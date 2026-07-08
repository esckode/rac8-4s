resource "aws_elasticache_subnet_group" "main" {
  name       = "${var.environment}-tournament-redis"
  subnet_ids = var.private_subnet_ids

  tags = {
    Name        = "${var.environment}-tournament-redis"
    Environment = var.environment
  }
}

# noeviction is a BullMQ hard requirement (jobs are multi-key ensembles kept
# consistent by Lua scripts). The ElastiCache default volatile-lru would evict
# TTL'd keys first — i.e. live magic-link tokens. Fail writes loudly instead.
resource "aws_elasticache_parameter_group" "main" {
  name   = "${var.environment}-tournament-redis7"
  family = "redis7"

  parameter {
    name  = "maxmemory-policy"
    value = "noeviction"
  }
}

resource "aws_elasticache_cluster" "main" {
  cluster_id           = "${var.environment}-tournament-redis"
  engine               = "redis"
  engine_version       = "7.1"
  node_type            = var.node_type
  num_cache_nodes      = 1
  parameter_group_name = aws_elasticache_parameter_group.main.name
  subnet_group_name    = aws_elasticache_subnet_group.main.name
  security_group_ids   = [var.redis_security_group_id]

  tags = {
    Name        = "${var.environment}-tournament-redis"
    Environment = var.environment
  }
}
