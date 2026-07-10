terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
  required_version = ">= 1.7.0"
}

provider "aws" {
  region = var.aws_region
}

data "aws_caller_identity" "current" {}

module "networking" {
  source = "./modules/networking"

  environment      = var.environment
  vpc_cidr         = var.vpc_cidr
  enable_ssh       = var.enable_ssh
  allowed_ssh_cidr = var.allowed_ssh_cidr
}

module "database" {
  source = "./modules/database"

  environment                = var.environment
  private_subnet_ids         = module.networking.private_subnet_ids
  rds_security_group_id      = module.networking.rds_security_group_id
  db_instance_class          = var.db_instance_class
  db_allocated_storage       = var.db_allocated_storage
  db_backup_retention_period = var.db_backup_retention_period
  db_skip_final_snapshot     = var.db_skip_final_snapshot
}

module "cache" {
  source = "./modules/cache"

  environment             = var.environment
  private_subnet_ids      = module.networking.private_subnet_ids
  redis_security_group_id = module.networking.redis_security_group_id
}

module "secrets" {
  source = "./modules/secrets"

  environment        = var.environment
  database_url       = "postgresql://${module.database.username}:${module.database.password}@${module.database.address}:${module.database.port}/${module.database.db_name}?sslmode=no-verify"
  redis_url          = module.cache.redis_url
  email_service      = var.email_service
  email_from_address = var.email_from_address
  frontend_url       = "https://${module.frontend.distribution_domain_name}"
}

module "api" {
  source = "./modules/api"

  environment           = var.environment
  vpc_id                = module.networking.vpc_id
  public_subnet_ids     = module.networking.public_subnet_ids
  alb_security_group_id = module.networking.alb_security_group_id
  api_security_group_id = module.networking.api_security_group_id
  instance_type         = var.ec2_instance_type
  volume_size           = var.ec2_volume_size
  seed_on_boot          = var.seed_on_boot

  health_check_interval            = var.health_check_interval
  health_check_timeout             = var.health_check_timeout
  health_check_healthy_threshold   = var.health_check_healthy_threshold
  health_check_unhealthy_threshold = var.health_check_unhealthy_threshold

  # The instance reads /${environment}/api/* at first boot. module.secrets must
  # NOT be in depends_on — secrets.frontend_url consumes the CloudFront domain,
  # which consumes this module's ALB DNS (6d cycle). The boot script's get_param
  # retry loop covers the params-not-yet-created race instead.
  depends_on = [module.cache]
}

module "frontend" {
  source = "./modules/frontend"

  environment  = var.environment
  alb_dns_name = module.api.alb_dns_name
}
