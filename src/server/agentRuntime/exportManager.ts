// ====================================================================
// ANOTHER ME — SECTION 8: SAFE PROJECT EXPORT MANAGER
// Generates clean, secure downloadable ZIP archives of workspaces.
// Strictly excludes credentials, runtime databases, tokens, logs, caches,
// detects symlink escapes and path traversal, and validates archive integrity.
// ====================================================================

import fs from 'fs'
import path from 'path'
import JSZip from 'jszip'
import { workspaceManager } from './workspaceManager'
import type { ExportInspectionResult, ExportArchiveValidation } from './types'

export class ExportError extends Error {
  statusCode: number
  code: string

  constructor(message: string, statusCode: number = 400, code: string = 'EXPORT_ERROR') {
    super(message)
    this.name = 'ExportError'
    this.statusCode = statusCode
    this.code = code
  }
}

// Patterns of files that must be excluded by default
const DEFAULT_EXCLUDE_PATTERNS = [
  { pattern: /(^|\/)node_modules(\/|$)/i, reason: 'dependency_cache' },
  { pattern: /(^|\/)\.git(\/|$)/i, reason: 'git_internals' },
  { pattern: /(^|\/)\.workspace_/i, reason: 'internal_metadata' },
  { pattern: /(^|\/)\.terminal(\/|$)/i, reason: 'terminal_session_state' },
  { pattern: /(^|\/)\.cache(\/|$)/i, reason: 'build_cache' },
  { pattern: /(^|\/)\.env(\..+)?$/i, reason: 'environment_credentials' },
  { pattern: /(^|\/)\.env(\/|$)/i, reason: 'environment_credentials' },
  { pattern: /\.(db|sqlite|sqlite3|mdb)$/i, reason: 'runtime_database' },
  { pattern: /\.log$/i, reason: 'runtime_log' },
  { pattern: /(\.DS_Store|Thumbs\.db)$/i, reason: 'os_system_file' },
  { pattern: /(^|\/)\.npmrc$/i, reason: 'npm_credentials' },
  { pattern: /(^|\/)\.docker(\/|$)/i, reason: 'docker_credentials' },
  { pattern: /(^|\/)\.ssh(\/|$)/i, reason: 'ssh_credentials' },
  { pattern: /(^|\/)\.aws(\/|$)/i, reason: 'cloud_credentials' },
  { pattern: /(^|\/)\.azure(\/|$)/i, reason: 'cloud_credentials' },
  { pattern: /(^|\/)\.gcloud(\/|$)/i, reason: 'cloud_credentials' },
  { pattern: /service[-_]account.*\.json$/i, reason: 'cloud_credentials' },
  { pattern: /(id_rsa|\.pem|\.key|\.cert|\.crt)$/i, reason: 'private_key_or_certificate' },
]

// Secret detection regexes for warning about hardcoded secrets in source files
const SECRET_DETECTION_RULES = [
  { id: 'SEC_PRIVATE_KEY', regex: /-----BEGIN\s+(RSA|OPENSSH|DSA|EC|PGP)?\s*PRIVATE KEY-----/, name: 'Private Key' },
  { id: 'SEC_AWS_KEY', regex: /(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/, name: 'AWS Access Key' },
  { id: 'SEC_GITHUB_TOKEN', regex: /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,255}/, name: 'GitHub Token' },
  { id: 'SEC_STRIPE_KEY', regex: /(?:sk|pk)_(?:test|live)_[0-9a-zA-Z]{24,99}/, name: 'Stripe API Key' },
  { id: 'SEC_GENERIC_SECRET', regex: /(?:api_key|apikey|secret_key|client_secret)\s*[:=]\s*["'][a-zA-Z0-9_\-]{16,}["']/i, name: 'API Secret' },
]

export class SafeExportManager {
  /**
   * Determine if a relative path matches any exclusion rule
   */
  shouldExclude(relPath: string, customExclusions: string[] = []): { exclude: boolean; reason: string } {
    const normalized = relPath.replace(/\\/g, '/').replace(/^\/+/, '')

    // Check custom exclusions
    for (const custom of customExclusions) {
      if (normalized === custom || normalized.startsWith(`${custom}/`)) {
        return { exclude: true, reason: 'user_custom_exclusion' }
      }
    }

    // Check standard exclusion patterns
    for (const rule of DEFAULT_EXCLUDE_PATTERNS) {
      if (rule.pattern.test(normalized)) {
        return { exclude: true, reason: rule.reason }
      }
    }

    return { exclude: false, reason: '' }
  }

  /**
   * Inspect workspace files for export: lists included/excluded files and potential secret warnings
   */
  async inspectExport(
    projectId: string,
    userId: string,
    customExclusions: string[] = []
  ): Promise<ExportInspectionResult> {
    const workspaceRoot = workspaceManager.getWorkspaceRoot(userId, projectId)
    if (!fs.existsSync(workspaceRoot)) {
      throw new ExportError(`Workspace root not found for project ${projectId}`, 404, 'WORKSPACE_NOT_FOUND')
    }

    const allFiles = this.walkWorkspaceSync(workspaceRoot)
    const includedFiles: string[] = []
    const excludedFiles: { path: string; reason: string }[] = []
    const secretWarnings: string[] = []
    let estimatedSizeBytes = 0

    for (const item of allFiles) {
      const relPath = item.relativePath

      // Verify symlink escape
      if (item.isSymlink) {
        if (!this.verifySymlinkTarget(workspaceRoot, item.fullPath)) {
          excludedFiles.push({ path: relPath, reason: 'symlink_escape_blocked' })
          continue
        }
      }

      // Scan text files for hardcoded secrets
      if (this.isTextFile(relPath, item.fullPath) && item.size < 2 * 1024 * 1024) {
        try {
          const content = fs.readFileSync(item.fullPath, 'utf-8')
          for (const secRule of SECRET_DETECTION_RULES) {
            if (secRule.regex.test(content)) {
              secretWarnings.push(`[${secRule.id}] File "${relPath}" appears to contain a hardcoded ${secRule.name}.`)
              break
            }
          }
        } catch {}
      }

      const exclusionCheck = this.shouldExclude(relPath, customExclusions)
      if (exclusionCheck.exclude) {
        excludedFiles.push({ path: relPath, reason: exclusionCheck.reason })
        continue
      }

      // File is included
      includedFiles.push(relPath)
      estimatedSizeBytes += item.size
    }

    return {
      projectId,
      totalFiles: allFiles.length,
      includedFiles,
      excludedFiles,
      secretWarnings,
      estimatedSizeBytes,
      timestamp: new Date().toISOString(),
    }
  }

  /**
   * Generate downloadable ZIP buffer for project export
   */
  async generateExportZip(
    projectId: string,
    userId: string,
    options: {
      customExclusions?: string[]
      projectName?: string
    } = {}
  ): Promise<{ buffer: Buffer; filename: string; manifest: ExportInspectionResult }> {
    const manifest = await this.inspectExport(projectId, userId, options.customExclusions || [])
    const workspaceRoot = workspaceManager.getWorkspaceRoot(userId, projectId)

    // Enforce maximum allowable export size (100MB) to prevent server OOM
    const MAX_EXPORT_SIZE_BYTES = 100 * 1024 * 1024
    if (manifest.estimatedSizeBytes > MAX_EXPORT_SIZE_BYTES) {
      throw new ExportError(
        `Project workspace (${(manifest.estimatedSizeBytes / (1024 * 1024)).toFixed(1)}MB) exceeds maximum allowable export archive size of 100MB.`,
        413,
        'PROJECT_TOO_LARGE'
      )
    }

    const zip = new JSZip()

    for (const relPath of manifest.includedFiles) {
      // Validate path containment and prevent path traversal
      const validatedFullPath = workspaceManager.resolveAndValidatePath(workspaceRoot, relPath)

      // Ensure normalized entry path doesn't contain traversal
      const normalizedEntry = relPath.replace(/\\/g, '/').replace(/^\/+/, '')
      if (normalizedEntry.includes('..') || normalizedEntry.startsWith('/')) {
        throw new ExportError(`Malicious archive entry path detected: "${relPath}"`, 400, 'PATH_TRAVERSAL_DETECTED')
      }

      try {
        const fileData = fs.readFileSync(validatedFullPath)
        zip.file(normalizedEntry, fileData)
      } catch (err: any) {
        throw new ExportError(`Failed to read file "${relPath}" for archive: ${err.message}`, 500, 'ARCHIVE_READ_FAILED')
      }
    }

    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    })

    const safeName = (options.projectName || projectId)
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'project'
    const filename = `${safeName}-export.zip`

    return {
      buffer: zipBuffer,
      filename,
      manifest,
    }
  }

  /**
   * Validate exported archive buffer: verifies integrity, entry paths, package.json
   */
  async validateExportArchive(buffer: Buffer): Promise<ExportArchiveValidation> {
    const errors: string[] = []
    let entryCount = 0
    let hasPackageJson = false
    let hasTraversalErrors = false

    try {
      const zip = await JSZip.loadAsync(buffer)
      const entries = Object.keys(zip.files)
      entryCount = entries.length

      if (entryCount === 0) {
        errors.push('Archive is empty; contains 0 files.')
      }

      for (const entryName of entries) {
        if (entryName.includes('..') || entryName.startsWith('/') || entryName.startsWith('\\')) {
          hasTraversalErrors = true
          errors.push(`Archive contains forbidden path traversal entry: "${entryName}"`)
        }

        if (entryName === 'package.json') {
          hasPackageJson = true
          try {
            const content = await zip.files[entryName].async('text')
            JSON.parse(content)
          } catch {
            errors.push('Archive package.json is corrupt or invalid JSON.')
          }
        }
      }
    } catch (err: any) {
      errors.push(`ZIP archive parsing error: ${err.message}`)
    }

    return {
      valid: errors.length === 0,
      entryCount,
      hasPackageJson,
      hasTraversalErrors,
      errors,
    }
  }

  /**
   * Synchronously walk workspace files recursively
   */
  private walkWorkspaceSync(root: string): { relativePath: string; fullPath: string; size: number; isSymlink: boolean }[] {
    const results: { relativePath: string; fullPath: string; size: number; isSymlink: boolean }[] = []

    const walk = (currentDir: string) => {
      let entries: fs.Dirent[] = []
      try {
        entries = fs.readdirSync(currentDir, { withFileTypes: true })
      } catch {
        return
      }

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name)
        const relPath = path.relative(root, fullPath).replace(/\\/g, '/')

        let isSymlink = false
        try {
          const lstat = fs.lstatSync(fullPath)
          isSymlink = lstat.isSymbolicLink()
        } catch {}

        if (entry.isDirectory()) {
          // If directory is an excluded directory like node_modules or .git, skip descending
          if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.terminal') {
            results.push({ relativePath: relPath, fullPath, size: 0, isSymlink })
            continue
          }
          walk(fullPath)
        } else {
          let size = 0
          try {
            const stat = fs.statSync(fullPath)
            size = stat.size
          } catch {}
          results.push({ relativePath: relPath, fullPath, size, isSymlink })
        }
      }
    }

    walk(root)
    return results
  }

  /**
   * Verify symlink target is contained within the workspace root
   */
  private verifySymlinkTarget(workspaceRoot: string, symlinkPath: string): boolean {
    try {
      const realTarget = fs.realpathSync(symlinkPath)
      const canonicalRoot = fs.realpathSync(workspaceRoot)
      const rel = path.relative(canonicalRoot, realTarget)
      return !rel.startsWith('..') && !path.isAbsolute(rel)
    } catch {
      return false
    }
  }

  /**
   * Check if file is likely a text file based on extension, name, or null-byte absence
   */
  private isTextFile(filePath: string, fullPath?: string): boolean {
    const base = path.basename(filePath).toLowerCase()
    if (base.startsWith('.env')) return true
    if (['credentials', 'id_rsa', 'secret', 'secrets', 'keys', 'token', 'auth'].includes(base)) return true

    const ext = path.extname(filePath).toLowerCase()
    const textExtensions = new Set([
      '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
      '.json', '.html', '.css', '.scss', '.md', '.txt',
      '.env', '.yaml', '.yml', '.svg', '.xml', '.toml', '.ini',
      '.local', '.example', '.template', '.cfg', '.conf', '.properties', '.sh'
    ])
    if (textExtensions.has(ext)) return true

    // Inspect content for absence of binary null bytes
    if (fullPath && fs.existsSync(fullPath)) {
      try {
        const buf = Buffer.alloc(512)
        const fd = fs.openSync(fullPath, 'r')
        const bytesRead = fs.readSync(fd, buf, 0, 512, 0)
        fs.closeSync(fd)
        for (let i = 0; i < bytesRead; i++) {
          if (buf[i] === 0) return false
        }
        return bytesRead > 0
      } catch {}
    }

    return false
  }
}

export const exportManager = new SafeExportManager()
