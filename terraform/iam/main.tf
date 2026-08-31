data "tls_certificate" "github" {
  url = "https://token.actions.githubusercontent.com/.well-known/openid-configuration"
}

resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.github.certificates[0].sha1_fingerprint]
}

data "aws_iam_policy_document" "ci_plan_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        "repo:${local.repo_owner}/${local.repo_name}:pull_request",
        "repo:${local.repo_owner}/${local.repo_name}:ref:refs/heads/main",
      ]
    }
  }
}

data "aws_iam_policy_document" "ci_apply_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${local.repo_owner}/${local.repo_name}:environment:deploy"]
    }
  }
}

data "aws_iam_policy_document" "state_access" {
  statement {
    sid       = "StateBucketList"
    effect    = "Allow"
    actions   = ["s3:ListBucket"]
    resources = ["arn:aws:s3:::${module.names.state_bucket}"]
  }

  statement {
    sid       = "StateObjectRW"
    effect    = "Allow"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["arn:aws:s3:::${module.names.state_bucket}/root/*"]
  }

  statement {
    sid       = "StateLock"
    effect    = "Allow"
    actions   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem"]
    resources = ["arn:aws:dynamodb:${local.region}:${var.account_id}:table/${module.names.lock_table}"]
  }
}

# The read half is the fan-out of Get calls the aws_s3_bucket refresh makes, so
# plan needs all of them to see the bucket at all.
data "aws_iam_policy_document" "egress_log_bucket_read" {
  statement {
    sid    = "EgressLogBucketRead"
    effect = "Allow"
    actions = [
      "s3:GetAccelerateConfiguration",
      "s3:GetBucketAcl",
      "s3:GetBucketCORS",
      "s3:GetBucketLocation",
      "s3:GetBucketLogging",
      "s3:GetBucketNotification",
      "s3:GetBucketObjectLockConfiguration",
      "s3:GetBucketOwnershipControls",
      "s3:GetBucketPolicy",
      "s3:GetBucketPublicAccessBlock",
      "s3:GetBucketRequestPayment",
      "s3:GetBucketTagging",
      "s3:GetBucketVersioning",
      "s3:GetBucketWebsite",
      "s3:GetEncryptionConfiguration",
      "s3:GetLifecycleConfiguration",
      "s3:GetReplicationConfiguration",
    ]
    resources = [module.names.egress_log_bucket_arn]
  }
}

# KMS key ARNs embed a generated key id, so key statements scope on the Project
# tag (terraform/locals.tf common_tags) instead of a name prefix.
data "aws_iam_policy_document" "kms_common" {
  statement {
    sid    = "KmsReadTagged"
    effect = "Allow"
    actions = [
      "kms:DescribeKey",
      "kms:GetKeyPolicy",
      "kms:GetKeyRotationStatus",
      "kms:ListResourceTags",
    ]
    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "aws:ResourceTag/Project"
      values   = [local.name_prefix]
    }
  }

  statement {
    sid       = "KmsListAliases"
    effect    = "Allow"
    actions   = ["kms:ListAliases"]
    resources = ["*"]
  }

  # Without this, kms:PutKeyPolicy lets ci-apply grant itself decrypt on the CMK.
  # A deny here cannot be overridden by a key policy. Encrypt/GenerateDataKey* are
  # deliberately not denied: Secrets Manager validates the CMK at CreateSecret.
  statement {
    sid       = "DenyKmsDataPlane"
    effect    = "Deny"
    actions   = ["kms:Decrypt", "kms:ReEncrypt*"]
    resources = ["*"]
  }
}

# Read side of what the root stack (terraform/) manages. ci_plan needs it or every
# refresh hits AccessDenied; ci_apply sources it too because apply refreshes first.
data "aws_iam_policy_document" "root_read" {
  statement {
    sid    = "IamRoleRead"
    effect = "Allow"
    actions = [
      "iam:GetRole",
      "iam:ListRoleTags",
      "iam:ListRolePolicies",
      "iam:ListAttachedRolePolicies",
    ]
    resources = ["arn:aws:iam::${var.account_id}:role/${local.name_prefix}-*"]
  }

  statement {
    sid       = "IamInstanceProfileRead"
    effect    = "Allow"
    actions   = ["iam:GetInstanceProfile", "iam:ListInstanceProfileTags"]
    resources = ["arn:aws:iam::${var.account_id}:instance-profile/${local.name_prefix}-*"]
  }

  # us-east-1, not local.region: AWS Budgets only publishes to us-east-1 topics, so
  # terraform/spend-guard.tf creates the topic behind an aliased provider.
  statement {
    sid    = "SnsRead"
    effect = "Allow"
    actions = [
      "sns:GetTopicAttributes",
      "sns:GetSubscriptionAttributes",
      "sns:ListSubscriptionsByTopic",
      "sns:ListTagsForResource",
    ]
    resources = ["arn:aws:sns:us-east-1:${var.account_id}:${local.name_prefix}-*"]
  }

  statement {
    sid       = "BudgetsRead"
    effect    = "Allow"
    actions   = ["budgets:ViewBudget"]
    resources = ["arn:aws:budgets::${var.account_id}:budget/${local.name_prefix}-*"]
  }

  statement {
    sid       = "SecretsRead"
    effect    = "Allow"
    actions   = ["secretsmanager:DescribeSecret", "secretsmanager:GetResourcePolicy"]
    resources = ["arn:aws:secretsmanager:${local.region}:${var.account_id}:secret:${local.name_prefix}-*"]
  }

  # Plan output lands in a public PR comment and ci-plan is assumed on PR runs.
  # DescribeSecret is metadata only; the value must stay unreadable, and a deny here
  # cannot be lifted by a secret resource policy.
  statement {
    sid       = "DenySecretValue"
    effect    = "Deny"
    actions   = ["secretsmanager:GetSecretValue", "secretsmanager:PutSecretValue"]
    resources = ["arn:aws:secretsmanager:${local.region}:${var.account_id}:secret:${local.name_prefix}-*"]
  }
}

data "aws_iam_policy_document" "ci_plan" {
  source_policy_documents = [
    data.aws_iam_policy_document.state_access.json,
    data.aws_iam_policy_document.kms_common.json,
    data.aws_iam_policy_document.egress_log_bucket_read.json,
    data.aws_iam_policy_document.root_read.json,
  ]

  statement {
    sid       = "Ec2Read"
    effect    = "Allow"
    actions   = ["ec2:Describe*", "ec2:Get*"]
    resources = ["*"]
  }
}

data "aws_iam_policy_document" "ci_apply" {
  source_policy_documents = [
    data.aws_iam_policy_document.state_access.json,
    data.aws_iam_policy_document.kms_common.json,
    data.aws_iam_policy_document.egress_log_bucket_read.json,
    data.aws_iam_policy_document.root_read.json,
  ]

  statement {
    sid    = "IamRole"
    effect = "Allow"
    actions = [
      "iam:CreateRole",
      "iam:DeleteRole",
      "iam:GetRole",
      "iam:TagRole",
      "iam:UntagRole",
      "iam:ListRoleTags",
      "iam:UpdateAssumeRolePolicy",
      "iam:ListAttachedRolePolicies",
      "iam:ListRolePolicies",
      "iam:ListInstanceProfilesForRole",
    ]
    resources = ["arn:aws:iam::${var.account_id}:role/${local.name_prefix}-*"]
  }

  statement {
    sid       = "IamRoleAttach"
    effect    = "Allow"
    actions   = ["iam:AttachRolePolicy", "iam:DetachRolePolicy"]
    resources = ["arn:aws:iam::${var.account_id}:role/${local.name_prefix}-*"]

    condition {
      test     = "StringEquals"
      variable = "iam:PolicyARN"
      values = [
        "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore",
        "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
      ]
    }
  }

  statement {
    sid    = "IamInstanceProfile"
    effect = "Allow"
    actions = [
      "iam:CreateInstanceProfile",
      "iam:DeleteInstanceProfile",
      "iam:GetInstanceProfile",
      "iam:AddRoleToInstanceProfile",
      "iam:RemoveRoleFromInstanceProfile",
      "iam:TagInstanceProfile",
      "iam:UntagInstanceProfile",
      "iam:ListInstanceProfileTags",
    ]
    resources = ["arn:aws:iam::${var.account_id}:instance-profile/${local.name_prefix}-*"]
  }

  statement {
    sid       = "IamPassRole"
    effect    = "Allow"
    actions   = ["iam:PassRole"]
    resources = ["arn:aws:iam::${var.account_id}:role/${local.name_prefix}-*"]

    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["ec2.amazonaws.com", "lambda.amazonaws.com"]
    }
  }

  statement {
    sid       = "IamRoleInline"
    effect    = "Allow"
    actions   = ["iam:PutRolePolicy", "iam:GetRolePolicy", "iam:DeleteRolePolicy"]
    resources = ["arn:aws:iam::${var.account_id}:role/${local.name_prefix}-*"]
  }

  statement {
    sid    = "Lambda"
    effect = "Allow"
    actions = [
      "lambda:CreateFunction",
      "lambda:DeleteFunction",
      "lambda:GetFunction",
      "lambda:GetFunctionConfiguration",
      "lambda:UpdateFunctionCode",
      "lambda:UpdateFunctionConfiguration",
      "lambda:ListVersionsByFunction",
      "lambda:PutFunctionConcurrency",
      "lambda:DeleteFunctionConcurrency",
      "lambda:AddPermission",
      "lambda:RemovePermission",
      "lambda:GetPolicy",
      "lambda:TagResource",
      "lambda:UntagResource",
      "lambda:ListTags",
    ]
    resources = ["arn:aws:lambda:${local.region}:${var.account_id}:function:${local.name_prefix}-*"]
  }

  statement {
    sid    = "Events"
    effect = "Allow"
    actions = [
      "events:PutRule",
      "events:DeleteRule",
      "events:DescribeRule",
      "events:EnableRule",
      "events:DisableRule",
      "events:PutTargets",
      "events:RemoveTargets",
      "events:ListTargetsByRule",
      "events:TagResource",
      "events:UntagResource",
      "events:ListTagsForResource",
    ]
    resources = ["arn:aws:events:${local.region}:${var.account_id}:rule/${local.name_prefix}-*"]
  }

  statement {
    sid    = "Secrets"
    effect = "Allow"
    actions = [
      "secretsmanager:CreateSecret",
      "secretsmanager:DeleteSecret",
      "secretsmanager:DescribeSecret",
      "secretsmanager:UpdateSecret",
      "secretsmanager:GetResourcePolicy",
      "secretsmanager:TagResource",
      "secretsmanager:UntagResource",
    ]
    resources = ["arn:aws:secretsmanager:${local.region}:${var.account_id}:secret:${local.name_prefix}-*"]
  }

  # Bucket-level only: terraform never puts or reads the log objects themselves.
  statement {
    sid    = "EgressLogBucketWrite"
    effect = "Allow"
    actions = [
      "s3:CreateBucket",
      "s3:DeleteBucket",
      "s3:DeleteBucketPolicy",
      "s3:PutBucketOwnershipControls",
      "s3:PutBucketPolicy",
      "s3:PutBucketPublicAccessBlock",
      "s3:PutBucketTagging",
      "s3:PutEncryptionConfiguration",
      "s3:PutLifecycleConfiguration",
    ]
    resources = [module.names.egress_log_bucket_arn]
  }

  # kms:TagResource is required by CreateKey to tag the key on creation, and the
  # key does not exist yet - so it is gated on the requested tag, not a resource tag.
  statement {
    sid       = "KmsCreateKey"
    effect    = "Allow"
    actions   = ["kms:CreateKey", "kms:TagResource"]
    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "aws:RequestTag/Project"
      values   = [local.name_prefix]
    }
  }

  statement {
    sid    = "KmsWriteTagged"
    effect = "Allow"
    actions = [
      "kms:TagResource",
      "kms:UntagResource",
      "kms:PutKeyPolicy",
      "kms:EnableKeyRotation",
      "kms:ScheduleKeyDeletion",
      "kms:CancelKeyDeletion",
      "kms:CreateAlias",
      "kms:DeleteAlias",
    ]
    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "aws:ResourceTag/Project"
      values   = [local.name_prefix]
    }
  }

  # CreateAlias/DeleteAlias authorize against both the alias and its target key;
  # KmsWriteTagged covers the key half.
  statement {
    sid       = "KmsAlias"
    effect    = "Allow"
    actions   = ["kms:CreateAlias", "kms:DeleteAlias"]
    resources = ["arn:aws:kms:${local.region}:${var.account_id}:alias/${local.name_prefix}-*"]
  }

  statement {
    sid       = "Budgets"
    effect    = "Allow"
    actions   = ["budgets:ViewBudget", "budgets:ModifyBudget"]
    resources = ["arn:aws:budgets::${var.account_id}:budget/${local.name_prefix}-*"]
  }

  # us-east-1, not local.region: AWS Budgets only publishes to us-east-1 topics, so
  # terraform/spend-guard.tf creates the topic behind an aliased provider.
  statement {
    sid    = "Sns"
    effect = "Allow"
    actions = [
      "sns:CreateTopic",
      "sns:DeleteTopic",
      "sns:GetTopicAttributes",
      "sns:SetTopicAttributes",
      "sns:Subscribe",
      "sns:ListSubscriptionsByTopic",
      "sns:TagResource",
      "sns:UntagResource",
      "sns:ListTagsForResource",
    ]
    resources = ["arn:aws:sns:us-east-1:${var.account_id}:${local.name_prefix}-*"]
  }

  statement {
    sid       = "SnsUnsubscribe"
    effect    = "Allow"
    actions   = ["sns:Unsubscribe"]
    resources = ["*"]
  }

  statement {
    sid       = "DenyCiSelfManage"
    effect    = "Deny"
    actions   = ["iam:*"]
    resources = ["arn:aws:iam::${var.account_id}:role/${local.name_prefix}-ci-*"]
  }
}

resource "aws_iam_role" "ci_plan" {
  name               = "${local.name_prefix}-ci-plan"
  assume_role_policy = data.aws_iam_policy_document.ci_plan_assume.json
}

resource "aws_iam_role_policy" "ci_plan" {
  name   = "${local.name_prefix}-ci-plan"
  role   = aws_iam_role.ci_plan.id
  policy = data.aws_iam_policy_document.ci_plan.json
}

resource "aws_iam_role" "ci_apply" {
  name               = "${local.name_prefix}-ci-apply"
  assume_role_policy = data.aws_iam_policy_document.ci_apply_assume.json
}

resource "aws_iam_role_policy" "ci_apply" {
  name   = "${local.name_prefix}-ci-apply"
  role   = aws_iam_role.ci_apply.id
  policy = data.aws_iam_policy_document.ci_apply.json
}

resource "aws_iam_role_policy_attachment" "ci_apply_ec2" {
  role       = aws_iam_role.ci_apply.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2FullAccess"
}
