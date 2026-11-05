// ====================================================================
// ANOTHER ME — SECTION 2: ISOLATED WORKSPACE MANAGER
// Manages dedicated, isolated workspaces per authenticated user and project.
// Guarantees strict path containment, symlink escape rejection,
// and safe workspace lifecycle management.
// ====================================================================

import fs from 'fs'
import path from 'path'
import type { WorkspaceMetadata } from './types'
import { scaffoldCanonicalProjectWorkspace } from './projectScaffolder'

const CANONICAL_ROOT = path.resolve(process.cwd(), 'storage', 'workspaces')

function sanitizeId(id: string): string {
  if (!id || typeof id !== 'string') return 'default'
  return id.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 80)
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

export class WorkspaceSecurityError extends Error {
  statusCode: number
  code: string

  constructor(message: string, statusCode: number = 403, code: string = 'PATH_TRAVERSAL_DETECTED') {
    super(message)
    this.name = 'WorkspaceSecurityError'
    this.statusCode = statusCode
    this.code = code
  }
}

export class WorkspaceManager {
  private baseDir: string

  constructor(baseDir: string = CANONICAL_ROOT) {
    this.baseDir = path.resolve(baseDir)
    ensureDir(this.baseDir)
  }

  /**
   * Returns canonical disk path for a user's project workspace.
   */
  getWorkspaceRoot(userId: string, projectId: string): string {
    const safeUser = sanitizeId(userId)
    const safeProject = sanitizeId(projectId)
    const root = path.resolve(this.baseDir, safeUser, safeProject)
    return root
  }

  /**
   * Strictly validates that a target relative path is contained within the workspace root.
   * Defends against directory traversal ('../'), encoded traversal ('%2e%2e'), absolute paths,
   * Windows drive letters, alternate data streams, and symlink escapes (for existing and non-existing paths).
   */
  resolveAndValidatePath(workspaceRoot: string, relativePath: string): string {
    if (!relativePath || typeof relativePath !== 'string') {
      throw new WorkspaceSecurityError('Invalid path: Relative path cannot be empty.', 400, 'INVALID_PATH')
    }

    // 1. Multi-pass URI decode to prevent double/triple-encoded traversal attacks
    let decoded = relativePath
    for (let i = 0; i < 3; i++) {
      try {
        const next = decodeURIComponent(decoded)
        if (next === decoded) break
        decoded = next
      } catch {
        break
      }
    }

    // 2. Reject null bytes and illegal control characters
    if (decoded.includes('\0') || /[\x00-\x1f\x7f]/.test(decoded)) {
      throw new WorkspaceSecurityError('Path contains illegal control characters or null bytes.', 400, 'ILLEGAL_CHARACTERS')
    }

    // 3. Reject Windows Alternate Data Streams (e.g. file.txt:secret, file::$DATA) and illegal colons
    if (decoded.includes(':')) {
      throw new WorkspaceSecurityError('Alternate data streams or colons in paths are strictly prohibited.', 400, 'ILLEGAL_PATH')
    }

    // 4. Reject absolute paths, UNC network shares, and Windows drive-letter paths upfront
    if (
      path.isAbsolute(decoded) ||
      /^[a-zA-Z]:[/\\]/.test(decoded) ||
      decoded.startsWith('//') ||
      decoded.startsWith('\\\\') ||
      /^[a-zA-Z]:$/.test(decoded)
    ) {
      throw new WorkspaceSecurityError(
        `Security containment breach: Absolute or drive-qualified paths are forbidden ("${relativePath}").`,
        403,
        'PATH_TRAVERSAL_DETECTED'
      )
    }

    // 5. Clean relative path (convert backslashes, remove leading slashes)
    const normalized = decoded.replace(/\\/g, '/').replace(/^\/+/, '')
    const canonicalRoot = path.resolve(workspaceRoot)
    const resolved = path.resolve(canonicalRoot, normalized)

    // 6. Non-prefix boundary containment check via path.relative
    const relFromRoot = path.relative(canonicalRoot, resolved)
    if (
      relFromRoot.startsWith('..') ||
      path.isAbsolute(relFromRoot) ||
      relFromRoot === '..' ||
      resolved === path.dirname(canonicalRoot)
    ) {
      throw new WorkspaceSecurityError(
        `Security containment breach: Path "${relativePath}" escapes workspace root.`,
        403,
        'PATH_TRAVERSAL_DETECTED'
      )
    }

    // 7. Symlink escape defense for existing targets AND ancestor directories (for new files)
    const realRoot = fs.existsSync(canonicalRoot) ? fs.realpathSync(canonicalRoot) : canonicalRoot

    if (fs.existsSync(resolved)) {
      try {
        const realTarget = fs.realpathSync(resolved)
        const realRel = path.relative(realRoot, realTarget)
        if (realRel.startsWith('..') || path.isAbsolute(realRel)) {
          throw new WorkspaceSecurityError(
            `Symlink escape detected: "${relativePath}" resolves to "${realTarget}" outside workspace root.`,
            403,
            'SYMLINK_ESCAPE_DETECTED'
          )
        }
      } catch (err: any) {
        if (err instanceof WorkspaceSecurityError) throw err
      }
    } else {
      // For paths that do not exist yet, verify closest existing ancestor directory
      let ancestor = path.dirname(resolved)
      while (!fs.existsSync(ancestor) && ancestor !== canonicalRoot && path.dirname(ancestor) !== ancestor) {
        ancestor = path.dirname(ancestor)
      }
      if (fs.existsSync(ancestor)) {
        try {
          const realAncestor = fs.realpathSync(ancestor)
          const realRel = path.relative(realRoot, realAncestor)
          if (realRel.startsWith('..') || path.isAbsolute(realRel)) {
            throw new WorkspaceSecurityError(
              `Symlink escape detected: Parent directory of "${relativePath}" resolves to "${realAncestor}" outside workspace root.`,
              403,
              'SYMLINK_ESCAPE_DETECTED'
            )
          }
        } catch (err: any) {
          if (err instanceof WorkspaceSecurityError) throw err
        }
      }
    }

    return resolved
  }

  /**
   * Initializes or reopens a workspace for an authenticated user and project.
   * Idempotent: Preserves existing source files and state on refresh/re-mount.
   */
  async getOrCreateWorkspace(userId: string, projectId: string): Promise<WorkspaceMetadata> {
    const workspaceRoot = this.getWorkspaceRoot(userId, projectId)
    ensureDir(workspaceRoot)

    const metaFile = path.join(workspaceRoot, '.workspace_meta.json')
    const now = new Date().toISOString()

    let metadata: WorkspaceMetadata
    const isNew = !fs.existsSync(metaFile)
    if (fs.existsSync(metaFile)) {
      try {
        metadata = JSON.parse(fs.readFileSync(metaFile, 'utf-8'))
        metadata.updatedAt = now
      } catch {
        metadata = {
          userId,
          projectId,
          canonicalRoot: workspaceRoot,
          createdAt: now,
          updatedAt: now,
          fileCount: 0,
          totalBytes: 0,
        }
      }
    } else {
      metadata = {
        userId,
        projectId,
        canonicalRoot: workspaceRoot,
        createdAt: now,
        updatedAt: now,
        fileCount: 0,
        totalBytes: 0,
      }
    }

    // Auto-scaffold standard multi-folder architecture for fresh workspace
    if (isNew || metadata.fileCount === 0) {
      await scaffoldCanonicalProjectWorkspace(workspaceRoot, {
        name: projectId,
      })
    }

    // Update stats
    const stats = this.computeStats(workspaceRoot)
    metadata.fileCount = stats.count
    metadata.totalBytes = stats.bytes

    fs.writeFileSync(metaFile, JSON.stringify(metadata, null, 2), 'utf-8')
    return metadata
  }

  /**
   * Computes file count and total size within workspace, ignoring metadata and node_modules.
   */
  private computeStats(workspaceRoot: string): { count: number; bytes: number } {
    let count = 0
    let bytes = 0

    const scan = (dir: string) => {
      if (!fs.existsSync(dir)) return
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.git') || entry.name === '.workspace_meta.json') {
          continue
        }
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          scan(full)
        } else if (entry.isFile()) {
          count++
          try {
            bytes += fs.statSync(full).size
          } catch {}
        }
      }
    }

    scan(workspaceRoot)
    return { count, bytes }
  }

  /**
   * Checks if workspace exists for given user and project.
   */
  workspaceExists(userId: string, projectId: string): boolean {
    const root = this.getWorkspaceRoot(userId, projectId)
    return fs.existsSync(root)
  }

  /**
   * Cleans up / deletes workspace files safely.
   */
  async deleteWorkspace(userId: string, projectId: string): Promise<boolean> {
    const root = this.getWorkspaceRoot(userId, projectId)
    if (fs.existsSync(root)) {
      fs.rmSync(root, { recursive: true, force: true })
      return true
    }
    return false
  }
}

export const workspaceManager = new WorkspaceManager()
