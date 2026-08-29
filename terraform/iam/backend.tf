terraform {
  # Backend HCL is parsed pre-eval, so it can't reference var.name_prefix.
  # These literals must stay in sync with name_prefix in variables.tf ("agentassembly").
  backend "s3" {
    bucket         = "agentassembly-tfstate"
    dynamodb_table = "agentassembly-tflock"
    key            = "iam/terraform.tfstate"
    region         = "eu-west-2"
    encrypt        = true
  }
}
