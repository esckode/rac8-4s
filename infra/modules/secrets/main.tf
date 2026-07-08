resource "random_password" "jwt" {
  length  = 64
  special = false
}

locals {
  prefix = "/${var.environment}/api"
}

resource "aws_ssm_parameter" "database_url" {
  name  = "${local.prefix}/database_url"
  type  = "SecureString"
  value = var.database_url
}

resource "aws_ssm_parameter" "jwt_secret" {
  name  = "${local.prefix}/jwt_secret"
  type  = "SecureString"
  value = random_password.jwt.result
}

# "production" in EVERY deployed environment, UAT included — /test/player-token
# (app.ts) is an auth bypass gated only by NODE_ENV, and the ALB is publicly
# reachable. See the Step 4 decision note.
resource "aws_ssm_parameter" "node_env" {
  name  = "${local.prefix}/node_env"
  type  = "String"
  value = "production"
}

resource "aws_ssm_parameter" "email_service" {
  name  = "${local.prefix}/email_service"
  type  = "String"
  value = var.email_service
}

resource "aws_ssm_parameter" "email_from_address" {
  name  = "${local.prefix}/email_from_address"
  type  = "String"
  value = var.email_from_address
}

resource "aws_ssm_parameter" "frontend_url" {
  name  = "${local.prefix}/frontend_url"
  type  = "String"
  value = var.frontend_url
}

resource "aws_ssm_parameter" "redis_url" {
  name  = "${local.prefix}/redis_url"
  type  = "String"
  value = var.redis_url
}
