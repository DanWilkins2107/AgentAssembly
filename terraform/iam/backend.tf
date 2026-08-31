terraform {
  # Backend HCL is parsed pre-eval, so it can't reference a module output. These
  # literals must stay in sync with terraform/modules/names, which owns every other
  # copy of these names. Rename there -> rename here.
  backend "s3" {
    bucket         = "agentassembly-tfstate"
    dynamodb_table = "agentassembly-tflock"
    key            = "iam/terraform.tfstate"
    region         = "eu-west-2"
    encrypt        = true
  }
}
