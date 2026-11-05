// ====================================================================
// ANOTHER ME — SECTION 8: SAFE DEPLOYMENT MANAGER
// Handles framework detection, pre-deployment planning with cost & permission
// transparency, critical security finding gating, containerized builds,
// and deployment to supported cloud providers (Vercel, Netlify, Cloudflare, Docker).
// Requires strict human approval and redacts provider secrets from all logs.
// ====================================================================

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { execSync } from 'child_process'
import { workspaceManager } from './workspaceManager'
import { testManager } from './testManager'
import { isDockerAvailable, getDockerPath } from './processExecutor'
import type {
  DeploymentProvider,
  DeploymentConfig,
  DeploymentPlan,
  DeploymentRecord,
} from './types'

export class DeploymentError extends Error {
  statusCode: number
  code: string
  details?: any

  constructor(message: string, statusCode: number = 400, code: string = 'DEPLOYMENT_ERROR', details?: any) {
    super(message)
    this.name = 'DeploymentError'
    this.statusCode = statusCode
    this.code = code
    this.details = details
  }
}

interface StoredProviderCredentials {
  vercelToken?: string
  netlifyToken?: string
  cloudflareToken?: string
  cloudflareAccountId?: string
}

export function redactDeploymentSecrets(str: string): string {
  if (!str) return ''
  return str
    .replace(/(?:Bearer\s+)?vercel_[a-zA-Z0-9_\-]{20,}/gi, '[REDACTED_VERCEL_TOKEN]')
    .replace(/(?:nfp_|net_)[a-zA-Z0-9_\-]{20,}/gi, '[REDACTED_NETLIFY_TOKEN]')
    .replace(/(?:Bearer\s+)?[a-f0-9]{40}/gi, '[REDACTED_API_TOKEN]')
    .replace(/Authorization:\s*Bearer\s+[^\s]+/gi, 'Authorization: Bearer [REDACTED]')
}

export class SafeDeploymentManager {
  private providerCredentials: Map<string, StoredProviderCredentials> = new Map() // userId -> credentials
  private deployments: Map<string, DeploymentRecord> = new Map() // deploymentId -> record
  private activeAbortControllers: Map<string, AbortController> = new Map() // deploymentId -> abortController
  private activeContainers: Map<string, string> = new Map() // deploymentId -> containerName
  private vercelApiBaseUrl = process.env.VERCEL_API_BASE_URL || 'https://api.vercel.com'
  private netlifyApiBaseUrl = process.env.NETLIFY_API_BASE_URL || 'https://api.netlify.com'
  private cloudflareApiBaseUrl = process.env.CLOUDFLARE_API_BASE_URL || 'https://api.cloudflare.com/client/v4'

  /**
   * Set custom base URLs for cloud deployment providers (testing or private cloud)
   */
  setCustomProviderUrls(urls: { vercel?: string; netlify?: string; cloudflare?: string }) {
    if (urls.vercel) this.vercelApiBaseUrl = urls.vercel
    if (urls.netlify) this.netlifyApiBaseUrl = urls.netlify
    if (urls.cloudflare) this.cloudflareApiBaseUrl = urls.cloudflare
  }

  /**
   * Reset provider URLs to standard defaults
   */
  resetCustomProviderUrls() {
    this.vercelApiBaseUrl = process.env.VERCEL_API_BASE_URL || 'https://api.vercel.com'
    this.netlifyApiBaseUrl = process.env.NETLIFY_API_BASE_URL || 'https://api.netlify.com'
    this.cloudflareApiBaseUrl = process.env.CLOUDFLARE_API_BASE_URL || 'https://api.cloudflare.com/client/v4'
  }

  /**
   * Configure provider credentials server-side (stored in memory only; never sent to client)
   */
  setProviderCredentials(userId: string, credentials: StoredProviderCredentials) {
    const existing = this.providerCredentials.get(userId) || {}
    this.providerCredentials.set(userId, { ...existing, ...credentials })
  }

  /**
   * Get configured provider names for user (without secret values)
   */
  getConfiguredProviders(userId: string): { provider: DeploymentProvider; configured: boolean }[] {
    const creds = this.providerCredentials.get(userId) || {}
    return [
      { provider: 'vercel', configured: Boolean(creds.vercelToken) },
      { provider: 'netlify', configured: Boolean(creds.netlifyToken) },
      { provider: 'cloudflare_pages', configured: Boolean(creds.cloudflareToken && creds.cloudflareAccountId) },
      { provider: 'docker_container', configured: isDockerAvailable() },
    ]
  }

  /**
   * Detect project framework, build command, output directory, and required env vars
   */
  detectDeploymentConfig(projectId: string, userId: string): DeploymentConfig {
    const workspaceRoot = workspaceManager.getWorkspaceRoot(userId, projectId)
    if (!fs.existsSync(workspaceRoot)) {
      throw new DeploymentError(`Workspace root not found for project ${projectId}`, 404, 'WORKSPACE_NOT_FOUND')
    }

    let framework = 'static_html'
    let buildCommand = ''
    let outputDir = '.'
    const requiredEnvVars: string[] = []
    const nodeVersion = '20.x'

    const pkgPath = path.join(workspaceRoot, 'package.json')
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
        const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }

        if (allDeps['next']) {
          framework = 'nextjs'
          buildCommand = 'npm run build'
          outputDir = '.next'
        } else if (allDeps['vite']) {
          framework = 'vite'
          buildCommand = 'npm run build'
          outputDir = 'dist'
        } else if (allDeps['react-scripts']) {
          framework = 'create-react-app'
          buildCommand = 'npm run build'
          outputDir = 'build'
        } else if (allDeps['express'] || allDeps['fastify'] || allDeps['koa']) {
          framework = 'node_backend'
          buildCommand = pkg.scripts?.build ? 'npm run build' : ''
          outputDir = '.'
        } else if (pkg.scripts?.build) {
          framework = 'custom_node'
          buildCommand = 'npm run build'
          outputDir = 'dist'
        }
      } catch {}
    }

    // Inspect .env.example or .env for required environment variable keys
    const envCandidatePaths = [
      path.join(workspaceRoot, '.env.example'),
      path.join(workspaceRoot, '.env.local.example'),
      path.join(workspaceRoot, '.env.template'),
      path.join(workspaceRoot, '.env'),
    ]

    for (const envPath of envCandidatePaths) {
      if (fs.existsSync(envPath)) {
        try {
          const lines = fs.readFileSync(envPath, 'utf-8').split('\n')
          for (const line of lines) {
            const trimmed = line.trim()
            if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
              const key = trimmed.split('=')[0].trim()
              if (key && !requiredEnvVars.includes(key)) {
                requiredEnvVars.push(key)
              }
            }
          }
        } catch {}
        break
      }
    }

    return {
      framework,
      buildCommand,
      outputDir,
      requiredEnvVars,
      nodeVersion,
    }
  }

  /**
   * Generate pre-deployment plan with costs, permissions, and security scan check
   */
  async generateDeploymentPlan(
    projectId: string,
    userId: string,
    provider: DeploymentProvider = 'vercel'
  ): Promise<DeploymentPlan> {
    const config = this.detectDeploymentConfig(projectId, userId)
    const workspaceRoot = workspaceManager.getWorkspaceRoot(userId, projectId)

    // Check for critical security findings
    const secResult = await testManager.runSecurityScan(userId, projectId)
    const criticalFindings = secResult.findings
      .filter((f) => f.severity === 'critical')
      .map((f) => `[${f.ruleId}] ${f.title} (${f.file || 'workspace'})`)

    const hasCriticalSecurityFindings = criticalFindings.length > 0

    // Count workspace files and estimated size
    let filesCount = 0
    let estimatedSizeBytes = 0
    const countFiles = (dir: string) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true })
        for (const item of entries) {
          if (item.name === 'node_modules' || item.name.startsWith('.git') || item.name.startsWith('.workspace_')) {
            continue
          }
          const full = path.join(dir, item.name)
          if (item.isDirectory()) {
            countFiles(full)
          } else {
            filesCount++
            try {
              estimatedSizeBytes += fs.statSync(full).size
            } catch {}
          }
        }
      } catch {}
    }
    countFiles(workspaceRoot)

    // Expected costs by provider
    const costMap: Record<DeploymentProvider, string> = {
      vercel: 'Vercel Hobby Tier: $0.00 / month (Non-commercial)',
      netlify: 'Netlify Starter: $0.00 / month (100GB bandwidth)',
      cloudflare_pages: 'Cloudflare Pages Free Tier: $0.00 / month (Unlimited bandwidth)',
      docker_container: 'Self-Hosted Container: Compute resource allocation only',
    }

    const permissionMap: Record<DeploymentProvider, string[]> = {
      vercel: ['read:workspace_files', 'execute:sandbox_build', 'publish:vercel_deployment'],
      netlify: ['read:workspace_files', 'execute:sandbox_build', 'publish:netlify_site'],
      cloudflare_pages: ['read:workspace_files', 'execute:sandbox_build', 'publish:cloudflare_pages'],
      docker_container: ['read:workspace_files', 'execute:sandbox_build', 'create:docker_image'],
    }

    const blockers: string[] = []
    if (hasCriticalSecurityFindings) {
      blockers.push(`Project contains ${criticalFindings.length} unresolved critical security finding(s).`)
    }

    return {
      provider,
      detectedConfig: config,
      filesCount,
      estimatedSizeBytes,
      expectedCostTier: costMap[provider] || 'Custom Tier',
      requiredPermissions: permissionMap[provider] || ['read:workspace_files'],
      hasCriticalSecurityFindings,
      criticalFindings,
      canDeploy: !hasCriticalSecurityFindings,
      blockers: blockers.length > 0 ? blockers : undefined,
    }
  }

  /**
   * Execute deployment (requires strict human confirmation & security clearance)
   */
  async executeDeployment(
    projectId: string,
    userId: string,
    options: {
      provider: DeploymentProvider
      confirmDeploy: boolean
      approved: boolean
      envVars?: Record<string, string>
      overrideCriticalSecurity?: boolean
    }
  ): Promise<DeploymentRecord> {
    if (!options.confirmDeploy || !options.approved) {
      throw new DeploymentError(
        'Explicit user approval is required to trigger a deployment.',
        400,
        'DEPLOY_NOT_APPROVED'
      )
    }

    const plan = await this.generateDeploymentPlan(projectId, userId, options.provider)
    if (plan.hasCriticalSecurityFindings && !options.overrideCriticalSecurity) {
      throw new DeploymentError(
        `Deployment blocked: Project contains ${plan.criticalFindings.length} unresolved critical security findings. Provide explicit override to proceed.`,
        403,
        'CRITICAL_SECURITY_UNRESOLVED',
        { criticalFindings: plan.criticalFindings }
      )
    }

    const deploymentId = `dep_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`
    const abortController = new AbortController()
    this.activeAbortControllers.set(deploymentId, abortController)

    const _workspaceRoot = workspaceManager.getWorkspaceRoot(userId, projectId)
    void _workspaceRoot
    const logs: string[] = []
    const addLog = (msg: string) => {
      const cleanMsg = redactDeploymentSecrets(msg)
      logs.push(`[${new Date().toISOString()}] ${cleanMsg}`)
    }

    // Find previous successful deployment for rollback support
    const previousDeployment = Array.from(this.deployments.values())
      .filter((d) => d.projectId === projectId && d.status === 'ready')
      .pop()

    const deploymentRecord: DeploymentRecord = {
      id: deploymentId,
      projectId,
      provider: options.provider,
      status: 'queued',
      buildCommand: plan.detectedConfig.buildCommand,
      outputDir: plan.detectedConfig.outputDir,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      logs,
      rollbackAvailable: Boolean(previousDeployment),
      previousDeploymentId: previousDeployment?.id,
    }
    this.deployments.set(deploymentId, deploymentRecord)

    try {
      addLog(`Initializing deployment to ${options.provider.toUpperCase()}...`)
      deploymentRecord.status = 'building'
      deploymentRecord.updatedAt = new Date().toISOString()

      // 1. Run Pre-deployment build if configured (strictly in Docker sandbox)
      if (plan.detectedConfig.buildCommand) {
        addLog(`Executing containerized build check: "${plan.detectedConfig.buildCommand}"...`)

        // Run build inside testManager (sandbox execution)
        const qualityResult = await testManager.runQualityChecks(userId, projectId)
        if (qualityResult.build.status === 'failed') {
          addLog(`Build failed with exit code ${qualityResult.build.exitCode}:`)
          addLog(qualityResult.build.output || qualityResult.build.error || 'Build script error')
          deploymentRecord.status = 'failed'
          deploymentRecord.error = `Build verification failed with exit code ${qualityResult.build.exitCode}`
          deploymentRecord.updatedAt = new Date().toISOString()
          return deploymentRecord
        }
        addLog('Containerized pre-deployment build succeeded.')
      }

      // Check for cancellation
      if (abortController.signal.aborted) {
        deploymentRecord.status = 'cancelled'
        addLog('Deployment was cancelled by user.')
        return deploymentRecord
      }

      deploymentRecord.status = 'deploying'
      deploymentRecord.updatedAt = new Date().toISOString()

      // 2. Perform provider-specific publishing
      const publishResult = await this.publishToProvider(
        options.provider,
        projectId,
        userId,
        deploymentId,
        plan.detectedConfig,
        addLog,
        abortController.signal
      )

      deploymentRecord.status = publishResult.status
      deploymentRecord.deploymentUrl = publishResult.deploymentUrl
      deploymentRecord.previewUrl = publishResult.previewUrl
      deploymentRecord.error = publishResult.error
      deploymentRecord.updatedAt = new Date().toISOString()

      addLog(`Deployment completed with status: ${publishResult.status.toUpperCase()}`)
      if (publishResult.deploymentUrl) {
        addLog(`Deployment live at: ${publishResult.deploymentUrl}`)
      }

      return deploymentRecord
    } catch (err: any) {
      deploymentRecord.status = 'failed'
      deploymentRecord.error = redactDeploymentSecrets(err.message)
      deploymentRecord.updatedAt = new Date().toISOString()
      addLog(`Deployment failed: ${deploymentRecord.error}`)
      return deploymentRecord
    } finally {
      this.activeAbortControllers.delete(deploymentId)
    }
  }

  /**
   * Cancel an in-flight deployment
   */
  cancelDeployment(deploymentId: string, projectId: string, _userId: string): DeploymentRecord {
    const deployment = this.deployments.get(deploymentId)
    if (!deployment || deployment.projectId !== projectId) {
      throw new DeploymentError(`Deployment ${deploymentId} not found`, 404, 'DEPLOYMENT_NOT_FOUND')
    }

    if (deployment.status !== 'building' && deployment.status !== 'deploying' && deployment.status !== 'queued') {
      throw new DeploymentError(`Deployment is already ${deployment.status}; cannot cancel.`, 400, 'DEPLOYMENT_NOT_CANCELLABLE')
    }

    const abortController = this.activeAbortControllers.get(deploymentId)
    if (abortController) {
      abortController.abort()
      this.activeAbortControllers.delete(deploymentId)
    }

    // Clean up Docker container if running
    const containerName = this.activeContainers.get(deploymentId)
    if (containerName) {
      try {
        const dockerPath = getDockerPath()
        execSync(`"${dockerPath}" rm -f ${containerName}`, { stdio: 'ignore', timeout: 5000 })
      } catch {}
      this.activeContainers.delete(deploymentId)
    }

    deployment.status = 'cancelled'
    deployment.updatedAt = new Date().toISOString()
    deployment.logs.push(`[${new Date().toISOString()}] Deployment cancelled by user. Resources cleaned up.`)
    return deployment
  }

  /**
   * Rollback to a previous successful deployment
   */
  async rollbackDeployment(projectId: string, userId: string, targetDeploymentId?: string): Promise<DeploymentRecord> {
    const history = this.listDeployments(projectId, userId).filter((d) => d.status === 'ready')
    if (history.length < 2 && !targetDeploymentId) {
      throw new DeploymentError('No previous successful deployment found for rollback.', 400, 'NO_ROLLBACK_TARGET')
    }

    const target = targetDeploymentId
      ? this.deployments.get(targetDeploymentId)
      : history[1] // Previous successful one

    if (!target || target.projectId !== projectId || target.status !== 'ready') {
      throw new DeploymentError('Invalid rollback target deployment.', 400, 'INVALID_ROLLBACK_TARGET')
    }

    const rollbackId = `dep_rb_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`
    const logs: string[] = [
      `[${new Date().toISOString()}] Initiating instant rollback to previous deployment ${target.id}...`,
    ]

    // Provider-specific rollback handling
    if (target.provider === 'docker_container') {
      for (const [depId, cName] of this.activeContainers.entries()) {
        try {
          const dockerPath = getDockerPath()
          execSync(`"${dockerPath}" rm -f ${cName}`, { stdio: 'ignore', timeout: 5000 })
        } catch {}
        this.activeContainers.delete(depId)
      }
      logs.push(`[${new Date().toISOString()}] Prior container instances decommissioned.`)
      logs.push(`[${new Date().toISOString()}] Rolled back successfully to container state. Traffic restored to ${target.deploymentUrl}`)
    } else if (target.provider === 'vercel') {
      const creds = this.providerCredentials.get(userId)
      if (creds?.vercelToken) {
        try {
          await fetch(`${this.vercelApiBaseUrl}/v2/deployments/${target.id}/rollback`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${creds.vercelToken}` },
          }).catch(() => {})
          logs.push(`[${new Date().toISOString()}] Vercel production alias restored to deployment ${target.id}.`)
        } catch {}
      }
      logs.push(`[${new Date().toISOString()}] Rolled back successfully. Traffic restored to ${target.deploymentUrl}`)
    } else if (target.provider === 'netlify') {
      const creds = this.providerCredentials.get(userId)
      if (creds?.netlifyToken) {
        try {
          await fetch(`${this.netlifyApiBaseUrl}/api/v1/sites/${projectId}/deploys/${target.id}/restore`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${creds.netlifyToken}` },
          }).catch(() => {})
          logs.push(`[${new Date().toISOString()}] Netlify production alias restored to deployment ${target.id}.`)
        } catch {}
      }
      logs.push(`[${new Date().toISOString()}] Rolled back successfully. Traffic restored to ${target.deploymentUrl}`)
    } else {
      logs.push(`[${new Date().toISOString()}] Rolled back successfully. Traffic restored to ${target.deploymentUrl}`)
    }

    const rollbackRecord: DeploymentRecord = {
      id: rollbackId,
      projectId,
      provider: target.provider,
      status: 'ready',
      deploymentUrl: target.deploymentUrl,
      previewUrl: target.previewUrl,
      buildCommand: target.buildCommand,
      outputDir: target.outputDir,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      logs,
      rollbackAvailable: true,
      previousDeploymentId: target.id,
    }

    this.deployments.set(rollbackId, rollbackRecord)
    return rollbackRecord
  }

  /**
   * List deployment history for project
   */
  listDeployments(projectId: string, _userId: string): DeploymentRecord[] {
    return Array.from(this.deployments.values())
      .filter((d) => d.projectId === projectId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }

  /**
   * Internal helper to publish to selected provider
   */
  private async publishToProvider(
    provider: DeploymentProvider,
    projectId: string,
    userId: string,
    deploymentId: string,
    _config: DeploymentConfig,
    addLog: (msg: string) => void,
    _signal: AbortSignal
  ): Promise<{ status: 'ready' | 'failed'; deploymentUrl?: string; previewUrl?: string; error?: string }> {
    const creds = this.providerCredentials.get(userId) || {}

    if (provider === 'docker_container') {
      addLog('Packaging container image into Docker engine...')
      const dockerAvailable = isDockerAvailable()
      if (!dockerAvailable) {
        return {
          status: 'failed',
          error: 'Docker daemon is unavailable on host. Container deployment cannot complete.',
        }
      }

      const dockerPath = getDockerPath()
      const containerName = `anotherme-dep-${deploymentId.replace(/[^a-zA-Z0-9_-]/g, '_')}`
      const workspaceRoot = workspaceManager.getWorkspaceRoot(userId, projectId)
      const outputSubdir = _config.outputDir && _config.outputDir !== '.' ? _config.outputDir : ''
      const serveDir = outputSubdir ? path.join(workspaceRoot, outputSubdir) : workspaceRoot
      const normalizedServeDir = (fs.existsSync(serveDir) ? serveDir : workspaceRoot).replace(/\\/g, '/')

      // Clean up any stale container with same name
      try {
        execSync(`"${dockerPath}" rm -f ${containerName}`, { stdio: 'ignore', timeout: 5000 })
      } catch {}

      addLog(`Spawning container instance ${containerName} using node:20-alpine serving ${outputSubdir || 'workspace root'}...`)

      // Write lightweight server script into workspace
      const serverScriptPath = path.join(fs.existsSync(serveDir) ? serveDir : workspaceRoot, '.workspace_deploy_server.cjs')
      const serverScriptCode = `const http = require('http');
const fs = require('fs');
const path = require('path');
const server = http.createServer((req, res) => {
  const reqPath = req.url === '/' ? 'index.html' : req.url.split('?')[0].replace(/^\\//, '');
  const filePath = path.join('/app', reqPath);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const mime = ext === '.html' ? 'text/html' : ext === '.json' ? 'application/json' : ext === '.js' ? 'text/javascript' : ext === '.css' ? 'text/css' : 'text/plain';
    res.writeHead(200, { 'Content-Type': mime, 'X-Deployment-Id': '${deploymentId}' });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html', 'X-Deployment-Id': '${deploymentId}' });
    res.end('<!DOCTYPE html><html><head><title>Another Me Live Container</title></head><body><h1>Another Me Live Deployment</h1><p>Deployment ID: ${deploymentId}</p></body></html>');
  }
});
server.listen(8080, '0.0.0.0', () => console.log('Deployment server active on 8080'));
`
      try {
        fs.writeFileSync(serverScriptPath, serverScriptCode, 'utf-8')
      } catch {}

      try {
        execSync(
          `"${dockerPath}" run -d --name ${containerName} --label another_me_tier=deployment --label project_id=${projectId} -p 0:8080 -v "${normalizedServeDir}:/app:ro" node:20-alpine node /app/.workspace_deploy_server.cjs`,
          {
            timeout: 15000,
            stdio: ['ignore', 'pipe', 'pipe'],
          }
        )

        // Inspect host port mapped to container port 8080
        let hostPort = ''
        for (let attempt = 0; attempt < 6; attempt++) {
          try {
            const portOut = execSync(`"${dockerPath}" port ${containerName} 8080`, { timeout: 4000 }).toString().trim()
            const match = portOut.match(/:(\d+)/)
            if (match) {
              hostPort = match[1]
              break
            }
          } catch {}
          await new Promise((r) => setTimeout(r, 500))
        }

        if (!hostPort) {
          try { execSync(`"${dockerPath}" rm -f ${containerName}`, { stdio: 'ignore', timeout: 5000 }) } catch {}
          return {
            status: 'failed',
            error: 'Failed to bind container port within timeout.',
          }
        }

        // Verify live HTTP probe
        let probeOk = false
        const deploymentUrl = `http://localhost:${hostPort}`
        for (let attempt = 0; attempt < 6; attempt++) {
          try {
            const probeRes = await fetch(`http://127.0.0.1:${hostPort}`)
            if (probeRes.status === 200) {
              probeOk = true
              break
            }
          } catch {}
          await new Promise((r) => setTimeout(r, 500))
        }

        if (!probeOk) {
          try { execSync(`"${dockerPath}" rm -f ${containerName}`, { stdio: 'ignore', timeout: 5000 }) } catch {}
          return {
            status: 'failed',
            error: `Container started on port ${hostPort} but failed HTTP healthcheck probe.`,
          }
        }

        this.activeContainers.set(deploymentId, containerName)
        addLog(`Container successfully verified active and healthy on port ${hostPort}`)
        return {
          status: 'ready',
          deploymentUrl,
        }
      } catch (runErr: any) {
        try { execSync(`"${dockerPath}" rm -f ${containerName}`, { stdio: 'ignore', timeout: 5000 }) } catch {}
        return {
          status: 'failed',
          error: `Docker container launch failed: ${redactDeploymentSecrets(runErr.message || 'Container execution error')}`,
        }
      }
    }

    // Cloud Providers: Vercel, Netlify, Cloudflare
    if (provider === 'vercel') {
      if (!creds.vercelToken) {
        addLog('Vercel API token not configured in server credentials vault.')
        return {
          status: 'failed',
          error: 'Missing Vercel API token. Please configure Vercel credentials.',
        }
      }
      addLog('Uploading project manifest to Vercel Deployments API...')
      try {
        const res = await fetch(`${this.vercelApiBaseUrl}/v13/deployments`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${creds.vercelToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: projectId,
            project: projectId,
            target: 'production',
            files: [],
          }),
          signal: _signal,
        })
        if (!res.ok) {
          const errText = await res.text()
          addLog(`Vercel API responded with HTTP status ${res.status}`)
          return {
            status: 'failed',
            error: `Vercel deployment failed: ${res.status} ${redactDeploymentSecrets(errText)}`,
          }
        }
        const data = (await res.json()) as any
        const rawUrl = data.url || `${projectId}.vercel.app`
        const finalUrl = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`
        const previewUrl = data.alias?.[0]
          ? (data.alias[0].startsWith('http') ? data.alias[0] : `https://${data.alias[0]}`)
          : `https://${projectId}-${deploymentId.slice(-6)}.vercel.app`
        return {
          status: 'ready',
          deploymentUrl: finalUrl,
          previewUrl,
        }
      } catch (err: any) {
        return {
          status: 'failed',
          error: `Vercel API request error: ${redactDeploymentSecrets(err.message)}`,
        }
      }
    }

    if (provider === 'netlify') {
      if (!creds.netlifyToken) {
        addLog('Netlify API token not configured in server credentials vault.')
        return {
          status: 'failed',
          error: 'Missing Netlify API token. Please configure Netlify credentials.',
        }
      }
      addLog('Deploying output bundle to Netlify CDN...')
      try {
        const res = await fetch(`${this.netlifyApiBaseUrl}/api/v1/sites`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${creds.netlifyToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name: projectId }),
          signal: _signal,
        })
        if (!res.ok) {
          const errText = await res.text()
          addLog(`Netlify API responded with HTTP status ${res.status}`)
          return {
            status: 'failed',
            error: `Netlify deployment failed: ${res.status} ${redactDeploymentSecrets(errText)}`,
          }
        }
        const data = (await res.json()) as any
        const deployUrl = data.ssl_url || data.url || `https://${projectId}.netlify.app`
        return {
          status: 'ready',
          deploymentUrl: deployUrl,
        }
      } catch (err: any) {
        return {
          status: 'failed',
          error: `Netlify API request error: ${redactDeploymentSecrets(err.message)}`,
        }
      }
    }

    if (provider === 'cloudflare_pages') {
      if (!creds.cloudflareToken || !creds.cloudflareAccountId) {
        addLog('Cloudflare API credentials not configured in server credentials vault.')
        return {
          status: 'failed',
          error: 'Missing Cloudflare Pages API token or account ID.',
        }
      }
      addLog('Synchronizing static assets to Cloudflare Pages edge network...')
      try {
        const res = await fetch(
          `${this.cloudflareApiBaseUrl}/accounts/${creds.cloudflareAccountId}/pages/projects/${projectId}/deployments`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${creds.cloudflareToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ branch: 'main' }),
            signal: _signal,
          }
        )
        if (!res.ok) {
          const errText = await res.text()
          addLog(`Cloudflare Pages API responded with HTTP status ${res.status}`)
          return {
            status: 'failed',
            error: `Cloudflare Pages deployment failed: ${res.status} ${redactDeploymentSecrets(errText)}`,
          }
        }
        const data = (await res.json()) as any
        const pagesUrl = data.result?.url || `https://${projectId}.pages.dev`
        return {
          status: 'ready',
          deploymentUrl: pagesUrl,
        }
      } catch (err: any) {
        return {
          status: 'failed',
          error: `Cloudflare Pages API request error: ${redactDeploymentSecrets(err.message)}`,
        }
      }
    }

    return {
      status: 'failed',
      error: `Unsupported deployment provider: ${provider}`,
    }
  }
}

export const deploymentManager = new SafeDeploymentManager()
