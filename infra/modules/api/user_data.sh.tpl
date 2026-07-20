#!/bin/bash
set -euo pipefail
exec > /var/log/user-data.log 2>&1

# --- swap: two tsx-loaded Node processes + OS in 1 GiB is tight (Step 5 decision) ---
dd if=/dev/zero of=/swapfile bs=1M count=2048
chmod 600 /swapfile
mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# --- packages: Node 20 (NodeSource), git, psql for debugging ---
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
dnf install -y nodejs git postgresql16

mkdir -p /etc/tournament-app

# --- env refresh: SSM -> env file; re-run by every service start (ExecStartPre),
# --- so an updated parameter (e.g. frontend_url in 6d) lands on restart. ---
cat > /usr/local/bin/tournament-refresh-env << 'SCRIPT'
#!/bin/bash
set -euo pipefail
get_param() {
  local n
  for n in 1 2 3 4 5; do
    if VAL=$(aws ssm get-parameter --region ${aws_region} --name "/${environment}/api/$1" \
      --with-decryption --query Parameter.Value --output text 2>/dev/null); then
      echo "$VAL"; return 0
    fi
    sleep 5
  done
  echo "failed to read SSM parameter $1" >&2
  return 1
}
umask 077
cat > /etc/tournament-app/env << ENVFILE
DATABASE_URL=$(get_param database_url)
JWT_SECRET=$(get_param jwt_secret)
NODE_ENV=$(get_param node_env)
EMAIL_SERVICE=$(get_param email_service)
EMAIL_FROM_ADDRESS=$(get_param email_from_address)
FRONTEND_URL=$(get_param frontend_url)
REDIS_URL=$(get_param redis_url)
TOKEN_STORE=redis
JOB_QUEUE=bullmq
PORT=${api_port}
LOG_LEVEL=info
ENVFILE
SCRIPT
chmod +x /usr/local/bin/tournament-refresh-env

# --- readiness wait: gates the worker and the seed unit on migrations being done ---
cat > /usr/local/bin/tournament-wait-ready << 'SCRIPT'
#!/bin/bash
for n in $(seq 1 60); do
  curl -sf "http://localhost:${api_port}/health/ready" > /dev/null && exit 0
  sleep 5
done
echo "API never became ready" >&2
exit 1
SCRIPT
chmod +x /usr/local/bin/tournament-wait-ready

# --- code: clone from source (PAT bridge until Step 10; anonymous fallback) ---
TOKEN=$(aws ssm get-parameter --region ${aws_region} --name "/${environment}/api/github_token" \
  --with-decryption --query Parameter.Value --output text 2>/dev/null || true)
if [ -n "$TOKEN" ]; then
  git clone --depth 1 --branch ${app_branch} "https://x-access-token:$TOKEN@${app_repo}" /opt/tournament-app
else
  git clone --depth 1 --branch ${app_branch} "https://${app_repo}" /opt/tournament-app
fi
cd /opt/tournament-app
npm ci

# --- services: API + BullMQ worker (Step 5 decision) ---
cat > /etc/systemd/system/tournament-api.service << 'UNIT'
[Unit]
Description=Tournament API
After=network-online.target
Wants=network-online.target

[Service]
WorkingDirectory=/opt/tournament-app
ExecStartPre=/usr/local/bin/tournament-refresh-env
EnvironmentFile=/etc/tournament-app/env
ExecStart=/usr/bin/npx tsx packages/api/src/server.ts
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

cat > /etc/systemd/system/tournament-worker.service << 'UNIT'
[Unit]
Description=Tournament BullMQ worker
After=tournament-api.service
Wants=tournament-api.service

[Service]
WorkingDirectory=/opt/tournament-app
ExecStartPre=/usr/local/bin/tournament-refresh-env
ExecStartPre=/usr/local/bin/tournament-wait-ready
EnvironmentFile=/etc/tournament-app/env
ExecStart=/usr/bin/npx tsx packages/api/src/worker-entrypoint.ts
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

# --- seed the env file before first activation: EnvironmentFile= is validated
# --- for ALL Exec* directives (including ExecStartPre) before a unit's first
# --- start, so the file must already exist here, not just via ExecStartPre. ---
/usr/local/bin/tournament-refresh-env

systemctl daemon-reload
systemctl enable --now tournament-api tournament-worker

%{ if seed_on_boot }
# --- boot-time seed (UAT only; production hard-blocked by variable validation) ---
cat > /etc/systemd/system/tournament-seed.service << 'UNIT'
[Unit]
Description=Tournament seed (idempotent)
After=tournament-api.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/tournament-app
ExecStartPre=/usr/local/bin/tournament-wait-ready
EnvironmentFile=/etc/tournament-app/env
ExecStart=/usr/bin/npm run seed --workspace=packages/api
UNIT
systemctl daemon-reload
systemctl enable --now tournament-seed
%{ endif }
