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

- ✅ OpenTofu installed: `brew install opentofu`
- ✅ AWS CLI configured: `aws configure`
- ✅ AWS account access
- ✅ This repository cloned locally

### Recommended

- ✅ Read `IaC-design.md` first (high-level overview)
- ✅ Read `IaC-architecture.md` for reference during implementation

---

## One-Time Setup (Do This First)

### Create S3 State Bucket

```bash
# Create bucket for Terraform state
aws s3 mb s3://tournament-app-tofu-state --region us-east-1

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

### Create Directory Structure

```bash
cd /home/esckode/projects/claude/rac8-4s
mkdir -p infra/{modules/{networking,secrets,database,api,frontend,audit},environments}
cd infra
```

### Create `backend.tf`

```bash
cat > backend.tf << 'EOF'
terraform {
  backend "s3" {
    bucket         = "tournament-app-tofu-state"
    key            = "tournament-app.tfstate"
    region         = "us-east-1"
    encrypt        = true
    use_lockfile   = true
  }
}
EOF
```

### Create `main.tf` (Provider Only)

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
```

### Create `variables.tf`

**Reference:** For complete variable list, see **`IaC-architecture.md`** → "All Available Parameters"

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
  default     = "us-east-1"
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

### Create `outputs.tf`

```bash
cat > outputs.tf << 'EOF'
output "vpc_id" {
  value       = module.networking.vpc_id
  description = "VPC ID"
}

output "public_subnet_ids" {
  value       = module.networking.public_subnet_ids
  description = "Public subnet IDs"
}

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

output "rds_endpoint" {
  value       = module.database.endpoint
  description = "RDS endpoint"
}

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

output "iam_instance_profile_name" {
  value       = module.api.instance_profile_name
  description = "IAM instance profile name"
}
EOF
```

### Create Environment Config Files

**Reference:** See **`IaC-architecture.md`** → "Parameters & Configuration" for all available parameters and how to customize.

**`environments/production.tfvars`:**
```bash
cat > environments/production.tfvars << 'EOF'
environment                    = "production"
aws_region                     = "us-east-1"
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

**`environments/uat.tfvars`:**
```bash
cat > environments/uat.tfvars << 'EOF'
environment                    = "uat"
aws_region                     = "us-east-1"
vpc_cidr                       = "10.1.0.0/16"

ec2_instance_type              = "t2.micro"
ec2_volume_size                = 20
enable_ssh                     = true
allowed_ssh_cidr               = "0.0.0.0/0"

db_instance_class              = "db.t3.micro"
db_allocated_storage           = 20
db_backup_retention_period     = 0
db_skip_final_snapshot         = true

health_check_interval          = 30
health_check_timeout           = 5
health_check_healthy_threshold = 2
health_check_unhealthy_threshold = 3

email_service                  = "mock"
email_from_address             = "noreply@uat.example.com"

enable_cloudtrail              = true
enable_cloudwatch_logs         = false
enable_mfa_delete              = false
log_retention_days             = 30
EOF
```

### Initialize OpenTofu

```bash
tofu init

# Expected output:
# Initializing the backend...
# Initializing modules...
# Initializing provider plugins...
# [success] Terraform has been successfully initialized!
```

### Validate

```bash
# Check that state backend is configured
ls -la .terraform/
# Expected: backend.tf config file

# Verify providers are installed
ls .terraform/providers/
# Expected: aws and random providers

# Test syntax
tofu validate
# Expected: "Success! The configuration is valid."
```

✅ **Validation passed if:** `tofu validate` succeeds with "Success!" message

---

## Step 2: Create Networking Module

**For detailed HCL code, see:** `/home/esckode/.claude/plans/piped-zooming-mist.md` → "Networking Module"

### Create `modules/networking/main.tf`

[Create networking module with VPC, subnets, IGW, route tables, security groups]

### Create `modules/networking/variables.tf`

[Standard variables: environment, vpc_cidr]

### Create `modules/networking/outputs.tf`

[Output VPC ID, subnet IDs, security group IDs]

### Wire Into Root `main.tf`

```bash
cat >> main.tf << 'EOF'

module "networking" {
  source = "./modules/networking"

  environment = var.environment
  vpc_cidr    = var.vpc_cidr
}
EOF
```

### Validate Networking

```bash
# Syntax check
tofu validate
# Expected: "Success! The configuration is valid."

# Preview what will be created
tofu plan -var-file=environments/uat.tfvars
# Expected: ~8 resources (VPC, subnets, IGW, route table, security groups)

# Create the networking
tofu apply -var-file=environments/uat.tfvars -auto-approve

# Verify resources exist
aws ec2 describe-vpcs --filters "Name=cidr,Values=10.1.0.0/16" --query 'Vpcs[0].VpcId'
# Expected: vpc-xxxxx

aws ec2 describe-subnets --filters "Name=vpc-id,Values=$(tofu output -raw vpc_id)" --query 'Subnets[*].SubnetId'
# Expected: 4 subnet IDs

aws ec2 describe-security-groups --filters "Name=vpc-id,Values=$(tofu output -raw vpc_id)" --query 'SecurityGroups[*].GroupName'
# Expected: uat-alb-sg, uat-api-sg, uat-rds-sg
```

✅ **Validation passed if:** All AWS resources exist with correct IDs

---

## Step 3: Create Database Module

**For detailed HCL code, see:** `/home/esckode/.claude/plans/piped-zooming-mist.md` → "Database Module"

[Follow same pattern: Create files → Wire module → Validate]

### Validate Database

```bash
# Wait for RDS to become available (5-10 minutes)
aws rds describe-db-instances --db-instance-identifier uat-tournament-db \
  --query 'DBInstances[0].DBInstanceStatus'
# Expected: "available"

# Verify endpoint
tofu output rds_endpoint
# Expected: uat-tournament-db.xxxxx.us-east-1.rds.amazonaws.com
```

✅ **Validation passed if:** RDS instance is "available"

---

## Step 4: Create Secrets Module

**For detailed HCL code, see:** `/home/esckode/.claude/plans/piped-zooming-mist.md` → "Secrets Module"

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

- [ ] Step 1: OpenTofu initialized
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
