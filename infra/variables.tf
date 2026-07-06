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
