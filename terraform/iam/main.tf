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

# Both CI roles carry the AWS ReadOnlyAccess managed policy for refresh reads.
# These denies are the guardrail on top of it: an inline deny beats every allow and
# cannot be lifted by a key policy or a secret resource policy.
data "aws_iam_policy_document" "deny_data_plane" {
  # Without this, kms:PutKeyPolicy lets ci-apply grant itself decrypt on the CMK.
  # Encrypt/GenerateDataKey* are deliberately not denied: Secrets Manager validates
  # the CMK at CreateSecret.
  statement {
    sid       = "DenyKmsDataPlane"
    effect    = "Deny"
    actions   = ["kms:Decrypt", "kms:ReEncrypt*"]
    resources = ["*"]
  }

  # Plan output lands in a public PR comment and ci-plan is assumed on PR runs.
  statement {
    sid       = "DenySecretValue"
    effect    = "Deny"
    actions   = ["secretsmanager:GetSecretValue", "secretsmanager:PutSecretValue"]
    resources = ["*"]
  }
}

data "aws_iam_policy_document" "ci_plan" {
  source_policy_documents = [
    data.aws_iam_policy_document.state_access.json,
    data.aws_iam_policy_document.deny_data_plane.json,
  ]
}

data "aws_iam_policy_document" "ci_apply" {
  source_policy_documents = [
    data.aws_iam_policy_document.state_access.json,
    data.aws_iam_policy_document.deny_data_plane.json,
  ]

  statement {
    sid    = "IamRole"
    effect = "Allow"
    actions = [
      "iam:CreateRole",
      "iam:DeleteRole",
      "iam:TagRole",
      "iam:UntagRole",
      "iam:UpdateAssumeRolePolicy",
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
      "iam:AddRoleToInstanceProfile",
      "iam:RemoveRoleFromInstanceProfile",
      "iam:TagInstanceProfile",
      "iam:UntagInstanceProfile",
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
    actions   = ["iam:PutRolePolicy", "iam:DeleteRolePolicy"]
    resources = ["arn:aws:iam::${var.account_id}:role/${local.name_prefix}-*"]
  }

  statement {
    sid    = "Lambda"
    effect = "Allow"
    actions = [
      "lambda:CreateFunction",
      "lambda:DeleteFunction",
      "lambda:UpdateFunctionCode",
      "lambda:UpdateFunctionConfiguration",
      "lambda:PutFunctionConcurrency",
      "lambda:DeleteFunctionConcurrency",
      "lambda:AddPermission",
      "lambda:RemovePermission",
      "lambda:TagResource",
      "lambda:UntagResource",
    ]
    resources = ["arn:aws:lambda:${local.region}:${var.account_id}:function:${local.name_prefix}-*"]
  }

  statement {
    sid    = "Events"
    effect = "Allow"
    actions = [
      "events:PutRule",
      "events:DeleteRule",
      "events:EnableRule",
      "events:DisableRule",
      "events:PutTargets",
      "events:RemoveTargets",
      "events:TagResource",
      "events:UntagResource",
    ]
    resources = ["arn:aws:events:${local.region}:${var.account_id}:rule/${local.name_prefix}-*"]
  }

  statement {
    sid    = "Secrets"
    effect = "Allow"
    actions = [
      "secretsmanager:CreateSecret",
      "secretsmanager:DeleteSecret",
      "secretsmanager:UpdateSecret",
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
    actions   = ["budgets:ModifyBudget"]
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
      "sns:SetTopicAttributes",
      "sns:Subscribe",
      "sns:TagResource",
      "sns:UntagResource",
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

resource "aws_iam_role_policy_attachment" "ci_plan_read" {
  role       = aws_iam_role.ci_plan.name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

resource "aws_iam_role_policy_attachment" "ci_apply_read" {
  role       = aws_iam_role.ci_apply.name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}
