data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

resource "aws_iam_role" "api" {
  name = "${var.environment}-api-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = {
    Name        = "${var.environment}-api-role"
    Environment = var.environment
  }
}

# Read only this environment's parameter path — this also covers the manually
# created github_token (5c). SES send is used when email_service = aws_ses.
resource "aws_iam_role_policy" "api" {
  name = "${var.environment}-api-policy"
  role = aws_iam_role.api.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["ssm:GetParameter", "ssm:GetParametersByPath"]
        Resource = "arn:aws:ssm:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:parameter/${var.environment}/api/*"
      },
      {
        Effect   = "Allow"
        Action   = ["ses:SendEmail", "ses:SendRawEmail"]
        Resource = "*"
      }
    ]
  })
}

# SSM Session Manager: send-command (seed, debug), port-forward (psql), shell.
resource "aws_iam_role_policy_attachment" "ssm_core" {
  role       = aws_iam_role.api.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "api" {
  name = "${var.environment}-api-profile"
  role = aws_iam_role.api.name
}

data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-2023*-kernel-*-x86_64"]
  }
}

resource "aws_instance" "api" {
  ami                    = data.aws_ami.al2023.id
  instance_type          = var.instance_type
  subnet_id              = var.public_subnet_ids[0]
  vpc_security_group_ids = [var.api_security_group_id]
  iam_instance_profile   = aws_iam_instance_profile.api.name

  user_data = templatefile("${path.module}/user_data.sh.tpl", {
    environment  = var.environment
    aws_region   = data.aws_region.current.name
    api_port     = var.api_port
    app_repo     = var.app_repo
    app_branch   = var.app_branch
    seed_on_boot = var.seed_on_boot
  })
  # Replacement IS the deploy (Step 5 decision) — a user_data change must
  # recreate the instance, not stop/start it.
  user_data_replace_on_change = true

  root_block_device {
    volume_size = var.volume_size
  }

  tags = {
    Name        = "${var.environment}-api"
    Environment = var.environment
  }
}

resource "aws_lb" "api" {
  name               = "${var.environment}-api-alb"
  load_balancer_type = "application"
  security_groups    = [var.alb_security_group_id]
  subnets            = var.public_subnet_ids

  tags = {
    Name        = "${var.environment}-api-alb"
    Environment = var.environment
  }
}

resource "aws_lb_target_group" "api" {
  name     = "${var.environment}-api-tg"
  port     = var.api_port
  protocol = "HTTP"
  vpc_id   = var.vpc_id

  health_check {
    path                = "/health/ready" # NOT /health — that is liveness, always 200
    matcher             = "200"
    interval            = var.health_check_interval
    timeout             = var.health_check_timeout
    healthy_threshold   = var.health_check_healthy_threshold
    unhealthy_threshold = var.health_check_unhealthy_threshold
  }

  tags = {
    Name        = "${var.environment}-api-tg"
    Environment = var.environment
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.api.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

resource "aws_lb_target_group_attachment" "api" {
  target_group_arn = aws_lb_target_group.api.arn
  target_id        = aws_instance.api.id
  port             = var.api_port
}
