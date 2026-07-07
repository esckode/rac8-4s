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
