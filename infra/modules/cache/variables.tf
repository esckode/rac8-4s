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
