terraform {
  # No backend block on purpose: this stack creates the S3 bucket and lock table
  # the root config uses as its backend, so its own state stays local (gitignored).
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = var.tags
  }
}
