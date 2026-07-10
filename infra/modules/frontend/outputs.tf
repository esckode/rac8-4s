output "bucket_name" {
  value       = aws_s3_bucket.frontend.id
  description = "Frontend bucket name"
}

output "distribution_id" {
  value       = aws_cloudfront_distribution.main.id
  description = "CloudFront distribution ID"
}

output "distribution_domain_name" {
  value       = aws_cloudfront_distribution.main.domain_name
  description = "CloudFront domain"
}
