// ====================================================================
// ANOTHER ME — SECTION 2: SAFE FILE OPERATIONS ENGINE
// Implements secure, contained filesystem tools for the coding agent.
// Enforces atomic writes, size limits, diff tracking, and path isolation.
// ====================================================================

import fs from 'fs'
import path from 'path'
import { workspaceManager } from './workspaceManager'
import type { WorkspaceFileEntry, FileChangeRecord } from './types'

const MAX_FILE_READ_BYTES = 5 * 1024 * 1024 // 5 MB
const MAX_FILE_WRITE_BYTES = 10 * 1024 * 1024 // 10 MB

export class FileOperationError extends Error {
  statusCode: number
  code: string

  constructor(message: string, statusCode: number = 400, code: string = 'FILE_OPERATION_FAILED') {
    super(message)
    this.name = 'FileOperationError'
    this.statusCode = statusCode
    this.code = code
  }
}

function computeSimpleDiff(oldContent: string, newContent: string): { additions: number; deletions: number; diff: string } {
  const oldLines = oldContent ? oldContent.split('\n') : []
  const newLines = newContent ? newContent.split('\n') : []

  // Simple line diff estimation
  const oldSet = new Set(oldLines)
  const newSet = new Set(newLines)

  let additions = 0
  let deletions = 0

  newLines.forEach((l) => {
    if (!oldSet.has(l)) additions++
  })

  oldLines.forEach((l) => {
    if (!newSet.has(l)) deletions++
  })

  // Format minimal readable diff summary
  const snippet = newLines.slice(0, 30).map((l) => `+ ${l}`).join('\n')
  const diff = additions === 0 && deletions === 0
    ? 'No content changes'
    : `@@ -1,${oldLines.length} +1,${newLines.length} @@\n${snippet}${newLines.length > 30 ? '\n... (truncated)' : ''}`

  return { additions, deletions, diff }
}

export class SafeFileOperations {
  /**
   * List all files in the workspace recursively.
   * Returns workspace-relative paths only.
   */
  async listFiles(workspaceRoot: string, subDir: string = ''): Promise<WorkspaceFileEntry[]> {
    const targetDir = subDir ? workspaceManager.resolveAndValidatePath(workspaceRoot, subDir) : workspaceRoot
    const entries: WorkspaceFileEntry[] = []

    if (!fs.existsSync(targetDir)) return entries

    const walk = (currentDir: string) => {
      const dirEntries = fs.readdirSync(currentDir, { withFileTypes: true })
      for (const item of dirEntries) {
        if (
          item.name === 'node_modules' ||
          item.name.startsWith('.git') ||
          item.name === '.workspace_meta.json' ||
          item.name === '.workspace_changes.jsonl' ||
          item.name === '.terminal' ||
          item.name.startsWith('.terminal')
        ) {
          continue
        }

        const fullPath = path.join(currentDir, item.name)
        const relPath = path.relative(workspaceRoot, fullPath).replace(/\\/g, '/')
        const isDir = item.isDirectory()

        let size = 0
        let updatedAt = new Date().toISOString()
        try {
          const stats = fs.statSync(fullPath)
          size = isDir ? 0 : stats.size
          updatedAt = stats.mtime.toISOString()
        } catch {}

        entries.push({
          relativePath: relPath,
          name: item.name,
          size,
          isDirectory: isDir,
          updatedAt,
          extension: isDir ? '' : path.extname(item.name).toLowerCase(),
        })

        if (isDir) {
          walk(fullPath)
        }
      }
    }

    walk(targetDir)
    entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
    return entries
  }

  /**
   * Read file content with strict path validation and size limits.
   */
  async readFile(workspaceRoot: string, relativePath: string, maxBytes: number = MAX_FILE_READ_BYTES): Promise<{ content: string; size: number }> {
    const targetPath = workspaceManager.resolveAndValidatePath(workspaceRoot, relativePath)

    if (!fs.existsSync(targetPath)) {
      throw new FileOperationError(`File not found: "${relativePath}"`, 404, 'FILE_NOT_FOUND')
    }

    const stats = fs.statSync(targetPath)
    if (stats.isDirectory()) {
      throw new FileOperationError(`Path is a directory, not a file: "${relativePath}"`, 400, 'IS_DIRECTORY')
    }

    if (stats.size > maxBytes) {
      throw new FileOperationError(
        `File size (${stats.size} bytes) exceeds safety read limit (${maxBytes} bytes).`,
        413,
        'FILE_TOO_LARGE'
      )
    }

    const content = fs.readFileSync(targetPath, 'utf-8')
    return { content, size: stats.size }
  }

  /**
   * Write file atomically with safety containment.
   * Creates parent directories automatically.
   */
  async writeFile(
    workspaceRoot: string,
    relativePath: string,
    content: string | Record<string, any>,
    maxBytes: number = MAX_FILE_WRITE_BYTES
  ): Promise<FileChangeRecord> {
    const targetPath = workspaceManager.resolveAndValidatePath(workspaceRoot, relativePath)
    const normalizedRelPath = relativePath.replace(/\\/g, '/').replace(/^\/+/, '')

    const contentStr = typeof content === 'object' && content !== null
      ? JSON.stringify(content, null, 2)
      : String(content ?? '')

    const buffer = Buffer.from(contentStr, 'utf-8')
    if (buffer.length > maxBytes) {
      throw new FileOperationError(
        `Content size (${buffer.length} bytes) exceeds safety write limit (${maxBytes} bytes).`,
        413,
        'CONTENT_TOO_LARGE'
      )
    }

    const parentDir = path.dirname(targetPath)
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true })
    }

    let action: 'created' | 'modified' = 'created'
    let previousSize = 0
    let oldContent = ''

    if (fs.existsSync(targetPath)) {
      action = 'modified'
      try {
        previousSize = fs.statSync(targetPath).size
        oldContent = fs.readFileSync(targetPath, 'utf-8')
      } catch {}
    }

    // Symlink escape defense: verify targetPath is not an escaping symbolic link
    try {
      if (fs.existsSync(targetPath)) {
        const lstat = fs.lstatSync(targetPath)
        if (lstat.isSymbolicLink()) {
          const realTarget = fs.realpathSync(targetPath)
          const canonicalRoot = fs.realpathSync(workspaceRoot)
          const rel = path.relative(canonicalRoot, realTarget)
          if (rel.startsWith('..') || path.isAbsolute(rel)) {
            throw new FileOperationError(
              `Symlink escape detected: Writing to symlink "${relativePath}" targeting "${realTarget}" outside workspace is prohibited.`,
              403,
              'SYMLINK_ESCAPE_DETECTED'
            )
          }
        }
      }
    } catch (e: any) {
      if (e instanceof FileOperationError) throw e
    }

    // Atomic write via temporary file with TOCTOU parent re-verification
    const tempFile = path.join(parentDir, `.${path.basename(targetPath)}__tmp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`)
    try {
      fs.writeFileSync(tempFile, buffer)
      // Re-verify that parent directory has not been replaced with a symlink before renaming
      const canonicalRoot = fs.realpathSync(workspaceRoot)
      const currentRealParent = fs.realpathSync(parentDir)
      const relParent = path.relative(canonicalRoot, currentRealParent)
      if (relParent.startsWith('..') || path.isAbsolute(relParent)) {
        throw new FileOperationError(
          `TOCTOU containment breach: Parent directory escaped workspace root during write.`,
          403,
          'PATH_TRAVERSAL_DETECTED'
        )
      }
      fs.renameSync(tempFile, targetPath)
    } catch (err: any) {
      if (fs.existsSync(tempFile)) {
        try { fs.unlinkSync(tempFile) } catch {}
      }
      if (err instanceof FileOperationError) throw err
      throw new FileOperationError(`Atomic write failed: ${err.message}`, 500, 'WRITE_ERROR')
    }

    const { additions, deletions, diff } = computeSimpleDiff(oldContent, contentStr)

    const changeRecord: FileChangeRecord = {
      relativePath: normalizedRelPath,
      path: normalizedRelPath,
      action,
      previousSize: action === 'modified' ? previousSize : undefined,
      currentSize: buffer.length,
      timestamp: new Date().toISOString(),
      diff,
      additions,
      deletions,
    }

    this.recordChange(workspaceRoot, changeRecord)
    return changeRecord
  }

  /**
   * Patch file content by replacing an exact chunk of text.
   */
  async patchFile(
    workspaceRoot: string,
    relativePath: string,
    searchContent: string,
    replaceContent: string
  ): Promise<FileChangeRecord> {
    const { content: currentContent } = await this.readFile(workspaceRoot, relativePath)

    if (!currentContent.includes(searchContent)) {
      throw new FileOperationError(
        `Patch target content was not found in file "${relativePath}".`,
        400,
        'PATCH_TARGET_NOT_FOUND'
      )
    }

    const occurrences = currentContent.split(searchContent).length - 1
    if (occurrences > 1) {
      throw new FileOperationError(
        `Search target matches multiple occurrences (${occurrences}) in "${relativePath}". Please specify a more unique block.`,
        400,
        'AMBIGUOUS_PATCH_TARGET'
      )
    }

    const newContent = currentContent.replace(searchContent, replaceContent)
    return this.writeFile(workspaceRoot, relativePath, newContent)
  }

  /**
   * Delete file safely with containment verification.
   */
  async deleteFile(workspaceRoot: string, relativePath: string): Promise<FileChangeRecord> {
    const targetPath = workspaceManager.resolveAndValidatePath(workspaceRoot, relativePath)
    const normalizedRelPath = relativePath.replace(/\\/g, '/').replace(/^\/+/, '')

    if (targetPath === workspaceRoot || normalizedRelPath === '' || normalizedRelPath === '.') {
      throw new FileOperationError('Cannot delete workspace root directory.', 400, 'ROOT_DELETION_FORBIDDEN')
    }

    if (normalizedRelPath === '.workspace_meta.json' || normalizedRelPath === '.workspace_changes.jsonl') {
      throw new FileOperationError('Cannot delete workspace internal metadata files.', 403, 'INTERNAL_FILE_PROTECTED')
    }

    if (!fs.existsSync(targetPath)) {
      throw new FileOperationError(`File not found for deletion: "${relativePath}"`, 404, 'FILE_NOT_FOUND')
    }

    let previousSize = 0
    try {
      previousSize = fs.statSync(targetPath).size
    } catch {}

    const isDir = fs.statSync(targetPath).isDirectory()
    if (isDir) {
      fs.rmSync(targetPath, { recursive: true, force: true })
    } else {
      fs.unlinkSync(targetPath)
    }

    const changeRecord: FileChangeRecord = {
      relativePath: normalizedRelPath,
      path: normalizedRelPath,
      action: 'deleted',
      previousSize,
      currentSize: 0,
      timestamp: new Date().toISOString(),
      diff: `- [Deleted ${isDir ? 'directory' : 'file'}: ${normalizedRelPath}]`,
      additions: 0,
      deletions: 1,
    }

    this.recordChange(workspaceRoot, changeRecord)
    return changeRecord
  }

  /**
   * Persists change event to `.workspace_changes.jsonl`
   */
  private recordChange(workspaceRoot: string, change: FileChangeRecord): void {
    try {
      const changesFile = path.join(workspaceRoot, '.workspace_changes.jsonl')
      fs.appendFileSync(changesFile, JSON.stringify(change) + '\n', 'utf-8')
    } catch {}
  }

  /**
   * Retrieves all recorded file changes for a workspace.
   */
  getChanges(workspaceRoot: string): FileChangeRecord[] {
    const changesFile = path.join(workspaceRoot, '.workspace_changes.jsonl')
    if (!fs.existsSync(changesFile)) return []

    const lines = fs.readFileSync(changesFile, 'utf-8').split('\n').filter(Boolean)
    const changes: FileChangeRecord[] = []
    for (const line of lines) {
      try {
        changes.push(JSON.parse(line))
      } catch {}
    }
    return changes
  }

  /**
   * Generates a readable unified diff between two string contents.
   */
  createUnifiedDiff(oldContent: string, newContent: string, filePath: string = 'file'): string {
    const oldLines = oldContent ? oldContent.split('\n') : []
    const newLines = newContent ? newContent.split('\n') : []

    const header = `--- a/${filePath}\n+++ b/${filePath}\n@@ -1,${Math.max(1, oldLines.length)} +1,${Math.max(1, newLines.length)} @@`
    
    const lines: string[] = [header]
    const maxPreview = 40
    let count = 0

    const oldSet = new Set(oldLines)
    const newSet = new Set(newLines)

    for (const l of oldLines) {
      if (!newSet.has(l)) {
        lines.push(`-${l}`)
        count++
        if (count >= maxPreview) break
      }
    }
    for (const l of newLines) {
      if (!oldSet.has(l)) {
        lines.push(`+${l}`)
        count++
        if (count >= maxPreview) break
      }
    }

    if (lines.length === 1) {
      lines.push(` ${newLines[0] || ''}`)
    }

    return lines.join('\n')
  }
}

export const safeFileOperations = new SafeFileOperations()
export const fileOperations = safeFileOperations
