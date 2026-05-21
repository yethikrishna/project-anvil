# OIDC Federation for GitHub Actions — No Stored Secrets
#
# Creates an IAM role that GitHub Actions can assume via OIDC federation.
# No long-lived credentials stored anywhere.
#
# Usage:
#   1. Apply this Terraform
#   2. Set AWS_ROLE_ARN as a GitHub variable (not secret!)
#   3. GitHub Actions auto-generates OIDC tokens

# ── OIDC Provider ──

resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]

  tags = {
    Project = "project-anvil"
    Purpose = "github-actions-oidc"
  }
}

# ── IAM Role ──

data "aws_iam_policy_document" "github_assume_role" {
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
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        "repo:yethikrishna/project-anvil:*"
      ]
    }
  }
}

resource "aws_iam_role" "github_actions" {
  name               = "github-actions-anvil"
  assume_role_policy = data.aws_iam_policy_document.github_assume_role.json

  tags = {
    Project = "project-anvil"
    Purpose = "github-actions-oidc"
  }
}

# ── Permissions ──

data "aws_iam_policy_document" "anvil_deploy" {
  # S3 deployment
  statement {
    effect = "Allow"
    actions = [
      "s3:PutObject",
      "s3:GetObject",
      "s3:DeleteObject",
      "s3:ListBucket",
    ]
    resources = [
      "arn:aws:s3:::anvil-*",
      "arn:aws:s3:::anvil-*/*",
    ]
  }

  # CloudFront cache invalidation
  statement {
    effect = "Allow"
    actions = [
      "cloudfront:CreateInvalidation",
      "cloudfront:GetDistribution",
    ]
    resources = ["*"]
  }

  # ECR push (for container images)
  statement {
    effect = "Allow"
    actions = [
      "ecr:GetAuthorizationToken",
      "ecr:BatchCheckLayerAvailability",
      "ecr:GetDownloadUrlForLayer",
      "ecr:BatchGetImage",
      "ecr:PutImage",
      "ecr:InitiateLayerUpload",
      "ecr:UploadLayerPart",
      "ecr:CompleteLayerUpload",
    ]
    resources = [
      "arn:aws:ecr:*:*:repository/anvil-*",
    ]
  }
}

resource "aws_iam_role_policy" "anvil_deploy" {
  name   = "anvil-deploy-policy"
  role   = aws_iam_role.github_actions.id
  policy = data.aws_iam_policy_document.anvil_deploy.json
}

# ── Outputs ──

output "github_actions_role_arn" {
  description = "ARN of the IAM role for GitHub Actions OIDC federation"
  value       = aws_iam_role.github_actions.arn
}
