# The CI roles' grants build this bucket's ARN from the same prefix in
# terraform/iam/main.tf (egress_log_bucket_read, EgressLogBucketWrite).
# Rename here -> rename there.
resource "aws_s3_bucket" "egress_log" {
  bucket = "${local.name_prefix}-egress-logs"
}

# Deliberately unversioned: a noncurrent version of a log line the VM cannot read
# back is dead weight, and versioning would outlive the lifecycle expiry below.

resource "aws_s3_bucket_server_side_encryption_configuration" "egress_log" {
  bucket = aws_s3_bucket.egress_log.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "egress_log" {
  bucket = aws_s3_bucket.egress_log.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "egress_log" {
  bucket = aws_s3_bucket.egress_log.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

# The expiry is the cost ceiling for this bucket, not a cleanup habit.
resource "aws_s3_bucket_lifecycle_configuration" "egress_log" {
  bucket = aws_s3_bucket.egress_log.id

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

data "aws_iam_policy_document" "egress_log_bucket" {
  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.egress_log.arn,
      "${aws_s3_bucket.egress_log.arn}/*",
    ]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "egress_log" {
  bucket = aws_s3_bucket.egress_log.id
  policy = data.aws_iam_policy_document.egress_log_bucket.json

  depends_on = [aws_s3_bucket_public_access_block.egress_log]
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
    resources = ["${aws_s3_bucket.egress_log.arn}/${local.egress_log_prefix}/*"]
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
      aws_s3_bucket.egress_log.arn,
      "${aws_s3_bucket.egress_log.arn}/*",
    ]
  }
}

resource "aws_iam_role_policy" "vm_egress_log_write" {
  name   = "${local.name_prefix}-egress-log-write"
  role   = module.vm.instance_role_name
  policy = data.aws_iam_policy_document.vm_egress_log_write.json
}
