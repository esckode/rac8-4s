output "vpc_id" {
  value       = module.networking.vpc_id
  description = "VPC ID"
}

output "public_subnet_ids" {
  value       = module.networking.public_subnet_ids
  description = "Public subnet IDs"
}

output "rds_endpoint" {
  value       = module.database.address
  description = "RDS hostname"
}

output "ec2_instance_id" {
  value       = module.api.instance_id
  description = "EC2 instance ID"
}

output "iam_instance_profile_name" {
  value       = module.api.instance_profile_name
  description = "IAM instance profile name"
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
