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
