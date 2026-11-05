// ====================================================================
// ANOTHER ME — SECTION 8: SAFE GITHUB INTEGRATION MANAGER
// Manages GitHub OAuth connections, repository management, working diffs,
// and safe pushes with explicit human confirmation and token redaction.
// Tokens NEVER leave server-side memory and are scrubbed from all logs.
// ====================================================================

import crypto from 'crypto'
import path from 'path'
import fs from 'fs'
import { workspaceManager } from './workspaceManager'
import { safeFileOperations } from './fileOperations'
import type {
  GitHubUserStatus,
  GitHubRepo,
  GitHubBranch,
  GitHubCommit,
  GitHubDiffSummary,
  GitHubFileDiff,
  GitHubPushResult,
  GitHubPushConflictDetails,
  GitHubConflictFile,
  GitHubPushOptions,
} from './types'

export class GitHubError extends Error {
  statusCode: number
  code: string
  details?: any

  constructor(message: string, statusCode: number = 400, code: string = 'GITHUB_ERROR', details?: any) {
    super(message)
    this.name = 'GitHubError'
    this.statusCode = statusCode
    this.code = code
    this.details = details
  }
}

interface StoredGitHubCredentials {
  accessToken: string
  tokenType: string
  scope: string[]
  username: string
  avatarUrl?: string
  expiresAt?: string
}

interface OAuthStateRecord {
  userId: string
  projectId: string
  createdAt: number
  redirectUri?: string
  scope?: string[]
}

// Redact any tokens or secrets from strings
export function redactGitHubSecrets(str: string): string {
  if (!str) return ''
  return str
    .replace(/ghp_[a-zA-Z0-9]{20,255}/g, '[REDACTED_GITHUB_PAT]')
    .replace(/github_pat_[a-zA-Z0-9_]{20,255}/g, '[REDACTED_GITHUB_PAT]')
    .replace(/gho_[a-zA-Z0-9]{20,255}/g, '[REDACTED_GITHUB_OAUTH]')
    .replace(/Bearer\s+[a-zA-Z0-9_\-\.]{20,}/gi, 'Bearer [REDACTED_TOKEN]')
}

export class SafeGitHubManager {
  private credentialsVault: Map<string, StoredGitHubCredentials> = new Map()
  private oauthStates: Map<string, OAuthStateRecord> = new Map()
  private customApiBaseUrl: string = process.env.GITHUB_API_BASE_URL || 'https://api.github.com'
  private customOAuthBaseUrl: string = process.env.GITHUB_OAUTH_BASE_URL || 'https://github.com'

  /**
   * Set custom API base URL for testing
   */
  setCustomApiBaseUrl(url: string) {
    this.customApiBaseUrl = url.replace(/\/$/, '')
  }

  /**
   * Set custom OAuth base URL for testing
   */
  setCustomOAuthBaseUrl(url: string) {
    this.customOAuthBaseUrl = url.replace(/\/$/, '')
  }

  /**
   * Reset custom URLs back to standard GitHub endpoints
   */
  resetCustomUrls() {
    this.customApiBaseUrl = process.env.GITHUB_API_BASE_URL || 'https://api.github.com'
    this.customOAuthBaseUrl = process.env.GITHUB_OAUTH_BASE_URL || 'https://github.com'
  }

  /**
   * Generate OAuth Authorization URL with crypto state, scope minimization, and open-redirect defense
   */
  getOAuthUrl(
    userId: string,
    projectId: string,
    redirectUri?: string,
    requestedScope?: string
  ): { authUrl: string; state: string } {
    // Validate redirectUri against open-redirect vulnerabilities
    if (redirectUri) {
      const isRelative = redirectUri.startsWith('/') && !redirectUri.startsWith('//') && !redirectUri.includes('\\')
      const isAllowedOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/i.test(redirectUri)
      if (!isRelative && !isAllowedOrigin) {
        throw new GitHubError('Invalid or untrusted OAuth redirect URI.', 400, 'GITHUB_INVALID_REDIRECT_URI')
      }
    }

    // Supported least-privilege scopes
    const allowedScopes = ['public_repo,read:user', 'repo,read:user', 'read:user']
    const effectiveScope = requestedScope && allowedScopes.includes(requestedScope)
      ? requestedScope
      : 'repo,read:user'

    const state = crypto.randomBytes(24).toString('hex')
    this.oauthStates.set(state, {
      userId,
      projectId,
      createdAt: Date.now(),
      redirectUri,
      scope: effectiveScope.split(',').map((s) => s.trim()),
    })

    // Clean up expired states older than 15 minutes
    const now = Date.now()
    for (const [s, rec] of this.oauthStates.entries()) {
      if (now - rec.createdAt > 15 * 60 * 1000) {
        this.oauthStates.delete(s)
      }
    }

    const clientId = process.env.GITHUB_CLIENT_ID || 'dummy_github_client_id'
    const params = new URLSearchParams({
      client_id: clientId,
      scope: effectiveScope,
      state,
    })
    if (redirectUri) {
      params.append('redirect_uri', redirectUri)
    }

    return {
      authUrl: `${this.customOAuthBaseUrl}/login/oauth/authorize?${params.toString()}`,
      state,
    }
  }

  /**
   * Handle OAuth Callback Code Exchange
   */
  async handleOAuthCallback(code: string, state: string): Promise<GitHubUserStatus> {
    const record = this.oauthStates.get(state)
    if (!record) {
      throw new GitHubError('Invalid or expired OAuth state parameter', 400, 'GITHUB_INVALID_STATE')
    }
    this.oauthStates.delete(state)

    if (Date.now() - record.createdAt > 15 * 60 * 1000) {
      throw new GitHubError('OAuth authorization session expired. Please retry.', 400, 'GITHUB_STATE_EXPIRED')
    }

    const clientId = process.env.GITHUB_CLIENT_ID || 'dummy_client_id'
    const clientSecret = process.env.GITHUB_CLIENT_SECRET || 'dummy_client_secret'

    try {
      const payload: Record<string, string> = {
        client_id: clientId,
        client_secret: clientSecret,
        code,
        state,
      }
      if (record.redirectUri) {
        payload.redirect_uri = record.redirectUri
      }

      const tokenRes = await fetch(`${this.customOAuthBaseUrl}/login/oauth/access_token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': 'AnotherMe-App/1.0',
        },
        body: JSON.stringify(payload),
      })

      if (!tokenRes.ok) {
        throw new GitHubError(`GitHub token exchange failed: HTTP ${tokenRes.status}`, 502, 'GITHUB_OAUTH_FAILED')
      }

      const tokenData: any = await tokenRes.json()
      if (tokenData.error || !tokenData.access_token) {
        throw new GitHubError(
          tokenData.error_description || tokenData.error || 'Failed to exchange authorization code for token',
          400,
          'GITHUB_OAUTH_REJECTED'
        )
      }

      const accessToken = tokenData.access_token
      const scopes = (tokenData.scope || 'repo,read:user').split(',').map((s: string) => s.trim())

      // Fetch user profile using the acquired access token
      const userProfile = await this.fetchUserProfile(accessToken)

      this.credentialsVault.set(record.userId, {
        accessToken,
        tokenType: tokenData.token_type || 'bearer',
        scope: scopes,
        username: userProfile.login,
        avatarUrl: userProfile.avatar_url,
      })

      return {
        connected: true,
        username: userProfile.login,
        avatarUrl: userProfile.avatar_url,
        scopes,
      }
    } catch (err: any) {
      if (err instanceof GitHubError) throw err
      throw new GitHubError(`OAuth callback error: ${redactGitHubSecrets(err.message)}`, 500, 'GITHUB_OAUTH_ERROR')
    }
  }

  /**
   * Set or authenticate with a Personal Access Token (PAT)
   */
  async setPersonalAccessToken(userId: string, token: string): Promise<GitHubUserStatus> {
    const trimmed = (token || '').trim()
    if (!trimmed) {
      throw new GitHubError('GitHub access token cannot be empty', 400, 'GITHUB_TOKEN_EMPTY')
    }

    if (trimmed.length < 10) {
      throw new GitHubError('Invalid GitHub access token format', 400, 'GITHUB_INVALID_TOKEN_FORMAT')
    }

    // Verify token validity by calling GitHub User API
    const userProfile = await this.fetchUserProfile(trimmed)

    this.credentialsVault.set(userId, {
      accessToken: trimmed,
      tokenType: 'bearer',
      scope: ['repo', 'read:user'],
      username: userProfile.login,
      avatarUrl: userProfile.avatar_url,
    })

    return {
      connected: true,
      username: userProfile.login,
      avatarUrl: userProfile.avatar_url,
      scopes: ['repo', 'read:user'],
    }
  }

  /**
   * Disconnect user's GitHub session
   */
  disconnect(userId: string): { success: boolean } {
    this.credentialsVault.delete(userId)
    return { success: true }
  }

  /**
   * Get current connection status (NEVER returns accessToken)
   */
  async getStatus(userId: string): Promise<GitHubUserStatus> {
    const creds = this.credentialsVault.get(userId)
    if (!creds) {
      return { connected: false }
    }

    // Fetch rate limit info safely
    let rateLimitInfo = undefined
    try {
      const rlRes = await fetch(`${this.customApiBaseUrl}/rate_limit`, {
        headers: {
          Authorization: `Bearer ${creds.accessToken}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'AnotherMe-App/1.0',
        },
      })
      if (rlRes.ok) {
        const rlData: any = await rlRes.json()
        if (rlData.resources?.core) {
          rateLimitInfo = {
            limit: rlData.resources.core.limit,
            remaining: rlData.resources.core.remaining,
            reset: rlData.resources.core.reset,
          }
        }
      } else if (rlRes.status === 401) {
        // Token expired
        this.credentialsVault.delete(userId)
        return { connected: false }
      }
    } catch {}

    return {
      connected: true,
      username: creds.username,
      avatarUrl: creds.avatarUrl,
      scopes: creds.scope,
      expiresAt: creds.expiresAt,
      rateLimit: rateLimitInfo,
    }
  }

  /**
   * Helper to fetch authenticated user profile
   */
  private async fetchUserProfile(token: string): Promise<{ login: string; avatar_url?: string }> {
    const res = await fetch(`${this.customApiBaseUrl}/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'AnotherMe-App/1.0',
      },
    })

    if (!res.ok) {
      if (res.status === 401) {
        throw new GitHubError('Invalid or expired GitHub access token.', 401, 'GITHUB_AUTH_EXPIRED')
      }
      if (res.status === 403) {
        throw new GitHubError('GitHub API access forbidden or rate limit reached.', 403, 'GITHUB_RATE_LIMITED')
      }
      throw new GitHubError(`GitHub API user verification failed: HTTP ${res.status}`, res.status, 'GITHUB_API_ERROR')
    }

    const data: any = await res.json()
    if (!data.login) {
      throw new GitHubError('Failed to read user profile from GitHub API', 502, 'GITHUB_PROFILE_INVALID')
    }

    return { login: data.login, avatar_url: data.avatar_url }
  }

  /**
   * List accessible repositories for user
   */
  async listRepositories(userId: string): Promise<GitHubRepo[]> {
    const creds = this.credentialsVault.get(userId)
    if (!creds) {
      throw new GitHubError('GitHub connection required to list repositories.', 401, 'GITHUB_NOT_CONNECTED')
    }

    const res = await fetch(`${this.customApiBaseUrl}/user/repos?sort=updated&per_page=30`, {
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'AnotherMe-App/1.0',
      },
    })

    if (!res.ok) {
      this.handleGitHubApiError(res.status, await res.text())
    }

    const repos: any[] = (await res.json()) as any[]
    return repos.map((r) => ({
      id: r.id,
      name: r.name,
      fullName: r.full_name,
      private: Boolean(r.private),
      htmlUrl: r.html_url,
      defaultBranch: r.default_branch || 'main',
      description: r.description || null,
      updatedAt: r.updated_at,
    }))
  }

  /**
   * Create a new repository on GitHub (requires explicit human confirmation)
   */
  async createRepository(
    userId: string,
    options: {
      name: string
      description?: string
      private?: boolean
      confirmCreate: boolean
    }
  ): Promise<GitHubRepo> {
    const creds = this.credentialsVault.get(userId)
    if (!creds) {
      throw new GitHubError('GitHub connection required to create a repository.', 401, 'GITHUB_NOT_CONNECTED')
    }

    if (!options.confirmCreate) {
      throw new GitHubError(
        'Explicit user approval is required to create a new GitHub repository.',
        400,
        'CONFIRMATION_REQUIRED'
      )
    }

    const repoName = (options.name || '').trim()
    const nameRegex = /^[a-zA-Z0-9_.-]{1,100}$/
    if (!repoName || !nameRegex.test(repoName)) {
      throw new GitHubError(
        `Invalid repository name "${repoName}". Repository names can only contain letters, numbers, hyphens, dots, and underscores (max 100 characters).`,
        400,
        'INVALID_REPO_NAME'
      )
    }

    const res = await fetch(`${this.customApiBaseUrl}/user/repos`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'AnotherMe-App/1.0',
      },
      body: JSON.stringify({
        name: repoName,
        description: options.description || 'Created via Another Me',
        private: options.private !== false,
        auto_init: true,
      }),
    })

    if (!res.ok) {
      this.handleGitHubApiError(res.status, await res.text())
    }

    const r: any = await res.json()
    return {
      id: r.id,
      name: r.name,
      fullName: r.full_name,
      private: Boolean(r.private),
      htmlUrl: r.html_url,
      defaultBranch: r.default_branch || 'main',
      description: r.description || null,
      updatedAt: r.updated_at,
    }
  }

  /**
   * List repository branches
   */
  async listBranches(userId: string, owner: string, repo: string): Promise<GitHubBranch[]> {
    const creds = this.credentialsVault.get(userId)
    if (!creds) {
      throw new GitHubError('GitHub connection required to list branches.', 401, 'GITHUB_NOT_CONNECTED')
    }

    this.validateRepoParams(owner, repo)

    const res = await fetch(`${this.customApiBaseUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches`, {
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'AnotherMe-App/1.0',
      },
    })

    if (!res.ok) {
      this.handleGitHubApiError(res.status, await res.text())
    }

    const branches: any[] = (await res.json()) as any[]
    return branches.map((b) => ({
      name: b.name,
      commitSha: b.commit?.sha || '',
      protected: Boolean(b.protected),
    }))
  }

  /**
   * Get repository commit history
   */
  async getCommitHistory(userId: string, owner: string, repo: string, branch: string = 'main'): Promise<GitHubCommit[]> {
    const creds = this.credentialsVault.get(userId)
    if (!creds) {
      throw new GitHubError('GitHub connection required to view commit history.', 401, 'GITHUB_NOT_CONNECTED')
    }

    this.validateRepoParams(owner, repo)
    this.validateBranchName(branch)

    const res = await fetch(
      `${this.customApiBaseUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?sha=${encodeURIComponent(branch)}&per_page=20`,
      {
        headers: {
          Authorization: `Bearer ${creds.accessToken}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'AnotherMe-App/1.0',
        },
      }
    )

    if (!res.ok) {
      this.handleGitHubApiError(res.status, await res.text())
    }

    const commits: any[] = (await res.json()) as any[]
    return commits.map((c) => ({
      sha: c.sha,
      message: c.commit?.message || '',
      authorName: c.commit?.author?.name || 'Unknown',
      authorDate: c.commit?.author?.date || '',
      url: c.html_url,
    }))
  }

  /**
   * Compute working diff between workspace and remote GitHub branch
   */
  async getWorkingDiff(
    userId: string,
    projectId: string,
    owner: string,
    repo: string,
    branch: string = 'main'
  ): Promise<GitHubDiffSummary> {
    const creds = this.credentialsVault.get(userId)
    if (!creds) {
      throw new GitHubError('GitHub connection required to compute diff.', 401, 'GITHUB_NOT_CONNECTED')
    }

    this.validateRepoParams(owner, repo)
    this.validateBranchName(branch)

    const workspaceRoot = workspaceManager.getWorkspaceRoot(userId, projectId)
    if (!fs.existsSync(workspaceRoot)) {
      throw new GitHubError('Workspace root directory does not exist.', 404, 'WORKSPACE_NOT_FOUND')
    }

    // List local files (filtering node_modules, .git, etc.)
    const localEntries = await safeFileOperations.listFiles(workspaceRoot)
    const localFiles = localEntries.filter((e) => !e.isDirectory)

    // Fetch branch ref first to obtain remote HEAD baseSha
    let baseSha = ''
    try {
      const refRes = await fetch(
        `${this.customApiBaseUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(branch)}`,
        {
          headers: {
            Authorization: `Bearer ${creds.accessToken}`,
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'AnotherMe-App/1.0',
          },
        }
      )
      if (refRes.ok) {
        const refData: any = await refRes.json()
        baseSha = refData.object?.sha || ''
      }
    } catch {}

    // Fetch remote branch git tree
    let remoteTreeFiles: Map<string, string> = new Map() // path -> sha
    try {
      const treeIdentifier = baseSha || branch
      const treeRes = await fetch(
        `${this.customApiBaseUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(treeIdentifier)}?recursive=1`,
        {
          headers: {
            Authorization: `Bearer ${creds.accessToken}`,
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'AnotherMe-App/1.0',
          },
        }
      )

      if (treeRes.ok) {
        const treeData: any = await treeRes.json()
        if (Array.isArray(treeData.tree)) {
          for (const item of treeData.tree) {
            if (item.type === 'blob') {
              remoteTreeFiles.set(item.path, item.sha)
            }
          }
        }
      }
    } catch {}

    const diffFiles: GitHubFileDiff[] = []
    let totalAdditions = 0
    let totalDeletions = 0

    // Compare local files against remote tree
    for (const lf of localFiles) {
      const relPath = lf.relativePath
      if (
        relPath === '.workspace_meta.json' ||
        relPath.startsWith('.workspace_') ||
        relPath.startsWith('.terminal') ||
        relPath.startsWith('.git')
      ) {
        continue
      }

      const fullPath = path.join(workspaceRoot, relPath)
      let localContent = ''
      try {
        localContent = fs.readFileSync(fullPath, 'utf-8')
      } catch {
        continue
      }

      if (!remoteTreeFiles.has(relPath)) {
        // Added file
        const linesCount = localContent.split('\n').length
        totalAdditions += linesCount
        diffFiles.push({
          path: relPath,
          status: 'added',
          additions: linesCount,
          deletions: 0,
          patch: `+ [New File: ${linesCount} lines]`,
        })
      } else {
        // Existing file, check if modified
        diffFiles.push({
          path: relPath,
          status: 'modified',
          additions: 1,
          deletions: 0,
          patch: `~ [Updated File: ${lf.size} bytes]`,
        })
        totalAdditions += 1
      }
    }

    // Compare remote tree files against local files to detect deletions
    const localRelPaths = new Set(localFiles.map((f) => f.relativePath.replace(/\\/g, '/')))
    for (const [remotePath] of remoteTreeFiles.entries()) {
      if (
        remotePath === '.workspace_meta.json' ||
        remotePath.startsWith('.workspace_') ||
        remotePath.startsWith('.terminal') ||
        remotePath.startsWith('.git')
      ) {
        continue
      }

      if (!localRelPaths.has(remotePath)) {
        diffFiles.push({
          path: remotePath,
          status: 'deleted',
          additions: 0,
          deletions: 1,
          patch: `- [Deleted File]`,
        })
        totalDeletions += 1
      }
    }

    return {
      branch,
      baseSha,
      changedFilesCount: diffFiles.length,
      totalAdditions,
      totalDeletions,
      files: diffFiles,
    }
  }

  /**
   * Helper to fetch remote blob text content safely and redact secrets
   */
  private async fetchRemoteBlobContent(
    owner: string,
    repo: string,
    blobSha: string,
    creds: StoredGitHubCredentials
  ): Promise<string> {
    if (!blobSha) return ''
    try {
      const res = await fetch(
        `${this.customApiBaseUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/blobs/${encodeURIComponent(blobSha)}`,
        {
          headers: {
            Authorization: `Bearer ${creds.accessToken}`,
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'AnotherMe-App/1.0',
          },
        }
      )
      if (!res.ok) return ''
      const data: any = await res.json()
      let raw = ''
      if (data.encoding === 'base64' && typeof data.content === 'string') {
        raw = Buffer.from(data.content.replace(/\s/g, ''), 'base64').toString('utf-8')
      } else if (typeof data.content === 'string') {
        raw = data.content
      }
      return redactGitHubSecrets(raw)
    } catch {
      return ''
    }
  }

  /**
   * Build structured conflict details when remote branch has advanced or non-fast-forward push conflict occurs
   */
  private async buildPushConflictDetails(
    userId: string,
    projectId: string,
    owner: string,
    repo: string,
    branch: string,
    expectedBaseSha: string,
    currentRemoteSha: string,
    creds: StoredGitHubCredentials,
    reason: 'REMOTE_ADVANCED' | 'NON_FAST_FORWARD' | 'CONCURRENT_UPDATE' = 'REMOTE_ADVANCED'
  ): Promise<GitHubPushConflictDetails> {
    const workspaceRoot = workspaceManager.getWorkspaceRoot(userId, projectId)

    // 1. Fetch remote commits on branch
    const remoteCommits: { sha: string; message: string; authorName?: string; authorDate?: string }[] = []
    try {
      const commitsRes = await fetch(
        `${this.customApiBaseUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?sha=${encodeURIComponent(currentRemoteSha)}&per_page=10`,
        {
          headers: {
            Authorization: `Bearer ${creds.accessToken}`,
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'AnotherMe-App/1.0',
          },
        }
      )
      if (commitsRes.ok) {
        const cData: any = await commitsRes.json()
        if (Array.isArray(cData)) {
          for (const item of cData) {
            remoteCommits.push({
              sha: item.sha,
              message: redactGitHubSecrets(item.commit?.message || ''),
              authorName: redactGitHubSecrets(item.commit?.author?.name || item.author?.login || 'Unknown'),
              authorDate: item.commit?.author?.date || '',
            })
            if (expectedBaseSha && item.sha === expectedBaseSha) {
              break
            }
          }
        }
      }
    } catch {}

    // 2. Fetch remote tree at currentRemoteSha
    const currentRemoteTreeMap = new Map<string, string>() // path -> blob sha
    try {
      const rTreeRes = await fetch(
        `${this.customApiBaseUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(currentRemoteSha)}?recursive=1`,
        {
          headers: {
            Authorization: `Bearer ${creds.accessToken}`,
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'AnotherMe-App/1.0',
          },
        }
      )
      if (rTreeRes.ok) {
        const rData: any = await rTreeRes.json()
        if (Array.isArray(rData.tree)) {
          for (const t of rData.tree) {
            if (t.type === 'blob') currentRemoteTreeMap.set(t.path, t.sha)
          }
        }
      }
    } catch {}

    // 3. Fetch base tree at expectedBaseSha (if available)
    const baseTreeMap = new Map<string, string>() // path -> blob sha
    if (expectedBaseSha && expectedBaseSha !== currentRemoteSha) {
      try {
        const bTreeRes = await fetch(
          `${this.customApiBaseUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(expectedBaseSha)}?recursive=1`,
          {
            headers: {
              Authorization: `Bearer ${creds.accessToken}`,
              Accept: 'application/vnd.github.v3+json',
              'User-Agent': 'AnotherMe-App/1.0',
            },
          }
        )
        if (bTreeRes.ok) {
          const bData: any = await bTreeRes.json()
          if (Array.isArray(bData.tree)) {
            for (const t of bData.tree) {
              if (t.type === 'blob') baseTreeMap.set(t.path, t.sha)
            }
          }
        }
      } catch {}
    }

    // 4. Read local workspace files
    const localFileMap = new Map<string, string>() // path -> content
    if (fs.existsSync(workspaceRoot)) {
      try {
        const localEntries = await safeFileOperations.listFiles(workspaceRoot)
        for (const e of localEntries) {
          if (e.isDirectory) continue
          const rel = e.relativePath.replace(/\\/g, '/')
          if (
            rel === '.workspace_meta.json' ||
            rel.startsWith('.workspace_') ||
            rel.startsWith('.terminal') ||
            rel.startsWith('.git')
          ) {
            continue
          }
          try {
            const content = fs.readFileSync(path.join(workspaceRoot, rel), 'utf-8')
            localFileMap.set(rel, content)
          } catch {}
        }
      } catch {}
    }

    // 5. Detect conflicting and diverged files
    const allPaths = new Set<string>([
      ...currentRemoteTreeMap.keys(),
      ...baseTreeMap.keys(),
      ...localFileMap.keys(),
    ])

    const conflicts: GitHubConflictFile[] = []

    for (const filePath of allPaths) {
      if (
        filePath === '.workspace_meta.json' ||
        filePath.startsWith('.workspace_') ||
        filePath.startsWith('.terminal') ||
        filePath.startsWith('.git')
      ) {
        continue
      }

      const hasLocal = localFileMap.has(filePath)
      const hasCurrentRemote = currentRemoteTreeMap.has(filePath)
      const hasBase = baseTreeMap.has(filePath)

      const localContent = localFileMap.get(filePath) || ''
      const remoteBlobSha = currentRemoteTreeMap.get(filePath) || ''
      const baseBlobSha = baseTreeMap.get(filePath) || ''

      const remoteChanged = hasBase !== hasCurrentRemote || (hasBase && hasCurrentRemote && remoteBlobSha !== baseBlobSha)

      if (hasLocal && hasCurrentRemote) {
        const remoteContent = await this.fetchRemoteBlobContent(owner, repo, remoteBlobSha, creds)
        const localClean = redactGitHubSecrets(localContent)
        const remoteClean = redactGitHubSecrets(remoteContent)

        if (localClean !== remoteClean) {
          const conflictMarkers = [
            '<<<<<<< LOCAL (Ours)',
            localClean,
            '=======',
            remoteClean,
            '>>>>>>> REMOTE (Theirs)',
          ].join('\n')

          conflicts.push({
            path: filePath,
            type: 'modified_modified',
            localContent: localClean,
            remoteContent: remoteClean,
            conflictMarkers,
            description: `Both local workspace and remote branch modified "${filePath}".`,
          })
        }
      } else if (hasLocal && !hasCurrentRemote) {
        if (hasBase) {
          const localClean = redactGitHubSecrets(localContent)
          const conflictMarkers = [
            '<<<<<<< LOCAL (Ours)',
            localClean,
            '=======',
            '[File deleted on remote]',
            '>>>>>>> REMOTE (Theirs)',
          ].join('\n')

          conflicts.push({
            path: filePath,
            type: 'modified_deleted',
            localContent: localClean,
            conflictMarkers,
            description: `File "${filePath}" was modified locally but deleted on remote branch.`,
          })
        } else {
          if (remoteChanged || remoteCommits.length > 0) {
            conflicts.push({
              path: filePath,
              type: 'local_only',
              localContent: redactGitHubSecrets(localContent),
              description: `File "${filePath}" was created locally.`,
            })
          }
        }
      } else if (!hasLocal && hasCurrentRemote) {
        const remoteContent = await this.fetchRemoteBlobContent(owner, repo, remoteBlobSha, creds)
        const remoteClean = redactGitHubSecrets(remoteContent)

        if (hasBase) {
          const conflictMarkers = [
            '<<<<<<< LOCAL (Ours)',
            '[File deleted locally]',
            '=======',
            remoteClean,
            '>>>>>>> REMOTE (Theirs)',
          ].join('\n')

          conflicts.push({
            path: filePath,
            type: 'deleted_modified',
            remoteContent: remoteClean,
            conflictMarkers,
            description: `File "${filePath}" was deleted locally but modified/preserved on remote branch.`,
          })
        } else {
          conflicts.push({
            path: filePath,
            type: 'remote_only',
            remoteContent: remoteClean,
            description: `File "${filePath}" was added on remote branch.`,
          })
        }
      }
    }

    const shortExpected = (expectedBaseSha || 'unknown').slice(0, 7)
    const shortRemote = (currentRemoteSha || 'unknown').slice(0, 7)
    const summary = `Remote branch "${branch}" has diverged: expected base ${shortExpected}, but remote is at ${shortRemote}. Detected ${remoteCommits.length} remote commit(s) and ${conflicts.length} conflicting or updated file(s).`

    return {
      conflict: true,
      reason,
      branch,
      expectedBaseSha,
      currentRemoteSha,
      remoteCommits,
      conflicts,
      summary,
    }
  }

  /**
   * Push workspace changes to GitHub (requires explicit human confirmation)
   * Strictly enforces force: false and validates expectedBaseSha to prevent overwriting remote work.
   */
  async pushChanges(
    userId: string,
    projectId: string,
    options: GitHubPushOptions
  ): Promise<GitHubPushResult> {
    const creds = this.credentialsVault.get(userId)
    if (!creds) {
      throw new GitHubError('GitHub connection required to push changes.', 401, 'GITHUB_NOT_CONNECTED')
    }

    if (!options.confirmPush) {
      throw new GitHubError(
        'Explicit user approval is required to push changes to GitHub.',
        400,
        'PUSH_CONFIRMATION_REQUIRED'
      )
    }

    const commitMessage = (options.commitMessage || '').trim()
    if (!commitMessage) {
      throw new GitHubError('Commit message cannot be empty.', 400, 'COMMIT_MESSAGE_REQUIRED')
    }

    this.validateRepoParams(options.owner, options.repo)
    this.validateBranchName(options.branch)

    const workspaceRoot = workspaceManager.getWorkspaceRoot(userId, projectId)
    if (!fs.existsSync(workspaceRoot)) {
      throw new GitHubError('Workspace root directory does not exist.', 404, 'WORKSPACE_NOT_FOUND')
    }

    // 1. Get branch reference to verify existing commit and detect conflicts
    const refRes = await fetch(
      `${this.customApiBaseUrl}/repos/${encodeURIComponent(options.owner)}/${encodeURIComponent(options.repo)}/git/ref/heads/${encodeURIComponent(options.branch)}`,
      {
        headers: {
          Authorization: `Bearer ${creds.accessToken}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'AnotherMe-App/1.0',
        },
      }
    )

    if (!refRes.ok) {
      this.handleGitHubApiError(refRes.status, await refRes.text())
    }

    const refData: any = await refRes.json()
    const currentRemoteSha: string = refData.object?.sha || ''

    // Requirement 1 & 2: Compare remote HEAD SHA with expectedBaseSha
    if (options.expectedBaseSha && options.expectedBaseSha !== currentRemoteSha) {
      const conflictDetails = await this.buildPushConflictDetails(
        userId,
        projectId,
        options.owner,
        options.repo,
        options.branch,
        options.expectedBaseSha,
        currentRemoteSha,
        creds,
        'REMOTE_ADVANCED'
      )
      throw new GitHubError(
        `Push rejected: Remote branch "${options.branch}" has advanced. Expected SHA ${options.expectedBaseSha.slice(0, 7)}, but remote is at ${currentRemoteSha.slice(0, 7)}. Please review and resolve conflict.`,
        409,
        'GITHUB_PUSH_CONFLICT',
        conflictDetails
      )
    }

    // Requirement 4: Apply user-approved conflict resolution if provided
    if (options.resolutionStrategy) {
      if (options.resolutionStrategy === 'theirs') {
        // Accept remote: overwrite workspace with remote tree files
        const remoteTreeRes = await fetch(
          `${this.customApiBaseUrl}/repos/${encodeURIComponent(options.owner)}/${encodeURIComponent(options.repo)}/git/trees/${encodeURIComponent(currentRemoteSha)}?recursive=1`,
          {
            headers: {
              Authorization: `Bearer ${creds.accessToken}`,
              Accept: 'application/vnd.github.v3+json',
              'User-Agent': 'AnotherMe-App/1.0',
            },
          }
        )
        if (remoteTreeRes.ok) {
          const rData: any = await remoteTreeRes.json()
          if (Array.isArray(rData.tree)) {
            for (const item of rData.tree) {
              if (item.type === 'blob') {
                if (
                  item.path === '.workspace_meta.json' ||
                  item.path.startsWith('.workspace_') ||
                  item.path.startsWith('.terminal') ||
                  item.path.startsWith('.git')
                ) {
                  continue
                }
                const content = await this.fetchRemoteBlobContent(options.owner, options.repo, item.sha, creds)
                await safeFileOperations.writeFile(workspaceRoot, item.path, content)
              }
            }
          }
        }
      } else if (options.resolutionStrategy === 'merge_resolved' && Array.isArray(options.resolvedFiles)) {
        // Granular per-file resolution
        const rTreeRes = await fetch(
          `${this.customApiBaseUrl}/repos/${encodeURIComponent(options.owner)}/${encodeURIComponent(options.repo)}/git/trees/${encodeURIComponent(currentRemoteSha)}?recursive=1`,
          {
            headers: {
              Authorization: `Bearer ${creds.accessToken}`,
              Accept: 'application/vnd.github.v3+json',
              'User-Agent': 'AnotherMe-App/1.0',
            },
          }
        )
        const rData: any = rTreeRes.ok ? await rTreeRes.json() : {}
        const treeList: any[] = Array.isArray(rData.tree) ? rData.tree : []

        for (const resolution of options.resolvedFiles) {
          if (!resolution.path) continue
          if (resolution.action === 'theirs') {
            const matchedBlob = treeList.find((t: any) => t.path === resolution.path)
            if (matchedBlob) {
              const content = await this.fetchRemoteBlobContent(options.owner, options.repo, matchedBlob.sha, creds)
              await safeFileOperations.writeFile(workspaceRoot, resolution.path, content)
            } else {
              await safeFileOperations.deleteFile(workspaceRoot, resolution.path)
            }
          } else if (resolution.action === 'custom' && typeof resolution.customContent === 'string') {
            await safeFileOperations.writeFile(workspaceRoot, resolution.path, resolution.customContent)
          }
          // 'ours': preserve local workspace file as-is
        }
      }
      // 'ours': preserve all local files as-is
    }

    // Requirement 6: Check if remote changed again during resolution application
    const verifyRefRes = await fetch(
      `${this.customApiBaseUrl}/repos/${encodeURIComponent(options.owner)}/${encodeURIComponent(options.repo)}/git/ref/heads/${encodeURIComponent(options.branch)}`,
      {
        headers: {
          Authorization: `Bearer ${creds.accessToken}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'AnotherMe-App/1.0',
        },
      }
    )
    if (!verifyRefRes.ok) {
      this.handleGitHubApiError(verifyRefRes.status, await verifyRefRes.text())
    }
    const verifyRefData: any = await verifyRefRes.json()
    const verifySha: string = verifyRefData.object?.sha || ''
    if (verifySha !== currentRemoteSha) {
      const repeatedConflict = await this.buildPushConflictDetails(
        userId,
        projectId,
        options.owner,
        options.repo,
        options.branch,
        currentRemoteSha,
        verifySha,
        creds,
        'CONCURRENT_UPDATE'
      )
      throw new GitHubError(
        `Push rejected: Remote branch "${options.branch}" moved again to ${verifySha.slice(0, 7)} while preparing push. Please review new remote changes.`,
        409,
        'GITHUB_PUSH_CONFLICT',
        repeatedConflict
      )
    }

    const localEntries = await safeFileOperations.listFiles(workspaceRoot)
    const localFiles = localEntries.filter((e) => !e.isDirectory)

    const pushedFiles: string[] = []

    // Fetch remote branch tree to identify files deleted locally
    const remoteTreeFiles = new Set<string>()
    try {
      const remoteTreeRes = await fetch(
        `${this.customApiBaseUrl}/repos/${encodeURIComponent(options.owner)}/${encodeURIComponent(options.repo)}/git/trees/${encodeURIComponent(verifySha)}?recursive=1`,
        {
          headers: {
            Authorization: `Bearer ${creds.accessToken}`,
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'AnotherMe-App/1.0',
          },
        }
      )
      if (remoteTreeRes.ok) {
        const rData: any = await remoteTreeRes.json()
        if (Array.isArray(rData.tree)) {
          for (const item of rData.tree) {
            if (item.type === 'blob') remoteTreeFiles.add(item.path)
          }
        }
      }
    } catch {}

    // 2. Create Git Blobs for files
    const treeItems: { path: string; mode: string; type: string; sha: string | null }[] = []

    for (const lf of localFiles) {
      const relPath = lf.relativePath
      if (
        relPath === '.workspace_meta.json' ||
        relPath.startsWith('.workspace_') ||
        relPath.startsWith('.terminal') ||
        relPath.startsWith('.git')
      ) {
        continue
      }

      const fullPath = path.join(workspaceRoot, relPath)
      let content = ''
      try {
        content = fs.readFileSync(fullPath, 'utf-8')
      } catch {
        continue
      }

      const blobRes = await fetch(
        `${this.customApiBaseUrl}/repos/${encodeURIComponent(options.owner)}/${encodeURIComponent(options.repo)}/git/blobs`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${creds.accessToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'AnotherMe-App/1.0',
          },
          body: JSON.stringify({
            content,
            encoding: 'utf-8',
          }),
        }
      )

      if (!blobRes.ok) {
        this.handleGitHubApiError(blobRes.status, await blobRes.text())
      }

      const blobData: any = await blobRes.json()
      treeItems.push({
        path: relPath,
        mode: '100644',
        type: 'blob',
        sha: blobData.sha,
      })
      pushedFiles.push(relPath)
    }

    // Include deleted files (sha: null in Git Trees API)
    const localRelSet = new Set(localFiles.map((f) => f.relativePath.replace(/\\/g, '/')))
    for (const remotePath of remoteTreeFiles) {
      if (
        remotePath === '.workspace_meta.json' ||
        remotePath.startsWith('.workspace_') ||
        remotePath.startsWith('.terminal') ||
        remotePath.startsWith('.git')
      ) {
        continue
      }
      if (!localRelSet.has(remotePath)) {
        treeItems.push({
          path: remotePath,
          mode: '100644',
          type: 'blob',
          sha: null,
        })
        pushedFiles.push(`deleted: ${remotePath}`)
      }
    }

    // 3. Create Git Tree on top of verifySha
    const treeRes = await fetch(
      `${this.customApiBaseUrl}/repos/${encodeURIComponent(options.owner)}/${encodeURIComponent(options.repo)}/git/trees`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${creds.accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'AnotherMe-App/1.0',
        },
        body: JSON.stringify({
          tree: treeItems,
          base_tree: verifySha,
        }),
      }
    )

    if (!treeRes.ok) {
      this.handleGitHubApiError(treeRes.status, await treeRes.text())
    }

    const newTreeData: any = await treeRes.json()

    // 4. Create Commit against latest remote SHA
    const commitRes = await fetch(
      `${this.customApiBaseUrl}/repos/${encodeURIComponent(options.owner)}/${encodeURIComponent(options.repo)}/git/commits`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${creds.accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'AnotherMe-App/1.0',
        },
        body: JSON.stringify({
          message: commitMessage,
          tree: newTreeData.sha,
          parents: [verifySha],
        }),
      }
    )

    if (!commitRes.ok) {
      this.handleGitHubApiError(commitRes.status, await commitRes.text())
    }

    const newCommitData: any = await commitRes.json()

    // 5. Update Branch Reference strictly with force: false
    const updateRefRes = await fetch(
      `${this.customApiBaseUrl}/repos/${encodeURIComponent(options.owner)}/${encodeURIComponent(options.repo)}/git/refs/heads/${encodeURIComponent(options.branch)}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${creds.accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'AnotherMe-App/1.0',
        },
        body: JSON.stringify({
          sha: newCommitData.sha,
          force: false,
        }),
      }
    )

    if (!updateRefRes.ok) {
      const errText = await updateRefRes.text()
      if (updateRefRes.status === 422 || updateRefRes.status === 409 || errText.includes('fast forward')) {
        const raceRefRes = await fetch(
          `${this.customApiBaseUrl}/repos/${encodeURIComponent(options.owner)}/${encodeURIComponent(options.repo)}/git/ref/heads/${encodeURIComponent(options.branch)}`,
          {
            headers: {
              Authorization: `Bearer ${creds.accessToken}`,
              Accept: 'application/vnd.github.v3+json',
              'User-Agent': 'AnotherMe-App/1.0',
            },
          }
        )
        const raceData: any = await raceRefRes.json().catch(() => ({}))
        const raceSha = raceData.object?.sha || 'unknown'
        const conflictDetails = await this.buildPushConflictDetails(
          userId,
          projectId,
          options.owner,
          options.repo,
          options.branch,
          verifySha,
          raceSha,
          creds,
          'NON_FAST_FORWARD'
        )
        throw new GitHubError(
          `Push rejected: Remote branch "${options.branch}" has diverged. Fetch latest changes to resolve push conflict.`,
          409,
          'GITHUB_PUSH_CONFLICT',
          conflictDetails
        )
      }
      this.handleGitHubApiError(updateRefRes.status, errText)
    }

    return {
      success: true,
      commitSha: newCommitData.sha,
      commitUrl: `${this.customOAuthBaseUrl}/${options.owner}/${options.repo}/commit/${newCommitData.sha}`,
      branch: options.branch,
      pushedFiles,
      timestamp: new Date().toISOString(),
    }
  }

  /**
   * Helper to validate repository owner and name
   */
  private validateRepoParams(owner: string, repo: string) {
    const ownerName = (owner || '').trim()
    const repoName = (repo || '').trim()
    const pattern = /^[a-zA-Z0-9_.-]{1,100}$/
    if (!ownerName || !pattern.test(ownerName) || !repoName || !pattern.test(repoName)) {
      throw new GitHubError('Invalid owner or repository name format.', 400, 'INVALID_REPO_NAME')
    }
  }

  /**
   * Helper to validate branch name
   */
  private validateBranchName(branch: string) {
    const b = (branch || '').trim()
    const branchPattern = /^[a-zA-Z0-9/_.-]{1,100}$/
    if (!b || !branchPattern.test(b) || b.includes('..')) {
      throw new GitHubError(`Invalid branch name "${branch}".`, 400, 'INVALID_BRANCH_NAME')
    }
  }

  /**
   * Unified error handler for GitHub API calls
   */
  private handleGitHubApiError(statusCode: number, responseBody: string) {
    const cleanBody = redactGitHubSecrets(responseBody)
    if (statusCode === 401) {
      throw new GitHubError('GitHub authentication expired or token revoked.', 401, 'GITHUB_AUTH_EXPIRED')
    }
    if (statusCode === 403) {
      if (cleanBody.toLowerCase().includes('rate limit')) {
        throw new GitHubError('GitHub API rate limit exceeded.', 403, 'GITHUB_RATE_LIMITED')
      }
      throw new GitHubError('GitHub API access forbidden: Insufficient repository permissions.', 403, 'GITHUB_FORBIDDEN')
    }
    if (statusCode === 404) {
      throw new GitHubError('Requested repository, branch, or resource was not found on GitHub.', 404, 'GITHUB_NOT_FOUND')
    }
    if (statusCode === 409) {
      throw new GitHubError('Push conflict detected on remote repository.', 409, 'GITHUB_PUSH_CONFLICT')
    }
    throw new GitHubError(
      `GitHub API request failed with HTTP ${statusCode}: ${cleanBody}`,
      statusCode >= 400 && statusCode < 500 ? statusCode : 502,
      'GITHUB_API_ERROR'
    )
  }
}

export const githubManager = new SafeGitHubManager()
