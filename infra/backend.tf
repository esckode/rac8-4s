terraform {
  backend "s3" {
    bucket       = "tournament-app-tofu-state"
    key          = "tournament-app.tfstate"
    region       = "us-east-2"
    encrypt      = true
    use_lockfile = true
  }
}
