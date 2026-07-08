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
