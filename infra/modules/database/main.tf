# special = false keeps the password URL-safe by construction — it is embedded
# verbatim in the database_url SSM parameter (Step 4).
resource "random_password" "db" {
  length  = 32
  special = false
}

resource "aws_db_subnet_group" "main" {
  name       = "${var.environment}-tournament-db"
  subnet_ids = var.private_subnet_ids

  tags = {
    Name        = "${var.environment}-tournament-db"
    Environment = var.environment
  }
}

resource "aws_db_instance" "main" {
  identifier     = "${var.environment}-tournament-db"
  engine         = "postgres"
  engine_version = "15"

  instance_class    = var.db_instance_class
  allocated_storage = var.db_allocated_storage

  db_name  = "tournament_app"
  username = "tournament_user"
  password = random_password.db.result

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [var.rds_security_group_id]
  publicly_accessible    = false

  backup_retention_period   = var.db_backup_retention_period
  skip_final_snapshot       = var.db_skip_final_snapshot
  final_snapshot_identifier = var.db_skip_final_snapshot ? null : "${var.environment}-tournament-db-final"

  tags = {
    Name        = "${var.environment}-tournament-db"
    Environment = var.environment
  }
}
