import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DeleteObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const region = process.env.AWS_REGION ?? 'eu-north-1'
const db = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), { marshallOptions: { removeUndefinedValues: true } })
const bedrock = new BedrockRuntimeClient({ region })
const s3 = new S3Client({ region })
const secrets = new SecretsManagerClient({ region })
const configTable = process.env.CONFIG_TABLE_NAME ?? 'littlewhale-config'
const sessionsTable = process.env.SESSIONS_TABLE_NAME ?? 'littlewhale-sessions'
const messagesTable = process.env.MESSAGES_TABLE_NAME ?? 'littlewhale-messages'
const authTable = process.env.AUTH_TABLE_NAME ?? 'littlewhale-auth'
const bucket = process.env.WORKSPACES_BUCKET_NAME
const modelId = process.env.BEDROCK_MODEL_ID ?? 'amazon.nova-lite-v1:0'
const maxMessageChars = 20000
const rovoResource = 'https://mcp.atlassian.com/v1/mcp/authv2'
const rovoProtectedResourceMetadata = 'https://mcp.atlassian.com/.well-known/oauth-protected-resource/v1/mcp/authv2'
const cookieName = 'littlewhale_session'
let sessionSecretPromise

const corsHeaders = () => ({
  'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
})
const response = (statusCode, body, headers = {}) => ({ statusCode, headers: { ...corsHeaders(), ...headers }, body: body === undefined ? '' : JSON.stringify(body) })
const redirect = (location, headers = {}) => ({ statusCode: 302, headers: { location, 'cache-control': 'no-store', ...headers }, body: '' })
const pathParts = event => (event.rawPath ?? event.requestContext?.http?.path ?? '/').split('/').filter(Boolean)
const method = event => event.requestContext?.http?.method ?? event.httpMethod ?? 'GET'
const bodyOf = event => { if (!event.body) return {}; try { return JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body) } catch { return null } }
const now = () => new Date().toISOString()
const epoch = () => Math.floor(Date.now() / 1000)
const queryOf = event => new URL(`https://littlewhale.invalid${event.rawPath ?? '/'}${event.rawQueryString ? `?${event.rawQueryString}` : ''}`).searchParams

async function sessionSecret() {
  sessionSecretPromise ??= secrets.send(new GetSecretValueCommand({ SecretId: process.env.SESSION_SECRET_ARN })).then(result => {
    let value
    if (result.SecretString) {
      try { value = JSON.parse(result.SecretString).secret } catch { value = result.SecretString }
    }
    if (typeof value !== 'string' || value.length < 32) throw new Error('invalid session secret')
    return value
  })
  return sessionSecretPromise
}
async function sign(value) { return createHmac('sha256', await sessionSecret()).update(value).digest('base64url') }
async function makeCookie(sessionId) { return `${cookieName}=${sessionId}.${await sign(sessionId)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800` }
function cookieValue(event) {
  const raw = event.headers?.cookie ?? event.headers?.Cookie ?? ''
  return raw.split(';').map(value => value.trim()).find(value => value.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1) ?? null
}
async function currentAuth(event) {
  const value = cookieValue(event); if (!value) return null
  const [sessionId, signature] = value.split('.'); if (!sessionId || !signature) return null
  const expected = await sign(sessionId); const actualBuffer = Buffer.from(signature); const expectedBuffer = Buffer.from(expected)
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null
  const result = await db.send(new GetCommand({ TableName: authTable, Key: { authKey: `session#${sessionId}` } }))
  if (!result.Item || result.Item.expiresAt <= epoch()) return null
  if (result.Item.tokens?.refresh_token && result.Item.tokens.expires_at <= epoch() + 60) {
    const tokenParams = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: result.Item.tokens.refresh_token, client_id: result.Item.client.client_id, resource: result.Item.resource })
    if (result.Item.client.client_secret) tokenParams.set('client_secret', result.Item.client.client_secret)
    const refreshed = await fetch('https://auth.atlassian.com/oauth/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: tokenParams })
    if (!refreshed.ok) return null
    const tokens = await refreshed.json(); if (typeof tokens.access_token !== 'string') return null
    tokens.refresh_token ??= result.Item.tokens.refresh_token
    tokens.expires_at = epoch() + (Number(tokens.expires_in) || 3600)
    await db.send(new UpdateCommand({ TableName: authTable, Key: { authKey: `session#${sessionId}` }, UpdateExpression: 'SET tokens = :tokens', ExpressionAttributeValues: { ':tokens': tokens } }))
    result.Item.tokens = tokens
  }
  return result.Item
}
async function requireAuth(event) { const auth = await currentAuth(event); return auth ? { auth } : { error: response(401, { error: 'authentication required' }) } }
function requestOrigin(event) { const protocol = event.headers?.['x-forwarded-proto'] ?? event.headers?.['X-Forwarded-Proto'] ?? 'https'; const host = event.headers?.host ?? event.headers?.Host; if (!host) throw new Error('request host unavailable'); return `${protocol}://${host}` }
function safeReturnTo(value) { const allowed = process.env.ALLOWED_ORIGIN; if (!value || !allowed || value !== allowed) return allowed ?? 'https://placeholder.invalid'; return `${value}/` }

async function rovoMetadata() {
  const protectedResult = await fetch(rovoProtectedResourceMetadata); if (!protectedResult.ok) throw new Error(`Rovo protected resource discovery failed: ${protectedResult.status}`)
  const protectedResource = await protectedResult.json(); const issuer = protectedResource.authorization_servers?.[0]; if (!issuer) throw new Error('Rovo authorization server not advertised')
  const metadataResult = await fetch(`${issuer.replace(/\/$/, '')}/.well-known/oauth-authorization-server`); if (!metadataResult.ok) throw new Error(`Atlassian OAuth discovery failed: ${metadataResult.status}`)
  return { protectedResource, metadata: await metadataResult.json() }
}
async function startAtlassian(event) {
  const { metadata, protectedResource } = await rovoMetadata(); const callbackUrl = `${requestOrigin(event)}/auth/atlassian/callback`; const returnTo = safeReturnTo(queryOf(event).get('returnTo'))
  const registration = await fetch(metadata.registration_endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'LittleWhale', redirect_uris: [callbackUrl], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' }) })
  if (!registration.ok) throw new Error(`Atlassian client registration failed: ${registration.status}`)
  const client = await registration.json(); const verifier = randomBytes(32).toString('base64url'); const challenge = createHash('sha256').update(verifier).digest('base64url'); const state = randomBytes(32).toString('base64url')
  await db.send(new PutCommand({ TableName: authTable, Item: { authKey: `state#${state}`, state, verifier, callbackUrl, returnTo, client, resource: protectedResource.resource ?? rovoResource, expiresAt: epoch() + 900 } }))
  const authUrl = new URL(metadata.authorization_endpoint); authUrl.search = new URLSearchParams({ response_type: 'code', client_id: client.client_id, redirect_uri: callbackUrl, code_challenge: challenge, code_challenge_method: 'S256', state, scope: protectedResource.scopes_supported?.join(' ') ?? 'read:me read:account offline_access', resource: protectedResource.resource ?? rovoResource }).toString()
  return redirect(authUrl.toString())
}
function tokenPayload(token) { try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) } catch { return {} } }
async function completeAtlassian(event) {
  const params = queryOf(event); const state = params.get('state'); const code = params.get('code'); if (!state || !code) return response(400, { error: 'missing OAuth callback parameters' })
  const savedResult = await db.send(new GetCommand({ TableName: authTable, Key: { authKey: `state#${state}` } })); const saved = savedResult.Item
  if (!saved || saved.expiresAt <= epoch()) return response(400, { error: 'OAuth state expired; please retry' })
  const tokenParams = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: saved.callbackUrl, client_id: saved.client.client_id, code_verifier: saved.verifier, resource: saved.resource }); if (saved.client.client_secret) tokenParams.set('client_secret', saved.client.client_secret)
  const tokenResult = await fetch('https://auth.atlassian.com/oauth/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: tokenParams }); if (!tokenResult.ok) return response(502, { error: 'Atlassian token exchange failed' })
  const tokens = await tokenResult.json(); if (typeof tokens.access_token !== 'string') return response(502, { error: 'Atlassian did not return an access token' })
  const profileResult = await fetch('https://api.atlassian.com/me', { headers: { authorization: `Bearer ${tokens.access_token}` } }); const profile = profileResult.ok ? await profileResult.json() : tokenPayload(tokens.access_token); const accountId = profile.account_id ?? profile.accountId ?? profile.sub
  if (typeof accountId !== 'string' || !accountId) return response(502, { error: 'Atlassian account identity unavailable' })
  const sessionId = randomUUID(); const timestamp = now(); tokens.expires_at = epoch() + (Number(tokens.expires_in) || 3600); await db.send(new PutCommand({ TableName: authTable, Item: { authKey: `session#${sessionId}`, sessionId, ownerId: `atlassian#${accountId}`, accountId, displayName: profile.name ?? profile.nickname ?? accountId, tokens, client: saved.client, resource: saved.resource, createdAt: timestamp, expiresAt: epoch() + 604800 } }))
  await db.send(new DeleteCommand({ TableName: authTable, Key: { authKey: `state#${state}` } })); return redirect(saved.returnTo, { 'set-cookie': await makeCookie(sessionId) })
}
async function logout(event) { const auth = await currentAuth(event); if (auth) await db.send(new DeleteCommand({ TableName: authTable, Key: { authKey: `session#${auth.sessionId}` } })); return response(204, undefined, { 'set-cookie': `${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` }) }
async function authMe(event) { const auth = await currentAuth(event); return auth ? response(200, { user: { accountId: auth.accountId, displayName: auth.displayName } }) : response(401, { error: 'authentication required' }) }

const toSession = item => ({ id: item.sessionId, title: item.title, createdAt: item.createdAt, updatedAt: item.updatedAt, messageCount: item.messageCount ?? 0 })
async function getConfig(key) { const result = await db.send(new GetCommand({ TableName: configTable, Key: { configKey: key } })); return result.Item?.value }
async function loadSession(auth, sessionId) { const result = await db.send(new GetCommand({ TableName: sessionsTable, Key: { ownerId: auth.ownerId, sessionId } })); return result.Item }
async function listSessions(event, auth) { const result = await db.send(new QueryCommand({ TableName: sessionsTable, KeyConditionExpression: 'ownerId = :ownerId', ExpressionAttributeValues: { ':ownerId': auth.ownerId }, ScanIndexForward: false, Limit: 100 })); return response(200, { sessions: (result.Items ?? []).map(toSession) }) }
async function createSession(event, auth) { const input = bodyOf(event) ?? {}; const sessionId = randomUUID(); const timestamp = now(); const title = typeof input.title === 'string' && input.title.trim() ? input.title.trim().slice(0, 120) : 'New conversation'; await db.send(new PutCommand({ TableName: sessionsTable, Item: { ownerId: auth.ownerId, sessionId, title, createdAt: timestamp, updatedAt: timestamp, messageCount: 0 } })); return response(201, { session: { id: sessionId, title, createdAt: timestamp, updatedAt: timestamp, messageCount: 0 } }) }
async function listMessages(event, auth, sessionId) { if (!(await loadSession(auth, sessionId))) return response(404, { error: 'session not found' }); const result = await db.send(new QueryCommand({ TableName: messagesTable, KeyConditionExpression: 'sessionId = :sessionId', ExpressionAttributeValues: { ':sessionId': sessionId }, ScanIndexForward: true, Limit: 200 })); return response(200, { messages: (result.Items ?? []).map(item => ({ id: item.messageId, role: item.role, content: item.content, createdAt: item.createdAt })) }) }
const modelMessage = item => ({ role: item.role === 'assistant' ? 'assistant' : 'user', content: [{ text: item.content }] })
async function chat(event, auth, sessionId) {
  const session = await loadSession(auth, sessionId); if (!session) return response(404, { error: 'session not found' }); const input = bodyOf(event); const content = typeof input?.message === 'string' ? input.message.trim() : ''; if (!content || content.length > maxMessageChars) return response(400, { error: `message must contain 1-${maxMessageChars} characters` })
  const previous = await db.send(new QueryCommand({ TableName: messagesTable, KeyConditionExpression: 'sessionId = :sessionId', ExpressionAttributeValues: { ':sessionId': sessionId }, ScanIndexForward: true, Limit: 100 })); const userMessage = { messageId: `${Date.now()}#${randomUUID()}`, sessionId, role: 'user', content, createdAt: now() }; await db.send(new PutCommand({ TableName: messagesTable, Item: userMessage }))
  const answerResult = await bedrock.send(new ConverseCommand({ modelId, system: [{ text: await getConfig('systemPrompt') ?? 'You are LittleWhale, a helpful AI assistant.' }], messages: [...(previous.Items ?? []).map(modelMessage), modelMessage(userMessage)], inferenceConfig: { maxTokens: 2048, temperature: 0.4 } })); const answer = answerResult.output?.message?.content?.map(part => part.text ?? '').join('')?.trim() || 'I could not produce an answer.'
  const assistantMessage = { messageId: `${Date.now()}#${randomUUID()}`, sessionId, role: 'assistant', content: answer, createdAt: now() }; await db.send(new PutCommand({ TableName: messagesTable, Item: assistantMessage })); await db.send(new UpdateCommand({ TableName: sessionsTable, Key: { ownerId: auth.ownerId, sessionId }, UpdateExpression: 'SET updatedAt = :updatedAt, title = :title, messageCount = if_not_exists(messageCount, :zero) + :two', ExpressionAttributeValues: { ':updatedAt': assistantMessage.createdAt, ':title': session.title === 'New conversation' ? content.slice(0, 60) : session.title, ':zero': 0, ':two': 2 } }))
  return response(200, { user: { id: userMessage.messageId, role: 'user', content, createdAt: userMessage.createdAt }, assistant: { id: assistantMessage.messageId, role: 'assistant', content: answer, createdAt: assistantMessage.createdAt }, modelId })
}
async function createWorkspace(event, auth) { if (!bucket) return response(503, { error: 'workspace storage is unavailable' }); const input = bodyOf(event) ?? {}; const name = typeof input.name === 'string' && /^[A-Za-z0-9][A-Za-z0-9 _-]{0,63}$/.test(input.name.trim()) ? input.name.trim() : null; if (!name) return response(400, { error: 'name must be 1-64 safe characters' }); const id = randomUUID(); const createdAt = now(); await s3.send(new PutObjectCommand({ Bucket: bucket, Key: `${auth.ownerId}/${id}/.workspace`, Body: JSON.stringify({ name, createdAt }), ContentType: 'application/json' })); return response(201, { workspace: { id, name, createdAt } }) }
async function listWorkspaces(event, auth) { if (!bucket) return response(200, { workspaces: [] }); const result = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: `${auth.ownerId}/`, Delimiter: '/' })); return response(200, { workspaces: (result.CommonPrefixes ?? []).map(item => ({ id: item.Prefix.split('/')[1], name: item.Prefix.split('/')[1] })) }) }
async function presign(event, auth, workspaceId) { const input = bodyOf(event) ?? {}; const filename = typeof input.filename === 'string' ? input.filename.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 160) : null; if (!bucket || !workspaceId || !filename) return response(400, { error: 'workspaceId and filename are required' }); const key = `${auth.ownerId}/${workspaceId}/${randomUUID()}-${filename}`; const uploadUrl = await getSignedUrl(s3, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: typeof input.contentType === 'string' ? input.contentType : 'application/octet-stream' }), { expiresIn: 900 }); return response(200, { key, uploadUrl, expiresIn: 900 }) }
async function deleteWorkspace(event, auth, workspaceId) { if (!bucket) return response(503, { error: 'workspace storage is unavailable' }); const result = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: `${auth.ownerId}/${workspaceId}/` })); await Promise.all((result.Contents ?? []).map(item => s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: item.Key })))); return response(204) }

export async function handler(event) {
  try {
    const currentMethod = method(event); const parts = pathParts(event); if (currentMethod === 'OPTIONS') return response(204)
    if (parts[0] === 'health') return response(200, { ok: true, service: 'littlewhale', region, modelId, authentication: 'atlassian-oauth-required' })
    if (parts[0] === 'auth' && parts[1] === 'atlassian' && parts[2] === 'start') return await startAtlassian(event)
    if (parts[0] === 'auth' && parts[1] === 'atlassian' && parts[2] === 'callback') return await completeAtlassian(event)
    if (parts[0] === 'auth' && parts[1] === 'me') return await authMe(event)
    if (parts[0] === 'auth' && parts[1] === 'logout' && currentMethod === 'POST') return await logout(event)
    if (parts[0] !== 'api') return response(404, { error: 'not found' })
    const required = await requireAuth(event); if (required.error) return required.error; const auth = required.auth
    if (parts[1] === 'config') return response(200, { modelId, region, capabilities: ['chat', 'sessions', 'workspaces', 'file-upload'], authentication: 'atlassian-oauth' })
    if (parts[1] === 'sessions' && parts.length === 2 && currentMethod === 'GET') return listSessions(event, auth)
    if (parts[1] === 'sessions' && parts.length === 2 && currentMethod === 'POST') return createSession(event, auth)
    if (parts[1] === 'sessions' && parts[3] === 'messages' && currentMethod === 'GET') return listMessages(event, auth, parts[2])
    if (parts[1] === 'sessions' && parts[3] === 'chat' && currentMethod === 'POST') return chat(event, auth, parts[2])
    if (parts[1] === 'workspaces' && parts.length === 2 && currentMethod === 'GET') return listWorkspaces(event, auth)
    if (parts[1] === 'workspaces' && parts.length === 2 && currentMethod === 'POST') return createWorkspace(event, auth)
    if (parts[1] === 'workspaces' && parts[3] === 'presign' && currentMethod === 'POST') return presign(event, auth, parts[2])
    if (parts[1] === 'workspaces' && parts.length === 3 && currentMethod === 'DELETE') return deleteWorkspace(event, auth, parts[2])
    return response(404, { error: 'not found' })
  } catch (error) { console.error('littlewhale request failed', error); return response(500, { error: 'internal server error' }) }
}
