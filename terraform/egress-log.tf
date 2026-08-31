# Deliberately unversioned: a noncurrent version of a log line the VM cannot read
# back is dead weight, and versioning would outlive the lifecycle expiry below.
module "egress_log_bucket" {
  source = "./modules/s3-bucket"
  bucket = module.names.egress_log_bucket
}

# The expiry is the cost ceiling for this bucket, not a cleanup habit.
resource "aws_s3_bucket_lifecycle_configuration" "egress_log" {
  bucket = module.egress_log_bucket.id

  rule {
    id     = "expire-egress-logs"
    status = "Enabled"

    filter {}

    expiration {
      days = var.egress_log_retention_days
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

# Write-only. The box appends history it cannot read back, list or erase, so a
# compromised session cannot check or cover what it already shipped. The denies
# are not redundant with the narrow Allow: they survive any later policy — on the
# role or on the bucket — that would otherwise hand it read-back or delete.
# PutObject without multipart means the shipper must use single-part puts.
data "aws_iam_policy_document" "vm_egress_log_write" {
  statement {
    sid       = "PutEgressLogs"
    effect    = "Allow"
    actions   = ["s3:PutObject"]
    resources = ["${module.egress_log_bucket.arn}/${local.egress_log_prefix}/*"]
  }

  statement {
    sid    = "DenyEgressLogReadBack"
    effect = "Deny"
    actions = [
      "s3:GetObject*",
      "s3:DeleteObject*",
      "s3:ListBucket*",
      "s3:*MultipartUpload*",
    ]
    resources = [
      module.egress_log_bucket.arn,
      "${module.egress_log_bucket.arn}/*",
    ]
  }
}

resource "aws_iam_role_policy" "vm_egress_log_write" {
  name   = "${local.name_prefix}-egress-log-write"
  role   = module.vm.instance_role_name
  policy = data.aws_iam_policy_document.vm_egress_log_write.json
}
