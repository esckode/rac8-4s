output "instance_id" {
  value       = aws_instance.api.id
  description = "EC2 instance ID"
}

output "instance_profile_name" {
  value       = aws_iam_instance_profile.api.name
  description = "IAM instance profile name"
}
