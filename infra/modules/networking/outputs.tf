output "vpc_id" {
  value       = aws_vpc.main.id
  description = "VPC ID"
}

output "public_subnet_ids" {
  value       = aws_subnet.public[*].id
  description = "Public subnet IDs"
}

output "private_subnet_ids" {
  value       = aws_subnet.private[*].id
  description = "Private subnet IDs (for the RDS subnet group)"
}

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

output "redis_security_group_id" {
  value       = aws_security_group.redis.id
  description = "Redis security group ID"
}
