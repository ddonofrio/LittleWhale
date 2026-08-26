# LittleWhale Cloud

This directory contains the deployable AWS surface for the LittleWhale chat UI:

- `frontend/` is a static Vite application hosted by Amplify Hosting.
- `backend/` is a Node.js Lambda Function URL backed by Bedrock, DynamoDB and S3.
- `scripts/deploy-lambda.ps1` provisions the supporting AWS resources and deploys the Lambda as a zip, matching the deployment pattern used by the other apps.

## First deployment

From this directory:

```powershell
./scripts/deploy-lambda.ps1
```

The script writes `cloud/outputs.json` locally (ignored by git), seeds the
configuration table and configures the Lambda Function URL. Pass the Amplify
origin with `-AllowedOrigin` so browser cookies and CORS remain restricted to
the published frontend.

LittleWhale is not anonymous. `/auth/atlassian/start` performs Atlassian's
OAuth 2.1 authorization-code flow with PKCE and dynamic client registration;
the callback stores the authenticated Atlassian account, refreshable token and
session in DynamoDB, and returns an HttpOnly signed cookie. Every `/api/*`
request requires that cookie and all sessions, messages and S3 workspace keys
are scoped to the Atlassian account.
