# Infrastructure as Code (IaC): Architecture & Configuration

**This document contains the detailed architecture, all AWS components, parameterization, and design decisions.**

## 📖 Reading Guide

**Start here if:** You want detailed technical specifications, all parameters, and component breakdown.

**Before reading this:** Read **`IaC-design.md`** (high-level overview) first.

**While reading this:** Use this as reference while building, jump to specific sections as needed.

**After reading this:** Ready to start **`IaC-implementation.md`** (step-by-step guide with validation).

**Information Flow:**
```
IaC-design.md (High-level overview)
    ↓
IaC-architecture.md (You are here - Detailed specs and parameters)
    ↓
IaC-implementation.md (Step-by-step with validation)
```

---

## Quick Reference: All Parameters

**All environment differences are controlled via `.tfvars` files.** See "Parameters & Configuration" section below for:
- Complete parameter list by category
- Example values for production, UAT, dev, staging
- How to add new environments (zero code changes)

---

## Complete AWS Component List

All AWS services and components provisioned per environment:

### Networking & Infrastructure (8 components)
- VPC, public/private subnets (2+2), Internet Gateway, route tables, network ACLs

### Security & Access Control (7 components)
- 3 security groups (ALB, EC2, RDS), IAM role, instance profile, 2 IAM policies

### Compute (3 components)
- EC2 instance (t2.micro), EBS root volume, auto-assigned public IP

### Load Balancing (3 components)
- ALB, target group, listener rule

### Database (7 components)
- RDS PostgreSQL instance, subnet group, security group, parameter group, EBS volume, automated backups, snapshots

### Storage & CDN (11 components)
- S3 bucket, bucket policy, CloudFront distribution, OAC
- 3 origins (S3, ALB for /api/*, ALB for /tournaments/*)
- 3 cache behaviors (static, API, tournaments)

### Secrets & Configuration (5 components)
- 5 SSM parameters (database_url, jwt_secret, node_env, email_service, frontend_url)
- AWS-managed KMS key for encryption

### Audit & Logging (Optional)
- CloudTrail trail, S3 bucket, IAM roles, CloudWatch Logs group

**Total: ~45 resources per environment (explicit + implicit)**

---

## Parameters & Configuration

### All Available Parameters

All environment differences are controlled via `.tfvars` files. Create new environments by creating a new `.tfvars` file (no code changes).

#### Core Parameters

| Parameter | Type | Production | UAT | Dev | Purpose |
|---|---|---|---|---|---|
| `environment` | string | `production` | `uat` | `dev` | Environment identifier |
| `aws_region` | string | `us-east-1` | `us-east-1` | `us-east-1` | AWS region |
| `vpc_cidr` | string | `10.0.0.0/16` | `10.1.0.0/16` | `10.2.0.0/16` | VPC CIDR block (isolated per env) |

#### Compute Parameters

| Parameter | Type | Production | UAT | Dev | Purpose |
|---|---|---|---|---|---|
| `ec2_instance_type` | string | `t2.micro` | `t2.micro` | `t2.micro` | EC2 instance type |
| `ec2_volume_size` | number | `30` | `20` | `20` | Root volume size (GB) |
| `enable_ssh` | bool | `false` | `true` | `true` | Enable SSH access |
| `allowed_ssh_cidr` | string | `null` | `0.0.0.0/0` | `0.0.0.0/0` | SSH source CIDR (null = disabled) |

#### Database Parameters

| Parameter | Type | Production | UAT | Dev | Purpose |
|---|---|---|---|---|---|
| `db_instance_class` | string | `db.t3.micro` | `db.t3.micro` | `db.t3.micro` | RDS instance class |
| `db_allocated_storage` | number | `20` | `20` | `20` | Storage size (GB) |
| `db_backup_retention_period` | number | `7` | `0` | `1` | Days to keep backups |
| `db_skip_final_snapshot` | bool | `false` | `true` | `true` | Skip snapshot on destroy |
| `db_multi_az` | bool | `false` | `false` | `false` | Multi-AZ deployment |
| `db_auto_minor_version_upgrade` | bool | `false` | `false` | `false` | Auto minor version upgrades |

#### Health Check Parameters

| Parameter | Type | Default | Purpose |
|---|---|---|---|
| `health_check_interval` | number | `30` | Health check interval (seconds) |
| `health_check_timeout` | number | `5` | Health check timeout (seconds) |
| `health_check_healthy_threshold` | number | `2` | Consecutive passes to mark healthy |
| `health_check_unhealthy_threshold` | number | `3` | Consecutive failures to mark unhealthy |

#### Email/Communication Parameters

| Parameter | Type | Production | UAT | Dev | Purpose |
|---|---|---|---|---|---|
| `email_service` | string | `aws_ses` | `mock` | `mock` | Email service (aws_ses or mock) |
| `email_from_address` | string | `noreply@tournament-app.com` | `noreply@uat.example.com` | `noreply@dev.example.com` | From address for emails |
| `enable_ses_sending` | bool | `true` | `false` | `false` | Enable SES sending |

#### Audit/Logging Parameters

| Parameter | Type | Production | UAT | Dev | Purpose |
|---|---|---|---|---|---|
| `enable_cloudtrail` | bool | `true` | `true` | `false` | Enable CloudTrail logging |
| `enable_cloudwatch_logs` | bool | `true` | `false` | `false` | Send logs to CloudWatch |
| `enable_mfa_delete` | bool | `true` | `false` | `false` | Require MFA to delete logs |
| `log_retention_days` | number | `2555` | `30` | `7` | Days to keep logs |

### Adding a New Environment

To add `staging` or any new environment:

1. **Create `infra/environments/staging.tfvars`:**
   ```bash
   cp infra/environments/uat.tfvars infra/environments/staging.tfvars
   ```

2. **Edit with your parameters:**
   ```hcl
   environment = "staging"
   vpc_cidr    = "10.3.0.0/16"
   # ... adjust other parameters as needed
   ```

3. **Deploy (no code changes):**
   ```bash
   cd infra
   tofu workspace new staging
   tofu apply -var-file=environments/staging.tfvars
   ```

**That's it.** All differences between environments come from `.tfvars` files only.

---

## Secrets & State Management

### Decision: Simple Approach (Terraform State Contains Secrets)

**We accept the risk that Terraform state contains secrets.**

#### Why This Trade-off

| Aspect | Benefit | Risk |
|---|---|---|
| **Simplicity** | Fewer moving parts | Larger attack surface if S3 breached |
| **Cost** | Free (SSM Parameter Store) | ~$0.40/month if switch to Secrets Manager |
| **Automation** | Terraform generates random secrets | Secrets visible in state file |
| **Maintenance** | Nothing extra to manage | Must protect S3 bucket carefully |

#### Mitigations in Place

```hcl
# infra/backend.tf
terraform {
  backend "s3" {
    bucket  = "tournament-app-tofu-state"
    encrypt = true  # ✅ Encrypted at rest with SSE-S3
    key     = "tournament-app.tfstate"
    region  = "us-east-1"
  }
}
```

#### Risk Assessment

**Low Risk (Accept):**
- ✅ Suitable for development/testing infrastructure
- ✅ Suitable for non-critical applications
- ✅ Suitable for learning

**HIGH Risk (Do NOT use):**
- ❌ Production databases with real customer data
- ❌ Payment processing systems (PCI-DSS)
- ❌ Healthcare data (HIPAA)
- ❌ Any regulated industry

#### If Leaking Occurs

```bash
# 1. Rotate all secrets
aws ssm put-parameter --name "/production/api/jwt_secret" --value "$(openssl rand -hex 32)" --overwrite

# 2. Restart services
aws ec2 reboot-instances --instance-ids <id>

# 3. Check CloudTrail for unauthorized access
aws cloudtrail lookup-events --lookup-attributes AttributeKey=EventName,AttributeValue=GetParameter
```

#### When to Upgrade

**Upgrade to pre-created secrets if:**
- Moving to production with real data
- Handling regulated data (healthcare, finance, PCI-DSS)
- Multiple team members with different access levels

**How to upgrade:** See section "Adding CloudTrail for Audit & Compliance" below.

---

## Adding CloudTrail for Audit & Compliance

CloudTrail logs all AWS API calls, providing an audit trail for compliance and incident response.

### CloudTrail Module

Create `modules/audit/main.tf` with:
- S3 bucket for CloudTrail logs
- CloudTrail trail configuration
- Optional CloudWatch Logs integration
- Optional MFA delete protection

### Enable in `.tfvars`

```hcl
# production.tfvars
enable_cloudtrail      = true
enable_cloudwatch_logs = true       # Real-time alerts
enable_mfa_delete      = true       # Protect logs
log_retention_days     = 2555       # Keep 7 years

# uat.tfvars
enable_cloudtrail      = true
enable_cloudwatch_logs = false      # Save money
enable_mfa_delete      = false
log_retention_days     = 30         # Keep 30 days
```

### Query Logs

```bash
# Download logs from S3
aws s3 cp s3://uat-cloudtrail-logs-123456789/... ./logs --recursive

# Query with Athena (SQL)
SELECT eventTime, eventName, userIdentity.principalId
FROM cloudtrail_logs
WHERE errorCode IS NOT NULL  # Find failed API calls
ORDER BY eventTime DESC;
```

---

## Networking Architecture

### VPC Isolation

Each environment gets its own isolated VPC:
- Production: `10.0.0.0/16`
- UAT: `10.1.0.0/16`
- Dev: `10.2.0.0/16`

### Public vs Private Subnets

**Public Subnets (2):** ALB + EC2 live here (have internet access)

**Private Subnets (2):** RDS lives here (no direct internet access)

### Security Groups (Least Privilege)

1. **ALB SG:** Allows HTTP (80) from anywhere
2. **EC2 SG:** Allows port 3001 from ALB only (not from internet)
3. **RDS SG:** Allows port 5432 from EC2 only (not from ALB)

### Result

```
Internet → CloudFront → ALB → EC2 → RDS
```

RDS is only accessible from EC2. No lateral movement possible.

---

## Frontend Architecture

### S3 + CloudFront

**S3:** Stores compiled React files (private, no public access)

**CloudFront:** CDN with two origins:
- `/*` → S3 (serves static files with caching)
- `/api/*` → ALB (proxied to API, no caching)
- `/tournaments/*` → ALB (proxied to API, no caching)

### Origin Access Control (OAC)

CloudFront has special permission to read S3. Users cannot access S3 directly.

### React Router Support

Custom error handling: 404 → `/index.html` (allows client-side routing)

---

## API Architecture

### EC2 Bootstrap

User data script runs on first boot:
1. Install Node 20
2. Fetch secrets from SSM Parameter Store
3. Clone app from git
4. Start Node.js app via systemd service

### Health Check

ALB performs HTTP GET to `/health` every 30 seconds:
- Expected response: `{"status":"ok","database":"connected"}`
- If fails: ALB marks target as unhealthy, stops routing traffic

### Secrets at Runtime

App reads secrets from SSM at startup:
- Never stored in code, git, or EC2 instance
- Encrypted in transit (AWS VPC endpoint)
- Encrypted at rest (SSM KMS)

---

## Database Architecture

### RDS PostgreSQL

- Single db.t3.micro instance (free tier)
- 20GB gp2 storage
- In private subnet (no internet access)
- Security group restricts to EC2 only

### Migrations

Migrations run automatically when API starts (before listening on port 3001). If migrations fail, API exits and ALB health check fails.

### Backups

- **Production:** 7-day backup retention + final snapshot on destroy
- **UAT:** No backups (skip final snapshot for fast teardown)

---

## Key Architectural Decisions

### 1. Environment-Agnostic Code
One `.tf` codebase. All differences via `.tfvars`. Allows adding unlimited environments.

### 2. EC2 Not ECS/Fargate
Simpler, free tier eligible, no container orchestration overhead.

### 3. CloudFront with 2 Origins
Single domain (no CORS), automatic S3 caching, API routing works seamlessly.

### 4. SSM Parameter Store
Free secrets storage (vs $0.40/month for Secrets Manager).

### 5. Accept Secrets in State
Simplicity trade-off. Acceptable for dev/testing. Upgrade before production.

---

## Cost Analysis

### Free Tier (12 Months)
- EC2 t2.micro: 750 hrs/month
- RDS db.t3.micro: 750 hrs/month
- S3: 5GB + 20k requests
- CloudFront: 1TB + 10M requests
- **Total: $0**

⚠️ **Critical:** Hours are shared across instances. Running prod + UAT simultaneously exceeds limits (~$20/month extra).

### After Free Tier

| Resource | Cost/month |
|---|---|
| EC2 t2.micro | $8.50 |
| RDS db.t3.micro | $12.50 |
| ALB | $16.00 (NOT free!) |
| S3 + CloudFront | $1.00 |
| **Total per env** | $37.50 |

**Cost optimization:** Remove ALB, save $16/month (trade-off: no health checking).

---

## What's Next?

**Ready to implement?** → Go to **`IaC-implementation.md`** for step-by-step guide with validation.

**Need overview first?** → Go back to **`IaC-design.md`**.

---

## Document Index

- **IaC-design.md** — High-level overview, decisions, risks
- **IaC-architecture.md** (this file) — Detailed architecture, all parameters, all components
- **IaC-implementation.md** — Step-by-step implementation guide with validation

---

## Document History

| Date | Change |
|---|---|
| 2026-06-10 | Detailed architecture documented, parameters organized |
