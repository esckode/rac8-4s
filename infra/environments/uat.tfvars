environment = "uat"
aws_region  = "us-east-2"
vpc_cidr    = "10.1.0.0/16"

ec2_instance_type = "t2.micro"
ec2_volume_size   = 20
enable_ssh        = true
allowed_ssh_cidr  = "0.0.0.0/0"

db_instance_class          = "db.t3.micro"
db_allocated_storage       = 20
db_backup_retention_period = 0
db_skip_final_snapshot     = true

health_check_interval            = 30
health_check_timeout             = 5
health_check_healthy_threshold   = 2
health_check_unhealthy_threshold = 3

email_service      = "mock"
email_from_address = "noreply@uat.example.com"

enable_cloudtrail      = true
enable_cloudwatch_logs = false
enable_mfa_delete      = false
log_retention_days     = 30

seed_on_boot = true
