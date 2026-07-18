# Infrastructure as Code (IaC): Implementation & Validation Guide

**A practical, step-by-step guide to build the infrastructure with integrated validation at each component.**

## 📖 Reading Guide

**Start here if:** You're ready to actually build the infrastructure and need exact commands and validation steps.

**Before reading this:**
1. Read **`IaC-design.md`** (5-10 min, high-level overview)
2. Read **`IaC-architecture.md`** (as reference while building)

**How to use this document:**
- Follow steps in order
- Do NOT proceed until current step's validation passes
- Jump back to **`IaC-architecture.md`** if you need details on a component

### Execution Protocol (binding for any executor, human or model)

1. **Session preamble:** `export AWS_PROFILE=tournament`; if any AWS call fails with an SSO/credentials error, stop and ask the user to run `aws sso login --profile tournament` — do not switch profiles or mint credentials another way.
2. **One micro-step at a time.** Run its commands verbatim, in order. Check its box only when every verify line matches.
3. **When a gate fails: stop and diagnose — never improvise forward.** Specifically: never use `-target`, never edit HCL outside the current micro-step, never accept a plan whose resource count differs from the documented expectation (a mismatch means state drift or a doc bug — surface it), and never `tofu destroy` to "reset" a single failed step.
4. **Bootstrap failures (5c) surface asynchronously**, not in tofu output. Pull `/var/log/user-data.log` via `ssm send-command`, fix the **template** (`user_data.sh.tpl`), and let `user_data_replace_on_change` recreate the instance. Never hand-patch the running instance — that's drift the next replacement silently reverts.
5. **Human-only steps — stop and hand back:** creating the GitHub PAT (5c pre-step), any `aws sso login`, and anything touching production.
6. **Commit only when the user asks** (CLAUDE.md §11); a completed step is a natural commit boundary.

**Information Flow:**
```
IaC-design.md (Understand the design)
    ↓
IaC-architecture.md (Study the details)
    ↓
IaC-implementation.md (You are here - Actually build it)
    ↓ Each step
    Create component → Validate component → Move to next step
```

---

## Prerequisites

### Required

- [x] OpenTofu installed: v1.12.3 baseline (standalone binary in `~/.local/bin`; macOS alternative: `brew install opentofu`). State was written with this version — don't downgrade below it.
- [x] AWS CLI v2 (2.35.15) with the `tournament` IAM Identity Center profile (see `~/.aws/config`): `aws sso login --profile tournament`, then `export AWS_PROFILE=tournament`
- [x] AWS account access (verified via `aws sts get-caller-identity`)
- [x] This repository cloned locally

### Recommended

- ✅ Read `IaC-design.md` first (high-level overview)
- ✅ Read `IaC-architecture.md` for reference during implementation

---

## One-Time Setup (Do This First)

**Status: ✅ completed 2026-07-06** — `tournament-app-tofu-state` created in us-east-2; versioning and AES256 encryption enabled, all three validations passed.

### Create S3 State Bucket

```bash
# Create bucket for Terraform state
aws s3 mb s3://tournament-app-tofu-state --region us-east-2

# Enable versioning (allows recovery if state is corrupted)
aws s3api put-bucket-versioning \
  --bucket tournament-app-tofu-state \
  --versioning-configuration Status=Enabled

# Enable encryption
aws s3api put-bucket-encryption \
  --bucket tournament-app-tofu-state \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "AES256"
      }
    }]
  }'
```

**Validate S3 bucket:**

```bash
# List buckets
aws s3 ls | grep tournament-app-tofu-state
# Expected: "tournament-app-tofu-state"

# Verify encryption
aws s3api get-bucket-encryption --bucket tournament-app-tofu-state
# Expected: SSEAlgorithm is AES256

# Verify versioning
aws s3api get-bucket-versioning --bucket tournament-app-tofu-state
# Expected: Status is Enabled
```

✅ **Move to Step 1 only if:** All three validations pass

---

## Step 1: Initialize OpenTofu & Create Base Files

Broken into micro-steps **1a–1g**: each creates one file or runs one command, has its own verify gate, and leaves the repo in a consistent, stoppable state. Do them in order; check the box when the verification passes. All AWS interaction in this step is read-only (state bucket + STS) — no billable resources are created. First real spend is Step 3 (RDS).

**Progress:**

- [x] 1a. Directory skeleton
- [x] 1b. Git hygiene (`.gitignore`)
- [x] 1c. `backend.tf` + first `tofu init` (backend connection only)
- [x] 1d. `variables.tf`
- [x] 1e. `main.tf` + second `tofu init` (providers)
- [x] 1f. `environments/uat.tfvars` + no-op plan
- [ ] 1g. `environments/production.tfvars` — **skipped 2026-07-06**, deferred to the production milestone (see note in 1g)

> **Changed from the original plan:** the root `outputs.tf` is no longer created in Step 1 — its blocks reference modules that don't exist until Steps 2–6, so `tofu validate` would fail. Each output block is now added by the step that introduces its module.

### 1a. Directory Skeleton

```bash
cd /home/esckode/projects/claude/rac8-4s
mkdir -p infra/{modules/{networking,secrets,database,api,frontend,audit},environments}
```

**Verify:** `find infra -type d` lists the 6 module dirs + `environments/`; pre-existing `infra/nginx/` untouched.

### 1b. Git Hygiene

Ignore OpenTofu artifacts before anything can generate them:

```bash
cat >> .gitignore << 'EOF'

# OpenTofu
infra/.terraform/
*.tfstate
*.tfstate.*
EOF
```

`.terraform/` holds provider binaries — never commit it. `.terraform.lock.hcl` (appears in 1e) **should** be committed: it pins provider versions.

**Verify:** `git check-ignore infra/.terraform/x` and `git check-ignore infra/foo.tfstate` both match.

### 1c. Create `backend.tf` + First `tofu init`

Only the backend block — with no providers declared yet, `init` does exactly one thing: connect to the S3 state bucket. A failure here can only be credentials (SSO expired? re-run `aws sso login --profile tournament`) or bucket config.

```bash
cd infra
cat > backend.tf << 'EOF'
terraform {
  backend "s3" {
    bucket       = "tournament-app-tofu-state"
    key          = "tournament-app.tfstate"
    region       = "us-east-2"
    encrypt      = true
    use_lockfile = true
  }
}
EOF

export AWS_PROFILE=tournament
tofu init
```

**Verify:** output includes `Successfully configured the backend "s3"`.

### 1d. Create `variables.tf`

**Reference:** For complete variable list, see **`IaC-architecture.md`** → "All Available Parameters"

Bare variable declarations are valid config on their own. This must precede `main.tf` (1e), which references `var.aws_region`.

```bash
cat > variables.tf << 'EOF'
variable "environment" {
  description = "Environment name (production, uat, dev, staging, etc.)"
  type        = string
  validation {
    condition     = can(regex("^[a-z0-9-]+$", var.environment))
    error_message = "Environment must be lowercase alphanumeric with hyphens."
  }
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-2"
}

variable "vpc_cidr" {
  description = "VPC CIDR block"
  type        = string
}

variable "ec2_instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t2.micro"
}

variable "ec2_volume_size" {
  description = "Root volume size (GB)"
  type        = number
  default     = 30
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.micro"
}

variable "db_allocated_storage" {
  description = "RDS allocated storage (GB)"
  type        = number
  default     = 20
}

variable "db_backup_retention_period" {
  description = "RDS backup retention (days)"
  type        = number
}

variable "db_skip_final_snapshot" {
  description = "Skip final snapshot on destroy"
  type        = bool
}

variable "email_service" {
  description = "Email service (aws_ses or mock)"
  type        = string
  validation {
    condition     = contains(["aws_ses", "mock"], var.email_service)
    error_message = "email_service must be 'aws_ses' or 'mock'."
  }
}

variable "email_from_address" {
  description = "From address for emails"
  type        = string
}

variable "enable_ssh" {
  description = "Enable SSH access"
  type        = bool
  default     = false
}

variable "allowed_ssh_cidr" {
  description = "SSH source CIDR (null to disable)"
  type        = string
  default     = null
}

variable "health_check_interval" {
  description = "ALB health check interval (seconds)"
  type        = number
  default     = 30
}

variable "health_check_timeout" {
  description = "ALB health check timeout (seconds)"
  type        = number
  default     = 5
}

variable "health_check_healthy_threshold" {
  description = "Consecutive passes to mark healthy"
  type        = number
  default     = 2
}

variable "health_check_unhealthy_threshold" {
  description = "Consecutive failures to mark unhealthy"
  type        = number
  default     = 3
}

variable "enable_cloudtrail" {
  description = "Enable CloudTrail logging"
  type        = bool
  default     = true
}

variable "enable_cloudwatch_logs" {
  description = "Send CloudTrail logs to CloudWatch"
  type        = bool
  default     = false
}

variable "enable_mfa_delete" {
  description = "Require MFA to delete audit logs"
  type        = bool
  default     = false
}

variable "log_retention_days" {
  description = "Days to keep audit logs (0 = forever)"
  type        = number
  default     = 90
}
EOF
```

**Verify:** `tofu validate` → "Success! The configuration is valid."

### 1e. Create `main.tf` (Providers) + Second `tofu init`

```bash
cat > main.tf << 'EOF'
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
  required_version = ">= 1.7.0"
}

provider "aws" {
  region = var.aws_region
}

data "aws_caller_identity" "current" {}
EOF

tofu init
```

Re-running `init` here has exactly one new job: downloading the two providers.

**Verify:**
- `tofu validate` → "Success! The configuration is valid."
- `ls .terraform/providers/registry.opentofu.org/hashicorp/` → `aws` and `random`
- `.terraform.lock.hcl` was created — commit it (pins provider versions)

### 1f. Create `environments/uat.tfvars`

**Reference:** See **`IaC-architecture.md`** → "Parameters & Configuration" for all available parameters and how to customize.

```bash
cat > environments/uat.tfvars << 'EOF'
environment = "uat"
aws_region  = "us-east-2"
vpc_cidr    = "10.1.0.0/16"

ec2_instance_type = "t2.micro"
ec2_volume_size   = 20
enable_ssh        = true
allowed_ssh_cidr  = "0.0.0.0/0"

db_instance_class          = "db.t3.micro"
db_allocated_storage       = 20
db_backup_retention_period = 0
db_skip_final_snapshot     = true

health_check_interval            = 30
health_check_timeout             = 5
health_check_healthy_threshold   = 2
health_check_unhealthy_threshold = 3

email_service      = "mock"
email_from_address = "noreply@uat.example.com"

enable_cloudtrail      = true
enable_cloudwatch_logs = false
enable_mfa_delete      = false
log_retention_days     = 30
EOF
```

**Verify:** end-to-end no-op plan —

```bash
tofu plan -var-file=environments/uat.tfvars
# Expected: "No changes." (0 to add, 0 to change, 0 to destroy)
```

This proves variables and tfvars agree, credentials work, and state I/O works — while creating nothing.

### 1g. Create `environments/production.tfvars` (Deferrable)

> **Decision (2026-07-06): skipped for now.** This stack uses a single state file, so `tofu apply -var-file=environments/production.tfvars` would not create a second environment — it would try to **mutate the existing UAT environment into production** (mass renames, VPC CIDR replacement, backup/email changes). Until the file exists, that accident is impossible. When the production milestone arrives, do these together as one micro-step:
> 1. Create per-environment **workspaces** (`tofu workspace new uat` / `production`) so each environment gets its own state file — Step 8 already assumes workspaces exist, but no step currently creates them.
> 2. Add a **workspace guard** in `main.tf` — a `precondition` asserting `terraform.workspace == var.environment` — so applying the wrong var-file hard-fails before touching anything.
> 3. Only then create `production.tfvars` (below). Never use `-auto-approve` against production.
> 4. Confirm `seed_on_boot` is absent or `false` in `production.tfvars` — the precondition guard (Step 8) will hard-fail the plan if it isn't, but don't rely on discovering that at apply time.

Not needed until the production deployment — skipping it blocks nothing in Steps 2–9.

```bash
cat > environments/production.tfvars << 'EOF'
environment                    = "production"
aws_region                     = "us-east-2"
vpc_cidr                       = "10.0.0.0/16"

ec2_instance_type              = "t2.micro"
ec2_volume_size                = 30
enable_ssh                     = false
allowed_ssh_cidr               = null

db_instance_class              = "db.t3.micro"
db_allocated_storage           = 20
db_backup_retention_period     = 7
db_skip_final_snapshot         = false

health_check_interval          = 30
health_check_timeout           = 5
health_check_healthy_threshold = 2
health_check_unhealthy_threshold = 3

email_service                  = "aws_ses"
email_from_address             = "noreply@tournament-app.com"

enable_cloudtrail              = true
enable_cloudwatch_logs         = true
enable_mfa_delete              = true
log_retention_days             = 2555
EOF
```

**Verify:** `tofu plan -var-file=environments/production.tfvars` also reports no changes.

✅ **Step 1 complete when:** 1a–1f are checked (1g optional).

---

## Step 2: Create Networking Module

Broken into micro-steps **2a–2e**, one infrastructure layer each. The rhythm per step: append HCL → `tofu plan` (assert the **exact** resource count) → `tofu apply` → verify against live AWS → check the box. Every resource in this step is free; the first billable resource remains Step 3 (RDS). Total after 2e: **13 managed resources**.

> **Note:** the original pointer to `~/.claude/plans/piped-zooming-mist.md` → "Networking Module" was dangling — that file contains no networking HCL. The module code below is authored here, following the plan file's design rules: security groups admit traffic by **group reference, not IP ranges**; the DB subnets have **no internet route** (and no NAT gateway — deliberate cost tradeoff); 2 AZs because RDS subnet groups require two.

**Progress:**

- [x] 2a. Module skeleton + VPC (plan: +1)
- [x] 2b. Subnets — 2 public, 2 private, 2 AZs (plan: +4)
- [x] 2c. Internet routing — IGW, route table, route, associations (plan: +5)
- [x] 2d. Security groups ×3, chained by reference (plan: +3)
- [x] 2e. Converge check — fmt, validate, no-op plan (plan: ±0)

### 2a. Module Skeleton + VPC

Module variables — declares everything the whole module will eventually need, so the root wiring below never has to be edited again:

```bash
cat > modules/networking/variables.tf << 'EOF'
variable "environment" {
  description = "Environment name"
  type        = string
}

variable "vpc_cidr" {
  description = "VPC CIDR block"
  type        = string
}

variable "api_port" {
  description = "Port the API listens on (ALB -> EC2 rule)"
  type        = number
  default     = 3001
}

variable "enable_ssh" {
  description = "Add SSH ingress to the API security group"
  type        = bool
  default     = false
}

variable "allowed_ssh_cidr" {
  description = "SSH source CIDR (null to disable)"
  type        = string
  default     = null
}
EOF

cat > modules/networking/main.tf << 'EOF'
resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name        = "${var.environment}-vpc"
    Environment = var.environment
  }
}
EOF

cat > modules/networking/outputs.tf << 'EOF'
output "vpc_id" {
  value       = aws_vpc.main.id
  description = "VPC ID"
}
EOF
```

Wire into root `main.tf` (SSH vars passed now so this block is append-once), plus the first root output:

```bash
cat >> main.tf << 'EOF'

module "networking" {
  source = "./modules/networking"

  environment      = var.environment
  vpc_cidr         = var.vpc_cidr
  enable_ssh       = var.enable_ssh
  allowed_ssh_cidr = var.allowed_ssh_cidr
}
EOF

cat >> outputs.tf << 'EOF'
output "vpc_id" {
  value       = module.networking.vpc_id
  description = "VPC ID"
}
EOF

tofu init   # new module reference needs re-init (local, instant)
```

**Verify:**

```bash
tofu validate
# Expected: "Success! The configuration is valid."

tofu plan -var-file=environments/uat.tfvars
# Expected: exactly "1 to add" — aws_vpc.main

tofu apply -var-file=environments/uat.tfvars -auto-approve

aws ec2 describe-vpcs --filters "Name=cidr,Values=10.1.0.0/16" --query 'Vpcs[0].VpcId'
# Expected: "vpc-..."
```

### 2b. Subnets (2 Public + 2 Private, 2 AZs)

CIDRs are derived from `vpc_cidr` via `cidrsubnet(...)` — /24s numbered 1, 2 (public) and 11, 12 (private). UAT: `10.1.1.0/24`, `10.1.2.0/24`, `10.1.11.0/24`, `10.1.12.0/24`; works unchanged for production's `10.0.0.0/16`.

```bash
cat >> modules/networking/main.tf << 'EOF'

data "aws_availability_zones" "available" {
  state = "available"
}

resource "aws_subnet" "public" {
  count                   = 2
  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, count.index + 1)
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true

  tags = {
    Name        = "${var.environment}-public-${element(["a", "b"], count.index)}"
    Environment = var.environment
    Tier        = "public"
  }
}

resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + 11)
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = {
    Name        = "${var.environment}-private-${element(["a", "b"], count.index)}"
    Environment = var.environment
    Tier        = "private"
  }
}
EOF

cat >> modules/networking/outputs.tf << 'EOF'

output "public_subnet_ids" {
  value       = aws_subnet.public[*].id
  description = "Public subnet IDs"
}

output "private_subnet_ids" {
  value       = aws_subnet.private[*].id
  description = "Private subnet IDs (for the RDS subnet group)"
}
EOF

cat >> outputs.tf << 'EOF'

output "public_subnet_ids" {
  value       = module.networking.public_subnet_ids
  description = "Public subnet IDs"
}
EOF
```

**Verify:**

```bash
tofu plan -var-file=environments/uat.tfvars
# Expected: exactly "4 to add" — 2 public + 2 private subnets

tofu apply -var-file=environments/uat.tfvars -auto-approve

aws ec2 describe-subnets --filters "Name=vpc-id,Values=$(tofu output -raw vpc_id)" \
  --query 'Subnets[*].[CidrBlock,MapPublicIpOnLaunch]' --output text | sort
# Expected: 4 rows; 10.1.1.0/24 and 10.1.2.0/24 with True, 10.1.11.0/24 and 10.1.12.0/24 with False
```

### 2c. Internet Routing

IGW + public route table + default route + 2 associations (public subnets only). The private subnets stay on the VPC's main route table, which has **no** internet route — that absence *is* the database-isolation guarantee.

```bash
cat >> modules/networking/main.tf << 'EOF'

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name        = "${var.environment}-igw"
    Environment = var.environment
  }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name        = "${var.environment}-public-rt"
    Environment = var.environment
  }
}

resource "aws_route" "public_internet" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.main.id
}

resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}
EOF
```

**Verify:**

```bash
tofu plan -var-file=environments/uat.tfvars
# Expected: exactly "5 to add" — IGW, route table, route, 2 associations

tofu apply -var-file=environments/uat.tfvars -auto-approve

aws ec2 describe-route-tables --filters "Name=vpc-id,Values=$(tofu output -raw vpc_id)" \
  --query 'RouteTables[*].Routes[?DestinationCidrBlock==`0.0.0.0/0`].GatewayId' --output text
# Expected: exactly one igw-... (the main route table contributes nothing)
```

### 2d. Security Groups (Chained by Reference)

Internet →`:80/:443`→ `alb-sg` →`:3001`→ `api-sg` →`:5432`→ `rds-sg`. Each group admits only the *group* before it, so rules survive IP churn. SSH ingress on `api-sg` exists only when `enable_ssh = true` **and** a CIDR is set (UAT yes, production no). Explicit egress blocks are required — OpenTofu strips AWS's default allow-all egress on managed SGs.

```bash
cat >> modules/networking/main.tf << 'EOF'

resource "aws_security_group" "alb" {
  name   = "${var.environment}-alb-sg"
  vpc_id = aws_vpc.main.id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "${var.environment}-alb-sg"
    Environment = var.environment
  }
}

resource "aws_security_group" "api" {
  name   = "${var.environment}-api-sg"
  vpc_id = aws_vpc.main.id

  ingress {
    from_port       = var.api_port
    to_port         = var.api_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  dynamic "ingress" {
    for_each = var.enable_ssh && var.allowed_ssh_cidr != null ? [1] : []
    content {
      from_port   = 22
      to_port     = 22
      protocol    = "tcp"
      cidr_blocks = [var.allowed_ssh_cidr]
    }
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "${var.environment}-api-sg"
    Environment = var.environment
  }
}

resource "aws_security_group" "rds" {
  name   = "${var.environment}-rds-sg"
  vpc_id = aws_vpc.main.id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.api.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "${var.environment}-rds-sg"
    Environment = var.environment
  }
}
EOF

cat >> modules/networking/outputs.tf << 'EOF'

output "alb_security_group_id" {
  value       = aws_security_group.alb.id
  description = "ALB security group ID"
}

output "api_security_group_id" {
  value       = aws_security_group.api.id
  description = "API (EC2) security group ID"
}

output "rds_security_group_id" {
  value       = aws_security_group.rds.id
  description = "RDS security group ID"
}
EOF
```

(These three IDs are module outputs consumed by the database/API modules in Steps 3 and 5 — they don't need to be root outputs.)

**Verify:**

```bash
tofu plan -var-file=environments/uat.tfvars
# Expected: exactly "3 to add" — the three security groups

tofu apply -var-file=environments/uat.tfvars -auto-approve

aws ec2 describe-security-groups --filters "Name=vpc-id,Values=$(tofu output -raw vpc_id)" \
  --query 'SecurityGroups[*].GroupName'
# Expected: default, uat-alb-sg, uat-api-sg, uat-rds-sg

# The chain is by reference, not IP: rds-sg's ingress source must be api-sg's group ID
aws ec2 describe-security-groups --filters "Name=group-name,Values=uat-rds-sg" \
  --query 'SecurityGroups[0].IpPermissions[0].UserIdGroupPairs[0].GroupId'
# Expected: the sg-... ID of uat-api-sg
```

### 2e. Converge Check

No new resources — proves the whole layer is stable and styled:

```bash
tofu fmt -recursive -check
# Expected: no output (all files formatted)

tofu validate
# Expected: "Success! The configuration is valid."

tofu plan -var-file=environments/uat.tfvars
# Expected: "No changes."

tofu state list | grep '^module\.networking' | grep -v '\.data\.' | wc -l
# Expected: 13 (1 VPC + 4 subnets + IGW + route table + route + 2 associations + 3 SGs)
```

✅ **Step 2 complete when:** 2a–2e are checked and the final plan shows "No changes."

---

## Step 3: Create Database Module

Broken into micro-steps **3a–3c**. Same rhythm as Step 2: append HCL → `tofu plan` (assert the exact count) → `tofu apply` → verify against live AWS → check the box.

> **Note:** as with Step 2, the original pointer to `~/.claude/plans/piped-zooming-mist.md` was dangling — that file has full HCL only for CloudTrail. The module code for Steps 3–6 is authored here. **3b creates the first billable resource** (RDS db.t3.micro — free-tier eligible, 750 h/month; the apply takes 5–10 minutes).

**Progress:**

- [x] 3a. Module skeleton — password + subnet group (plan: +2)
- [x] 3b. RDS instance (plan: +1, ~10 min apply) 💰
- [x] 3c. Root output + converge check (plan: ±0 resources)

### 3a. Module Skeleton: Password + Subnet Group

```bash
cd /home/esckode/projects/claude/rac8-4s/infra

cat > modules/database/variables.tf << 'EOF'
variable "environment" {
  description = "Environment name"
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnet IDs for the RDS subnet group"
  type        = list(string)
}

variable "rds_security_group_id" {
  description = "Security group admitting only api-sg on 5432"
  type        = string
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
}

variable "db_allocated_storage" {
  description = "Allocated storage (GB)"
  type        = number
}

variable "db_backup_retention_period" {
  description = "Backup retention (days)"
  type        = number
}

variable "db_skip_final_snapshot" {
  description = "Skip final snapshot on destroy"
  type        = bool
}
EOF

cat > modules/database/main.tf << 'EOF'
# special = false keeps the password URL-safe by construction — it is embedded
# verbatim in the database_url SSM parameter (Step 4).
resource "random_password" "db" {
  length  = 32
  special = false
}

resource "aws_db_subnet_group" "main" {
  name       = "${var.environment}-tournament-db"
  subnet_ids = var.private_subnet_ids

  tags = {
    Name        = "${var.environment}-tournament-db"
    Environment = var.environment
  }
}
EOF
```

Wire into root `main.tf` (append-once — all module inputs declared now):

```bash
cat >> main.tf << 'EOF'

module "database" {
  source = "./modules/database"

  environment                = var.environment
  private_subnet_ids         = module.networking.private_subnet_ids
  rds_security_group_id      = module.networking.rds_security_group_id
  db_instance_class          = var.db_instance_class
  db_allocated_storage       = var.db_allocated_storage
  db_backup_retention_period = var.db_backup_retention_period
  db_skip_final_snapshot     = var.db_skip_final_snapshot
}
EOF

tofu init   # new module reference (local, instant)
```

**Verify:**

```bash
tofu validate
# Expected: "Success! The configuration is valid."

tofu plan -var-file=environments/uat.tfvars
# Expected: exactly "2 to add" — random_password.db + aws_db_subnet_group.main

tofu apply -var-file=environments/uat.tfvars -auto-approve

aws rds describe-db-subnet-groups --db-subnet-group-name uat-tournament-db \
  --query 'DBSubnetGroups[0].Subnets[*].SubnetIdentifier'
# Expected: the two PRIVATE subnet IDs (compare: tofu output — they must NOT be the public ones)
```

### 3b. RDS Instance 💰

First billable resource. The apply blocks ~5–10 minutes while RDS provisions.

```bash
cat >> modules/database/main.tf << 'EOF'

resource "aws_db_instance" "main" {
  identifier     = "${var.environment}-tournament-db"
  engine         = "postgres"
  engine_version = "15"

  instance_class    = var.db_instance_class
  allocated_storage = var.db_allocated_storage

  db_name  = "tournament_app"
  username = "tournament_user"
  password = random_password.db.result

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [var.rds_security_group_id]
  publicly_accessible    = false

  backup_retention_period   = var.db_backup_retention_period
  skip_final_snapshot       = var.db_skip_final_snapshot
  final_snapshot_identifier = var.db_skip_final_snapshot ? null : "${var.environment}-tournament-db-final"

  tags = {
    Name        = "${var.environment}-tournament-db"
    Environment = var.environment
  }
}
EOF

cat > modules/database/outputs.tf << 'EOF'
output "address" {
  value       = aws_db_instance.main.address
  description = "RDS hostname"
}

output "port" {
  value       = aws_db_instance.main.port
  description = "RDS port"
}

output "db_name" {
  value       = aws_db_instance.main.db_name
  description = "Database name"
}

output "username" {
  value       = aws_db_instance.main.username
  description = "Master username"
}

output "password" {
  value       = random_password.db.result
  description = "Master password (feeds the database_url SSM parameter)"
  sensitive   = true
}
EOF
```

**Verify:**

```bash
tofu plan -var-file=environments/uat.tfvars
# Expected: exactly "1 to add" — aws_db_instance.main

tofu apply -var-file=environments/uat.tfvars -auto-approve   # ~5-10 min

aws rds describe-db-instances --db-instance-identifier uat-tournament-db \
  --query 'DBInstances[0].[DBInstanceStatus,PubliclyAccessible,Engine,EngineVersion]'
# Expected: "available", false, "postgres", "15.x"
```

### 3c. Root Output + Converge Check

```bash
cat >> outputs.tf << 'EOF'

output "rds_endpoint" {
  value       = module.database.address
  description = "RDS hostname"
}
EOF

tofu fmt -recursive -check && tofu validate

tofu plan -var-file=environments/uat.tfvars
# Expected: "0 to add, 0 to change, 0 to destroy" — only "Changes to Outputs: + rds_endpoint"

tofu apply -var-file=environments/uat.tfvars -auto-approve   # records the output

tofu output rds_endpoint
# Expected: uat-tournament-db.xxxxx.us-east-2.rds.amazonaws.com

tofu state list | grep '^module\.database' | grep -v '\.data\.' | wc -l
# Expected: 3 (password + subnet group + instance)
```

✅ **Step 3 complete when:** 3a–3c are checked and RDS is "available"

---

## Step 3.5: Create Cache Module (ElastiCache Redis)

> **Decision (2026-07-07): new step — this module did not exist in the original design.** Investigating the token store showed memory mode is unfit for any deployed environment:
>
> - **Magic-link tokens, guest player sessions, and the JWT blocklist live only in the in-process `TokenStore`** (`packages/api/src/auth/magic-link.ts`) with 24-hour TTLs. Every API restart — deploy, crash, systemd `Restart=always` — invalidates all outstanding emailed login links and logs out every guest player.
> - **The in-memory job queue records jobs but never executes them** (`InMemoryJobQueue` has no processing loop; routes that work in memory mode do so by invoking processors inline). `messaging.notify` digest emails, `messaging.read_receipt.flush`, and the partition ensure/purge cron schedules run only in the BullMQ worker (`packages/api/src/worker-entrypoint.ts`). Without it, messaging's partitioned tables eventually run out of future partitions and writes fail — the known 🔴 gap in `MESSAGING_DESIGN.md` §16.
>
> **Locked decisions:**
>
> 1. Single-node **ElastiCache Redis** (`cache.t3.micro`, non-cluster) in the private subnets — same isolation model as RDS. Colocating Redis on the EC2 instance was rejected: instance *replacement* (any `user_data` change, AMI refresh, or taint) would wipe auth state, it makes scale-out silently wrong (per-instance `localhost` stores), and it adds an unmanaged service to a 1 GiB box.
> 2. **Custom parameter group with `maxmemory-policy = noeviction`** — a BullMQ hard requirement (each job is a multi-key ensemble kept consistent by Lua scripts; evicting any member corrupts the queue). ElastiCache's default `volatile-lru` would also evict exactly the wrong keys first: every token-store key carries a TTL, so live magic links would be the first casualties under memory pressure. `noeviction` fails writes loudly instead of losing data silently.
> 3. **`redis-sg` appended to the networking module:** ingress 6379 from `api-sg` only, extending the Step 2 chain to `alb-sg → api-sg → {rds-sg, redis-sg}`.
> 4. A new **`redis_url` SSM parameter** (written in Step 4) feeds both selectors: `TOKEN_STORE=redis` and `JOB_QUEUE=bullmq` (env wiring in the Step 5 note). One node serves the token store and the BullMQ queues under different key prefixes (`magic:*` / `jwt:blocklist:*` vs `bull:*`).
>
> **Billing:** like the ALB, ElastiCache is time-metered (~$0.017/hr ≈ ~$12/month at 24/7 in us-east-2; 750 h/month free on accounts still inside the legacy 12-month free tier). Step 9 teardown remains the cost control.
>
> Must complete before Step 5 — the API and worker read `REDIS_URL` at boot.

**Progress:**

- [x] 3.5a. `redis-sg` appended to the networking module (plan: +1)
- [x] 3.5b. Cache module skeleton — subnet group + parameter group (plan: +2)
- [x] 3.5c. ElastiCache cluster + converge (plan: +1, ~5–10 min apply) 💰

### 3.5a. Extend the Security-Group Chain

Networking module grows from 13 to 14 resources; the Step 2e count of 13 was correct when it ran.

```bash
cat >> modules/networking/main.tf << 'EOF'

resource "aws_security_group" "redis" {
  name   = "${var.environment}-redis-sg"
  vpc_id = aws_vpc.main.id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.api.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "${var.environment}-redis-sg"
    Environment = var.environment
  }
}
EOF

cat >> modules/networking/outputs.tf << 'EOF'

output "redis_security_group_id" {
  value       = aws_security_group.redis.id
  description = "Redis security group ID"
}
EOF
```

**Verify:**

```bash
tofu plan -var-file=environments/uat.tfvars
# Expected: exactly "1 to add" — aws_security_group.redis

tofu apply -var-file=environments/uat.tfvars -auto-approve

aws ec2 describe-security-groups --filters "Name=group-name,Values=uat-redis-sg" \
  --query 'SecurityGroups[0].IpPermissions[0].UserIdGroupPairs[0].GroupId'
# Expected: the sg-... ID of uat-api-sg (chain by reference, same as Step 2d)
```

### 3.5b. Cache Module Skeleton: Subnet Group + Parameter Group

```bash
cat > modules/cache/variables.tf << 'EOF'
variable "environment" {
  description = "Environment name"
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnet IDs for the cache subnet group"
  type        = list(string)
}

variable "redis_security_group_id" {
  description = "Security group admitting only api-sg on 6379"
  type        = string
}

variable "node_type" {
  description = "ElastiCache node type"
  type        = string
  default     = "cache.t3.micro"
}
EOF

cat > modules/cache/main.tf << 'EOF'
resource "aws_elasticache_subnet_group" "main" {
  name       = "${var.environment}-tournament-redis"
  subnet_ids = var.private_subnet_ids

  tags = {
    Name        = "${var.environment}-tournament-redis"
    Environment = var.environment
  }
}

# noeviction is a BullMQ hard requirement (jobs are multi-key ensembles kept
# consistent by Lua scripts). The ElastiCache default volatile-lru would evict
# TTL'd keys first — i.e. live magic-link tokens. Fail writes loudly instead.
resource "aws_elasticache_parameter_group" "main" {
  name   = "${var.environment}-tournament-redis7"
  family = "redis7"

  parameter {
    name  = "maxmemory-policy"
    value = "noeviction"
  }
}
EOF
```

Wire into root `main.tf`:

```bash
cat >> main.tf << 'EOF'

module "cache" {
  source = "./modules/cache"

  environment             = var.environment
  private_subnet_ids      = module.networking.private_subnet_ids
  redis_security_group_id = module.networking.redis_security_group_id
}
EOF

tofu init
```

**Verify:**

```bash
tofu validate

tofu plan -var-file=environments/uat.tfvars
# Expected: exactly "2 to add" — subnet group + parameter group

tofu apply -var-file=environments/uat.tfvars -auto-approve

aws elasticache describe-cache-parameters --cache-parameter-group-name uat-tournament-redis7 \
  --query 'Parameters[?ParameterName==`maxmemory-policy`].ParameterValue'
# Expected: ["noeviction"]
```

### 3.5c. ElastiCache Cluster 💰

Time-metered like the ALB (~$0.017/hr; free-tier eligible on legacy accounts). Apply blocks ~5–10 minutes.

```bash
cat >> modules/cache/main.tf << 'EOF'

resource "aws_elasticache_cluster" "main" {
  cluster_id           = "${var.environment}-tournament-redis"
  engine               = "redis"
  engine_version       = "7.1"
  node_type            = var.node_type
  num_cache_nodes      = 1
  parameter_group_name = aws_elasticache_parameter_group.main.name
  subnet_group_name    = aws_elasticache_subnet_group.main.name
  security_group_ids   = [var.redis_security_group_id]

  tags = {
    Name        = "${var.environment}-tournament-redis"
    Environment = var.environment
  }
}
EOF

cat > modules/cache/outputs.tf << 'EOF'
output "redis_url" {
  value       = "redis://${aws_elasticache_cluster.main.cache_nodes[0].address}:6379"
  description = "Redis connection URL (feeds the redis_url SSM parameter)"
}
EOF
```

**Verify:**

```bash
tofu plan -var-file=environments/uat.tfvars
# Expected: exactly "1 to add" — aws_elasticache_cluster.main

tofu apply -var-file=environments/uat.tfvars -auto-approve   # ~5-10 min

aws elasticache describe-cache-clusters --cache-cluster-id uat-tournament-redis \
  --show-cache-node-info --query 'CacheClusters[0].[CacheClusterStatus,CacheNodes[0].Endpoint.Address]'
# Expected: "available" + the endpoint hostname

tofu fmt -recursive -check && tofu validate
tofu plan -var-file=environments/uat.tfvars
# Expected: "No changes."

tofu state list | grep '^module\.cache' | grep -v '\.data\.' | wc -l
# Expected: 3
```

✅ **Step 3.5 complete when:** 3.5a–3.5c are checked and the cluster is "available"

---

## Step 4: Create Secrets Module

Micro-steps **4a–4c**. (HCL authored here — the original plan-file pointer was dangling, see the Step 3 note.)

> **Changed (2026-07-07): the parameter list is now 7, not 5.** The original five (`database_url`, `jwt_secret`, `node_env`, `email_service`, `frontend_url`) plus:
> - `email_from_address` — the API reads `process.env.EMAIL_FROM_ADDRESS`; the original list missed it (latent in UAT where email is mocked, breaks in production).
> - `redis_url` — the ElastiCache endpoint from Step 3.5.
>
> Only `database_url` and `jwt_secret` are secrets (`SecureString`); the rest are plain `String` config. The original "all 5 are SecureString" validation was wrong on this point too.
>
> **Decision (2026-07-07): `node_env` = `"production"` in every deployed environment, UAT included.** `/test/player-token` (`app.ts:178`) mints a valid player session for any email and is gated only by `NODE_ENV !== 'production'`. The ALB has a public DNS name, so CloudFront routing can't hide it — the env var is the only effective gate. Consequence: e2e tests against deployed environments authenticate via real flows (signup/login, mock-email magic links), never the test-token fixture.
>
> **Fixed (2026-07-08, found during first real boot): `database_url` needs `?sslmode=no-verify`.** RDS Postgres rejects plain connections by default (`no pg_hba.conf entry for host "...", ... no encryption`); `packages/api/src/db-connections.ts` passes `DATABASE_URL` straight to `pg.Pool` with no separate `ssl` option, so `sslmode` has to come from the connection string itself. `sslmode=require` alone isn't enough: the installed `pg`/`pg-connection-string` currently treats `require`/`prefer`/`verify-ca` as aliases for full certificate verification (a temporary, soon-reverting behavior per its own deprecation warning), and Node doesn't trust AWS's RDS CA out of the box — `self-signed certificate in certificate chain`. `no-verify` unambiguously means encrypt-without-verifying, which is what's wanted here since RDS already sits in a private subnet, not internet-reachable.

(This module adds no root outputs.)

**Progress:**

- [x] 4a. Module skeleton + JWT secret (plan: +1)
- [x] 4b. The 7 SSM parameters (plan: +7)
- [x] 4c. Converge check (plan: ±0)

### 4a. Module Skeleton + JWT Secret

```bash
cat > modules/secrets/variables.tf << 'EOF'
variable "environment" {
  description = "Environment name"
  type        = string
}

variable "database_url" {
  description = "Full Postgres connection URL"
  type        = string
  sensitive   = true
}

variable "redis_url" {
  description = "Redis connection URL"
  type        = string
}

variable "email_service" {
  description = "Email service (aws_ses or mock)"
  type        = string
}

variable "email_from_address" {
  description = "From address for emails"
  type        = string
}

variable "frontend_url" {
  description = "Public frontend URL (placeholder until Step 6d)"
  type        = string
}
EOF

cat > modules/secrets/main.tf << 'EOF'
resource "random_password" "jwt" {
  length  = 64
  special = false
}
EOF
```

Wire into root `main.tf` — `database_url` is composed here from Step 3's outputs; `frontend_url` is a placeholder until the CloudFront domain exists (rewired in 6d):

```bash
cat >> main.tf << 'EOF'

module "secrets" {
  source = "./modules/secrets"

  environment        = var.environment
  database_url       = "postgresql://${module.database.username}:${module.database.password}@${module.database.address}:${module.database.port}/${module.database.db_name}?sslmode=no-verify"
  redis_url          = module.cache.redis_url
  email_service      = var.email_service
  email_from_address = var.email_from_address
  frontend_url       = "https://placeholder.invalid" # rewired in 6d
}
EOF

tofu init
```

**Verify:**

```bash
tofu validate

tofu plan -var-file=environments/uat.tfvars
# Expected: exactly "1 to add" — random_password.jwt

tofu apply -var-file=environments/uat.tfvars -auto-approve
```

### 4b. The 7 SSM Parameters

```bash
cat >> modules/secrets/main.tf << 'EOF'

locals {
  prefix = "/${var.environment}/api"
}

resource "aws_ssm_parameter" "database_url" {
  name  = "${local.prefix}/database_url"
  type  = "SecureString"
  value = var.database_url
}

resource "aws_ssm_parameter" "jwt_secret" {
  name  = "${local.prefix}/jwt_secret"
  type  = "SecureString"
  value = random_password.jwt.result
}

# "production" in EVERY deployed environment, UAT included — /test/player-token
# (app.ts) is an auth bypass gated only by NODE_ENV, and the ALB is publicly
# reachable. See the Step 4 decision note.
resource "aws_ssm_parameter" "node_env" {
  name  = "${local.prefix}/node_env"
  type  = "String"
  value = "production"
}

resource "aws_ssm_parameter" "email_service" {
  name  = "${local.prefix}/email_service"
  type  = "String"
  value = var.email_service
}

resource "aws_ssm_parameter" "email_from_address" {
  name  = "${local.prefix}/email_from_address"
  type  = "String"
  value = var.email_from_address
}

resource "aws_ssm_parameter" "frontend_url" {
  name  = "${local.prefix}/frontend_url"
  type  = "String"
  value = var.frontend_url
}

resource "aws_ssm_parameter" "redis_url" {
  name  = "${local.prefix}/redis_url"
  type  = "String"
  value = var.redis_url
}
EOF
```

**Verify:**

```bash
tofu plan -var-file=environments/uat.tfvars
# Expected: exactly "7 to add" — the seven parameters (values shown as (sensitive value) where applicable)

tofu apply -var-file=environments/uat.tfvars -auto-approve

aws ssm get-parameters-by-path --path /uat/api --query 'Parameters[*].Name' | sort
# Expected: database_url, email_from_address, email_service, frontend_url, jwt_secret, node_env, redis_url (7)

aws ssm get-parameter --name /uat/api/jwt_secret --query 'Parameter.Type'
# Expected: "SecureString"

aws ssm get-parameter --name /uat/api/node_env --query 'Parameter.Value'
# Expected: "production"
```

### 4c. Converge Check

```bash
tofu fmt -recursive -check && tofu validate

tofu plan -var-file=environments/uat.tfvars
# Expected: "No changes."

tofu state list | grep '^module\.secrets' | wc -l
# Expected: 8 (jwt password + 7 parameters)
```

✅ **Step 4 complete when:** 4a–4c are checked; all 7 parameters exist; `database_url` and `jwt_secret` are SecureString

---

## Step 5: Create API Module

Micro-steps **5a–5e**. (HCL authored here — the original plan-file pointer was dangling, see the Step 3 note.)

> **Decisions (2026-07-07):**
>
> - **The ALB health check targets `/health/ready`, not `/health`.** `/health` always returns HTTP 200 — liveness semantics, even with the database down (`packages/api/src/app.ts:263`) — so the original plan's health check would mark a dead API healthy and Step 5's verify gate would verify nothing. `/health/ready` returns 503 when the DB is unreachable or Redis is down; with Step 3.5, Redis is a hard dependency (`isRedisSelected()` is true once `TOKEN_STORE=redis`), so its readiness clause is correct, not incidental.
> - **`user_data` writes `TOKEN_STORE=redis` and `JOB_QUEUE=bullmq`** into the env file as plain values (topology decisions, not secrets) alongside the SSM-fetched parameters.
> - **Two systemd units on the one instance:** `tournament-api` (the API server) and `tournament-worker` (`packages/api/src/worker-entrypoint.ts` — the BullMQ consumer that runs messaging digests, read-receipt flushes, and the partition ensure/purge schedules).
> - **Mitigations:** add a swap file in `user_data` (two tsx-loaded Node processes plus the OS inside t2.micro's 1 GiB is tight). The API/worker migration race (`runMigrations()` in both) is resolved structurally: the worker unit's `ExecStartPre=tournament-wait-ready` blocks until `/health/ready` passes, which means the API's migrations already completed — the worker's own run is a sequential no-op re-run, not a concurrent one. No app change required.
> - **Boot-time seeding (UAT only):** when `seed_on_boot = true`, `user_data` also installs a oneshot `tournament-seed.service` gated on `/health/ready` passing. Default `false`, hard-blocked in production by a precondition — full rationale in Step 8.
> - **Code delivery (until Step 10): HTTPS clone with a fine-grained PAT read from SSM.** The repo is private (anonymous clone 404s). A read-only, single-repo token (Contents: read) is placed in SSM **by hand** (`aws ssm put-parameter --name /uat/api/github_token --type SecureString ...`) — deliberately not a tofu resource, so it never enters tofu state or any committed file; `user_data` fetches it via the instance role and falls back to an anonymous clone if the parameter is absent. Fine-grained PATs expire (≤ 1 year); expiry breaks the *next instance replacement*, and its planned demolition is Step 10 (CI/CD swaps clone for an S3 artifact and the parameter is deleted).
> - **Redeploy story: instance replacement is the deploy.** `tofu apply -replace=module.api.aws_instance.main` re-runs the bootstrap — fresh clone of current `main`, `npm ci`, re-seed check. Immutable, no drift, and it exercises the bootstrap path on every deploy. (Auth state now survives replacement — tokens live in Redis, Step 3.5.)
> - **App-side follow-up (not infra):** the BullMQ adapter (`packages/worker/src/bullmq-queue.ts`) sets no `removeOnComplete`/`removeOnFail`, so completed-job records accumulate in Redis indefinitely. One-line adapter fix; tracked here so it isn't lost.
> - **Fixed (2026-07-08, found during first real boot): first-activation chicken-and-egg on `EnvironmentFile=`.** systemd validates every `EnvironmentFile=` path for a unit before running *any* `Exec*` directive, including `ExecStartPre` — so on a unit's very first start, `tournament-refresh-env` never gets to run, because systemd refuses to start the unit at all when `/etc/tournament-app/env` doesn't exist yet (`Result: resources`, both services loop in `activating (auto-restart)`). Fixed by calling `tournament-refresh-env` once directly in `user_data`, before `systemctl enable --now` — every restart after that is still covered by each unit's own `ExecStartPre`.

**Progress:**

- [x] 5a. Module skeleton + IAM (role, policies, instance profile) + `seed_on_boot` root var (plan: +4)
- [x] 5b. `user_data.sh.tpl` authored (plan: ±0 — file only)
- [x] 5c. GitHub PAT parameter (manual) + EC2 instance (plan: +1)
- [x] 5d. ALB + target group + listener + attachment (plan: +4) 💰
- [x] 5e. Converge check (plan: ±0)

### 5a. Module Skeleton + IAM

Full variable set declared now so the root wiring below is append-once:

```bash
cat > modules/api/variables.tf << 'EOF'
variable "environment" {
  description = "Environment name"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID (for the target group)"
  type        = string
}

variable "public_subnet_ids" {
  description = "Public subnet IDs (ALB spans both; instance uses the first)"
  type        = list(string)
}

variable "alb_security_group_id" {
  description = "ALB security group ID"
  type        = string
}

variable "api_security_group_id" {
  description = "API (EC2) security group ID"
  type        = string
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
}

variable "volume_size" {
  description = "Root volume size (GB)"
  type        = number
}

variable "api_port" {
  description = "Port the API listens on"
  type        = number
  default     = 3001
}

variable "health_check_interval" {
  type = number
}

variable "health_check_timeout" {
  type = number
}

variable "health_check_healthy_threshold" {
  type = number
}

variable "health_check_unhealthy_threshold" {
  type = number
}

variable "seed_on_boot" {
  description = "Install the boot-time seed unit (UAT only)"
  type        = bool
  default     = false
}

variable "app_repo" {
  description = "GitHub repo (host/path form, no scheme)"
  type        = string
  default     = "github.com/esckode/rac8-4s.git"
}

variable "app_branch" {
  description = "Branch to deploy"
  type        = string
  default     = "main"
}
EOF

cat > modules/api/main.tf << 'EOF'
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

resource "aws_iam_role" "api" {
  name = "${var.environment}-api-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = {
    Name        = "${var.environment}-api-role"
    Environment = var.environment
  }
}

# Read only this environment's parameter path — this also covers the manually
# created github_token (5c). SES send is used when email_service = aws_ses.
resource "aws_iam_role_policy" "api" {
  name = "${var.environment}-api-policy"
  role = aws_iam_role.api.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["ssm:GetParameter", "ssm:GetParametersByPath"]
        Resource = "arn:aws:ssm:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:parameter/${var.environment}/api/*"
      },
      {
        Effect   = "Allow"
        Action   = ["ses:SendEmail", "ses:SendRawEmail"]
        Resource = "*"
      }
    ]
  })
}

# SSM Session Manager: send-command (seed, debug), port-forward (psql), shell.
resource "aws_iam_role_policy_attachment" "ssm_core" {
  role       = aws_iam_role.api.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "api" {
  name = "${var.environment}-api-profile"
  role = aws_iam_role.api.name
}
EOF
```

Add the `seed_on_boot` root variable (with the production hard-guard — cross-variable validation needs OpenTofu ≥ 1.9; we're on 1.12.3), set it in UAT, and wire the module:

```bash
cat >> variables.tf << 'EOF'

variable "seed_on_boot" {
  description = "Install a boot-time seed unit (known-password test accounts). UAT convenience only."
  type        = bool
  default     = false
  validation {
    condition     = !(var.seed_on_boot && var.environment == "production")
    error_message = "seed_on_boot must never be true in production — the seeds create known-password test accounts (see Step 8)."
  }
}
EOF

cat >> environments/uat.tfvars << 'EOF'

seed_on_boot = true
EOF

cat >> main.tf << 'EOF'

module "api" {
  source = "./modules/api"

  environment           = var.environment
  vpc_id                = module.networking.vpc_id
  public_subnet_ids     = module.networking.public_subnet_ids
  alb_security_group_id = module.networking.alb_security_group_id
  api_security_group_id = module.networking.api_security_group_id
  instance_type         = var.ec2_instance_type
  volume_size           = var.ec2_volume_size
  seed_on_boot          = var.seed_on_boot

  health_check_interval            = var.health_check_interval
  health_check_timeout             = var.health_check_timeout
  health_check_healthy_threshold   = var.health_check_healthy_threshold
  health_check_unhealthy_threshold = var.health_check_unhealthy_threshold

  # The instance reads /${environment}/api/* at first boot — they must exist first.
  depends_on = [module.secrets, module.cache]
}
EOF

tofu init
```

**Verify:**

```bash
tofu validate

tofu plan -var-file=environments/uat.tfvars
# Expected: exactly "4 to add" — role, role policy, policy attachment, instance profile

tofu apply -var-file=environments/uat.tfvars -auto-approve

aws iam get-instance-profile --instance-profile-name uat-api-profile \
  --query 'InstanceProfile.Roles[0].RoleName'
# Expected: "uat-api-role"

# Guard sanity: the production hard-block trips (expect an error, then restore)
tofu plan -var-file=environments/uat.tfvars -var 'environment=production'
# Expected: FAILS with "seed_on_boot must never be true in production"
```

### 5b. Author `user_data.sh.tpl`

No resources — this is the bootstrap contract. `${...}` are template variables; bash variables are deliberately brace-free (templatefile treats `${` as its own syntax).

```bash
cat > modules/api/user_data.sh.tpl << 'TPLEOF'
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
TPLEOF
```

**Verify:**

```bash
bash -n modules/api/user_data.sh.tpl
# Expected: no output (syntactically valid bash — template markers parse as harmless bash)

tofu validate
# Expected: still valid (template not yet referenced)
```

### 5c. GitHub PAT Parameter (Manual) + EC2 Instance

**Manual pre-step — the PAT bridge (Step 5 decision).** Create a fine-grained PAT (this repo only, Contents: read-only) at github.com → Settings → Developer settings, then place it in SSM **by hand** so it never touches tofu state or any committed file:

```bash
aws ssm put-parameter --name /uat/api/github_token --type SecureString --value '<the token>'
# Rotation: fine-grained PATs expire ≤ 1 year; expiry breaks the NEXT instance
# replacement (not running instances). Retired entirely at Step 10.
```

```bash
cat >> modules/api/main.tf << 'EOF'

data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-2023*-kernel-*-x86_64"]
  }
}

resource "aws_instance" "api" {
  ami                    = data.aws_ami.al2023.id
  instance_type          = var.instance_type
  subnet_id              = var.public_subnet_ids[0]
  vpc_security_group_ids = [var.api_security_group_id]
  iam_instance_profile   = aws_iam_instance_profile.api.name

  user_data = templatefile("${path.module}/user_data.sh.tpl", {
    environment  = var.environment
    aws_region   = data.aws_region.current.name
    api_port     = var.api_port
    app_repo     = var.app_repo
    app_branch   = var.app_branch
    seed_on_boot = var.seed_on_boot
  })
  # Replacement IS the deploy (Step 5 decision) — a user_data change must
  # recreate the instance, not stop/start it.
  user_data_replace_on_change = true

  root_block_device {
    volume_size = var.volume_size
  }

  tags = {
    Name        = "${var.environment}-api"
    Environment = var.environment
  }
}
EOF

cat > modules/api/outputs.tf << 'EOF'
output "instance_id" {
  value       = aws_instance.api.id
  description = "EC2 instance ID"
}

output "instance_profile_name" {
  value       = aws_iam_instance_profile.api.name
  description = "IAM instance profile name"
}
EOF

cat >> outputs.tf << 'EOF'

output "ec2_instance_id" {
  value       = module.api.instance_id
  description = "EC2 instance ID"
}

output "iam_instance_profile_name" {
  value       = module.api.instance_profile_name
  description = "IAM instance profile name"
}
EOF
```

> Note: `most_recent = true` means a newer AL2023 AMI on a future plan proposes instance replacement. That's consistent with replacement-is-the-deploy — review the plan, don't be surprised by it.

**Verify:**

```bash
tofu plan -var-file=environments/uat.tfvars
# Expected: exactly "1 to add" — aws_instance.api

tofu apply -var-file=environments/uat.tfvars -auto-approve

# Bootstrap takes ~4-6 min (packages + npm ci + migrations). First: SSM agent online
aws ssm describe-instance-information \
  --query 'InstanceInformationList[?InstanceId==`'$(tofu output -raw ec2_instance_id)'`].PingStatus'
# Expected: ["Online"]

# Then watch the bootstrap complete
aws ssm send-command --instance-ids $(tofu output -raw ec2_instance_id) \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=["tail -5 /var/log/user-data.log; systemctl is-active tournament-api tournament-worker"]' \
  --query 'Command.CommandId' --output text
# Then: aws ssm get-command-invocation --command-id <id> --instance-id <instance-id> --query 'StandardOutputContent'
# Expected: both services "active"
```

### 5d. ALB + Target Group + Listener 💰

First always-billable resource (~$0.0225/hr regardless of free tier — see cost notes). Health check targets `/health/ready` per the Step 5 decision.

```bash
cat >> modules/api/main.tf << 'EOF'

resource "aws_lb" "api" {
  name               = "${var.environment}-api-alb"
  load_balancer_type = "application"
  security_groups    = [var.alb_security_group_id]
  subnets            = var.public_subnet_ids

  tags = {
    Name        = "${var.environment}-api-alb"
    Environment = var.environment
  }
}

resource "aws_lb_target_group" "api" {
  name     = "${var.environment}-api-tg"
  port     = var.api_port
  protocol = "HTTP"
  vpc_id   = var.vpc_id

  health_check {
    path                = "/health/ready" # NOT /health — that is liveness, always 200
    matcher             = "200"
    interval            = var.health_check_interval
    timeout             = var.health_check_timeout
    healthy_threshold   = var.health_check_healthy_threshold
    unhealthy_threshold = var.health_check_unhealthy_threshold
  }

  tags = {
    Name        = "${var.environment}-api-tg"
    Environment = var.environment
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.api.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

resource "aws_lb_target_group_attachment" "api" {
  target_group_arn = aws_lb_target_group.api.arn
  target_id        = aws_instance.api.id
  port             = var.api_port
}
EOF

cat >> modules/api/outputs.tf << 'EOF'

output "alb_dns_name" {
  value       = aws_lb.api.dns_name
  description = "ALB DNS name"
}

output "alb_arn" {
  value       = aws_lb.api.arn
  description = "ALB ARN"
}

output "target_group_arn" {
  value       = aws_lb_target_group.api.arn
  description = "Target group ARN"
}
EOF

cat >> outputs.tf << 'EOF'

output "alb_dns_name" {
  value       = module.api.alb_dns_name
  description = "ALB DNS name"
}

output "alb_arn" {
  value       = module.api.alb_arn
  description = "ALB ARN"
}

output "alb_target_group_arn" {
  value       = module.api.target_group_arn
  description = "ALB target group ARN"
}
EOF
```

**Verify:**

```bash
tofu plan -var-file=environments/uat.tfvars
# Expected: exactly "4 to add" — ALB, target group, listener, attachment

tofu apply -var-file=environments/uat.tfvars -auto-approve   # ALB takes ~2-3 min

aws elbv2 describe-target-health --target-group-arn $(tofu output -raw alb_target_group_arn) \
  --query 'TargetHealthDescriptions[0].TargetHealth.State'
# Expected: "healthy" (give it interval × healthy_threshold ≈ 1 min after the ALB is active)

curl -s http://$(tofu output -raw alb_dns_name)/health/ready
# Expected: {"status":"ok","database":"connected","redis":"connected"}
```

### 5e. Converge Check

```bash
tofu fmt -recursive -check && tofu validate

tofu plan -var-file=environments/uat.tfvars
# Expected: "No changes."

tofu state list | grep '^module\.api' | grep -v '\.data\.' | wc -l
# Expected: 9 (role, policy, attachment, profile, instance, ALB, target group, listener, attachment)
```

✅ **Step 5 complete when:** 5a–5e are checked, both services are active, and target health is "healthy"

---

## Step 6: Create Frontend Module

Micro-steps **6a–6e**. (HCL authored here — the original plan-file pointer was dangling, see the Step 3 note.)

> **Decisions (2026-07-07):**
>
> - **CloudFront→ALB behaviors are exactly three: `/api/*`, `/tournaments/*`, `/player/*`.** The original plan's two-path list missed `/player/*` — the API's real top-level mounts are `/tournaments`, `/player`, `/player/groups`, `/api/analytics`, `/api/auth`, `/api/admin` (`app.ts:165-202`), so guest-session restore and player-groups calls would have hit the S3 origin and received HTML. Deliberately excluded: `/health*` (the ALB probes `/health/ready` internally; validation curls the ALB DNS directly; no DB/Redis/partition status detail on the public CDN domain) and `/test` (must not exist in deployed envs — see the `node_env` decision in Step 4).
> - **Maintenance rule** (also added to `CLAUDE.md` §9): any new top-level API mount must be added to the CloudFront behavior list in the frontend module, or it silently routes to S3.
> - **App-side prerequisite — SSE heartbeat (~25s).** Both SSE endpoints (`tournaments.ts` stream, `player-groups.ts` stream) write only when a message arrives. ALB kills idle connections at 60s, CloudFront at ~30s; `EventSource` reconnects but events during the gap are lost (no `id:`/replay). A ~25-second comment ping (TDD'd as a separate app change) must land before messaging is exercised through CloudFront.
> - **SPA routing via a CloudFront Function, NOT `custom_error_response`.** The original plan's "403/404 → `/index.html` as 200" rules are distribution-wide — they'd also rewrite the API's legitimate 403/404 JSON responses into 200+HTML, defeating every `if (!res.ok)` guard in the frontend and turning auth denials into JSON-parse crashes (only reproducible through the CDN). Instead: a viewer-request function attached **only to the S3 default behavior** rewrites extensionless URIs to `/index.html` (SPA route params are UUIDs — no dots — so the heuristic is safe). API behaviors pass errors through untouched. Accepted rough edge: a genuinely missing *asset* returns S3's raw 403 XML; not worth granting `s3:ListBucket` to beautify.

**Progress:**

- [x] 6a. Module skeleton — bucket, public-access block, OAC (plan: +3)
- [x] 6b. SPA-rewrite function + CloudFront distribution (plan: +2, ~5–15 min apply)
- [x] 6c. Bucket policy + root outputs (plan: +1)
- [x] 6d. Rewire `frontend_url` + restart services (plan: ~1 in-place change)
- [x] 6e. Converge check (plan: ±0)

### 6a. Module Skeleton: Bucket + Public-Access Block + OAC

```bash
cat > modules/frontend/variables.tf << 'EOF'
variable "environment" {
  description = "Environment name"
  type        = string
}

variable "alb_dns_name" {
  description = "ALB DNS name (the API origin)"
  type        = string
}
EOF

cat > modules/frontend/main.tf << 'EOF'
data "aws_caller_identity" "current" {}

# force_destroy: the bucket holds only rebuildable build artifacts, so Step 9's
# teardown may delete it non-empty.
resource "aws_s3_bucket" "frontend" {
  bucket        = "${var.environment}-tournament-frontend-${data.aws_caller_identity.current.account_id}"
  force_destroy = true

  tags = {
    Name        = "${var.environment}-tournament-frontend"
    Environment = var.environment
  }
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "${var.environment}-frontend-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}
EOF
```

Wire into root `main.tf`:

```bash
cat >> main.tf << 'EOF'

module "frontend" {
  source = "./modules/frontend"

  environment  = var.environment
  alb_dns_name = module.api.alb_dns_name
}
EOF

tofu init
```

**Verify:**

```bash
tofu validate

tofu plan -var-file=environments/uat.tfvars
# Expected: exactly "3 to add" — bucket, public access block, OAC

tofu apply -var-file=environments/uat.tfvars -auto-approve

aws s3api get-public-access-block --bucket uat-tournament-frontend-$(aws sts get-caller-identity --query Account --output text) \
  --query 'PublicAccessBlockConfiguration.BlockPublicPolicy'
# Expected: true
```

### 6b. SPA-Rewrite Function + CloudFront Distribution

The apply itself is quick, but the distribution takes ~5–15 minutes to reach "Deployed".

```bash
cat >> modules/frontend/main.tf << 'EOF'

# SPA fallback — attached ONLY to the S3 default behavior, so API errors keep
# their real status codes (custom_error_response would be distribution-wide and
# rewrite API 403/404s to 200+HTML — see the Step 6 decision).
resource "aws_cloudfront_function" "spa_rewrite" {
  name    = "${var.environment}-spa-rewrite"
  runtime = "cloudfront-js-2.0"
  publish = true
  code    = <<-EOT
    function handler(event) {
      var request = event.request;
      if (!request.uri.includes('.')) {
        request.uri = '/index.html';
      }
      return request;
    }
  EOT
}

data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_cache_policy" "caching_disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
  name = "Managed-AllViewerExceptHostHeader"
}

locals {
  # Step 6 decision — keep in sync with the API's top-level mounts (CLAUDE.md §9).
  api_path_patterns = ["/api/*", "/tournaments/*", "/player/*"]
}

resource "aws_cloudfront_distribution" "main" {
  enabled             = true
  comment             = "${var.environment} tournament app"
  default_root_object = "index.html"
  price_class         = "PriceClass_100"

  origin {
    origin_id                = "s3-frontend"
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  origin {
    origin_id   = "alb-api"
    domain_name = var.alb_dns_name

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only" # the ALB listener is HTTP :80
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id       = "s3-frontend"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = data.aws_cloudfront_cache_policy.caching_optimized.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa_rewrite.arn
    }
  }

  dynamic "ordered_cache_behavior" {
    for_each = local.api_path_patterns
    content {
      path_pattern             = ordered_cache_behavior.value
      target_origin_id         = "alb-api"
      viewer_protocol_policy   = "https-only"
      allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
      cached_methods           = ["GET", "HEAD"]
      cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
      origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = {
    Name        = "${var.environment}-frontend"
    Environment = var.environment
  }
}
EOF
```

**Verify:**

```bash
tofu plan -var-file=environments/uat.tfvars
# Expected: exactly "2 to add" — function + distribution

tofu apply -var-file=environments/uat.tfvars -auto-approve

DIST_ID=$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?Comment=='uat tournament app'].Id" --output text)
aws cloudfront get-distribution --id $DIST_ID --query 'Distribution.Status'
# Expected: "InProgress" then "Deployed" (~5-15 min)

aws cloudfront get-distribution --id $DIST_ID \
  --query 'Distribution.DistributionConfig.[Origins.Quantity,CacheBehaviors.Quantity,DefaultCacheBehavior.FunctionAssociations.Quantity]'
# Expected: [2, 3, 1] — 2 origins, 3 ALB behaviors, 1 function on the default behavior
```

### 6c. Bucket Policy + Root Outputs

The policy references the distribution ARN (only this distribution may read), which is why it comes after 6b:

```bash
cat >> modules/frontend/main.tf << 'EOF'

resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowCloudFrontOAC"
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.frontend.arn}/*"
      Condition = {
        StringEquals = { "AWS:SourceArn" = aws_cloudfront_distribution.main.arn }
      }
    }]
  })
}
EOF

cat > modules/frontend/outputs.tf << 'EOF'
output "bucket_name" {
  value       = aws_s3_bucket.frontend.id
  description = "Frontend bucket name"
}

output "distribution_id" {
  value       = aws_cloudfront_distribution.main.id
  description = "CloudFront distribution ID"
}

output "distribution_domain_name" {
  value       = aws_cloudfront_distribution.main.domain_name
  description = "CloudFront domain"
}
EOF

cat >> outputs.tf << 'EOF'

output "frontend_bucket_name" {
  value       = module.frontend.bucket_name
  description = "S3 bucket name for frontend"
}

output "cloudfront_distribution_id" {
  value       = module.frontend.distribution_id
  description = "CloudFront distribution ID"
}

output "cloudfront_url" {
  value       = module.frontend.distribution_domain_name
  description = "CloudFront distribution domain"
}
EOF
```

**Verify:**

```bash
tofu plan -var-file=environments/uat.tfvars
# Expected: exactly "1 to add" (bucket policy) plus "Changes to Outputs" (+3)

tofu apply -var-file=environments/uat.tfvars -auto-approve

aws s3api get-bucket-policy --bucket $(tofu output -raw frontend_bucket_name) \
  --query Policy --output text | grep -o 'cloudfront.amazonaws.com'
# Expected: cloudfront.amazonaws.com
```

### 6d. Rewire `frontend_url` + Restart Services

> **Defect found & fixed (2026-07-09):** this rewire creates a module-level dependency cycle — `module.api` had `depends_on = [module.secrets, …]` (5a), secrets now consumes the CloudFront domain, and CloudFront consumes the ALB DNS from `module.api`. Fix: drop `module.secrets` from api's `depends_on`; the boot script's `get_param` retry loop (5×5s per parameter) already covers the params-not-yet-created race, and `github_token` is manually managed so it always exists. Residual edge: on a from-scratch apply of the *final* config, the instance may boot before the distribution exists, leaving `FRONTEND_URL` empty until the next service restart or instance replacement — acceptable in UAT; the restart below covers the first build.

The Step 4a placeholder can now become the real CloudFront domain. Edit root `main.tf` — in the `module "secrets"` block, replace:

```hcl
  frontend_url       = "https://placeholder.invalid" # rewired in 6d
```

with:

```hcl
  frontend_url       = "https://${module.frontend.distribution_domain_name}"
```

**Verify + apply + restart** (the env file is regenerated by `ExecStartPre` on every service start, so a restart picks up the new parameter):

```bash
tofu plan -var-file=environments/uat.tfvars
# Expected: exactly "1 to change" — aws_ssm_parameter.frontend_url updated in-place

tofu apply -var-file=environments/uat.tfvars -auto-approve

aws ssm get-parameter --name /uat/api/frontend_url --query 'Parameter.Value'
# Expected: https://dxxxxxxxxxxxxx.cloudfront.net

aws ssm send-command --instance-ids $(tofu output -raw ec2_instance_id) \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=["systemctl restart tournament-api tournament-worker && sleep 5 && grep FRONTEND_URL /etc/tournament-app/env"]'
# Then get-command-invocation — Expected: FRONTEND_URL=https://dxxxx.cloudfront.net
```

### 6e. Converge Check

```bash
tofu fmt -recursive -check && tofu validate

tofu plan -var-file=environments/uat.tfvars
# Expected: "No changes."

tofu state list | grep '^module\.frontend' | grep -v '\.data\.' | wc -l
# Expected: 6 (bucket, PAB, OAC, function, distribution, bucket policy)

tofu state list | grep -v '\.data\.' | wc -l
# Expected: 43 total (networking 14, database 3, cache 3, secrets 8, api 9, frontend 6)
```

✅ **Step 6 complete when:** 6a–6e are checked, the distribution is "Deployed", and `frontend_url` matches the CloudFront domain

---

## Step 7: End-to-End Validation

Micro-steps **7a–7c** — commands only, no new resources.

> **Changed (2026-07-07):** health is deliberately **not** routed through CloudFront (Step 6 decision), so the original `curl https://$FRONTEND_URL/health` would return the SPA shell, not JSON. Health is validated against the ALB directly; the CDN is validated by paths it *does* route.

**Progress:**

- [x] 7a. Build & deploy the frontend
- [x] 7b. Health + routing checks (ALB direct, API via CDN, SPA fallback)
- [x] 7c. Auth smoke test through CloudFront

### 7a. Build & Deploy Frontend

```bash
cd /home/esckode/projects/claude/rac8-4s
npm run build --workspace=packages/frontend

BUCKET=$(cd infra && tofu output -raw frontend_bucket_name)
aws s3 sync packages/frontend/dist/ s3://$BUCKET/ --delete

# PWA_CACHING_IMPLEMENTATION.md S7 — service-worker.js and manifest.webmanifest carry
# the CachingDisabled behavior at the CloudFront layer (frontend module), but S3's own
# default Content-Type-derived caching metadata still needs an explicit no-cache so an
# intermediate/browser cache can't serve either stale (blocking the D9 update-prompt
# flow, or pointing at renamed/removed icons).
aws s3 cp packages/frontend/dist/service-worker.js s3://$BUCKET/service-worker.js \
  --cache-control "no-cache" --metadata-directive REPLACE
aws s3 cp packages/frontend/dist/manifest.webmanifest s3://$BUCKET/manifest.webmanifest \
  --cache-control "no-cache" --metadata-directive REPLACE

DIST_ID=$(cd infra && tofu output -raw cloudfront_distribution_id)
aws cloudfront create-invalidation --distribution-id $DIST_ID --paths "/*"
```

**Verify:** `aws s3 ls s3://$BUCKET/ --recursive | head` shows `index.html` + `assets/…`.
`aws s3api head-object --bucket $BUCKET --key service-worker.js --query CacheControl`
should show `"no-cache"`.

### 7b. Health + Routing Checks

```bash
ALB_DNS=$(cd infra && tofu output -raw alb_dns_name)
curl -s http://$ALB_DNS/health/ready
# Expected: {"status":"ok","database":"connected","redis":"connected"}

FRONTEND_URL=$(cd infra && tofu output -raw cloudfront_url)

# API behavior routes to the ALB (JSON, not HTML):
curl -s https://$FRONTEND_URL/tournaments/public | head -c 200
# Expected: JSON (a tournament list), NOT "<!doctype html>"

# SPA shell + the 6b rewrite function (deep link without a file extension):
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" https://$FRONTEND_URL/browse
# Expected: 200 text/html

# /health is NOT on the CDN — the rewrite serves the SPA shell instead of API JSON:
curl -s https://$FRONTEND_URL/health | head -c 30
# Expected: "<!doctype html>..." (deliberate — Step 6 decision)
```

### 7c. Auth Smoke Test Through CloudFront

Requires seeded data (`seed_on_boot = true` did this at boot; Step 8 is the formal gate):

```bash
curl -s -X POST "https://$FRONTEND_URL/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"organizer@test.com","password":"testpass123"}'
# Expected: 200 with a token — proves CDN→ALB→API→RDS and the auth path end-to-end
```

✅ **Step 7 complete when:** 7a–7c are checked — readiness ok, CDN routes API paths to JSON and SPA paths to HTML, login succeeds through the CDN

---

## Step 8: Seed Database (UAT Only)

> **Decision (2026-07-07): seeding is automated at boot, gated by `seed_on_boot` — this step is now verification only.** The original commands here ran seed/`psql` from the local machine against the RDS hostname, which is impossible by design: RDS sits in private subnets with no internet route, behind a security group admitting only `api-sg`. Resolution:
>
> - **`seed_on_boot` variable, default `false`; only `uat.tfvars` sets it `true`.** When set, `user_data` installs a oneshot `tournament-seed.service` that waits for `/health/ready` to pass (proving migrations completed), then runs the repo's own seed scripts (`npm run seed` from the instance's checkout — nothing shipped outside source control). The scripts are idempotent (check-before-insert), so re-runs on instance replacement are harmless. Rationale: UAT is destroyed/recreated frequently (free-tier hours), so manual re-seeding is repeated toil.
> - **Hard guard, not a memory item:** a precondition fails `tofu plan` when `seed_on_boot && environment == "production"`. The seeds create well-known test accounts with known passwords (`packages/api/scripts/seed-test-accounts.ts`); keeping them out of production must be structurally impossible — especially since new env tfvars are typically created by copying `uat.tfvars`. Nothing needs to be "removed before production."
> - Manual seeding and interactive `psql` access are documented in **Troubleshooting**.
>
> **Note:** `tofu workspace select uat` assumes per-environment workspaces, but no earlier step creates them — everything through Step 7 runs in the `default` workspace. Workspaces + the workspace/environment guard are introduced at the production milestone (see the 1g note). Until then, skip the `workspace select` line.

```bash
# Verify seeding end-to-end: log in as a seeded account through the ALB.
# Proves the seed ran, the DB is reachable, and the auth path works.
ALB_DNS=$(cd infra && tofu output -raw alb_dns_name)
curl -s -X POST "http://$ALB_DNS/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"organizer@test.com","password":"testpass123"}'
# Expected: 200 with a token in the response body
```

> **App defect found & fixed (2026-07-09):** `npm run seed:accounts` was a silent no-op — `scripts/seed-test-accounts.ts` exported `seedTestAccounts()` but had no `require.main === module` entry block (unlike `seed-tournaments.ts`), so the test accounts never existed and this login check failed with UNAUTHORIZED. Fixed by adding the same entry block. Until the fix lands on the deployed branch (`main`), instances seeded at boot get tournaments but not accounts; a one-off `tsx` run of `seedTestAccounts()` on the instance backfills them (idempotent).

✅ **Validation passed if:** login as a seeded account succeeds

---

## Step 9: Teardown & Cleanup (UAT)

Teardown is the cost control — the ALB and ElastiCache bill by the hour whether or not traffic flows. Destroy between sessions. Notes:

- **Expect ~15–20 minutes**, dominated by CloudFront (disable, propagate, delete).
- The frontend bucket deletes even when non-empty (`force_destroy = true`, 6a).
- **Survivors (intentional):** the state bucket, and the manually created `/uat/api/github_token` parameter — keep it for the next build-up; delete with `aws ssm delete-parameter --name /uat/api/github_token` only when retiring the PAT (Step 10).

```bash
tofu destroy -var-file=environments/uat.tfvars -auto-approve   # UAT only — never against production
# Expected: "Destroy complete! Resources: 43 destroyed."
```

**Verify:**

```bash
aws ec2 describe-instances --filters "Name=tag:Environment,Values=uat" \
  --query 'Reservations[*].Instances[*].State.Name'
# Expected: empty, or only "terminated"

aws rds describe-db-instances --db-instance-identifier uat-tournament-db 2>&1 | grep -o DBInstanceNotFound
# Expected: DBInstanceNotFound

aws elasticache describe-cache-clusters --cache-cluster-id uat-tournament-redis 2>&1 | grep -o CacheClusterNotFound
# Expected: CacheClusterNotFound

tofu state list | wc -l
# Expected: 0
```

✅ **Step 9 passed if:** destroy reports 43 destroyed and all four checks pass

---

## Step 10: CI/CD (GitHub Actions + OIDC + S3 Artifact)

> **Decision (2026-07-07): scoped as a numbered step so it's a destination, not a someday-note.** Not started; build only after Step 7 has passed end-to-end — a deploy pipeline needs a proven deploy target, and building it earlier makes every failure a three-way ambiguity (app vs infra vs pipeline).
>
> **Scope sketch:**
>
> 1. **OIDC trust:** an `aws_iam_openid_connect_provider` for `token.actions.githubusercontent.com` + a CI role assumable only by this repo's workflows (`sub` condition on `repo:esckode/rac8-4s:*`). No long-lived AWS keys in GitHub, no GitHub credentials in AWS.
> 2. **Artifact bucket:** versioned S3 bucket; CI uploads `releases/<sha>.tar.gz` (built by `git archive` after tests pass, optionally with `node_modules` baked in so instance boots stop depending on the npm registry).
> 3. **Workflow:** on push to `main` — test → build artifact → upload → trigger instance replacement (`tofu apply -replace=...`).
> 4. **Bootstrap swap:** `user_data`'s clone block becomes `aws s3 cp` of the artifact (instance role gets read on the bucket); **delete the `/…/api/github_token` SSM parameter** — the PAT bridge is demolished.
>
> "What's deployed" then becomes a SHA-named immutable artifact that passed CI, instead of whatever `main` was at last boot.
>
> **Documentation (decided 2026-07-07):** when this milestone starts, elaborate it in its own **`CICD-implementation.md`** (same style: grill the open decisions first — who runs `tofu apply`, CI vs laptop state-locking, artifact retention, test gating in the workflow — then micro-steps with verify gates), and shrink this section to a pointer + completion gate. Not written now, deliberately: content authored far ahead of use is how this plan's pointers went dangling in the first place. This stub stays the anchor in the Complete Checklist.

---

## Troubleshooting

**EC2 User Data Failed:** Check system logs
```bash
aws ec2 get-console-output --instance-id <id> | tail -50
```

**Database Connection Failed:** Check security groups
```bash
aws ec2 describe-security-groups --group-ids <id> --query 'SecurityGroups[0].IpPermissions'
```

**ALB Target Unhealthy:** Check app logs via SSM Session Manager
```bash
aws ssm start-session --target <instance-id>
# Then: systemctl status tournament-api
```

**CloudFront Not Serving:** Verify S3 bucket is empty (if new) or has files
```bash
aws s3 ls s3://<bucket>/ --recursive
```

**Manual Seed (re-run on the instance):** the seed scripts live in the checkout; run them with the instance's own env
```bash
aws ssm send-command --instance-ids <instance-id> --document-name "AWS-RunShellScript" \
  --parameters 'commands=["cd /opt/tournament-app && set -a && . /etc/tournament-app/env && set +a && npm run seed --workspace=packages/api"]'
```

**Interactive psql (RDS is in private subnets — tunnel through the instance):** requires the local session-manager-plugin
```bash
aws ssm start-session --target <instance-id> \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters "host=<rds-endpoint>,portNumber=5432,localPortNumber=15432"
# In another terminal (password is in the /uat/api/database_url SSM parameter):
psql "postgresql://tournament_user:<password>@localhost:15432/tournament_app"
```

---

## Next Steps After Implementation

1. Deploy to production: `tofu apply -var-file=environments/production.tfvars`
2. Add more environments by creating new `.tfvars` files
3. Enable CloudTrail (see **`IaC-architecture.md`** → "Adding CloudTrail")
4. Monitor costs in AWS Console

---

## Complete Checklist

- [x] Step 1: OpenTofu initialized (progress checkboxes for 1a–1g live in the Step 1 section — that's the canonical tracker)
- [x] Step 2: Networking created & validated
- [x] Step 3: Database created & validated
- [x] Step 3.5: Cache (ElastiCache Redis) created & validated
- [x] Step 4: Secrets created & validated
- [x] Step 5: API created & validated
- [x] Step 6: Frontend created & validated
- [x] Step 7: End-to-end validated
- [x] Step 8: Database seeded (UAT)
- [x] Step 9: Teardown tested (UAT)
- [ ] Step 10: CI/CD (GitHub Actions + OIDC + S3 artifact; retires the PAT bridge)
- [ ] Ready for production deployment

---

## Document Index

- **IaC-design.md** — High-level overview, decisions, risks
- **IaC-architecture.md** — Detailed architecture, all parameters, all components
- **IaC-implementation.md** (this file) — Step-by-step implementation guide with validation

---

## Need Help?

**For parameter details:** See **`IaC-architecture.md`** → "Parameters & Configuration"

**For component details:** See **`IaC-architecture.md`** → "Complete AWS Component List"

**For design decisions:** See **`IaC-design.md`** → "Key Design Decisions"

**For detailed HCL code:** authored directly in this document (Steps 2–6). The old pointer to `~/.claude/plans/piped-zooming-mist.md` is dangling for all modules except CloudTrail — consult it only for the audit module.
