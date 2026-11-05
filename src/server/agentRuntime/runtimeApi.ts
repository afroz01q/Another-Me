// ====================================================================
// ANOTHER ME — SECTION 2: CODING AGENT RUNTIME API PLUGIN
// Exposes authenticated backend endpoints for running tasks in isolated workspaces,
// retrieving live status, reading real workspace files, diffs, cancelling, and retrying.
// Strictly derives user identity from server auth token; never trusts client userId.
// ====================================================================

import fs from 'fs'
import path from 'path'
import type { Plugin } from 'vite'
import { verifyServerAuth } from '../orchestrator/authValidator'
import { orchestratorStorage } from '../orchestrator/orchestratorStorage'
import { workspaceManager } from './workspaceManager'
import { safeFileOperations } from './fileOperations'
import { taskRunner } from './taskRunner'
import { isDockerAvailable } from './processExecutor'
import { terminalManager } from './terminalManager'
import { packageManager } from './packageManager'
import { codingAgent } from './codingAgent'
import { previewTokenManager } from './previewTokenManager'
import { backendManager } from './backendManager'
import { previewManager } from './previewManager'
import { testManager } from './testManager'
import { githubManager } from './githubManager'
import { exportManager } from './exportManager'
import { deploymentManager } from './deploymentManager'

const SENSITIVE_PREVIEW_PATTERNS = [
  /^\.env/i,
  /\.env(\..+)?$/i,
  /^\.git/i,
  /\.workspace_/i,
  /^\.terminal/i,
  /\.npmrc$/i,
  /\.docker/i,
  /\.ssh/i,
  /package-lock\.json$/i,
  /id_rsa/i,
  /\.key$/i,
  /\.cert$/i,
]

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

// Rate limiting on preview token creation: max 60 tokens per minute per project
const previewTokenRateLimiter: Map<string, number[]> = new Map()
const MAX_PREVIEW_TOKENS_PER_MINUTE = 60

export function agentRuntimeApiPlugin(): Plugin {
  return {
    name: 'agent-runtime-api-plugin',
    configureServer(server) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`)
        const pathname = url.pathname

        if (!pathname.startsWith('/api/agent-runtime')) {
          return next()
        }

        const sendJson = (statusCode: number, data: any) => {
          if (res.headersSent) return
          res.statusCode = statusCode
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(data))
        }

        let cachedBody: any = null
        let bodyRead = false

        const readJsonBody = async (): Promise<any> => {
          if (bodyRead) return cachedBody || {}
          return new Promise((resolve) => {
            const chunks: Buffer[] = []
            req.on('data', (c: Buffer) => chunks.push(c))
            req.on('end', () => {
              bodyRead = true
              try {
                const str = Buffer.concat(chunks).toString('utf-8')
                cachedBody = str ? JSON.parse(str) : {}
                resolve(cachedBody)
              } catch {
                cachedBody = {}
                resolve({})
              }
            })
          })
        }

        const requireAuth = async () => {
          const authResult = await verifyServerAuth(req)
          if (!authResult.authenticated || !authResult.userId) {
            sendJson(authResult.statusCode || 401, {
              error: authResult.error || 'Authentication required.',
              code: 'UNAUTHORIZED',
            })
            return null
          }
          return authResult
        }

        try {
          // ------------------------------------------------------------------
          // STATUS & CAPABILITIES
          // GET /api/agent-runtime/status
          // ------------------------------------------------------------------
          if (pathname === '/api/agent-runtime/status' && req.method === 'GET') {
            const dockerAvailable = isDockerAvailable()
            return sendJson(200, {
              status: 'ok',
              section: 'Section 3: Real Terminal & Package Manager',
              sandboxTier: dockerAvailable ? 'container_isolated' : 'restricted_process_fallback',
              containerAvailable: dockerAvailable,
              containerStatus: dockerAvailable ? 'verified_active' : 'unverified_docker_unavailable',
              isolationBoundary: dockerAvailable ? 'ephemeral_docker_container' : 'restricted_host_process',
              infrastructureNotice: dockerAvailable
                ? 'Container isolation enabled via Docker daemon.'
                : 'Container runtime (Docker) is unavailable on this host; the container isolation path remains unverified. Host execution fallback strictly rejects arbitrary commands, package scripts, and package installation fail-closed.',
              isolationRoot: 'storage/workspaces',
              features: {
                terminalManager: true,
                packageManager: true,
                persistentCommandHistory: true,
                concurrencyLocks: true,
              },
              securityControls: {
                failClosedArbitraryCommands: true,
                commandSpecificArgumentPolicies: true,
                packageScriptsAndInstallDisabledOnHost: true,
                toctouSymlinkParentVerification: true,
                environmentSecretScrubbing: true,
                nonPrefixBoundaryContainment: true,
                symlinkEscapeVerification: true,
                processTreeTermination: true,
                serverSideOwnershipDerivation: true,
              },
            })
          }

          // ------------------------------------------------------------------
          // USER-LEVEL GITHUB INTEGRATION ENDPOINTS
          // ------------------------------------------------------------------
          if (pathname === '/api/agent-runtime/github/config-test-endpoint' && req.method === 'POST') {
            const auth = await requireAuth()
            if (!auth) return
            const body = await readJsonBody()
            if (body?.apiBaseUrl) githubManager.setCustomApiBaseUrl(body.apiBaseUrl)
            if (body?.oauthBaseUrl) githubManager.setCustomOAuthBaseUrl(body.oauthBaseUrl)
            if (body?.deployBaseUrl) {
              deploymentManager.setCustomProviderUrls({
                vercel: body.deployBaseUrl,
                netlify: body.deployBaseUrl,
                cloudflare: body.deployBaseUrl,
              })
            }
            if (body?.reset) {
              githubManager.resetCustomUrls()
              deploymentManager.resetCustomProviderUrls()
            }
            return sendJson(200, { success: true })
          }

          if (pathname === '/api/agent-runtime/github/status' && req.method === 'GET') {
            const auth = await requireAuth()
            if (!auth) return
            const status = await githubManager.getStatus(auth.userId!)
            return sendJson(200, status)
          }

          if (pathname === '/api/agent-runtime/github/connect' && req.method === 'POST') {
            const auth = await requireAuth()
            if (!auth) return
            const body = await readJsonBody()
            const token = body?.token
            if (!token) {
              return sendJson(400, { error: 'GitHub access token is required.', code: 'TOKEN_REQUIRED' })
            }
            try {
              const result = await githubManager.setPersonalAccessToken(auth.userId!, token)
              return sendJson(200, result)
            } catch (err: any) {
              return sendJson(err.statusCode || 400, {
                error: previewTokenManager.redactTokens(err.message || 'GitHub connection failed.'),
                code: err.code || 'GITHUB_ERROR',
              })
            }
          }

          if (pathname === '/api/agent-runtime/github/disconnect' && req.method === 'POST') {
            const auth = await requireAuth()
            if (!auth) return
            const result = githubManager.disconnect(auth.userId!)
            return sendJson(200, result)
          }

          if (pathname === '/api/agent-runtime/github/oauth/url' && req.method === 'GET') {
            const auth = await requireAuth()
            if (!auth) return
            const projId = url.searchParams.get('projectId') || ''
            const redirectUri = url.searchParams.get('redirectUri') || undefined
            const oauthInfo = githubManager.getOAuthUrl(auth.userId!, projId, redirectUri)
            return sendJson(200, oauthInfo)
          }

          if (pathname === '/api/agent-runtime/github/oauth/callback' && req.method === 'POST') {
            const auth = await requireAuth()
            if (!auth) return
            const body = await readJsonBody()
            try {
              const result = await githubManager.handleOAuthCallback(body.code, body.state)
              return sendJson(200, result)
            } catch (err: any) {
              return sendJson(err.statusCode || 400, {
                error: previewTokenManager.redactTokens(err.message || 'OAuth exchange failed.'),
                code: err.code || 'GITHUB_OAUTH_FAILED',
              })
            }
          }

          // ------------------------------------------------------------------
          // PROJECT ROUTE PARSING: /api/agent-runtime/projects/:id[/action]
          // ------------------------------------------------------------------
          const projectMatch = pathname.match(/^\/api\/agent-runtime\/projects\/([^/]+)(\/.*)?$/)
          if (projectMatch) {
            const projectId = decodeURIComponent(projectMatch[1])
            const subAction = projectMatch[2] || ''
            let verifiedUserId = ''
            let authScope: 'owner:all' | 'preview:read' = 'owner:all'
            let authMechanism: 'session_bearer' | 'preview_token' = 'session_bearer'

            // Security Hardening: Preview route authentication audit
            // Priority 1: Scoped preview token (?previewToken=)
            // Priority 2: Authorization: Bearer header
            // Priority 3: Legacy URL bearer token fallback (?token=)
            const isFilePreviewServe =
              (subAction === '/preview' ||
                (subAction.startsWith('/preview/') &&
                  !['/preview/start', '/preview/stop', '/preview/restart', '/preview/status', '/preview/logs'].includes(subAction))) &&
              req.method === 'GET'
            const isPreviewLogSubmit = subAction === '/preview/log' && req.method === 'POST'
            const isProxyRoute = subAction.startsWith('/backend-proxy')
            const isPreviewRoute = isFilePreviewServe || isPreviewLogSubmit

            // Read non-proxy POST/PUT/PATCH bodies upfront once for reliable access
            let parsedBody: any = null
            if (!isProxyRoute && (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH')) {
              parsedBody = await readJsonBody()
            }

            if (isPreviewRoute || isProxyRoute) {
              const previewTokenParam = url.searchParams.get('previewToken')
              const authHeader = req.headers?.authorization || req.headers?.Authorization
              const qToken = url.searchParams.get('token')
              const bodyToken = parsedBody?.previewToken || parsedBody?.token

              const candidatePreviewToken =
                previewTokenParam ||
                (qToken && qToken.startsWith('eyJ') && qToken.includes('.sig_') ? null : qToken) ||
                bodyToken

              if (candidatePreviewToken) {
                const tokenResult = previewTokenManager.verifyPreviewToken(candidatePreviewToken, projectId)
                if (!tokenResult.valid || !tokenResult.userId) {
                  return sendJson(tokenResult.statusCode || 401, {
                    error: tokenResult.error || 'Invalid or expired preview token.',
                    code: tokenResult.statusCode === 403
                      ? 'FORBIDDEN_TOKEN_PROJECT_MISMATCH'
                      : 'UNAUTHORIZED_PREVIEW_TOKEN',
                  })
                }
                verifiedUserId = tokenResult.userId
                authScope = 'preview:read'
                authMechanism = 'preview_token'
              } else if (authHeader && typeof authHeader === 'string' && /^Bearer\s+/i.test(authHeader)) {
                const rawToken = authHeader.replace(/^Bearer\s+/i, '').trim()
                const pvwCheck = previewTokenManager.verifyPreviewToken(rawToken, projectId)
                if (pvwCheck.valid && pvwCheck.userId) {
                  verifiedUserId = pvwCheck.userId
                  authScope = 'preview:read'
                  authMechanism = 'preview_token'
                } else if (!rawToken.includes('.sig_') && pvwCheck.error) {
                  return sendJson(pvwCheck.statusCode || 401, {
                    error: pvwCheck.error || 'Invalid or expired preview token.',
                    code: pvwCheck.statusCode === 403
                      ? 'FORBIDDEN_TOKEN_PROJECT_MISMATCH'
                      : 'UNAUTHORIZED_PREVIEW_TOKEN',
                  })
                } else {
                  // Standard user session JWT verification
                  const authResult = await verifyServerAuth(req)
                  if (!authResult.authenticated || !authResult.userId) {
                    return sendJson(authResult.statusCode || 401, {
                      error: authResult.error || 'Authentication required.',
                      code: 'UNAUTHORIZED',
                    })
                  }
                  verifiedUserId = authResult.userId
                  authScope = 'owner:all'
                  authMechanism = 'session_bearer'
                }
              } else if (qToken && typeof qToken === 'string' && qToken.trim()) {
                const authResult = await verifyServerAuth({
                  headers: { authorization: `Bearer ${qToken.trim()}` },
                })
                if (!authResult.authenticated || !authResult.userId) {
                  return sendJson(authResult.statusCode || 401, {
                    error: authResult.error || 'Authentication required.',
                    code: 'UNAUTHORIZED',
                  })
                }
                verifiedUserId = authResult.userId
                authScope = 'owner:all'
                authMechanism = 'session_bearer'
              } else {
                return sendJson(401, {
                  error: 'Authentication required. Supply a valid scoped ?previewToken= query parameter or Authorization: Bearer header.',
                  code: 'AUTH_REQUIRED',
                })
              }
            } else {
              // Non-preview project endpoints strictly require session bearer tokens
              const authHeader = req.headers?.authorization || req.headers?.Authorization
              if (authHeader && typeof authHeader === 'string' && /^Bearer\s+/i.test(authHeader)) {
                const rawToken = authHeader.replace(/^Bearer\s+/i, '').trim()
                let isPreviewToken = false
                try {
                  const parts = rawToken.split('.')
                  if (parts.length === 3) {
                    const hdr = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf-8'))
                    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'))
                    if (hdr.pvw || payload.scope === 'preview:read') {
                      isPreviewToken = true
                    }
                  }
                } catch {}

                if (isPreviewToken) {
                  const isPreviewManagement =
                    subAction === '/debug' ||
                    subAction.startsWith('/preview/') ||
                    subAction.startsWith('/tests') ||
                    subAction.startsWith('/quality') ||
                    subAction.startsWith('/security') ||
                    subAction.startsWith('/coverage') ||
                    subAction.startsWith('/github') ||
                    subAction.startsWith('/export') ||
                    subAction.startsWith('/deploy')
                  if (isPreviewManagement) {
                    return sendJson(403, {
                      error: 'Forbidden: Preview tokens have read-only scope for preview and proxy routes only. Owner authorization required.',
                      code: 'FORBIDDEN_PREVIEW_TOKEN_READ_ONLY',
                    })
                  }
                }
              }

              const auth = await requireAuth()
              if (!auth) return
              verifiedUserId = auth.userId!
              authScope = 'owner:all'
              authMechanism = 'session_bearer'
            }

            // Verify project ownership on every project route
            let project = null
            try {
              project = await orchestratorStorage.getProject(projectId, verifiedUserId)
            } catch (authErr: any) {
              if (authErr.message?.includes('ACCESS_DENIED')) {
                return sendJson(403, {
                  error: 'Access denied: You do not own this project.',
                  code: 'FORBIDDEN_PROJECT_ACCESS',
                })
              }
            }

            if (!project) {
              return sendJson(404, {
                error: `Project "${projectId}" not found for this authenticated user.`,
                code: 'PROJECT_NOT_FOUND',
              })
            }

            const workspaceRoot = workspaceManager.getWorkspaceRoot(verifiedUserId, projectId)

            // ----------------------------------------------------------------
            // ISSUE SHORT-LIVED PREVIEW TOKEN
            // POST /api/agent-runtime/projects/:id/preview-token
            // ----------------------------------------------------------------
            if (subAction === '/preview-token' && req.method === 'POST') {
              const nowMs = Date.now()
              const rateKey = `${verifiedUserId}:${projectId}`
              const recentTimestamps = (previewTokenRateLimiter.get(rateKey) || []).filter(
                (t) => nowMs - t < 60000
              )
              if (recentTimestamps.length >= MAX_PREVIEW_TOKENS_PER_MINUTE) {
                return sendJson(429, {
                  error: 'Rate limit exceeded: Maximum 60 preview tokens per minute per project.',
                  code: 'PREVIEW_TOKEN_RATE_LIMIT_EXCEEDED',
                })
              }
              recentTimestamps.push(nowMs)
              previewTokenRateLimiter.set(rateKey, recentTimestamps)

              const body = await readJsonBody()
              const ttlSeconds = body.ttlSeconds ? Number(body.ttlSeconds) : undefined
              const tokenInfo = previewTokenManager.createPreviewToken(verifiedUserId, projectId, ttlSeconds)
              return sendJson(200, {
                success: true,
                ...tokenInfo,
              })
            }

            // ----------------------------------------------------------------
            // REVOKE PREVIEW TOKENS
            // POST /api/agent-runtime/projects/:id/preview-token/revoke
            // ----------------------------------------------------------------
            if (subAction === '/preview-token/revoke' && req.method === 'POST') {
              const body = await readJsonBody()
              if (body.jti) {
                previewTokenManager.revokeToken(body.jti)
              } else {
                previewTokenManager.revokeProjectTokens(projectId)
              }
              return sendJson(200, {
                success: true,
                message: 'Active preview tokens have been revoked for this project.',
                projectId,
              })
            }

            // ----------------------------------------------------------------
            // START / RESUME EXECUTION
            // POST /api/agent-runtime/projects/:id/execute
            // ----------------------------------------------------------------
            if (subAction === '/execute' && req.method === 'POST') {
              const body = await readJsonBody()
              // Never trust client-supplied userId
              if (body.userId && body.userId !== verifiedUserId) {
                return sendJson(403, {
                  error: 'Access denied: Client userId mismatch with authenticated session.',
                  code: 'USER_MISMATCH',
                })
              }

              try {
                const status = await taskRunner.executeProject(verifiedUserId, projectId, {
                  apiKeyOverride: body.apiKey,
                })
                return sendJson(200, {
                  success: true,
                  message: 'Coding agent runtime execution started.',
                  status,
                })
              } catch (runErr: any) {
                return sendJson(runErr.statusCode || 400, {
                  error: runErr.message,
                  code: runErr.code || 'EXECUTION_START_FAILED',
                })
              }
            }

            // ----------------------------------------------------------------
            // GET EXECUTION STATUS
            // GET /api/agent-runtime/projects/:id/status
            // ----------------------------------------------------------------
            if (subAction === '/status' && req.method === 'GET') {
              try {
                const status = await taskRunner.getStatus(verifiedUserId, projectId)
                return sendJson(200, {
                  success: true,
                  status,
                })
              } catch (statErr: any) {
                return sendJson(statErr.statusCode || 500, {
                  error: statErr.message,
                  code: statErr.code || 'GET_STATUS_FAILED',
                })
              }
            }

            // ----------------------------------------------------------------
            // LIST WORKSPACE FILES
            // GET /api/agent-runtime/projects/:id/files
            // ----------------------------------------------------------------
            if (subAction === '/files' && req.method === 'GET') {
              try {
                const subDir = url.searchParams.get('dir') || ''
                const files = await safeFileOperations.listFiles(workspaceRoot, subDir)
                return sendJson(200, {
                  success: true,
                  projectId,
                  files,
                })
              } catch (fileErr: any) {
                return sendJson(fileErr.statusCode || 400, {
                  error: fileErr.message,
                  code: fileErr.code || 'LIST_FILES_FAILED',
                })
              }
            }

            // ----------------------------------------------------------------
            // READ SPECIFIC WORKSPACE FILE
            // GET /api/agent-runtime/projects/:id/files/content?path=...
            // ----------------------------------------------------------------
            if (subAction === '/files/content' && req.method === 'GET') {
              const filePath = url.searchParams.get('path')
              if (!filePath) {
                return sendJson(400, { error: 'Query parameter "path" is required.', code: 'MISSING_PATH' })
              }

              try {
                const { content, size } = await safeFileOperations.readFile(workspaceRoot, filePath)
                return sendJson(200, {
                  success: true,
                  projectId,
                  relativePath: filePath,
                  size,
                  content,
                })
              } catch (readErr: any) {
                return sendJson(readErr.statusCode || 400, {
                  error: readErr.message,
                  code: readErr.code || 'READ_FILE_FAILED',
                })
              }
            }

            // ----------------------------------------------------------------
            // RETRIEVE FILE CHANGES / DIFFS
            // GET /api/agent-runtime/projects/:id/changes
            // ----------------------------------------------------------------
            if (subAction === '/changes' && req.method === 'GET') {
              try {
                const changes = safeFileOperations.getChanges(workspaceRoot)
                return sendJson(200, {
                  success: true,
                  projectId,
                  changes,
                })
              } catch (chgErr: any) {
                return sendJson(500, {
                  error: chgErr.message,
                  code: 'GET_CHANGES_FAILED',
                })
              }
            }

            // ----------------------------------------------------------------
            // CANCEL RUNNING EXECUTION
            // POST /api/agent-runtime/projects/:id/cancel
            // ----------------------------------------------------------------
            if (subAction === '/cancel' && req.method === 'POST') {
              try {
                const cancelled = await taskRunner.cancelExecution(verifiedUserId, projectId)
                return sendJson(200, {
                  success: true,
                  cancelled,
                  message: cancelled
                    ? 'Execution cancellation signaled.'
                    : 'No active running execution was found to cancel.',
                })
              } catch (canErr: any) {
                return sendJson(canErr.statusCode || 500, {
                  error: canErr.message,
                  code: canErr.code || 'CANCEL_FAILED',
                })
              }
            }

            // ----------------------------------------------------------------
            // RETRY FAILED OR CANCELLED TASK
            // POST /api/agent-runtime/projects/:id/retry
            // ----------------------------------------------------------------
            if (subAction === '/retry' && req.method === 'POST') {
              const body = await readJsonBody()
              const { taskId, apiKey } = body
              if (!taskId) {
                return sendJson(400, { error: 'Field "taskId" is required for retry.', code: 'MISSING_TASK_ID' })
              }

              try {
                const status = await taskRunner.retryTask(verifiedUserId, projectId, taskId, {
                  apiKeyOverride: apiKey,
                })
                return sendJson(200, {
                  success: true,
                  message: `Retrying task "${taskId}".`,
                  status,
                })
              } catch (retErr: any) {
                return sendJson(retErr.statusCode || 400, {
                  error: retErr.message,
                  code: retErr.code || 'RETRY_FAILED',
                })
              }
            }

            // ----------------------------------------------------------------
            // SECTION 3: TERMINAL SESSION ENDPOINTS
            // ----------------------------------------------------------------
            // GET /api/agent-runtime/projects/:id/terminal/sessions
            if (subAction === '/terminal/sessions' && req.method === 'GET') {
              try {
                const sessions = await terminalManager.listSessions(verifiedUserId, projectId)
                return sendJson(200, { success: true, projectId, sessions })
              } catch (listErr: any) {
                return sendJson(listErr.statusCode || 500, {
                  error: listErr.message,
                  code: listErr.code || 'LIST_SESSIONS_FAILED',
                })
              }
            }

            // POST /api/agent-runtime/projects/:id/terminal/sessions
            if (subAction === '/terminal/sessions' && req.method === 'POST') {
              try {
                const body = await readJsonBody()
                const session = await terminalManager.createSession(verifiedUserId, projectId, body.name)
                return sendJson(201, { success: true, projectId, session })
              } catch (createErr: any) {
                return sendJson(createErr.statusCode || 400, {
                  error: createErr.message,
                  code: createErr.code || 'CREATE_SESSION_FAILED',
                })
              }
            }

            // GET /api/agent-runtime/projects/:id/terminal/history
            if (subAction === '/terminal/history' && req.method === 'GET') {
              try {
                const sessionIdParam = url.searchParams.get('sessionId') || undefined
                const history = await terminalManager.getCommandHistory(verifiedUserId, projectId, sessionIdParam)
                return sendJson(200, { success: true, projectId, history })
              } catch (histErr: any) {
                return sendJson(histErr.statusCode || 500, {
                  error: histErr.message,
                  code: histErr.code || 'GET_HISTORY_FAILED',
                })
              }
            }

            // Session-specific sub-routes: /terminal/sessions/:sessionId[/execute|/cancel|/history]
            const sessionMatch = subAction.match(/^\/terminal\/sessions\/([^/]+)(\/.*)?$/)
            if (sessionMatch) {
              const sessionId = decodeURIComponent(sessionMatch[1])
              const sessionSubAction = sessionMatch[2] || ''

              // GET /api/agent-runtime/projects/:id/terminal/sessions/:sessionId
              if (!sessionSubAction && req.method === 'GET') {
                const session = await terminalManager.getSession(verifiedUserId, projectId, sessionId)
                if (!session) {
                  return sendJson(404, {
                    error: `Terminal session "${sessionId}" not found.`,
                    code: 'SESSION_NOT_FOUND',
                  })
                }
                return sendJson(200, { success: true, projectId, session })
              }

              // POST /api/agent-runtime/projects/:id/terminal/sessions/:sessionId/execute
              if (sessionSubAction === '/execute' && req.method === 'POST') {
                const body = await readJsonBody()
                const { command, args, options } = body
                if (!command) {
                  return sendJson(400, { error: 'Field "command" is required.', code: 'MISSING_COMMAND' })
                }
                try {
                  const record = await terminalManager.executeCommand(
                    verifiedUserId,
                    projectId,
                    sessionId,
                    command,
                    args,
                    options
                  )
                  return sendJson(200, { success: true, projectId, sessionId, record })
                } catch (cmdErr: any) {
                  return sendJson(cmdErr.statusCode || 400, {
                    error: cmdErr.message,
                    code: cmdErr.code || 'COMMAND_EXECUTION_FAILED',
                  })
                }
              }

              // POST /api/agent-runtime/projects/:id/terminal/sessions/:sessionId/cancel
              if (sessionSubAction === '/cancel' && req.method === 'POST') {
                const body = await readJsonBody()
                try {
                  const result = await terminalManager.cancelCommand(
                    verifiedUserId,
                    projectId,
                    sessionId,
                    body.commandId
                  )
                  return sendJson(200, { projectId, sessionId, ...result })
                } catch (canErr: any) {
                  return sendJson(canErr.statusCode || 500, {
                    error: canErr.message,
                    code: canErr.code || 'CANCEL_FAILED',
                  })
                }
              }

              // DELETE /api/agent-runtime/projects/:id/terminal/sessions/:sessionId/history
              if (sessionSubAction === '/history' && req.method === 'DELETE') {
                try {
                  const cleared = await terminalManager.clearSessionHistory(verifiedUserId, projectId, sessionId)
                  return sendJson(200, { success: true, cleared })
                } catch (clrErr: any) {
                  return sendJson(clrErr.statusCode || 500, {
                    error: clrErr.message,
                    code: clrErr.code || 'CLEAR_HISTORY_FAILED',
                  })
                }
              }
            }

            // ----------------------------------------------------------------
            // SECTION 3: PACKAGE MANAGER ENDPOINTS
            // ----------------------------------------------------------------
            // GET /api/agent-runtime/projects/:id/packages
            if (subAction === '/packages' && req.method === 'GET') {
              try {
                const result = await packageManager.listPackages(verifiedUserId, projectId)
                return sendJson(result.success ? 200 : 400, { projectId, ...result })
              } catch (pkgErr: any) {
                return sendJson(500, {
                  error: pkgErr.message,
                  code: 'LIST_PACKAGES_FAILED',
                })
              }
            }

            // POST /api/agent-runtime/projects/:id/packages/install
            if (subAction === '/packages/install' && req.method === 'POST') {
              try {
                const body = await readJsonBody()
                const result = await packageManager.installPackage(
                  verifiedUserId,
                  projectId,
                  body.packageName,
                  body.options
                )
                const statusCode = result.status === 'blocked_missing_sandbox' ? 403 : result.success ? 200 : 400
                return sendJson(statusCode, { projectId, ...result })
              } catch (instErr: any) {
                return sendJson(500, {
                  error: instErr.message,
                  code: 'INSTALL_PACKAGE_FAILED',
                })
              }
            }

            // POST /api/agent-runtime/projects/:id/packages/build
            if (subAction === '/packages/build' && req.method === 'POST') {
              try {
                const body = await readJsonBody()
                const result = await packageManager.buildProject(verifiedUserId, projectId, body.options)
                const statusCode = result.status === 'blocked_missing_sandbox' ? 403 : result.success ? 200 : 400
                return sendJson(statusCode, { projectId, ...result })
              } catch (bldErr: any) {
                return sendJson(500, {
                  error: bldErr.message,
                  code: 'BUILD_PROJECT_FAILED',
                })
              }
            }

            // ----------------------------------------------------------------
            // POST /api/agent-runtime/projects/:id/edit
            // Follow-up conversational editing on authenticated workspace
            // ----------------------------------------------------------------
            if (subAction === '/edit' && req.method === 'POST') {
              try {
                const body = await readJsonBody()
                const instruction = body.instruction || body.prompt
                if (!instruction || typeof instruction !== 'string' || !instruction.trim()) {
                  return sendJson(400, {
                    error: 'Modification instruction is required.',
                    code: 'MISSING_INSTRUCTION',
                  })
                }

                const result = await codingAgent.editProject({
                  userId: verifiedUserId,
                  projectId,
                  instruction: instruction.trim(),
                  workspaceRoot,
                  apiKeyOverride: body.apiKey,
                })

                return sendJson(200, {
                  projectId,
                  ...result,
                })
              } catch (editErr: any) {
                return sendJson(500, {
                  error: editErr.message || 'Project edit encountered an unexpected error.',
                  code: 'PROJECT_EDIT_FAILED',
                })
              }
            }

            // ----------------------------------------------------------------
            // SECTION 6: LIVE DEBUGGING WORKFLOW
            // POST /api/agent-runtime/projects/:id/debug
            // Passes real error context to coding agent, proposes fix, diffs, and applies
            // ----------------------------------------------------------------
            if (subAction === '/debug' && req.method === 'POST') {
              if (authScope !== 'owner:all') {
                return sendJson(403, {
                  error: 'Preview tokens cannot execute debugging workflows. Owner authorization required.',
                  code: 'FORBIDDEN_PREVIEW_TOKEN_READ_ONLY',
                })
              }

              try {
                const body = await readJsonBody()
                const errorMsg = body.error || body.message
                if (!errorMsg || typeof errorMsg !== 'string' || !errorMsg.trim()) {
                  return sendJson(400, {
                    error: 'Error description or context is required for debugging.',
                    code: 'MISSING_ERROR_CONTEXT',
                  })
                }

                const result = await codingAgent.debugAndFixProject({
                  userId: verifiedUserId,
                  projectId,
                  error: errorMsg.trim(),
                  errorType: body.errorType || 'runtime',
                  file: body.file,
                  line: body.line ? Number(body.line) : undefined,
                  column: body.column ? Number(body.column) : undefined,
                  context: body.context,
                  workspaceRoot,
                  apiKeyOverride: body.apiKey,
                  autoApply: body.autoApply !== false,
                })

                return sendJson(200, {
                  projectId,
                  ...result,
                })
              } catch (debugErr: any) {
                return sendJson(500, {
                  error: debugErr.message || 'Debugging encountered an unexpected error.',
                  code: 'DEBUG_FAILED',
                })
              }
            }

            // ----------------------------------------------------------------
            // SECTION 5: BACKEND & DATABASE BUILDER ENDPOINTS
            // ----------------------------------------------------------------

            // POST /api/agent-runtime/projects/:id/backend/generate
            if (subAction === '/backend/generate' && req.method === 'POST') {
              try {
                const body = await readJsonBody()
                const instruction = body.instruction || body.prompt
                if (!instruction || typeof instruction !== 'string' || !instruction.trim()) {
                  return sendJson(400, {
                    error: 'Backend generation instruction is required.',
                    code: 'MISSING_INSTRUCTION',
                  })
                }

                const result = await codingAgent.generateBackendApi({
                  userId: verifiedUserId,
                  projectId,
                  instruction: instruction.trim(),
                  workspaceRoot,
                  apiKeyOverride: body.apiKey,
                })

                return sendJson(result.success ? 200 : 400, {
                  projectId,
                  ...result,
                })
              } catch (genErr: any) {
                return sendJson(500, {
                  error: genErr.message || 'Backend generation encountered an unexpected error.',
                  code: 'BACKEND_GENERATE_FAILED',
                })
              }
            }

            // GET /api/agent-runtime/projects/:id/backend/status
            if (subAction === '/backend/status' && req.method === 'GET') {
              try {
                const status = await backendManager.getBackendStatus(verifiedUserId, projectId)
                return sendJson(200, { projectId, ...status })
              } catch (statusErr: any) {
                return sendJson(500, {
                  error: statusErr.message,
                  code: 'BACKEND_STATUS_FAILED',
                })
              }
            }

            // POST /api/agent-runtime/projects/:id/backend/start
            if (subAction === '/backend/start' && req.method === 'POST') {
              try {
                const body = await readJsonBody()
                const status = await backendManager.startBackend(verifiedUserId, projectId, body)
                const statusCode = status.running ? 200 : status.error?.includes('Container isolation required') ? 403 : 400
                return sendJson(statusCode, { projectId, ...status })
              } catch (startErr: any) {
                return sendJson(500, {
                  error: startErr.message,
                  code: 'BACKEND_START_FAILED',
                })
              }
            }

            // POST /api/agent-runtime/projects/:id/backend/stop
            if (subAction === '/backend/stop' && req.method === 'POST') {
              try {
                const stopped = await backendManager.stopBackend(verifiedUserId, projectId)
                return sendJson(200, { projectId, stopped })
              } catch (stopErr: any) {
                return sendJson(500, {
                  error: stopErr.message,
                  code: 'BACKEND_STOP_FAILED',
                })
              }
            }

            // GET /api/agent-runtime/projects/:id/backend/migrations
            if (subAction === '/backend/migrations' && req.method === 'GET') {
              try {
                const migrations = await backendManager.getMigrations(verifiedUserId, projectId)
                return sendJson(200, { projectId, migrations })
              } catch (migErr: any) {
                return sendJson(500, {
                  error: migErr.message,
                  code: 'GET_MIGRATIONS_FAILED',
                })
              }
            }

            // POST /api/agent-runtime/projects/:id/backend/migrations/apply
            if (subAction === '/backend/migrations/apply' && req.method === 'POST') {
              try {
                const body = await readJsonBody()
                const result = await backendManager.applyMigrations(verifiedUserId, projectId, body)
                const statusCode =
                  result.status === 'destructive_blocked'
                    ? 400
                    : result.error === 'CONTAINER_ISOLATION_REQUIRED'
                    ? 403
                    : result.success
                    ? 200
                    : 400
                return sendJson(statusCode, { projectId, ...result })
              } catch (applyErr: any) {
                return sendJson(500, {
                  error: applyErr.message,
                  code: 'APPLY_MIGRATIONS_FAILED',
                })
              }
            }

            // POST /api/agent-runtime/projects/:id/backend/migrations/rollback
            if (subAction === '/backend/migrations/rollback' && req.method === 'POST') {
              try {
                const body = await readJsonBody()
                const result = await backendManager.rollbackMigration(
                  verifiedUserId,
                  projectId,
                  body?.targetVersion,
                  { confirmDestructive: body?.confirmDestructive }
                )
                const statusCode =
                  result.status === 'destructive_blocked'
                    ? 400
                    : result.success
                    ? 200
                    : 400
                return sendJson(statusCode, { projectId, ...result })
              } catch (rbErr: any) {
                return sendJson(500, {
                  error: rbErr.message,
                  code: 'ROLLBACK_MIGRATIONS_FAILED',
                })
              }
            }

            // POST /api/agent-runtime/projects/:id/backend/seed
            if (subAction === '/backend/seed' && req.method === 'POST') {
              try {
                const result = await backendManager.seedDatabase(verifiedUserId, projectId)
                const statusCode = result.error === 'CONTAINER_ISOLATION_REQUIRED' ? 403 : result.success ? 200 : 400
                return sendJson(statusCode, { projectId, ...result })
              } catch (seedErr: any) {
                return sendJson(500, {
                  error: seedErr.message,
                  code: 'SEED_DATABASE_FAILED',
                })
              }
            }

            // POST /api/agent-runtime/projects/:id/backend/test
            if (subAction === '/backend/test' && req.method === 'POST') {
              try {
                const result = await backendManager.testBackendEndpoints(verifiedUserId, projectId)
                return sendJson(result.success ? 200 : 400, { projectId, ...result })
              } catch (testErr: any) {
                return sendJson(500, {
                  error: testErr.message,
                  code: 'TEST_BACKEND_FAILED',
                })
              }
            }

            // Controlled Backend Proxy: ALL /api/agent-runtime/projects/:id/backend-proxy/*
            if (subAction.startsWith('/backend-proxy')) {
              // Authorization Hardening: preview:read token scope MUST NEVER authorize state-changing HTTP methods
              // or method override headers (X-HTTP-Method-Override, X-Method-Override, X-HTTP-Method, _method query)
              const rawMethod = (req.method || 'GET').toUpperCase()
              const overrideHeader = (
                req.headers?.['x-http-method-override'] ||
                req.headers?.['x-method-override'] ||
                req.headers?.['x-http-method']
              )?.toString().toUpperCase()
              const overrideQuery = (url.searchParams.get('_method') || url.searchParams.get('method'))?.toUpperCase()

              const effectiveMethod = overrideHeader || overrideQuery || rawMethod
              const isSafeReadMethod =
                ['GET', 'HEAD', 'OPTIONS'].includes(rawMethod) &&
                ['GET', 'HEAD', 'OPTIONS'].includes(effectiveMethod)

              if (authScope === 'preview:read' || authMechanism === 'preview_token') {
                if (!isSafeReadMethod || overrideHeader || overrideQuery) {
                  return sendJson(403, {
                    error: `Forbidden: preview:read token scope strictly authorizes read-only HTTP methods (GET, HEAD, OPTIONS). State-changing method "${effectiveMethod}" or method override headers are strictly prohibited. Full authenticated user session required.`,
                    code: 'FORBIDDEN_PREVIEW_TOKEN_READ_ONLY',
                    effectiveMethod,
                  })
                }
              }

              let targetPath = subAction.replace(/^\/backend-proxy/, '') || '/'
              if (url.search) {
                // Forward query parameters, but scrub previewToken and token
                const searchParams = new URLSearchParams(url.search)
                searchParams.delete('previewToken')
                searchParams.delete('token')
                searchParams.delete('_method')
                searchParams.delete('method')
                const forwardQuery = searchParams.toString()
                if (forwardQuery) {
                  targetPath += (targetPath.includes('?') ? '&' : '?') + forwardQuery
                }
              }

              // Path traversal / null-byte safety check
              let decodedTarget = targetPath
              try {
                decodedTarget = decodeURIComponent(targetPath)
              } catch {
                return sendJson(403, {
                  error: 'Access Denied: Malformed URL encoding in backend proxy.',
                  code: 'PATH_TRAVERSAL_BLOCKED',
                })
              }

              if (
                targetPath.includes('\0') ||
                targetPath.includes('%00') ||
                decodedTarget.includes('\0') ||
                targetPath.includes('..') ||
                decodedTarget.includes('..')
              ) {
                return sendJson(403, {
                  error: 'Access Denied: Path traversal detected in backend proxy.',
                  code: 'PATH_TRAVERSAL_BLOCKED',
                })
              }

              // Sensitive internal path protection:
              // Block attempts to read internal source code, databases, environment secrets, logs, credentials, or admin endpoints via the proxy
              const lowerPath = decodedTarget.toLowerCase()
              const isSensitiveInternalPath =
                lowerPath.startsWith('/.env') ||
                lowerPath.includes('/.env') ||
                lowerPath.startsWith('/data/') ||
                lowerPath.includes('app.db') ||
                lowerPath.includes('schema.json') ||
                lowerPath.startsWith('/server/db') ||
                lowerPath.startsWith('/migrations') ||
                lowerPath.includes('/.git') ||
                lowerPath.includes('node_modules') ||
                lowerPath.includes('secret') ||
                lowerPath.includes('credential') ||
                lowerPath.includes('password') ||
                lowerPath.includes('id_rsa') ||
                lowerPath.includes('id_ed25519') ||
                lowerPath.includes('.ssh') ||
                lowerPath.includes('.aws') ||
                lowerPath.startsWith('/logs') ||
                lowerPath.includes('/logs/') ||
                lowerPath.includes('container_logs') ||
                lowerPath.startsWith('/admin') ||
                lowerPath.startsWith('/metrics') ||
                lowerPath.startsWith('/proc') ||
                lowerPath.startsWith('/sys') ||
                lowerPath.includes('/etc/passwd') ||
                lowerPath.includes('/etc/shadow')

              if (isSensitiveInternalPath) {
                return sendJson(403, {
                  error: 'Access Denied: Backend proxy cannot access internal database files, server source code, environment secrets, logs, or administrative endpoints.',
                  code: 'FORBIDDEN_INTERNAL_PATH',
                })
              }

              await backendManager.proxyRequest(verifiedUserId, projectId, targetPath, req, res)
              return
            }

            // ----------------------------------------------------------------
            // SECTION 6: PREVIEW LIFECYCLE MANAGEMENT ENDPOINTS
            // ----------------------------------------------------------------

            // GET /api/agent-runtime/projects/:id/preview/status
            if (subAction === '/preview/status' && req.method === 'GET') {
              if (authScope !== 'owner:all') {
                return sendJson(403, {
                  error: 'Preview tokens cannot query preview management status. Owner authorization required.',
                  code: 'FORBIDDEN_PREVIEW_TOKEN_READ_ONLY',
                })
              }
              const status = previewManager.getPreviewStatus(verifiedUserId, projectId)
              return sendJson(200, {
                ...status,
                status,
              })
            }

            // POST /api/agent-runtime/projects/:id/preview/start
            if (subAction === '/preview/start' && req.method === 'POST') {
              if (authScope !== 'owner:all') {
                return sendJson(403, {
                  error: 'Preview tokens cannot start preview. Owner authorization required.',
                  code: 'FORBIDDEN_PREVIEW_TOKEN_READ_ONLY',
                })
              }
              const body = (parsedBody || await readJsonBody().catch(() => ({}))) || {}
              const status = await previewManager.startPreview(verifiedUserId, projectId, {
                forceRebuild: body.forceRebuild === true,
              })
              return sendJson(200, {
                ...status,
                status,
              })
            }

            // POST /api/agent-runtime/projects/:id/preview/stop
            if (subAction === '/preview/stop' && req.method === 'POST') {
              if (authScope !== 'owner:all') {
                return sendJson(403, {
                  error: 'Preview tokens cannot stop preview. Owner authorization required.',
                  code: 'FORBIDDEN_PREVIEW_TOKEN_READ_ONLY',
                })
              }
              const status = previewManager.stopPreview(verifiedUserId, projectId)
              return sendJson(200, {
                ...status,
                status,
              })
            }

            // POST /api/agent-runtime/projects/:id/preview/restart
            if (subAction === '/preview/restart' && req.method === 'POST') {
              if (authScope !== 'owner:all') {
                return sendJson(403, {
                  error: 'Preview tokens cannot restart preview. Owner authorization required.',
                  code: 'FORBIDDEN_PREVIEW_TOKEN_READ_ONLY',
                })
              }
              const status = await previewManager.restartPreview(verifiedUserId, projectId)
              return sendJson(200, {
                ...status,
                status,
              })
            }

            // GET /api/agent-runtime/projects/:id/preview/logs
            if (subAction === '/preview/logs' && req.method === 'GET') {
              if (authScope !== 'owner:all') {
                return sendJson(403, {
                  error: 'Preview tokens cannot view preview logs. Owner authorization required.',
                  code: 'FORBIDDEN_PREVIEW_TOKEN_READ_ONLY',
                })
              }
              const limitParam = url.searchParams.get('limit')
              const limit = limitParam ? parseInt(limitParam, 10) : 50
              const logs = previewManager.getLogs(verifiedUserId, projectId, limit)
              return sendJson(200, {
                projectId,
                logs,
              })
            }

            // ----------------------------------------------------------------
            // SECTION 7: TESTING & SECURITY ENDPOINTS
            // ----------------------------------------------------------------

            // POST /api/agent-runtime/projects/:id/tests/run
            if (subAction === '/tests/run' && req.method === 'POST') {
              if (authScope !== 'owner:all') {
                return sendJson(403, {
                  error: 'Preview tokens cannot execute test suites. Owner authorization required.',
                  code: 'FORBIDDEN_PREVIEW_TOKEN_READ_ONLY',
                })
              }

              try {
                const body = (parsedBody || await readJsonBody()) || {}
                const result = await testManager.runTests(verifiedUserId, projectId, {
                  timeoutMs: body.timeoutMs,
                  filter: body.filter,
                })
                return sendJson(200, result)
              } catch (testErr: any) {
                return sendJson(500, {
                  error: previewTokenManager.redactTokens(testErr.message || 'Test execution encountered an error.'),
                  code: 'TEST_EXECUTION_FAILED',
                })
              }
            }

            // POST /api/agent-runtime/projects/:id/tests/cancel
            if (subAction === '/tests/cancel' && req.method === 'POST') {
              if (authScope !== 'owner:all') {
                return sendJson(403, {
                  error: 'Preview tokens cannot cancel test suites. Owner authorization required.',
                  code: 'FORBIDDEN_PREVIEW_TOKEN_READ_ONLY',
                })
              }

              const cancelled = await testManager.cancelTests(verifiedUserId, projectId)
              return sendJson(200, {
                projectId,
                cancelled,
                success: true,
              })
            }

            // GET /api/agent-runtime/projects/:id/tests/history
            if (subAction === '/tests/history' && req.method === 'GET') {
              if (authScope !== 'owner:all') {
                return sendJson(403, {
                  error: 'Preview tokens cannot access test run history. Owner authorization required.',
                  code: 'FORBIDDEN_PREVIEW_TOKEN_READ_ONLY',
                })
              }

              const history = await testManager.getHistory(verifiedUserId, projectId)
              return sendJson(200, {
                projectId,
                history,
              })
            }

            // POST /api/agent-runtime/projects/:id/quality/check
            if (subAction === '/quality/check' && req.method === 'POST') {
              if (authScope !== 'owner:all') {
                return sendJson(403, {
                  error: 'Preview tokens cannot execute code quality checks. Owner authorization required.',
                  code: 'FORBIDDEN_PREVIEW_TOKEN_READ_ONLY',
                })
              }

              try {
                const qualityResult = await testManager.runQualityChecks(verifiedUserId, projectId)
                return sendJson(200, {
                  projectId,
                  ...qualityResult,
                })
              } catch (qErr: any) {
                return sendJson(500, {
                  error: previewTokenManager.redactTokens(qErr.message || 'Code quality audit failed.'),
                  code: 'QUALITY_CHECK_FAILED',
                })
              }
            }

            // POST /api/agent-runtime/projects/:id/security/scan
            if (subAction === '/security/scan' && req.method === 'POST') {
              if (authScope !== 'owner:all') {
                return sendJson(403, {
                  error: 'Preview tokens cannot execute security scans. Owner authorization required.',
                  code: 'FORBIDDEN_PREVIEW_TOKEN_READ_ONLY',
                })
              }

              try {
                const scanResult = await testManager.runSecurityScan(verifiedUserId, projectId)
                return sendJson(200, scanResult)
              } catch (sErr: any) {
                return sendJson(500, {
                  error: previewTokenManager.redactTokens(sErr.message || 'Security scan failed.'),
                  code: 'SECURITY_SCAN_FAILED',
                })
              }
            }

            // POST /api/agent-runtime/projects/:id/coverage/run
            if (subAction === '/coverage/run' && req.method === 'POST') {
              if (authScope !== 'owner:all') {
                return sendJson(403, {
                  error: 'Preview tokens cannot run coverage analysis. Owner authorization required.',
                  code: 'FORBIDDEN_PREVIEW_TOKEN_READ_ONLY',
                })
              }

              try {
                const coverage = await testManager.runCoverage(verifiedUserId, projectId)
                return sendJson(200, {
                  projectId,
                  coverage,
                })
              } catch (cErr: any) {
                return sendJson(500, {
                  error: previewTokenManager.redactTokens(cErr.message || 'Coverage analysis failed.'),
                  code: 'COVERAGE_FAILED',
                })
              }
            }

            // POST /api/agent-runtime/projects/:id/tests/propose-fix
            if (subAction === '/tests/propose-fix' && req.method === 'POST') {
              if (authScope !== 'owner:all') {
                return sendJson(403, {
                  error: 'Preview tokens cannot request test fixes. Owner authorization required.',
                  code: 'FORBIDDEN_PREVIEW_TOKEN_READ_ONLY',
                })
              }

              try {
                const body = (parsedBody || await readJsonBody()) || {}
                const proposal = await codingAgent.proposeTestOrSecurityFix({
                  userId: verifiedUserId,
                  projectId,
                  fixType: body.fixType || 'test_failure',
                  title: body.title || '',
                  description: body.description || '',
                  file: body.file,
                  line: body.line ? Number(body.line) : undefined,
                  errorStack: body.errorStack,
                  evidence: body.evidence,
                  findingId: body.findingId,
                  apiKeyOverride: body.apiKey,
                })
                return sendJson(200, {
                  projectId,
                  proposal,
                })
              } catch (pErr: any) {
                return sendJson(500, {
                  error: previewTokenManager.redactTokens(pErr.message || 'Failed to propose fix.'),
                  code: 'PROPOSE_FIX_FAILED',
                })
              }
            }

            // POST /api/agent-runtime/projects/:id/tests/apply-fix
            if (subAction === '/tests/apply-fix' && req.method === 'POST') {
              if (authScope !== 'owner:all') {
                return sendJson(403, {
                  error: 'Preview tokens cannot apply test fixes. Owner authorization required.',
                  code: 'FORBIDDEN_PREVIEW_TOKEN_READ_ONLY',
                })
              }

              try {
                const body = (parsedBody || await readJsonBody()) || {}
                if (!body.proposal || !body.proposal.targetFile || typeof body.proposal.newContent !== 'string') {
                  return sendJson(400, {
                    error: 'Valid proposal with targetFile and newContent is required.',
                    code: 'INVALID_PROPOSAL',
                  })
                }

                if (!body.proposal.approved) {
                  return sendJson(400, {
                    error: 'Fix proposal must be explicitly reviewed and approved by user before applying.',
                    code: 'FIX_NOT_APPROVED',
                  })
                }

                const applyResult = await codingAgent.applyApprovedTestFix(
                  verifiedUserId,
                  projectId,
                  body.proposal
                )

                let rerunResult: any = undefined
                if (body.rerunTests !== false) {
                  try {
                    rerunResult = await testManager.runTests(verifiedUserId, projectId)
                  } catch {}
                }

                return sendJson(200, {
                  projectId,
                  ...applyResult,
                  rerunResult,
                })
              } catch (aErr: any) {
                return sendJson(aErr.statusCode || 500, {
                  error: previewTokenManager.redactTokens(aErr.message || 'Failed to apply approved fix.'),
                  code: aErr.code || 'APPLY_FIX_FAILED',
                })
              }
            }

            // ================================================================
            // SECTION 8: GITHUB INTEGRATION ENDPOINTS
            // ================================================================

            // GET /api/agent-runtime/projects/:id/github/repos
            if (subAction === '/github/repos' && req.method === 'GET') {
              if (authScope !== 'owner:all') {
                return sendJson(403, {
                  error: 'Preview tokens cannot access GitHub repositories. Owner authorization required.',
                  code: 'FORBIDDEN_PREVIEW_TOKEN_READ_ONLY',
                })
              }
              try {
                const repos = await githubManager.listRepositories(verifiedUserId)
                return sendJson(200, { repos })
              } catch (err: any) {
                return sendJson(err.statusCode || 400, {
                  error: previewTokenManager.redactTokens(err.message || 'Failed to list repositories.'),
                  code: err.code || 'GITHUB_ERROR',
                })
              }
            }

            // POST /api/agent-runtime/projects/:id/github/repos
            if (subAction === '/github/repos' && req.method === 'POST') {
              if (authScope !== 'owner:all') {
                return sendJson(403, {
                  error: 'Preview tokens cannot create GitHub repositories. Owner authorization required.',
                  code: 'FORBIDDEN_PREVIEW_TOKEN_READ_ONLY',
                })
              }
              try {
                const body = (parsedBody || (await readJsonBody())) || {}
                const repo = await githubManager.createRepository(verifiedUserId, {
                  name: body.name,
                  description: body.description,
                  private: body.private,
                  confirmCreate: Boolean(body.confirmCreate),
                })
                return sendJson(201, { repo })
              } catch (err: any) {
                return sendJson(err.statusCode || 400, {
                  error: previewTokenManager.redactTokens(err.message || 'Failed to create repository.'),
                  code: err.code || 'GITHUB_ERROR',
                })
              }
            }

            // GET /api/agent-runtime/projects/:id/github/branches
            if (subAction === '/github/branches' && req.method === 'GET') {
              if (authScope !== 'owner:all') {
                return sendJson(403, {
                  error: 'Preview tokens cannot access GitHub branches. Owner authorization required.',
                  code: 'FORBIDDEN_PREVIEW_TOKEN_READ_ONLY',
                })
              }
              try {
                const owner = url.searchParams.get('owner') || ''
                const repo = url.searchParams.get('repo') || ''
                const branches = await githubManager.listBranches(verifiedUserId, owner, repo)
                return sendJson(200, { branches })
              } catch (err: any) {
                return sendJson(err.statusCode || 400, {
                  error: previewTokenManager.redactTokens(err.message || 'Failed to list branches.'),
                  code: err.code || 'GITHUB_ERROR',
                })
              }
            }

            // GET /api/agent-runtime/projects/:id/github/commits
            if (subAction === '/github/commits' && req.method === 'GET') {
              if (authScope !== 'owner:all') {
                return sendJson(403, {
                  error: 'Preview tokens cannot view commit history. Owner authorization required.',
                  code: 'FORBIDDEN_PREVIEW_TOKEN_READ_ONLY',
                })
              }
              try {
                const owner = url.searchParams.get('owner') || ''
                const repo = url.searchParams.get('repo') || ''
                const branch = url.searchParams.get('branch') || 'main'
                const commits = await githubManager.getCommitHistory(verifiedUserId, owner, repo, branch)
                return sendJson(200, { commits })
              } catch (err: any) {
                return sendJson(err.statusCode || 400, {
                  error: previewTokenManager.redactTokens(err.message || 'Failed to view commits.'),
                  code: err.code || 'GITHUB_ERROR',
                })
              }
            }

            // GET /api/agent-runtime/projects/:id/github/diff
            if (subAction === '/github/diff' && req.method === 'GET') {
              if (authScope !== 'owner:all') {
                return sendJson(403, {
                  error: 'Preview tokens cannot view GitHub diff. Owner authorization required.',
                  code: 'FORBIDDEN_PREVIEW_TOKEN_READ_ONLY',
                })
              }
              try {
                const owner = url.searchParams.get('owner') || ''
                const repo = url.searchParams.get('repo') || ''
                const branch = url.searchParams.get('branch') || 'main'
                const diff = await githubManager.getWorkingDiff(verifiedUserId, projectId, owner, repo, branch)
                return sendJson(200, diff)
              } catch (err: any) {
                return sendJson(err.statusCode || 400, {
                  error: previewTokenManager.redactTokens(err.message || 'Failed to compute diff.'),
                  code: err.code || 'GITHUB_ERROR',
                })
              }
            }

            // POST /api/agent-runtime/projects/:id/github/push
            if (subAction === '/github/push' && req.method === 'POST') {
              if (authScope !== 'owner:all') {
                return sendJson(403, {
                  error: 'Preview tokens cannot push to GitHub. Owner authorization required.',
                  code: 'FORBIDDEN_PREVIEW_TOKEN_READ_ONLY',
                })
              }
              try {
                const body = (parsedBody || (await readJsonBody())) || {}
                const pushResult = await githubManager.pushChanges(verifiedUserId, projectId, {
                  owner: body.owner,
                  repo: body.repo,
                  branch: body.branch,
                  commitMessage: body.commitMessage,
                  confirmPush: Boolean(body.confirmPush),
                  expectedBaseSha: body.expectedBaseSha,
                  resolutionStrategy: body.resolutionStrategy,
                  resolvedFiles: body.resolvedFiles,
                })
                return sendJson(200, pushResult)
              } catch (err: any) {
                return sendJson(err.statusCode || 400, {
                  error: previewTokenManager.redactTokens(err.message || 'Failed to push changes.'),
                  code: err.code || 'GITHUB_ERROR',
                  details: err.details,
                })
              }
            }

            // ================================================================
            // SECTION 8: PROJECT EXPORT ENDPOINTS
            // ================================================================

            // GET /api/agent-runtime/projects/:id/export/inspect
            if (subAction === '/export/inspect' && req.method === 'GET') {
              if (authScope !== 'owner:all') {
                return sendJson(403, {
                  error: 'Preview tokens cannot inspect export manifests. Owner authorization required.',
                  code: 'FORBIDDEN_PREVIEW_TOKEN_READ_ONLY',
                })
              }
              try {
                const manifest = await exportManager.inspectExport(projectId, verifiedUserId)
                return sendJson(200, manifest)
              } catch (err: any) {
                return sendJson(err.statusCode || 400, {
                  error: previewTokenManager.redactTokens(err.message || 'Failed to inspect export.'),
                  code: err.code || 'EXPORT_ERROR',
                })
              }
            }

            // GET /api/agent-runtime/projects/:id/export/download
            if (subAction === '/export/download' && req.method === 'GET') {
              if (authScope !== 'owner:all') {
                return sendJson(403, {
                  error: 'Preview tokens cannot download project export archives. Owner authorization required.',
                  code: 'FORBIDDEN_PREVIEW_TOKEN_READ_ONLY',
                })
              }
              try {
                const { buffer, filename, manifest } = await exportManager.generateExportZip(projectId, verifiedUserId, {
                  projectName: project.name,
                })
                res.statusCode = 200
                res.setHeader('Content-Type', 'application/zip')
                res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
                res.setHeader('Content-Length', buffer.length)
                res.setHeader('X-Export-Included-Files', String(manifest.includedFiles.length))
                res.setHeader('X-Export-Excluded-Files', String(manifest.excludedFiles.length))
                return res.end(buffer)
              } catch (err: any) {
                return sendJson(err.statusCode || 400, {
                  error: previewTokenManager.redactTokens(err.message || 'Failed to download export.'),
                  code: err.code || 'EXPORT_ERROR',
                })
              }
            }

            // POST /api/agent-runtime/projects/:id/export/validate
            if (subAction === '/export/validate' && req.method === 'POST') {
              if (authScope !== 'owner:all') {
                return sendJson(403, {
                  error: 'Preview tokens cannot validate export archives. Owner authorization required.',
                  code: 'FORBIDDEN_PREVIEW_TOKEN_READ_ONLY',
                })
              }
              try {
                const { buffer } = await exportManager.generateExportZip(projectId, verifiedUserId, {
                  projectName: project.name,
                })
                const validation = await exportManager.validateExportArchive(buffer)
                return sendJson(200, validation)
              } catch (err: any) {
                return sendJson(err.statusCode || 400, {
                  error: previewTokenManager.redactTokens(err.message || 'Archive validation failed.'),
                  code: err.code || 'EXPORT_ERROR',
                })
              }
            }

            // ================================================================
            // SECTION 8: DEPLOYMENT ENDPOINTS
            // ================================================================

            // GET /api/agent-runtime/projects/:id/deploy/config
            if (subAction === '/deploy/config' && req.method === 'GET') {
              if (authScope !== 'owner:all') {
                return sendJson(403, {
                  error: 'Preview tokens cannot view deployment configuration. Owner authorization required.',
                  code: 'FORBIDDEN_PREVIEW_TOKEN_READ_ONLY',
                })
              }
              try {
                const config = deploymentManager.detectDeploymentConfig(projectId, verifiedUserId)
                const providers = deploymentManager.getConfiguredProviders(verifiedUserId)
                return sendJson(200, { config, providers })
              } catch (err: any) {
                return sendJson(err.statusCode || 400, {
                  error: previewTokenManager.redactTokens(err.message || 'Failed to detect deployment config.'),
                  code: err.code || 'DEPLOY_ERROR',
                })
              }
            }

            // POST /api/agent-runtime/projects/:id/deploy/credentials
            if (subAction === '/deploy/credentials' && req.method === 'POST') {
              if (authScope !== 'owner:all') {
                return sendJson(403, {
                  error: 'Preview tokens cannot configure deployment credentials. Owner authorization required.',
                  code: 'FORBIDDEN_PREVIEW_TOKEN_READ_ONLY',
                })
              }
              try {
                const body = (parsedBody || (await readJsonBody())) || {}
                deploymentManager.setProviderCredentials(verifiedUserId, body)
                return sendJson(200, { success: true })
              } catch (err: any) {
                return sendJson(err.statusCode || 400, {
                  error: previewTokenManager.redactTokens(err.message || 'Failed to set provider credentials.'),
                  code: err.code || 'DEPLOY_ERROR',
                })
              }
            }

            // POST /api/agent-runtime/projects/:id/deploy/plan
            if (subAction === '/deploy/plan' && req.method === 'POST') {
              if (authScope !== 'owner:all') {
                return sendJson(403, {
                  error: 'Preview tokens cannot generate deployment plans. Owner authorization required.',
                  code: 'FORBIDDEN_PREVIEW_TOKEN_READ_ONLY',
                })
              }
              try {
                const body = (parsedBody || (await readJsonBody())) || {}
                const plan = await deploymentManager.generateDeploymentPlan(
                  projectId,
                  verifiedUserId,
                  body.provider || 'vercel'
                )
                return sendJson(200, plan)
              } catch (err: any) {
                return sendJson(err.statusCode || 400, {
                  error: previewTokenManager.redactTokens(err.message || 'Failed to generate deployment plan.'),
                  code: err.code || 'DEPLOY_ERROR',
                })
              }
            }

            // POST /api/agent-runtime/projects/:id/deploy/execute
            if (subAction === '/deploy/execute' && req.method === 'POST') {
              if (authScope !== 'owner:all') {
                return sendJson(403, {
                  error: 'Preview tokens cannot execute deployments. Owner authorization required.',
                  code: 'FORBIDDEN_PREVIEW_TOKEN_READ_ONLY',
                })
              }
              try {
                const body = (parsedBody || (await readJsonBody())) || {}
                const record = await deploymentManager.executeDeployment(projectId, verifiedUserId, {
                  provider: body.provider || 'vercel',
                  confirmDeploy: Boolean(body.confirmDeploy),
                  approved: Boolean(body.approved),
                  envVars: body.envVars,
                  overrideCriticalSecurity: Boolean(body.overrideCriticalSecurity),
                })
                return sendJson(200, record)
              } catch (err: any) {
                return sendJson(err.statusCode || 400, {
                  error: previewTokenManager.redactTokens(err.message || 'Deployment execution failed.'),
                  code: err.code || 'DEPLOY_ERROR',
                  details: err.details,
                })
              }
            }

            // GET /api/agent-runtime/projects/:id/deploy/history
            if (subAction === '/deploy/history' && req.method === 'GET') {
              if (authScope !== 'owner:all') {
                return sendJson(403, {
                  error: 'Preview tokens cannot view deployment history. Owner authorization required.',
                  code: 'FORBIDDEN_PREVIEW_TOKEN_READ_ONLY',
                })
              }
              try {
                const history = deploymentManager.listDeployments(projectId, verifiedUserId)
                return sendJson(200, { deployments: history })
              } catch (err: any) {
                return sendJson(err.statusCode || 400, {
                  error: previewTokenManager.redactTokens(err.message || 'Failed to list deployments.'),
                  code: err.code || 'DEPLOY_ERROR',
                })
              }
            }

            // POST /api/agent-runtime/projects/:id/deploy/cancel
            if (subAction === '/deploy/cancel' && req.method === 'POST') {
              if (authScope !== 'owner:all') {
                return sendJson(403, {
                  error: 'Preview tokens cannot cancel deployments. Owner authorization required.',
                  code: 'FORBIDDEN_PREVIEW_TOKEN_READ_ONLY',
                })
              }
              try {
                const body = (parsedBody || (await readJsonBody())) || {}
                const record = deploymentManager.cancelDeployment(body.deploymentId, projectId, verifiedUserId)
                return sendJson(200, record)
              } catch (err: any) {
                return sendJson(err.statusCode || 400, {
                  error: previewTokenManager.redactTokens(err.message || 'Failed to cancel deployment.'),
                  code: err.code || 'DEPLOY_ERROR',
                })
              }
            }

            // POST /api/agent-runtime/projects/:id/deploy/rollback
            if (subAction === '/deploy/rollback' && req.method === 'POST') {
              if (authScope !== 'owner:all') {
                return sendJson(403, {
                  error: 'Preview tokens cannot rollback deployments. Owner authorization required.',
                  code: 'FORBIDDEN_PREVIEW_TOKEN_READ_ONLY',
                })
              }
              try {
                const body = (parsedBody || (await readJsonBody())) || {}
                const record = await deploymentManager.rollbackDeployment(
                  projectId,
                  verifiedUserId,
                  body.targetDeploymentId
                )
                return sendJson(200, record)
              } catch (err: any) {
                return sendJson(err.statusCode || 400, {
                  error: previewTokenManager.redactTokens(err.message || 'Failed to rollback deployment.'),
                  code: err.code || 'DEPLOY_ERROR',
                })
              }
            }

            // POST /api/agent-runtime/projects/:id/preview/log
            // Sandboxed iframe runtime error and console log ingestion endpoint
            if (subAction === '/preview/log' && req.method === 'POST') {
              try {
                const body = (parsedBody || await readJsonBody()) || {}
                const logItem = previewManager.recordLog(verifiedUserId, projectId, {
                  level: body.level || 'info',
                  message: body.message || '',
                  source: body.source || 'browser',
                  filename: body.filename,
                  lineno: body.lineno,
                  colno: body.colno,
                  details: body.details,
                  timestamp: body.timestamp,
                })
                return sendJson(200, { success: true, log: logItem })
              } catch (err: any) {
                return sendJson(400, { error: 'Invalid log payload.', code: 'INVALID_LOG_PAYLOAD' })
              }
            }

            // ----------------------------------------------------------------
            // GET /api/agent-runtime/projects/:id/preview[/subPath]
            // Serve isolated live preview from authorized workspace
            // ----------------------------------------------------------------
            if (subAction.startsWith('/preview') && req.method === 'GET') {
              let subPath = subAction.replace(/^\/preview/, '').replace(/^\/+/, '')
              if (!subPath) subPath = 'index.html'

              const decodedSubPath = decodeURIComponent(subPath)

              // Security: validate path against traversal, null bytes, alternate data streams, or hidden metadata
              const segments = decodedSubPath.split(/[/\\]/)
              const hasSensitiveSegment = segments.some((p) =>
                p.startsWith('.') ||
                SENSITIVE_PREVIEW_PATTERNS.some((pat) => pat.test(p))
              )

              if (
                hasSensitiveSegment ||
                decodedSubPath.includes('\0') ||
                decodedSubPath.includes(':') ||
                decodedSubPath.includes('..') ||
                decodedSubPath.startsWith('/') ||
                decodedSubPath.startsWith('\\') ||
                SENSITIVE_PREVIEW_PATTERNS.some((pat) => pat.test(decodedSubPath))
              ) {
                res.statusCode = 403
                res.setHeader('Content-Type', 'text/plain; charset=utf-8')
                res.end('Access Denied: Path traversal, internal metadata, and sensitive environment files are restricted.')
                return
              }

              // Check preview status from previewManager
              const pvwStatus = previewManager.getPreviewStatus(verifiedUserId, projectId)
              if (pvwStatus.state === 'stopped') {
                if (req.headers.accept?.includes('application/json')) {
                  return sendJson(503, {
                    error: 'Preview is currently stopped. Call /preview/start to resume.',
                    code: 'PREVIEW_STOPPED',
                    status: pvwStatus,
                  })
                }
                res.statusCode = 200
                res.setHeader('Content-Type', 'text/html; charset=utf-8')
                res.setHeader('X-Content-Type-Options', 'nosniff')
                res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
                res.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Preview Stopped</title>
  <style>
    body { margin: 0; background: #0c0c10; color: #a1a1aa; font-family: ui-monospace, monospace; padding: 2.5rem; display: flex; align-items: center; justify-content: center; min-height: 80vh; }
    .card { background: #14141d; border: 1px solid #3f3f46; border-radius: 12px; padding: 2rem; max-width: 600px; width: 100%; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
    h2 { color: #f4f4f5; margin-top: 0; font-size: 1.25rem; }
    p { color: #71717a; font-size: 0.9rem; line-height: 1.5; }
    .tag { display: inline-block; background: #27272a; color: #e4e4e7; font-size: 0.75rem; padding: 0.25rem 0.6rem; border-radius: 9999px; font-weight: 600; text-transform: uppercase; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <div class="card">
    <div class="tag">Stopped</div>
    <h2>Live Preview Stopped</h2>
    <p>The live preview for this project is currently stopped. Click "Start Preview" in the toolbar to resume serving application output.</p>
  </div>
</body>
</html>`)
                return
              }

              // Check if project status is currently failed before serving stale success
              let statusFile: any = null
              try {
                const statusPath = path.join('storage', 'orchestrator', 'projects', `${projectId}.status.json`)
                if (fs.existsSync(statusPath)) {
                  statusFile = JSON.parse(fs.readFileSync(statusPath, 'utf-8'))
                }
              } catch {}

              const isExecuting = statusFile?.executionState === 'executing' || statusFile?.executionState === 'queued'
              const isFailed = statusFile?.executionState === 'failed' || pvwStatus.state === 'failed'

              if (isFailed) {
                res.statusCode = 200
                res.setHeader('Content-Type', 'text/html; charset=utf-8')
                res.setHeader('X-Content-Type-Options', 'nosniff')
                res.setHeader('X-DNS-Prefetch-Control', 'off')
                res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
                const errorDetail = statusFile?.error || 'A task failed during compilation or verification.'
                res.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Compilation Error</title>
  <style>
    body { margin: 0; background: #0c0c10; color: #f43f5e; font-family: ui-monospace, monospace; padding: 2.5rem; display: flex; align-items: center; justify-content: center; min-height: 80vh; }
    .card { background: #14141d; border: 1px solid #e11d48; border-radius: 12px; padding: 2rem; max-width: 680px; width: 100%; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
    h2 { margin-top: 0; color: #fb7185; font-size: 1.25rem; display: flex; align-items: center; gap: 8px; }
    p { color: #94a3b8; font-size: 0.9rem; line-height: 1.5; }
    pre { background: #08080c; border: 1px solid #27273a; border-radius: 8px; padding: 1rem; color: #fca5a5; font-size: 0.85rem; overflow-x: auto; white-space: pre-wrap; word-break: break-all; }
  </style>
</head>
<body>
  <div class="card">
    <h2>Compilation Error</h2>
    <p>The build sandbox encountered a compilation or verification failure:</p>
    <pre>${escapeHtml(errorDetail)}</pre>
  </div>
</body>
</html>`)
                return
              }

              // Determine target file to serve
              let targetPath = ''
              const distDir = path.resolve(workspaceRoot, 'dist')
              if (fs.existsSync(distDir)) {
                try {
                  const candidate = workspaceManager.resolveAndValidatePath(distDir, decodedSubPath)
                  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
                    targetPath = candidate
                  }
                } catch {}
              }

              if (!targetPath) {
                try {
                  const candidate = workspaceManager.resolveAndValidatePath(workspaceRoot, decodedSubPath)
                  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
                    targetPath = candidate
                  }
                } catch {}
              }

              if (!targetPath) {
                const publicDir = path.resolve(workspaceRoot, 'public')
                if (fs.existsSync(publicDir)) {
                  try {
                    const candidate = workspaceManager.resolveAndValidatePath(publicDir, decodedSubPath)
                    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
                      targetPath = candidate
                    }
                  } catch {}
                }
              }

              // Realpath verification: ensure no symlink escapes workspace root
              if (targetPath && fs.existsSync(targetPath)) {
                try {
                  const realTarget = fs.realpathSync(targetPath)
                  const realWsRoot = fs.realpathSync(workspaceRoot)
                  if (
                    !realTarget.startsWith(realWsRoot) ||
                    (realTarget !== realWsRoot && !realTarget.startsWith(realWsRoot + path.sep))
                  ) {
                    res.statusCode = 403
                    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
                    res.end('Access Denied: Symlink escapes workspace root.')
                    return
                  }
                } catch {
                  res.statusCode = 403
                  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
                  res.end('Access Denied: Cannot verify file realpath.')
                  return
                }

                const ext = path.extname(targetPath).toLowerCase()
                const mimeMap: Record<string, string> = {
                  '.html': 'text/html; charset=utf-8',
                  '.css': 'text/css; charset=utf-8',
                  '.js': 'application/javascript; charset=utf-8',
                  '.mjs': 'application/javascript; charset=utf-8',
                  '.json': 'application/json; charset=utf-8',
                  '.svg': 'image/svg+xml',
                  '.png': 'image/png',
                  '.jpg': 'image/jpeg',
                  '.jpeg': 'image/jpeg',
                  '.webp': 'image/webp',
                  '.ico': 'image/x-icon',
                  '.woff': 'font/woff',
                  '.woff2': 'font/woff2',
                  '.ttf': 'font/ttf',
                }

                const contentType = mimeMap[ext] || 'application/octet-stream'

                // Configurable CSP whitelist from project config (if configured)
                const allowedConnect = ((project as any)?.previewPolicy?.allowedConnectDomains || [])
                  .filter((d: string) => /^[a-zA-Z0-9.-]+(:\d+)?$/.test(d))
                  .join(' ')
                const allowedImages = ((project as any)?.previewPolicy?.allowedImageDomains || [])
                  .filter((d: string) => /^[a-zA-Z0-9.-]+(:\d+)?$/.test(d))
                  .join(' ')

                const effectiveCsp = [
                  "default-src 'self'",
                  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://cdn.tailwindcss.com https://unpkg.com https://cdn.jsdelivr.net",
                  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net https://unpkg.com",
                  "font-src 'self' data: https://fonts.gstatic.com",
                  `img-src 'self' data: blob: https: ${allowedImages}`.trim(),
                  `connect-src 'self' data: blob: https: ${allowedConnect}`.trim(),
                  "media-src 'self' data: blob:",
                  "object-src 'none'",
                  "base-uri 'none'",
                  "form-action 'self'",
                  "frame-ancestors 'self'",
                ].join('; ')

                // Isolated Origin Security Headers
                res.statusCode = 200
                res.setHeader('Content-Type', contentType)
                res.setHeader('X-Content-Type-Options', 'nosniff')
                res.setHeader('X-DNS-Prefetch-Control', 'off')
                res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
                res.setHeader('Referrer-Policy', 'no-referrer')
                res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
                res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()')
                res.setHeader('Content-Security-Policy', effectiveCsp)

                let fileContent = fs.readFileSync(targetPath)

                // Inject runtime error reporter script into HTML
                if (ext === '.html') {
                  const errorReporter = `
<script id="anotherme-preview-runtime-reporter">
(function() {
  window.__ANOTHER_ME_ERROR_REPORTER_INJECTED__ = true;
  function sendLog(level, message, details) {
    try {
      var logUrl = '/api/agent-runtime/projects/' + encodeURIComponent('${projectId}') + '/preview/log';
      var payload = JSON.stringify({ level: level, message: message, details: details, source: 'browser', timestamp: new Date().toISOString() });
      if (window.fetch) {
        window.fetch(logUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload }).catch(function() {});
      }
    } catch (_) {}
  }

  // 1. Runtime errors & resource errors
  window.addEventListener('error', function(e) {
    try {
      if (e.target && (e.target.tagName === 'SCRIPT' || e.target.tagName === 'LINK' || e.target.tagName === 'IMG')) {
        var src = e.target.src || e.target.href || '';
        var msg = 'Failed to load resource: <' + e.target.tagName.toLowerCase() + '> ' + src;
        window.parent.postMessage({
          type: 'PREVIEW_NETWORK_ERROR',
          url: src,
          method: 'GET',
          status: 404,
          statusText: 'ResourceLoadError',
          message: msg,
          timestamp: new Date().toISOString()
        }, '*');
        sendLog('error', msg, { url: src, type: 'resource' });
        return;
      }

      var msg = e.message || 'Unknown runtime error';
      window.parent.postMessage({
        type: 'PREVIEW_RUNTIME_ERROR',
        message: msg,
        filename: e.filename || '',
        lineno: e.lineno || 0,
        colno: e.colno || 0,
        stack: e.error ? String(e.error.stack || e.error) : undefined,
        timestamp: new Date().toISOString()
      }, '*');
      sendLog('error', msg, { filename: e.filename, lineno: e.lineno, colno: e.colno });
    } catch (_) {}
  }, true);

  // 2. Unhandled promise rejections
  window.addEventListener('unhandledrejection', function(e) {
    try {
      var msg = e.reason?.message || String(e.reason || 'Unhandled Promise Rejection');
      window.parent.postMessage({
        type: 'PREVIEW_RUNTIME_ERROR',
        message: msg,
        stack: e.reason?.stack ? String(e.reason.stack) : undefined,
        timestamp: new Date().toISOString()
      }, '*');
      sendLog('error', 'Unhandled Rejection: ' + msg);
    } catch (_) {}
  });

  // 3. Failed fetch requests
  var origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function(input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) ? input.url : '';
      var method = (init && init.method) ? String(init.method).toUpperCase() : 'GET';
      return origFetch.apply(this, arguments).then(function(res) {
        if (!res.ok && !url.includes('/preview/log')) {
          var msg = 'HTTP ' + res.status + ' (' + (res.statusText || 'Error') + ') on ' + method + ' ' + url;
          try {
            window.parent.postMessage({
              type: 'PREVIEW_NETWORK_ERROR',
              url: url,
              method: method,
              status: res.status,
              statusText: res.statusText || 'HTTP ' + res.status,
              message: msg,
              timestamp: new Date().toISOString()
            }, '*');
            sendLog('error', msg, { url: url, status: res.status, method: method });
          } catch (_) {}
        }
        return res;
      }).catch(function(err) {
        if (!url.includes('/preview/log')) {
          var msg = 'Network request failed: ' + (err.message || String(err)) + ' (' + method + ' ' + url + ')';
          try {
            window.parent.postMessage({
              type: 'PREVIEW_NETWORK_ERROR',
              url: url,
              method: method,
              status: 0,
              statusText: 'NetworkError',
              message: msg,
              timestamp: new Date().toISOString()
            }, '*');
            sendLog('error', msg, { url: url, method: method });
          } catch (_) {}
        }
        throw err;
      });
    };
  }

  // 4. Failed XHR requests
  var origXhrOpen = XMLHttpRequest.prototype.open;
  var origXhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url) {
    this._pvwMethod = method;
    this._pvwUrl = url;
    return origXhrOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function() {
    var xhr = this;
    xhr.addEventListener('error', function() {
      if (xhr._pvwUrl && !String(xhr._pvwUrl).includes('/preview/log')) {
        var msg = 'XHR failed on ' + (xhr._pvwMethod || 'GET') + ' ' + (xhr._pvwUrl || '');
        try {
          window.parent.postMessage({
            type: 'PREVIEW_NETWORK_ERROR',
            url: xhr._pvwUrl || '',
            method: xhr._pvwMethod || 'GET',
            status: xhr.status || 0,
            statusText: 'NetworkError',
            message: msg,
            timestamp: new Date().toISOString()
          }, '*');
          sendLog('error', msg);
        } catch (_) {}
      }
    });
    xhr.addEventListener('load', function() {
      if (xhr.status >= 400 && xhr._pvwUrl && !String(xhr._pvwUrl).includes('/preview/log')) {
        var msg = 'XHR returned HTTP ' + xhr.status + ' on ' + (xhr._pvwMethod || 'GET') + ' ' + (xhr._pvwUrl || '');
        try {
          window.parent.postMessage({
            type: 'PREVIEW_NETWORK_ERROR',
            url: xhr._pvwUrl || '',
            method: xhr._pvwMethod || 'GET',
            status: xhr.status,
            statusText: xhr.statusText,
            message: msg,
            timestamp: new Date().toISOString()
          }, '*');
          sendLog('error', msg, { status: xhr.status });
        } catch (_) {}
      }
    });
    return origXhrSend.apply(this, arguments);
  };

  // 5. Console errors & warnings capture
  var origConsoleError = console.error;
  console.error = function() {
    try {
      var msg = Array.prototype.slice.call(arguments).map(function(a) {
        return typeof a === 'object' ? JSON.stringify(a) : String(a);
      }).join(' ');
      window.parent.postMessage({
        type: 'PREVIEW_CONSOLE_LOG',
        level: 'error',
        message: msg,
        timestamp: new Date().toISOString()
      }, '*');
      if (!msg.includes('/preview/log')) {
        sendLog('error', msg);
      }
    } catch (_) {}
    return origConsoleError.apply(this, arguments);
  };

  var origConsoleWarn = console.warn;
  console.warn = function() {
    try {
      var msg = Array.prototype.slice.call(arguments).map(function(a) {
        return typeof a === 'object' ? JSON.stringify(a) : String(a);
      }).join(' ');
      window.parent.postMessage({
        type: 'PREVIEW_CONSOLE_LOG',
        level: 'warn',
        message: msg,
        timestamp: new Date().toISOString()
      }, '*');
    } catch (_) {}
    return origConsoleWarn.apply(this, arguments);
  };

  // 6. Preview Loaded event
  window.addEventListener('DOMContentLoaded', function() {
    try {
      window.parent.postMessage({ type: 'PREVIEW_LOADED', url: window.location.href }, '*');
    } catch (_) {}
  });
})();
</script>`
                  const htmlStr = fileContent.toString('utf-8')
                  if (htmlStr.includes('</head>')) {
                    fileContent = Buffer.from(htmlStr.replace('</head>', `${errorReporter}\n</head>`), 'utf-8')
                  } else {
                    fileContent = Buffer.from(`${errorReporter}\n${htmlStr}`, 'utf-8')
                  }
                }

                res.end(fileContent)
                return
              }

              // If file does not exist, check if currently executing or return 404
              res.setHeader('Content-Type', 'text/html; charset=utf-8')
              res.setHeader('X-Content-Type-Options', 'nosniff')
              res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')

              if (isExecuting) {
                res.statusCode = 200
                res.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Building Website...</title>
  <style>
    body { margin: 0; background: #0c0c10; color: #a1a1aa; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 90vh; }
    .spinner { width: 36px; height: 36px; border: 3px solid rgba(218, 119, 86, 0.2); border-top-color: #da7756; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 1rem; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .text { font-size: 0.95rem; letter-spacing: 0.02em; }
  </style>
</head>
<body>
  <div style="text-align: center;">
    <div class="spinner"></div>
    <div class="text">Building application in isolated Docker sandbox...</div>
  </div>
</body>
</html>`)
                return
              }

              // Neither exists -> 404
              res.statusCode = 404
              res.setHeader('Content-Type', 'text/plain; charset=utf-8')
              res.end('Preview not available. Build project first or check files.')
              return
            }
          }

          // Unmatched agent-runtime route
          return sendJson(404, { error: `Endpoint ${pathname} not found in agent runtime.`, code: 'NOT_FOUND' })
        } catch (err: any) {
          return sendJson(500, {
            error: `Agent Runtime internal error: ${previewTokenManager.redactTokens(err.message || '')}`,
            code: 'INTERNAL_ERROR',
          })
        }
      })
    },
  }
}
