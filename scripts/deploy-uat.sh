#!/usr/bin/env bash
#
# Deploy the UAT stack to AWS, end to end. Codifies IaC-implementation.md Step 7a:
#   tofu apply  ->  wait for API health  ->  build+sync frontend (incl. PWA
#   no-cache)  ->  invalidate CloudFront  ->  print the URL.
#
# Re-runnable. Pairs with teardown-uat.sh. Requires AWS_PROFILE set and valid creds
# (aws sso login). Shows the plan and asks to confirm unless --yes is passed.
#
# Usage:  AWS_PROFILE=tournament scripts/deploy-uat.sh [--yes]
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INFRA="$REPO_ROOT/infra"
VAR_FILE="environments/uat.tfvars"
REGION="us-east-2"
SES_RESOURCE='aws_sesv2_email_identity.sender[0]'
HEALTH_TRIES=120   # x10s = up to 20 min for EC2 bootstrap (npm ci on t2.micro is slow)
AUTO_APPROVE=""

for arg in "$@"; do
  case "$arg" in
    --yes|-y) AUTO_APPROVE=1 ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

# --- preconditions ---
: "${AWS_PROFILE:?set AWS_PROFILE (e.g. export AWS_PROFILE=tournament)}"
command -v tofu >/dev/null || { echo "tofu not found in PATH" >&2; exit 1; }
aws sts get-caller-identity >/dev/null 2>&1 || { echo "AWS creds invalid — run: aws sso login" >&2; exit 1; }
echo "==> account $(aws sts get-caller-identity --query Account --output text)  region $REGION  profile $AWS_PROFILE"

# --- init (idempotent): pulls providers + configures the S3 backend on a fresh clone ---
echo "==> tofu init"
tofu -chdir="$INFRA" init -input=false >/dev/null

# --- re-adopt the verified SES identity if it exists in AWS but not in state ---
# teardown-uat.sh preserves it (state rm), so on the next deploy it lives in AWS but
# is unmanaged; import it back so 'apply' reconciles instead of erroring on create.
EMAIL_SVC="$(sed -nE 's/^[[:space:]]*email_service[[:space:]]*=[[:space:]]*"([^"]+)".*/\1/p' "$INFRA/$VAR_FILE" || true)"
if [ "$EMAIL_SVC" = "aws_ses" ]; then
  FROM_ADDR="$(sed -nE 's/^[[:space:]]*email_from_address[[:space:]]*=[[:space:]]*"([^"]+)".*/\1/p' "$INFRA/secrets.auto.tfvars" 2>/dev/null || true)"
  if [ -n "$FROM_ADDR" ] && ! tofu -chdir="$INFRA" state list 2>/dev/null | grep -q "sesv2_email_identity.sender"; then
    if aws sesv2 get-email-identity --email-identity "$FROM_ADDR" --region "$REGION" >/dev/null 2>&1; then
      echo "==> re-adopting existing SES identity $FROM_ADDR into state"
      tofu -chdir="$INFRA" import -var-file="$VAR_FILE" "$SES_RESOURCE" "$FROM_ADDR"
    fi
  fi
fi

# --- plan + apply ---
PLAN="$(mktemp)"; trap 'rm -f "$PLAN"' EXIT
echo "==> tofu plan"
tofu -chdir="$INFRA" plan -var-file="$VAR_FILE" -out="$PLAN"
if [ -z "$AUTO_APPROVE" ]; then
  read -r -p "Apply this plan? [y/N] " ans
  [ "$ans" = "y" ] || [ "$ans" = "Y" ] || { echo "aborted"; exit 0; }
fi
echo "==> tofu apply"
tofu -chdir="$INFRA" apply "$PLAN"

# --- wait for the API to come up (ALB target health, direct — not via CloudFront) ---
ALB_DNS="$(tofu -chdir="$INFRA" output -raw alb_dns_name)"
echo "==> waiting for API at http://$ALB_DNS/health/ready (EC2 bootstrap, up to ~20 min)"
for i in $(seq 1 "$HEALTH_TRIES"); do
  if curl -sf "http://$ALB_DNS/health/ready" >/dev/null 2>&1; then
    echo "    API healthy"; break
  fi
  [ "$i" -eq "$HEALTH_TRIES" ] && { echo "API never became healthy — check EC2 bootstrap (IaC-implementation.md troubleshooting)" >&2; exit 1; }
  sleep 10
done

# --- build & deploy the frontend (Step 7a) ---
[ -d "$REPO_ROOT/node_modules" ] || { echo "==> installing deps (npm ci)"; (cd "$REPO_ROOT" && npm ci); }
echo "==> building frontend"
npm run build --workspace=packages/frontend

BUCKET="$(tofu -chdir="$INFRA" output -raw frontend_bucket_name)"
echo "==> syncing dist -> s3://$BUCKET"
aws s3 sync "$REPO_ROOT/packages/frontend/dist/" "s3://$BUCKET/" --delete

# PWA files need an explicit no-cache at the S3 layer too (S3's Content-Type default
# caching would otherwise let a browser/edge serve a stale SW or manifest).
echo "==> re-uploading service-worker.js + manifest.webmanifest with no-cache"
aws s3 cp "$REPO_ROOT/packages/frontend/dist/service-worker.js" "s3://$BUCKET/service-worker.js" \
  --cache-control "no-cache" --metadata-directive REPLACE
aws s3 cp "$REPO_ROOT/packages/frontend/dist/manifest.webmanifest" "s3://$BUCKET/manifest.webmanifest" \
  --cache-control "no-cache" --metadata-directive REPLACE

DIST_ID="$(tofu -chdir="$INFRA" output -raw cloudfront_distribution_id)"
echo "==> invalidating CloudFront ($DIST_ID)"
aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/*" >/dev/null

URL="$(tofu -chdir="$INFRA" output -raw cloudfront_url)"
echo ""
echo "==> deployed:  https://$URL"
echo "    CloudFront may take a few more minutes to fully propagate."
