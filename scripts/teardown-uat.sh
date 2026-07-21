#!/usr/bin/env bash
#
# Tear down the UAT stack. Pairs with deploy-uat.sh.
#
# The verified SES sender identity is PRESERVED: it is removed from tofu state
# (not deleted from AWS) before destroy, so you don't have to re-verify it by
# clicking an email link on every deploy cycle. deploy-uat.sh re-imports it.
#
# Requires AWS_PROFILE set and valid creds. Prompts to confirm unless --yes.
#
# Usage:  AWS_PROFILE=tournament scripts/teardown-uat.sh [--yes]
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INFRA="$REPO_ROOT/infra"
VAR_FILE="environments/uat.tfvars"
SES_RESOURCE='aws_sesv2_email_identity.sender[0]'
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

echo "==> This DESTROYS the UAT stack in account $(aws sts get-caller-identity --query Account --output text)."
echo "    The verified SES sender identity is PRESERVED (kept in AWS, removed from state)."
if [ -z "$AUTO_APPROVE" ]; then
  read -r -p "Type 'destroy' to confirm: " ans
  [ "$ans" = "destroy" ] || { echo "aborted"; exit 0; }
fi

# --- preserve SES identity: drop it from state so destroy leaves it in AWS ---
# NOTE: this preservation only works when tearing down THROUGH this script. A raw
# `tofu destroy` with the identity still in state WOULD delete it (re-verify next time).
if tofu -chdir="$INFRA" state list 2>/dev/null | grep -q "sesv2_email_identity.sender"; then
  echo "==> removing SES identity from state (kept alive in AWS)"
  tofu -chdir="$INFRA" state rm "$SES_RESOURCE"
fi

echo "==> tofu destroy"
if [ -n "$AUTO_APPROVE" ]; then
  tofu -chdir="$INFRA" destroy -var-file="$VAR_FILE" -auto-approve
else
  tofu -chdir="$INFRA" destroy -var-file="$VAR_FILE"
fi

echo "==> teardown complete. SES identity retained — no re-verification needed next deploy."
