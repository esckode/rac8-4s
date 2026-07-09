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
