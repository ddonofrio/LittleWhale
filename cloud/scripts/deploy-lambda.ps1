[CmdletBinding()]
param(
  [string]$Region = 'eu-north-1',
  [string]$FunctionName = 'littlewhale-chat',
  [string]$ModelId = 'amazon.nova-lite-v1:0',
  [string]$AllowedOrigin = 'https://placeholder.invalid',
  [string]$WorkspaceBucket = '',
  [switch]$SkipTests,
  [switch]$KeepPackage
)

$ErrorActionPreference = 'Stop'
$cloudRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$backend = Join-Path $cloudRoot 'backend'
$tempRoot = Join-Path $cloudRoot '.tmp'
$packageRoot = Join-Path $tempRoot ('lambda-package-' + [guid]::NewGuid().ToString('N'))
$zipPath = Join-Path $tempRoot 'littlewhale-lambda.zip'

function Invoke-Aws([string[]]$Arguments) {
  & aws @Arguments
  if ($LASTEXITCODE -ne 0) { throw "AWS CLI failed ($LASTEXITCODE): aws $($Arguments -join ' ')" }
}

function Get-AwsText([string[]]$Arguments) {
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $value = (& aws @Arguments 2>$null | Out-String).Trim()
    if ($LASTEXITCODE -ne 0) { return '' }
    return $value
  } finally {
    $ErrorActionPreference = $previous
  }
}

function Write-JsonFile([string]$Path, $Value) {
  $Value | ConvertTo-Json -Depth 10 | Set-Content -Path $Path -Encoding utf8
}

function Ensure-DynamoTable([string]$TableName, [string]$HashKey, [string]$RangeKey) {
  $status = Get-AwsText @('dynamodb', 'describe-table', '--table-name', $TableName, '--query', 'Table.TableStatus', '--output', 'text', '--region', $Region)
  if ($status -eq 'ACTIVE') {
    Write-Host "DynamoDB table exists: $TableName"
    return
  }

  Write-Host "Creating DynamoDB table: $TableName"
  if ($RangeKey) {
    Invoke-Aws @('dynamodb', 'create-table', '--table-name', $TableName,
      '--attribute-definitions', "AttributeName=$HashKey,AttributeType=S", "AttributeName=$RangeKey,AttributeType=S",
      '--key-schema', "AttributeName=$HashKey,KeyType=HASH", "AttributeName=$RangeKey,KeyType=RANGE",
      '--billing-mode', 'PAY_PER_REQUEST', '--region', $Region)
  } else {
    Invoke-Aws @('dynamodb', 'create-table', '--table-name', $TableName,
      '--attribute-definitions', "AttributeName=$HashKey,AttributeType=S",
      '--key-schema', "AttributeName=$HashKey,KeyType=HASH",
      '--billing-mode', 'PAY_PER_REQUEST', '--region', $Region)
  }
  Invoke-Aws @('dynamodb', 'wait', 'table-exists', '--table-name', $TableName, '--region', $Region)
}

function Ensure-S3Bucket([string]$BucketName) {
  $exists = Get-AwsText @('s3api', 'list-buckets', '--query', "Buckets[?Name=='$BucketName'].Name", '--output', 'text', '--region', $Region)
  if ($exists -ne $BucketName) {
    Write-Host "Creating S3 bucket: $BucketName"
    Invoke-Aws @('s3api', 'create-bucket', '--bucket', $BucketName, '--region', $Region, '--create-bucket-configuration', "LocationConstraint=$Region")
  } else {
    Write-Host "S3 bucket exists: $BucketName"
  }

  Invoke-Aws @('s3api', 'put-public-access-block', '--bucket', $BucketName, '--region', $Region,
    '--public-access-block-configuration', 'BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true')
  Invoke-Aws @('s3api', 'put-bucket-encryption', '--bucket', $BucketName, '--region', $Region,
    '--server-side-encryption-configuration', '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}')
  $corsPath = Join-Path $tempRoot 'cors.json'
  Write-JsonFile $corsPath @(@{ AllowedHeaders = @('content-type', 'x-amz-*'); AllowedMethods = @('GET', 'PUT', 'HEAD'); AllowedOrigins = @($AllowedOrigin); ExposeHeaders = @('etag'); MaxAgeSeconds = 86400 })
  Invoke-Aws @('s3api', 'put-bucket-cors', '--bucket', $BucketName, '--region', $Region, '--cors-configuration', "file://$corsPath")
}

Write-Host '[1/7] Resolving AWS account and resource names...'
$account = Get-AwsText @('sts', 'get-caller-identity', '--query', 'Account', '--output', 'text', '--region', $Region)
if ([string]::IsNullOrWhiteSpace($account)) { throw 'AWS identity could not be resolved.' }
if ([string]::IsNullOrWhiteSpace($WorkspaceBucket)) { $WorkspaceBucket = "littlewhale-workspaces-$account-$($Region -replace '-', '')" }
$configTable = 'littlewhale-config'
$sessionsTable = 'littlewhale-sessions'
$messagesTable = 'littlewhale-messages'
$authTable = 'littlewhale-auth'
$roleName = 'littlewhale-chat-role'
$secretName = 'littlewhale/session-secret'

Write-Host '[2/7] Installing Lambda production dependencies and creating zip...'
if (Test-Path $packageRoot) { Remove-Item -LiteralPath $packageRoot -Recurse -Force }
New-Item -ItemType Directory -Force -Path $packageRoot | Out-Null
Copy-Item -LiteralPath (Join-Path $backend 'index.mjs') -Destination $packageRoot
Copy-Item -LiteralPath (Join-Path $backend 'package.json') -Destination $packageRoot
Copy-Item -LiteralPath (Join-Path $backend 'package-lock.json') -Destination $packageRoot
Push-Location $packageRoot
try {
  npm ci --omit=dev --no-audit --no-fund
  if (-not $SkipTests) { node --check index.mjs }
} finally { Pop-Location }
if (Test-Path $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
Compress-Archive -Path (Join-Path $packageRoot '*') -DestinationPath $zipPath -Force

Write-Host '[3/7] Ensuring DynamoDB, S3, Secrets Manager and IAM...'
Ensure-DynamoTable $configTable 'configKey' ''
Ensure-DynamoTable $sessionsTable 'ownerId' 'sessionId'
Ensure-DynamoTable $messagesTable 'sessionId' 'messageId'
Ensure-DynamoTable $authTable 'authKey' ''
Invoke-Aws @('dynamodb', 'update-time-to-live', '--table-name', $authTable, '--time-to-live-specification', 'Enabled=true,AttributeName=expiresAt', '--region', $Region)
Ensure-S3Bucket $WorkspaceBucket

$secretArn = Get-AwsText @('secretsmanager', 'describe-secret', '--secret-id', $secretName, '--query', 'ARN', '--output', 'text', '--region', $Region)
if ([string]::IsNullOrWhiteSpace($secretArn)) {
  Write-Host "Creating Secrets Manager secret: $secretName"
  $secretArn = Get-AwsText @('secretsmanager', 'create-secret', '--name', $secretName, '--description', 'LittleWhale cookie signing secret', '--generate-random-password', '--query', 'ARN', '--output', 'text', '--region', $Region)
}
if ([string]::IsNullOrWhiteSpace($secretArn)) { throw 'Could not resolve the LittleWhale session secret.' }

$roleArn = Get-AwsText @('iam', 'get-role', '--role-name', $roleName, '--query', 'Role.Arn', '--output', 'text')
if ([string]::IsNullOrWhiteSpace($roleArn)) {
  Write-Host "Creating IAM role: $roleName"
  $trustPath = Join-Path $tempRoot 'trust-policy.json'
  Write-JsonFile $trustPath @{ Version = '2012-10-17'; Statement = @(@{ Effect = 'Allow'; Principal = @{ Service = 'lambda.amazonaws.com' }; Action = 'sts:AssumeRole' }) }
  $roleArn = Get-AwsText @('iam', 'create-role', '--role-name', $roleName, '--assume-role-policy-document', "file://$trustPath", '--query', 'Role.Arn', '--output', 'text')
  Invoke-Aws @('iam', 'attach-role-policy', '--role-name', $roleName, '--policy-arn', 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole')
  Start-Sleep -Seconds 8
}
$policyPath = Join-Path $tempRoot 'lambda-policy.json'
$tableArns = @(
  "arn:aws:dynamodb:$Region`:$account`:table/$configTable",
  "arn:aws:dynamodb:$Region`:$account`:table/$sessionsTable",
  "arn:aws:dynamodb:$Region`:$account`:table/$messagesTable",
  "arn:aws:dynamodb:$Region`:$account`:table/$authTable"
)
Write-JsonFile $policyPath @{ Version = '2012-10-17'; Statement = @(
  @{ Effect = 'Allow'; Action = @('dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:DeleteItem', 'dynamodb:Query'); Resource = $tableArns },
  @{ Effect = 'Allow'; Action = @('s3:ListBucket'); Resource = "arn:aws:s3:::$WorkspaceBucket" },
  @{ Effect = 'Allow'; Action = @('s3:GetObject', 's3:PutObject', 's3:DeleteObject'); Resource = "arn:aws:s3:::$WorkspaceBucket/*" },
  @{ Effect = 'Allow'; Action = @('bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'); Resource = '*' },
  @{ Effect = 'Allow'; Action = @('secretsmanager:GetSecretValue'); Resource = $secretArn }
) }
Invoke-Aws @('iam', 'put-role-policy', '--role-name', $roleName, '--policy-name', 'littlewhale-runtime', '--policy-document', "file://$policyPath")

Write-Host '[4/7] Creating or updating Lambda configuration...'
$environmentPath = Join-Path $tempRoot 'lambda-environment.json'
Write-JsonFile $environmentPath @{ Variables = @{
  CONFIG_TABLE_NAME = $configTable; SESSIONS_TABLE_NAME = $sessionsTable; MESSAGES_TABLE_NAME = $messagesTable; AUTH_TABLE_NAME = $authTable
  WORKSPACES_BUCKET_NAME = $WorkspaceBucket; SESSION_SECRET_ARN = $secretArn; BEDROCK_MODEL_ID = $ModelId; ALLOWED_ORIGIN = $AllowedOrigin
} }
$functionArn = Get-AwsText @('lambda', 'get-function', '--function-name', $FunctionName, '--query', 'Configuration.FunctionArn', '--output', 'text', '--region', $Region)
if ([string]::IsNullOrWhiteSpace($functionArn)) {
  Invoke-Aws @('lambda', 'create-function', '--function-name', $FunctionName, '--runtime', 'nodejs24.x', '--handler', 'index.handler', '--role', $roleArn, '--timeout', '120', '--memory-size', '1024', '--environment', "file://$environmentPath", '--zip-file', "fileb://$zipPath", '--region', $Region)
  $functionArn = Get-AwsText @('lambda', 'get-function', '--function-name', $FunctionName, '--query', 'Configuration.FunctionArn', '--output', 'text', '--region', $Region)
} else {
  Invoke-Aws @('lambda', 'update-function-configuration', '--function-name', $FunctionName, '--runtime', 'nodejs24.x', '--handler', 'index.handler', '--timeout', '120', '--memory-size', '1024', '--environment', "file://$environmentPath", '--region', $Region)
  Invoke-Aws @('lambda', 'wait', 'function-updated', '--function-name', $FunctionName, '--region', $Region)
  Invoke-Aws @('lambda', 'update-function-code', '--function-name', $FunctionName, '--zip-file', "fileb://$zipPath", '--publish', '--region', $Region)
}

Write-Host '[5/7] Configuring public Function URL with strict CORS origin...'
$urlConfig = Get-AwsText @('lambda', 'get-function-url-config', '--function-name', $FunctionName, '--query', 'FunctionUrl', '--output', 'text', '--region', $Region)
$corsConfigPath = Join-Path $tempRoot 'lambda-cors.json'
Write-JsonFile $corsConfigPath @{ AllowCredentials = $true; AllowHeaders = @('content-type'); AllowMethods = @('GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'); AllowOrigins = @($AllowedOrigin); MaxAge = 86400 }
if ([string]::IsNullOrWhiteSpace($urlConfig)) {
  Invoke-Aws @('lambda', 'create-function-url-config', '--function-name', $FunctionName, '--auth-type', 'NONE', '--cors', "file://$corsConfigPath", '--region', $Region)
} else {
  Invoke-Aws @('lambda', 'update-function-url-config', '--function-name', $FunctionName, '--auth-type', 'NONE', '--cors', "file://$corsConfigPath", '--region', $Region)
}

function Add-LambdaPermissionIfMissing([string]$StatementId, [string]$Action, [string]$FunctionUrlAuthType) {
  $policy = Get-AwsText @('lambda', 'get-policy', '--function-name', $FunctionName, '--region', $Region)
  if ($policy -notmatch [regex]::Escape($StatementId)) {
    Invoke-Aws @('lambda', 'add-permission', '--function-name', $FunctionName, '--statement-id', $StatementId, '--action', $Action, '--principal', '*', '--function-url-auth-type', $FunctionUrlAuthType, '--region', $Region)
  }
}
Add-LambdaPermissionIfMissing 'littlewhale-function-url' 'lambda:InvokeFunctionUrl' 'NONE'
Add-LambdaPermissionIfMissing 'littlewhale-function-url-invoke' 'lambda:InvokeFunction' 'NONE'

Write-Host '[6/7] Seeding LittleWhale configuration...'
$configPath = Join-Path $tempRoot 'config-item.json'
Write-JsonFile $configPath @{ configKey = @{ S = 'systemPrompt' }; value = @{ S = 'You are LittleWhale, a helpful AI assistant. Answer clearly, concisely and in the same language as the user.' } }
Invoke-Aws @('dynamodb', 'put-item', '--table-name', $configTable, '--item', "file://$configPath", '--region', $Region)

Write-Host '[7/7] Reading deployment outputs...'
$urlConfigJson = ConvertFrom-Json (Get-AwsText @('lambda', 'get-function-url-config', '--function-name', $FunctionName, '--region', $Region, '--output', 'json'))
$outputPath = Join-Path $cloudRoot 'outputs.json'
Write-JsonFile $outputPath @{ FunctionName = $FunctionName; FunctionUrl = $urlConfigJson.FunctionUrl; ConfigTable = $configTable; SessionsTable = $sessionsTable; MessagesTable = $messagesTable; AuthTable = $authTable; WorkspaceBucket = $WorkspaceBucket; Region = $Region; AllowedOrigin = $AllowedOrigin }
Write-Host "Function URL: $($urlConfigJson.FunctionUrl)"
Write-Host "Outputs saved to: $outputPath"

if (-not $KeepPackage -and (Test-Path $tempRoot)) { Remove-Item -LiteralPath $tempRoot -Recurse -Force }
