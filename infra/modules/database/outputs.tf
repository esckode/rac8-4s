output "address" {
  value       = aws_db_instance.main.address
  description = "RDS hostname"
}

output "port" {
  value       = aws_db_instance.main.port
  description = "RDS port"
}

output "db_name" {
  value       = aws_db_instance.main.db_name
  description = "Database name"
}

output "username" {
  value       = aws_db_instance.main.username
  description = "Master username"
}

output "password" {
  value       = random_password.db.result
  description = "Master password (feeds the database_url SSM parameter)"
  sensitive   = true
}
