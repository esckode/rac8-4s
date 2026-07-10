output "instance_id" {
  value       = aws_instance.api.id
  description = "EC2 instance ID"
}

output "instance_profile_name" {
  value       = aws_iam_instance_profile.api.name
  description = "IAM instance profile name"
}

output "alb_dns_name" {
  value       = aws_lb.api.dns_name
  description = "ALB DNS name"
}

output "alb_arn" {
  value       = aws_lb.api.arn
  description = "ALB ARN"
}

output "target_group_arn" {
  value       = aws_lb_target_group.api.arn
  description = "Target group ARN"
}
