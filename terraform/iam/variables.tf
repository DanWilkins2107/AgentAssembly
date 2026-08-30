variable "account_id" {
  type        = string
  description = "AWS account the CI roles live in. Builds the exact state-lock ARN for least-priv. No default: nothing account-identifying is committed."
}
