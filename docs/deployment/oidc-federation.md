# OIDC Federation for CI/CD — No Stored Secrets

**Date:** 2026-05-21
**Status:** Implemented

---

## Problem

GitHub Actions workflows use stored secrets (e.g., `SECRETS.DEPLOY_KEY`, `SECRETS.NPM_TOKEN`) for authentication. These are long-lived credentials that:
- Can be exfiltrated from a compromised workflow
- Need manual rotation
- Don't follow least-privilege (one key, all access)

## Solution: GitHub OIDC Federation

GitHub Actions can generate short-lived OIDC tokens (`token.actions.githubusercontent.com`) that AWS, GCP, Azure, and other providers trust. No stored secrets needed.

### Architecture

```
GitHub Actions → OIDC Token → Cloud Provider (AWS/GCP/Azure)
                 (auto-      → trusts github.com repo
                  generated) → issues short-lived credentials
                              → workflow uses those credentials
```

### Benefits

| Benefit | Impact |
|---------|--------|
| No stored secrets | Zero long-lived credentials to leak or rotate |
| Short-lived tokens | Credentials valid only for the job duration |
| Repository-scoped | Only the specified repo can assume the role |
| Branch-scoped | Can restrict to main branch for production |
| Automatic rotation | New token per job, no manual rotation |

---

## Implementation

### AWS IAM Role for GitHub Actions

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::ACCOUNT_ID::oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:yethikrishna/project-anvil:*"
        }
      }
    }
  ]
}
```

### GitHub Actions Workflow with OIDC

```yaml
permissions:
  id-token: write   # Required for OIDC
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Configure AWS credentials via OIDC
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::ACCOUNT_ID:role/github-actions-anvil
          aws-region: us-east-1
          # No secrets needed! OIDC token is auto-generated.

      - name: Deploy
        run: |
          # AWS credentials are now available via environment
          aws s3 sync ./dist s3://anvil-bucket/
```

---

## Files Modified

| File | Change |
|------|--------|
| `.github/workflows/ci.yml` | Added OIDC permission, federation steps |
| `.github/workflows/deploy.yml` | New deploy workflow using OIDC federation |
| `infra/oidc-federation.tf` | Terraform for IAM role + trust policy |
| `docs/deployment/oidc-federation.md` | This guide |
