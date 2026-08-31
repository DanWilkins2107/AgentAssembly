output "prefix" {
  value = local.prefix
}

output "state_bucket" {
  value = "${local.prefix}-tfstate"
}

output "lock_table" {
  value = "${local.prefix}-tflock"
}

output "egress_log_bucket" {
  value = "${local.prefix}-egress-logs"
}

output "egress_log_bucket_arn" {
  value = "arn:aws:s3:::${local.prefix}-egress-logs"
}
