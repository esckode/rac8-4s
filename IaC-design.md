# Infrastructure as Code (IaC): Design Overview

**This document records the high-level infrastructure design, security model, assumptions, and risks.**

## 📖 Reading Guide

**Start here if:** You want to understand the overall design, decisions, risks, and architecture at a glance.

**Before reading this:** Nothing required. This is the entry point.

**After reading this:** 
- For detailed architecture → Read **`IaC-architecture.md`**
- For step-by-step implementation → Read **`IaC-implementation.md`**
- For hands-on building → Start with **`IaC-implementation.md`** Step 1

**Information Flow:**
```
IaC-design.md (You are here)
    ↓ Deep dive into details
IaC-architecture.md (All parameters, all AWS components, design decisions)
    ↓ Ready to build
IaC-implementation.md (Step-by-step with validation)
```

---

## Architecture Overview

### High-Level Design

```
Users
  ↓ HTTPS
CloudFront (CDN)
  ├─ /api/* → Application Load Balancer
  │            ↓ HTTP (VPC private)
  │            EC2 t2.micro (Node.js API)
  │            ↓
  │            RDS PostgreSQL (db.t3.micro)
  │
  └─ /* → S3 Bucket (React SPA static files)
```

### Environment Model

- **Production**: Persistent, always running
- **UAT**: Ephemeral, spin up/test/destroy on demand
- **Dev/Staging**: Future environments, supported with zero code changes

**See IaC-architecture.md** for detailed component breakdown and parameter options for each environment.

### IaC Technology

- **Tool**: OpenTofu (open-source Terraform fork)
- **State**: S3 backend with encryption
- **Workspaces**: One codebase, separate state per environment
- **Parameterization**: All environment differences in `.tfvars` files, zero conditionals in `.tf` code

**See IaC-architecture.md → "Parameters & Configuration"** for all available parameters and how to add new environments.

---

## Security Model

### Threat Model & Mitigations

| Threat | Mitigation | Risk Level |
|--------|-----------|-----------|
| **Internet attacker targets EC2** | Security group: only port 3001 from ALB | Low |
| **Internet attacker targets RDS** | Private subnet + security group | Low |
| **Internet attacker targets S3** | S3 private + CloudFront OAC only | Low |
| **Lateral movement within VPC** | Security groups restrict east-west traffic | Medium* |
| **Compromise of EC2** | IAM role: least privilege (SSM read, SES send only) | Low |
| **Secrets leakage via state file** | S3 encrypted, IAM-restricted bucket | **CRITICAL** |
| **Brute force API** | No WAF or rate limiting | **HIGH** |
| **API vulnerabilities** | Not in scope (application security) | **HIGH** |
| **Database vulnerabilities** | Not in scope (database hardening) | Medium |

*No encryption in transit between EC2 ↔ RDS (acceptable for VPC-private traffic)

### Security Assumptions

**What we assume is secure:**
- ✅ AWS account access controls (IAM policies)
- ✅ AWS network isolation (VPC, security groups work correctly)
- ✅ S3 bucket encryption (AWS-managed KMS keys)
- ✅ EC2 metadata service (doesn't leak credentials)
- ✅ SSM Parameter Store encryption

**What we do NOT assume:**
- ❌ Application code is secure (XSS, SQL injection, etc.)
- ❌ Database is hardened (audit logs, encryption at rest)
- ❌ Network is protected from internal attacks (no encryption in transit)
- ❌ Secrets won't leak if AWS account is compromised

### Secrets Management

**Current Approach:** Terraform state contains secrets

```
✅ Encrypted at rest (S3 SSE)
✅ Not in git or version control
✅ Scoped to environment (prod secrets ≠ UAT secrets)
❌ Visible if someone accesses state file
❌ No versioning/rotation built in
❌ No audit trail of secret access
```

**Risk Level:** 🟢 LOW for dev/testing, 🔴 HIGH for production with sensitive data

**When to Upgrade:** Before deploying regulated data (healthcare, finance, PCI-DSS)

**Upgrade Path:** Switch to "pre-created secrets" (see IaC-architecture.md → "Adding CloudTrail for Audit & Compliance")

**See IaC-architecture.md → "Secrets & State Management"** for detailed explanation and mitigation options.

---

## Infrastructure Components

### Networking
- VPC (10.0.0.0/16 prod, 10.1.0.0/16 UAT)
- 2 public subnets (ALB + EC2)
- 2 private subnets (RDS)
- Security groups with least-privilege rules
- No direct internet access to RDS

### Compute
- EC2 t2.micro (free tier eligible)
- Amazon Linux 2023
- User data bootstrap: installs Node 20, fetches secrets from SSM, starts systemd service
- No SSH keys (uses SSM Session Manager)
- IAM role with scoped permissions

### Database
- RDS PostgreSQL 15
- db.t3.micro (free tier eligible)
- 20GB gp2 storage
- Automated backups (7 days prod, 0 days UAT)
- Final snapshots (prod only)
- Encrypted at rest (AWS-managed key)

### Load Balancing
- Application Load Balancer (HTTP only inside VPC)
- Health check every 30s (GET /health)
- Target group port 3001

### Frontend Delivery
- S3 bucket (private, no public access)
- CloudFront distribution (2 origins)
  - S3 for static files (`/*`)
  - ALB for API routes (`/api/*`, `/tournaments/*`)
- CloudFront Origin Access Control (OAC) — only CloudFront can read S3
- Custom error handling: 403/404 → /index.html (React Router)

### Secrets Management
- SSM Parameter Store (encrypted, free tier)
- 5 secrets per environment

### Audit & Logging (Optional)
- CloudTrail trail (all AWS API calls logged to S3)
- CloudWatch Logs integration (optional, for real-time alerts)

**For detailed component breakdown, see IaC-architecture.md → "Complete AWS Component List"**

---

## Key Design Decisions

### 1. Environment-Agnostic Code
**Decision:** One `.tf` codebase, all differences in `.tfvars` files

**Why:** Adding dev/staging environments requires only a new `.tfvars` file. No code drift.

**Implication:** No `if var.environment == "production"` logic in `.tf` files

### 2. EC2 Instead of ECS/Fargate
**Decision:** Single t2.micro EC2 instance (not containerized)

**Why:** Free tier eligible, simpler to understand and debug

**Trade-off:** Manual server management, no auto-scaling

### 3. CloudFront with 2 Origins
**Decision:** S3 for static files, ALB for API routes (both via CloudFront)

**Why:** Single domain (no CORS), CloudFront caches static files automatically

**Trade-off:** 1 more hop for API requests (acceptable)

### 4. SSM Parameter Store, Not Secrets Manager
**Decision:** Use free SSM Parameter Store for secrets

**Why:** Free tier ($0/month), sufficient for small apps

**Trade-off:** No versioning, no automatic rotation

### 5. Accept Secrets in Terraform State
**Decision:** Allow secrets in state file (encrypted in S3)

**Why:** Simplicity, Terraform needs state to manage resources

**Risk:** If S3 bucket is compromised, all secrets exposed

**Mitigation:** S3 encryption + IAM access control

**Upgrade Path:** Pre-create secrets outside Terraform (before production)

**See IaC-architecture.md → "Secrets & State Management"** for detailed explanation and options.

---

## Cost Analysis

### Free Tier (12 Months)

| Resource | Free Tier | Our Usage | Cost |
|---|---|---|---|
| EC2 t2.micro | 750 hrs/month | 720 hrs | $0 |
| RDS db.t3.micro | 750 hrs/month | 720 hrs | $0 |
| S3 | 5GB + 20k GET | ~1GB + few requests | $0 |
| CloudFront | 1TB + 10M requests | Negligible | $0 |
| **Total** | | | **$0** |

⚠️ **Critical:** 750 EC2 + 750 RDS hours are **shared** across all instances. Running production + UAT simultaneously exceeds free tier (~$20/month extra).

### After Free Tier (per environment)

| Resource | Cost |
|---|---|
| EC2 t2.micro | ~$8.50/month |
| RDS db.t3.micro | ~$12.50/month |
| ALB | ~$16.00/month (NOT free tier!) |
| S3 + CloudFront | ~$1.00/month |
| **Total per env** | ~$37.50/month |

**Cost reduction option:** Remove ALB, point CloudFront directly at EC2 (saves ~$16/month)

---

## Known Limitations

### Not Implemented (But Could Be)

| Feature | Why Not | When to Add |
|---|---|---|
| **Auto Scaling** | Not needed for single app | If traffic grows unpredictably |
| **Database Replication** | Costs money | Before handling production data |
| **Secrets Rotation** | Manual for now | Before PCI-DSS/HIPAA compliance |
| **Web Application Firewall** | Not urgent | Before public launch |
| **VPC Flow Logs** | Nice-to-have | If debugging network issues |
| **CloudTrail** | Optional audit | Before production with sensitive data |
| **Multi-region** | Unnecessary | If need disaster recovery |

### Acceptable Gaps for Current Stage

- ✅ Development/testing: All gaps acceptable
- ⚠️ Production testing: Add CloudTrail, consider WAF
- ❌ Production with sensitive data: Must add encryption in transit, secrets rotation, audit logging

---

## Security Checklist

### Before Development/Testing
- ✅ S3 state bucket encrypted
- ✅ IAM roles with least privilege
- ✅ Security groups restricting traffic
- ✅ Secrets in SSM Parameter Store

### Before UAT with Stakeholders
- ⚠️ CloudTrail enabled (optional)
- ⚠️ Disable SSH (enable_ssh = false)
- ⚠️ HTTPS via CloudFront

### Before Production with Sensitive Data
- ❌ **MUST** implement secrets rotation (upgrade from state-based to pre-created)
- ❌ **MUST** add WAF to CloudFront
- ❌ **MUST** add CloudTrail with CloudWatch Logs
- ❌ **MUST** enable encryption in transit (EC2 ↔ RDS)
- ❌ **MUST** enable RDS backup retention (7+ days)

---

## Operational Guidelines

### Secrets Handling
**DO:**
- Store secrets only in SSM Parameter Store (encrypted)
- Rotate secrets via AWS CLI (not Terraform)
- Use SSM Session Manager for EC2 access (no SSH keys)

**DON'T:**
- Commit `.tfvars` files with actual secrets to git
- Share state files via email/Slack
- Print `terraform state show` output
- Store secrets in EC2 user data

### Deployment
**DO:**
- Always run `tofu plan` before `tofu apply`
- Review plan output carefully
- Keep `.tfvars` files in version control (without real secrets)
- Use workspaces to separate environments

**DON'T:**
- Use `terraform destroy` without understanding what's being deleted
- Force-push to main until infrastructure is tested
- Store state file locally (only in S3)

### Incident Response
**If state file leaks:**
1. Rotate all secrets immediately
2. Check CloudTrail for unauthorized access
3. Restart services to pick up new secrets
4. Rotate RDS password directly in AWS

---

## What's Next?

**Next step:** Read **`IaC-architecture.md`** for detailed architecture, all parameters, and component breakdown.

**Then:** Follow **`IaC-implementation.md`** for step-by-step implementation with validation.

---

## Document Index

- **IaC-design.md** (this file) — High-level overview, decisions, risks
- **IaC-architecture.md** — Detailed architecture, all parameters, all components
- **IaC-implementation.md** — Step-by-step implementation guide with validation

---

## Document History

| Date | Change |
|---|---|
| 2026-06-10 | Initial design documented |
