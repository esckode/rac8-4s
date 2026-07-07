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

**For detailed HCL code, see:** `/home/esckode/.claude/plans/piped-zooming-mist.md` → "Database Module"

[Follow same pattern: Create files → Wire module → Add root outputs → Validate]

### Add Root Outputs (Database)

```bash
cat >> outputs.tf << 'EOF'

output "rds_endpoint" {
  value       = module.database.endpoint
  description = "RDS endpoint"
}
EOF
```

### Validate Database

```bash
# Wait for RDS to become available (5-10 minutes)
aws rds describe-db-instances --db-instance-identifier uat-tournament-db \
  --query 'DBInstances[0].DBInstanceStatus'
# Expected: "available"

# Verify endpoint
tofu output rds_endpoint
# Expected: uat-tournament-db.xxxxx.us-east-2.rds.amazonaws.com
```

✅ **Validation passed if:** RDS instance is "available"

---

## Step 4: Create Secrets Module

**For detailed HCL code, see:** `/home/esckode/.claude/plans/piped-zooming-mist.md` → "Secrets Module"

(This module adds no root outputs.)

### Validate Secrets

```bash
# Verify secrets exist
aws ssm describe-parameters --filters "Key=Name,Values=/uat/api" \
  --query 'Parameters[*].Name'
# Expected: All 5 parameter names

# Verify encryption type
aws ssm get-parameter --name /uat/api/jwt_secret --query 'Parameter.Type'
# Expected: SecureString
```

✅ **Validation passed if:** All 5 secrets are SecureString type

---

## Step 5: Create API Module

**For detailed HCL code, see:** `/home/esckode/.claude/plans/piped-zooming-mist.md` → "API Module"

### Add Root Outputs (API)

```bash
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

### Validate API

```bash
# Wait for user_data (2-3 minutes)
sleep 120

# Check EC2 logs
aws ec2 get-console-output --instance-id $(tofu output -raw ec2_instance_id) | tail -30
# Expected: "tournament-api.service started" or success message

# Wait for health check (1-2 minutes)
sleep 60

# Check ALB target health
aws elbv2 describe-target-health --target-group-arn $(tofu output -raw alb_target_group_arn) \
  --query 'TargetHealthDescriptions[0].TargetHealth.State'
# Expected: healthy
```

✅ **Validation passed if:** ALB target health is "healthy"

---

## Step 6: Create Frontend Module

**For detailed HCL code, see:** `/home/esckode/.claude/plans/piped-zooming-mist.md` → "Frontend Module"

### Add Root Outputs (Frontend)

```bash
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

### Validate Frontend

```bash
# Verify CloudFront distribution is deployed
DIST_ID=$(tofu output -raw cloudfront_distribution_id)
aws cloudfront get-distribution --id $DIST_ID --query 'Distribution.Status'
# Expected: Deployed

# Verify 2 origins
aws cloudfront get-distribution --id $DIST_ID \
  --query 'Distribution.DistributionConfig.Origins[*].DomainName'
# Expected: 2 domains
```

✅ **Validation passed if:** CloudFront is "Deployed" with 2 origins

---

## Step 7: End-to-End Validation

### Build & Deploy Frontend

```bash
npm run build --workspace=packages/frontend

BUCKET=$(cd infra && tofu output -raw frontend_bucket_name)
aws s3 sync packages/frontend/dist/ s3://$BUCKET/ --delete

DIST_ID=$(cd infra && tofu output -raw cloudfront_distribution_id)
aws cloudfront create-invalidation --distribution-id $DIST_ID --paths "/*"
```

### Test Health Endpoint

```bash
FRONTEND_URL=$(cd infra && tofu output -raw cloudfront_url)
curl https://$FRONTEND_URL/health

# Expected: {"status":"ok","database":"connected"}
```

✅ **Validation passed if:** Health endpoint returns success

---

## Step 8: Seed Database (UAT Only)

> **Note:** `tofu workspace select uat` assumes per-environment workspaces, but no earlier step creates them — everything through Step 7 runs in the `default` workspace. Workspaces + the workspace/environment guard are introduced at the production milestone (see the 1g note). Until then, skip the `workspace select` line.

```bash
tofu workspace select uat

DATABASE_URL=$(aws ssm get-parameter \
  --name "/uat/api/database_url" \
  --with-decryption \
  --query 'Parameter.Value' \
  --output text)

DATABASE_URL="$DATABASE_URL" npm run seed --workspace=packages/api

# Verify seeded data
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM public.accounts;"
# Expected: 2
```

✅ **Validation passed if:** Seeded accounts exist

---

## Step 9: Teardown & Cleanup (UAT)

```bash
tofu destroy -var-file=environments/uat.tfvars -auto-approve

# Verify cleanup
aws ec2 describe-instances --filters "Name=tag:Environment,Values=uat" --query 'Reservations[0]'
# Expected: Empty or error
```

✅ **Validation passed if:** All resources deleted

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

---

## Next Steps After Implementation

1. Deploy to production: `tofu apply -var-file=environments/production.tfvars`
2. Add more environments by creating new `.tfvars` files
3. Enable CloudTrail (see **`IaC-architecture.md`** → "Adding CloudTrail")
4. Monitor costs in AWS Console

---

## Complete Checklist

- [ ] Step 1: OpenTofu initialized (progress checkboxes for 1a–1g live in the Step 1 section — that's the canonical tracker)
- [ ] Step 2: Networking created & validated
- [ ] Step 3: Database created & validated
- [ ] Step 4: Secrets created & validated
- [ ] Step 5: API created & validated
- [ ] Step 6: Frontend created & validated
- [ ] Step 7: End-to-end validated
- [ ] Step 8: Database seeded (UAT)
- [ ] Step 9: Teardown tested (UAT)
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

**For detailed HCL code:** See `/home/esckode/.claude/plans/piped-zooming-mist.md`
