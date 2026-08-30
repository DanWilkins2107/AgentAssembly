terraform {
  # Backend HCL is parsed pre-eval, so it can't reference local.name_prefix.
  # These literals must stay in sync with name_prefix in locals.tf ("agentassembly").
  backend "s3" {
    bucket         = "agentassembly-tfstate"
    dynamodb_table = "agentassembly-tflock"
    key            = "iam/terraform.tfstate"
    region         = "eu-west-2"
    encrypt        = true
  }
}
