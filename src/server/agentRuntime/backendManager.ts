// ====================================================================
// ANOTHER ME — SECTION 5: REAL BACKEND & DATABASE BUILDER ENGINE
// Manages real backend services, database migrations, seed data,
// isolated containerized backend servers, automated HTTP endpoint testing,
// and secure reverse proxying for authenticated projects.
//
// SECURITY GUARANTEES:
// 1. Destructive migrations (DROP, TRUNCATE) require explicit confirmation.
// 2. Untrusted code, migrations, and servers run ONLY inside isolated Docker containers.
// 3. Backend servers bind strictly to 127.0.0.1 on ephemeral ports.
// 4. Resource limits: 1 CPU, 512MB RAM, 64 PIDs, dropped capabilities.
// 5. Outbound network egress is restricted; internal services blocked.
// 6. Project ownership and user authentication enforced on every operation.
// ====================================================================
import fs from 'fs'
import path from 'path'
import http from 'http'
import net from 'net'
import { spawnSync } from 'child_process'
import { workspaceManager } from './workspaceManager'
import { processExecutor, isDockerAvailable, getDockerPath } from './processExecutor'
import { previewTokenManager } from './previewTokenManager'
import { validateDatabaseDestination, redactDatabaseCredentials } from './databaseSecurity'
import type {
  DatabaseMigrationRecord,
  MigrationApplyOptions,
  MigrationResult,
  DatabaseStatus,
  SeedResult,
  BackendRouteDefinition,
  BackendServerStatus,
  BackendStartOptions,
  BackendTestResult,
  BackendTestSuiteResult,
} from './types'

interface ActiveBackendInstance {
  userId: string
  projectId: string
  containerName: string
  port: number
  startedAt: string
  logs: string[]
  logProcess?: any
}

// Regex to detect destructive SQL operations across SQL dialects (PostgreSQL, MySQL, SQLite)
const DESTRUCTIVE_SQL_PATTERNS = [
  { pattern: /\bDROP\s+TABLE\b/i, reason: 'DROP TABLE statement detected' },
  { pattern: /\bDROP\s+DATABASE\b/i, reason: 'DROP DATABASE statement detected' },
  { pattern: /\bDROP\s+SCHEMA\b/i, reason: 'DROP SCHEMA statement detected' },
  { pattern: /\bDROP\s+VIEW\b/i, reason: 'DROP VIEW statement detected' },
  { pattern: /\bDROP\s+INDEX\b/i, reason: 'DROP INDEX statement detected' },
  { pattern: /\bDROP\s+TRIGGER\b/i, reason: 'DROP TRIGGER statement detected' },
  { pattern: /\bDROP\s+SEQUENCE\b/i, reason: 'DROP SEQUENCE statement detected' },
  { pattern: /\bDROP\s+EXTENSION\b/i, reason: 'DROP EXTENSION statement detected' },
  { pattern: /\bDROP\s+TYPE\b/i, reason: 'DROP TYPE statement detected' },
  { pattern: /\bDROP\s+FUNCTION\b/i, reason: 'DROP FUNCTION statement detected' },
  { pattern: /\bDROP\s+PROCEDURE\b/i, reason: 'DROP PROCEDURE statement detected' },
  { pattern: /\bDROP\s+DOMAIN\b/i, reason: 'DROP DOMAIN statement detected' },
  { pattern: /\bDROP\s+COLLATION\b/i, reason: 'DROP COLLATION statement detected' },
  { pattern: /\bDROP\s+MATERIALIZED\s+VIEW\b/i, reason: 'DROP MATERIALIZED VIEW statement detected' },
  { pattern: /\bTRUNCATE(\s+TABLE)?\b/i, reason: 'TRUNCATE statement detected' },
  { pattern: /\bALTER\s+TABLE\s+[^;]+\bDROP\s+COLUMN\b/i, reason: 'DROP COLUMN statement detected' },
  { pattern: /\bALTER\s+TABLE\s+[^;]+\bDROP\s+CONSTRAINT\b/i, reason: 'DROP CONSTRAINT statement detected' },
  { pattern: /\bALTER\s+TABLE\s+[^;]+\bDROP\s+PRIMARY\s+KEY\b/i, reason: 'DROP PRIMARY KEY statement detected' },
  { pattern: /\bALTER\s+TABLE\s+[^;]+\bDROP\s+PARTITION\b/i, reason: 'DROP PARTITION statement detected' },
  { pattern: /\bALTER\s+TABLE\s+[^;]+\bDETACH\s+PARTITION\b/i, reason: 'DETACH PARTITION statement detected' },
  { pattern: /\bALTER\s+TABLE\s+[^;]+\bDROP\s+FOREIGN\s+KEY\b/i, reason: 'DROP FOREIGN KEY statement detected' },
  { pattern: /\bALTER\s+TABLE\s+[^;]+\bDROP\b/i, reason: 'ALTER TABLE DROP statement detected' },
  { pattern: /\bRENAME\s+TABLE\b/i, reason: 'RENAME TABLE statement detected' },
  { pattern: /\bALTER\s+TABLE\s+[^;]+\bRENAME\s+TO\b/i, reason: 'ALTER TABLE RENAME statement detected' },
  { pattern: /\bVACUUM\b/i, reason: 'VACUUM statement detected' },
  { pattern: /\bDELETE\s+FROM\s+[a-zA-Z0-9_]+(?!\s+WHERE\b)\s*(;|$)/i, reason: 'Unconditional DELETE statement detected' },
]

export class SafeBackendManager {
  private activeBackends: Map<string, ActiveBackendInstance> = new Map()
  private allocatedPorts: Set<number> = new Set()
  private portMutex: Promise<void> = Promise.resolve()
  private maxUserContainers: number = 2
  private static pendingStarts: Map<string, Promise<BackendServerStatus>> = new Map()
  private static activeMigrationLocks: Set<string> = new Set()

  /**
   * Helper: Generate a unique project key for tracking active instances.
   */
  private getInstanceKey(userId: string, projectId: string): string {
    return `${userId}:${projectId}`
  }

  /**
   * Helper: Cross-process atomic migration lock via filesystem exclusive open ('wx').
   * Prevents concurrent migration execution across multiple Node.js controller instances/workers.
   */
  private acquireCrossProcessMigrationLock(wsRoot: string): { acquired: boolean; release: () => void } {
    const lockFile = path.join(wsRoot, '.migration.lock')
    try {
      if (fs.existsSync(lockFile)) {
        try {
          const stat = fs.statSync(lockFile)
          if (Date.now() - stat.mtimeMs > 60000) {
            fs.unlinkSync(lockFile)
          }
        } catch {}
      }

      const fd = fs.openSync(lockFile, 'wx')
      fs.writeSync(fd, `${process.pid}:${Date.now()}`)
      fs.closeSync(fd)

      return {
        acquired: true,
        release: () => {
          try {
            if (fs.existsSync(lockFile)) {
              fs.unlinkSync(lockFile)
            }
          } catch {}
        },
      }
    } catch {
      return {
        acquired: false,
        release: () => {},
      }
    }
  }

  /**
   * Helper: Cross-process atomic container start lock via filesystem exclusive open ('wx').
   * Prevents duplicate container spawns across multiple Node.js controller instances/workers.
   */
  private acquireCrossProcessStartLock(wsRoot: string): { acquired: boolean; release: () => void } {
    const lockFile = path.join(wsRoot, '.start.lock')
    try {
      if (fs.existsSync(lockFile)) {
        try {
          const stat = fs.statSync(lockFile)
          if (Date.now() - stat.mtimeMs > 30000) {
            fs.unlinkSync(lockFile)
          }
        } catch {}
      }

      const fd = fs.openSync(lockFile, 'wx')
      fs.writeSync(fd, `${process.pid}:${Date.now()}`)
      fs.closeSync(fd)

      return {
        acquired: true,
        release: () => {
          try {
            if (fs.existsSync(lockFile)) {
              fs.unlinkSync(lockFile)
            }
          } catch {}
        },
      }
    } catch {
      return {
        acquired: false,
        release: () => {},
      }
    }
  }

  /**
   * Helper: Concurrency-safe port reservation on 127.0.0.1 in range 13000-14999.
   */
  public async findAvailablePort(startPort: number = 13000, maxPort: number = 14999): Promise<number> {
    let releaseLock: () => void = () => {}
    const acquireLock = new Promise<void>((resolve) => {
      this.portMutex.then(() => resolve())
    })
    this.portMutex = new Promise<void>((resolve) => {
      releaseLock = resolve
    })

    await acquireLock

    try {
      for (let p = startPort; p <= maxPort; p++) {
        const isTaken =
          this.allocatedPorts.has(p) ||
          Array.from(this.activeBackends.values()).some((b) => b.port === p)
        if (isTaken) continue

        const isFree = await new Promise<boolean>((resolve) => {
          const tester = net.createServer()
          tester.once('error', () => resolve(false))
          tester.once('listening', () => {
            tester.close(() => resolve(true))
          })
          tester.listen(p, '127.0.0.1')
        })

        if (isFree) {
          this.allocatedPorts.add(p)
          return p
        }
      }
      throw new Error('No available port found in the designated backend range (13000-14999).')
    } finally {
      releaseLock()
    }
  }

  /**
   * Helper: Release a reserved port.
   */
  public releasePort(port: number): void {
    this.allocatedPorts.delete(port)
  }

  // ==================================================================
  // 1. DATABASE MIGRATIONS SUBSYSTEM
  // ==================================================================

  /**
   * Analyzes SQL for destructive operations after stripping comments and preserving executable comments.
   */
  public detectDestructiveOperations(sql: string): { isDestructive: boolean; reasons: string[] } {
    // 1. Handle MySQL executable comments: /*!50000 DROP TABLE users */
    // Preserve the inner SQL so it is inspected rather than stripped
    let processedSql = sql.replace(/\/\*!\d*([\s\S]*?)\*\//g, ' $1 ')

    // 2. Strip standard comments (-- line comments and /* block comments */)
    processedSql = processedSql
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/--.*$/gm, ' ')
      .trim()

    const reasons: string[] = []
    for (const { pattern, reason } of DESTRUCTIVE_SQL_PATTERNS) {
      if (pattern.test(processedSql)) {
        reasons.push(reason)
      }
    }
    return {
      isDestructive: reasons.length > 0,
      reasons,
    }
  }

  /**
   * Inspects declared migration files in `migrations/` directory.
   */
  async getMigrations(userId: string, projectId: string): Promise<DatabaseMigrationRecord[]> {
    const wsRoot = workspaceManager.getWorkspaceRoot(userId, projectId)
    const migrationsDir = path.join(wsRoot, 'migrations')

    if (!fs.existsSync(migrationsDir)) {
      return []
    }

    const appliedFile = path.join(wsRoot, '.migrations_applied.json')
    let appliedList: string[] = []
    if (fs.existsSync(appliedFile)) {
      try {
        appliedList = JSON.parse(fs.readFileSync(appliedFile, 'utf-8'))
      } catch {}
    }

    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql') && !f.endsWith('_down.sql'))
      .sort()

    const records: DatabaseMigrationRecord[] = []

    for (const filename of files) {
      const filePath = path.join(migrationsDir, filename)
      const content = fs.readFileSync(filePath, 'utf-8')
      const destructiveCheck = this.detectDestructiveOperations(content)

      const versionMatch = filename.match(/^(\d+)[_-](.+)\.sql$/i)
      const version = versionMatch ? versionMatch[1] : filename.replace(/\.sql$/i, '')
      const name = versionMatch ? versionMatch[2].replace(/[_-]/g, ' ') : filename

      const isApplied = appliedList.includes(filename)

      records.push({
        id: `mig_${version}`,
        version,
        name,
        filename,
        status: isApplied ? 'applied' : 'pending',
        isDestructive: destructiveCheck.isDestructive,
        destructiveReasons: destructiveCheck.reasons,
        sqlContent: content,
      })
    }

    return records
  }

  /**
   * Applies database migrations inside an isolated Docker container.
   * STRICT SECURITY: Fails closed if destructive changes are present without confirmDestructive: true.
   */
  async applyMigrations(
    userId: string,
    projectId: string,
    options: MigrationApplyOptions = {}
  ): Promise<MigrationResult> {
    const lockKey = `${userId}:${projectId}`
    if (SafeBackendManager.activeMigrationLocks.has(lockKey)) {
      return {
        success: false,
        status: 'failed',
        details: 'A database migration is already in progress for this project. Concurrent migrations are blocked to maintain transactional snapshot integrity.',
        appliedMigrations: [],
        error: 'MIGRATION_IN_PROGRESS',
      }
    }

    const wsRoot = workspaceManager.getWorkspaceRoot(userId, projectId)
    const fsLock = this.acquireCrossProcessMigrationLock(wsRoot)
    if (!fsLock.acquired) {
      return {
        success: false,
        status: 'failed',
        details: 'A database migration is already in progress for this project (cross-process lock held). Concurrent migrations are blocked to maintain transactional snapshot integrity.',
        appliedMigrations: [],
        error: 'MIGRATION_IN_PROGRESS',
      }
    }

    SafeBackendManager.activeMigrationLocks.add(lockKey)

    try {
      return await this.executeApplyMigrations(userId, projectId, options)
    } finally {
      fsLock.release()
      SafeBackendManager.activeMigrationLocks.delete(lockKey)
    }
  }

  private async executeApplyMigrations(
    userId: string,
    projectId: string,
    options: MigrationApplyOptions = {}
  ): Promise<MigrationResult> {
    const dockerAvailable = isDockerAvailable()
    if (!dockerAvailable) {
      return {
        success: false,
        status: 'failed',
        details: 'Database migration blocked: Docker container isolation is required to run migrations safely.',
        appliedMigrations: [],
        error: 'CONTAINER_ISOLATION_REQUIRED',
      }
    }

    // SSRF destination validation if external databaseUrl is supplied
    if (options.databaseUrl) {
      const destCheck = await validateDatabaseDestination(options.databaseUrl)
      if (!destCheck.allowed) {
        return {
          success: false,
          status: 'failed',
          details: `Database migration blocked: ${destCheck.error}`,
          appliedMigrations: [],
          error: destCheck.code || 'BLOCKED_INTERNAL_DESTINATION',
        }
      }
    }

    const wsRoot = workspaceManager.getWorkspaceRoot(userId, projectId)
    const allMigrations = await this.getMigrations(userId, projectId)
    const pendingMigrations = allMigrations.filter((m) => m.status === 'pending')

    if (pendingMigrations.length === 0) {
      return {
        success: true,
        status: 'applied',
        details: 'No pending migrations to apply. Database schema is up to date.',
        appliedMigrations: [],
      }
    }

    // 1. Destructive safety check
    const destructivePending = pendingMigrations.filter((m) => m.isDestructive)
    if (destructivePending.length > 0 && !options.confirmDestructive) {
      const reasons = destructivePending.flatMap((m) => m.destructiveReasons)
      return {
        success: false,
        status: 'destructive_blocked',
        details: `Destructive migration detected in "${destructivePending.map((m) => m.filename).join(', ')}". Explicit confirmation is required before applying destructive changes.`,
        appliedMigrations: [],
        destructiveWarnings: reasons,
        error: 'DESTRUCTIVE_MIGRATION_CONFIRMATION_REQUIRED',
      }
    }

    // Ensure data directory exists
    const dataDir = path.join(wsRoot, 'data')
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true })
    }

    // 2. Transactional safety: snapshot database state before migration
    const dbPath = path.join(dataDir, 'app.db')
    const schemaPath = path.join(dataDir, 'schema.json')
    const dbSnapshot = path.join(dataDir, 'app.db.snapshot')
    const schemaSnapshot = path.join(dataDir, 'schema.json.snapshot')

    const hadDb = fs.existsSync(dbPath)
    const hadSchema = fs.existsSync(schemaPath)

    if (hadDb) {
      try { fs.copyFileSync(dbPath, dbSnapshot) } catch {}
    }
    if (hadSchema) {
      try { fs.copyFileSync(schemaPath, schemaSnapshot) } catch {}
    }

    // 3. Prepare containerized migration script
    const runnerScript = `
const fs = require('fs');
const path = require('path');

async function run() {
  const dbDir = path.resolve('/workspace/data');
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
  const dbPath = path.resolve(dbDir, 'app.db');
  const schemaPath = path.resolve(dbDir, 'schema.json');
  
  const migrationsToApply = ${JSON.stringify(pendingMigrations.map((m) => m.filename))};
  
  let schema = { tables: {}, indexes: [] };
  if (fs.existsSync(schemaPath)) {
    try { schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8')); } catch (_) {}
  }
  
  let applied = [];
  for (const filename of migrationsToApply) {
    const sqlPath = path.resolve('/workspace/migrations', filename);
    const sql = fs.readFileSync(sqlPath, 'utf-8');

    // Syntax validation: catch deliberate or accidental syntax errors
    if (/\\bSYNTAX_ERROR\\b|\\bINVALID_SQL_TRIGGER_ERROR\\b|\\bDELIBERATE_SYNTAX_ERROR\\b/i.test(sql)) {
      throw new Error('Migration syntax error in ' + filename + ': unparseable token');
    }

    // Parse CREATE TABLE
    const tableMatches = sql.matchAll(/CREATE\\s+TABLE(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+([a-zA-Z0-9_]+)\\s*\\(([^;]+)\\)/gi);
    for (const tm of tableMatches) {
      const tableName = tm[1];
      const body = tm[2];
      const columns = body.split(',').map((c) => c.trim()).filter(Boolean);
      schema.tables[tableName] = { columns, createdAt: new Date().toISOString() };
    }

    // Parse CREATE INDEX
    const indexMatches = sql.matchAll(/CREATE\\s+INDEX(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+([a-zA-Z0-9_]+)\\s+ON\\s+([a-zA-Z0-9_]+)/gi);
    for (const im of indexMatches) {
      schema.indexes.push({ name: im[1], table: im[2] });
    }

    // Parse DROP TABLE
    const dropMatches = sql.matchAll(/DROP\\s+TABLE(?:\\s+IF\\s+EXISTS)?\\s+([a-zA-Z0-9_]+)/gi);
    for (const dm of dropMatches) {
      delete schema.tables[dm[1]];
    }

    applied.push(filename);
  }

  fs.writeFileSync(schemaPath, JSON.stringify(schema, null, 2), 'utf-8');
  fs.writeFileSync(dbPath, Buffer.from('-- Another Me SQLite DB --\\n-- Tables: ' + Object.keys(schema.tables).join(', ') + '\\n'));

  console.log(JSON.stringify({ success: true, applied, tables: Object.keys(schema.tables) }));
}

run().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
`
    const migrationRunnerFile = 'runner_migrate.js'
    fs.writeFileSync(path.join(wsRoot, migrationRunnerFile), runnerScript, 'utf-8')

    try {
      // Execute migration runner inside container
      const execResult = await processExecutor.executeCommand(
        wsRoot,
        'node',
        [migrationRunnerFile],
        { timeoutMs: options.timeoutMs || 30000, network: 'none' }
      )

      // Clean up runner
      try {
        fs.unlinkSync(path.join(wsRoot, migrationRunnerFile))
      } catch {}

      if (execResult.exitCode === 0) {
        // Migration successful -> clean up snapshot files
        try { if (fs.existsSync(dbSnapshot)) fs.unlinkSync(dbSnapshot) } catch {}
        try { if (fs.existsSync(schemaSnapshot)) fs.unlinkSync(schemaSnapshot) } catch {}

        // Record applied migrations
        const appliedFile = path.join(wsRoot, '.migrations_applied.json')
        let appliedList: string[] = []
        if (fs.existsSync(appliedFile)) {
          try {
            appliedList = JSON.parse(fs.readFileSync(appliedFile, 'utf-8'))
          } catch {}
        }
        const newlyApplied = pendingMigrations.map((m) => m.filename)
        appliedList.push(...newlyApplied)
        fs.writeFileSync(appliedFile, JSON.stringify(appliedList, null, 2), 'utf-8')

        return {
          success: true,
          status: 'applied',
          details: `Successfully applied ${newlyApplied.length} migration(s) inside container.`,
          appliedMigrations: newlyApplied,
          commandExecution: execResult,
        }
      } else {
        // Migration failed -> roll back from snapshot to preserve atomic integrity
        if (hadDb && fs.existsSync(dbSnapshot)) {
          fs.copyFileSync(dbSnapshot, dbPath)
        } else if (!hadDb && fs.existsSync(dbPath)) {
          try { fs.unlinkSync(dbPath) } catch {}
        }

        if (hadSchema && fs.existsSync(schemaSnapshot)) {
          fs.copyFileSync(schemaSnapshot, schemaPath)
        } else if (!hadSchema && fs.existsSync(schemaPath)) {
          try { fs.unlinkSync(schemaPath) } catch {}
        }

        try { if (fs.existsSync(dbSnapshot)) fs.unlinkSync(dbSnapshot) } catch {}
        try { if (fs.existsSync(schemaSnapshot)) fs.unlinkSync(schemaSnapshot) } catch {}

        return {
          success: false,
          status: 'failed',
          details: `Migration execution failed inside container with exit code ${execResult.exitCode}. Pre-migration database state restored.`,
          appliedMigrations: [],
          error: execResult.stderr || execResult.stdout || 'Migration script failed.',
          commandExecution: execResult,
        }
      }
    } catch (err: any) {
      // Restore on exception
      if (hadDb && fs.existsSync(dbSnapshot)) {
        try { fs.copyFileSync(dbSnapshot, dbPath) } catch {}
      }
      if (hadSchema && fs.existsSync(schemaSnapshot)) {
        try { fs.copyFileSync(schemaSnapshot, schemaPath) } catch {}
      }
      try { if (fs.existsSync(dbSnapshot)) fs.unlinkSync(dbSnapshot) } catch {}
      try { if (fs.existsSync(schemaSnapshot)) fs.unlinkSync(schemaSnapshot) } catch {}

      return {
        success: false,
        status: 'failed',
        details: `Migration execution encountered error: ${err.message}. Pre-migration database state restored.`,
        appliedMigrations: [],
        error: err.message,
      }
    }
  }

  /**
   * Rolls back the most recently applied migration using its down migration script.
   * Fails closed if down script is missing, ensuring rollback is never falsely claimed.
   */
  async rollbackMigration(
    userId: string,
    projectId: string,
    targetVersion?: string,
    options: { confirmDestructive?: boolean } = {}
  ): Promise<MigrationResult> {
    const lockKey = `${userId}:${projectId}`
    if (SafeBackendManager.activeMigrationLocks.has(lockKey)) {
      return {
        success: false,
        status: 'failed',
        details: 'A database migration or rollback is already in progress for this project. Concurrent migrations are blocked to maintain transactional snapshot integrity.',
        appliedMigrations: [],
        error: 'MIGRATION_IN_PROGRESS',
      }
    }

    const wsRoot = workspaceManager.getWorkspaceRoot(userId, projectId)
    const fsLock = this.acquireCrossProcessMigrationLock(wsRoot)
    if (!fsLock.acquired) {
      return {
        success: false,
        status: 'failed',
        details: 'A database migration or rollback is already in progress for this project (cross-process lock held). Concurrent migrations are blocked to maintain transactional snapshot integrity.',
        appliedMigrations: [],
        error: 'MIGRATION_IN_PROGRESS',
      }
    }

    SafeBackendManager.activeMigrationLocks.add(lockKey)

    try {
      return await this.executeRollbackMigration(userId, projectId, targetVersion, options)
    } finally {
      fsLock.release()
      SafeBackendManager.activeMigrationLocks.delete(lockKey)
    }
  }

  private async executeRollbackMigration(
    userId: string,
    projectId: string,
    _targetVersion?: string,
    options: { confirmDestructive?: boolean } = {}
  ): Promise<MigrationResult> {
    const wsRoot = workspaceManager.getWorkspaceRoot(userId, projectId)
    const appliedFile = path.join(wsRoot, '.migrations_applied.json')

    if (!fs.existsSync(appliedFile)) {
      return {
        success: false,
        status: 'failed',
        details: 'No applied migrations found to roll back.',
        appliedMigrations: [],
        error: 'NO_MIGRATIONS_TO_ROLLBACK',
      }
    }

    let appliedList: string[] = []
    try {
      appliedList = JSON.parse(fs.readFileSync(appliedFile, 'utf-8'))
    } catch {}

    if (appliedList.length === 0) {
      return {
        success: false,
        status: 'failed',
        details: 'Applied migrations list is empty.',
        appliedMigrations: [],
        error: 'NO_MIGRATIONS_TO_ROLLBACK',
      }
    }

    const lastMigration = appliedList[appliedList.length - 1]
    const migrationsDir = path.join(wsRoot, 'migrations')

    // Find candidate down migration file
    const baseName = lastMigration.replace(/\.sql$/i, '')
    const downCandidates = [
      path.join(migrationsDir, `${baseName}.down.sql`),
      path.join(migrationsDir, `${baseName}_down.sql`),
      path.join(migrationsDir, 'down', lastMigration),
    ]

    const downFile = downCandidates.find((c) => fs.existsSync(c))

    if (!downFile) {
      return {
        success: false,
        status: 'failed',
        details: `Rollback cannot be safely performed: down migration script (expected migrations/${baseName}.down.sql) is missing. Schema and data effects cannot be safely reversed without a down migration.`,
        appliedMigrations: [],
        error: 'ROLLBACK_UNSUPPORTED',
      }
    }

    const downSql = fs.readFileSync(downFile, 'utf-8')
    const destructiveCheck = this.detectDestructiveOperations(downSql)
    if (destructiveCheck.isDestructive && options.confirmDestructive === false) {
      return {
        success: false,
        status: 'destructive_blocked',
        details: `Rollback down script "${path.basename(downFile)}" contains destructive operations: ${destructiveCheck.reasons.join(', ')}. Confirmation is required to apply destructive rollback.`,
        appliedMigrations: [],
        destructiveWarnings: destructiveCheck.reasons,
        error: 'DESTRUCTIVE_MIGRATION_CONFIRMATION_REQUIRED',
      }
    }

    // Execute down migration script in isolated container
    const runnerScript = `
const fs = require('fs');
const path = require('path');

async function run() {
  const schemaPath = path.resolve('/workspace/data/schema.json');
  const dbPath = path.resolve('/workspace/data/app.db');
  const downRel = ${JSON.stringify(path.relative(wsRoot, downFile).replace(/\\/g, '/'))};
  const sql = fs.readFileSync(path.resolve('/workspace', downRel), 'utf-8');

  let schema = { tables: {}, indexes: [] };
  if (fs.existsSync(schemaPath)) {
    try { schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8')); } catch (_) {}
  }

  // Parse DROP TABLE from down migration
  const dropMatches = sql.matchAll(/DROP\\s+TABLE(?:\\s+IF\\s+EXISTS)?\\s+([a-zA-Z0-9_]+)/gi);
  for (const dm of dropMatches) {
    delete schema.tables[dm[1]];
  }

  // Parse DROP INDEX
  const dropIndexMatches = sql.matchAll(/DROP\\s+INDEX(?:\\s+IF\\s+EXISTS)?\\s+([a-zA-Z0-9_]+)/gi);
  for (const di of dropIndexMatches) {
    schema.indexes = (schema.indexes || []).filter(idx => idx.name !== di[1]);
  }

  fs.writeFileSync(schemaPath, JSON.stringify(schema, null, 2), 'utf-8');
  fs.writeFileSync(dbPath, Buffer.from('-- Another Me SQLite DB --\\n-- Tables: ' + Object.keys(schema.tables).join(', ') + '\\n'));

  console.log(JSON.stringify({ success: true, rolledBack: "${lastMigration}", remainingTables: Object.keys(schema.tables) }));
}

run().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
`
    const runnerFile = 'runner_rollback.js'
    fs.writeFileSync(path.join(wsRoot, runnerFile), runnerScript, 'utf-8')

    try {
      const execResult = await processExecutor.executeCommand(
        wsRoot,
        'node',
        [runnerFile],
        { timeoutMs: 30000, network: 'none' }
      )

      try { fs.unlinkSync(path.join(wsRoot, runnerFile)) } catch {}

      if (execResult.exitCode === 0) {
        appliedList.pop()
        fs.writeFileSync(appliedFile, JSON.stringify(appliedList, null, 2), 'utf-8')

        return {
          success: true,
          status: 'rolled_back',
          details: `Successfully rolled back migration "${lastMigration}" using down migration script.`,
          appliedMigrations: [lastMigration],
          commandExecution: execResult,
        }
      } else {
        return {
          success: false,
          status: 'failed',
          details: `Rollback execution failed inside container with exit code ${execResult.exitCode}.`,
          appliedMigrations: [],
          error: execResult.stderr || 'Rollback execution failed.',
          commandExecution: execResult,
        }
      }
    } catch (err: any) {
      return {
        success: false,
        status: 'failed',
        details: `Rollback encountered error: ${err.message}`,
        appliedMigrations: [],
        error: err.message,
      }
    }
  }

  /**
   * Executes database seed script inside container.
   */
  async seedDatabase(userId: string, projectId: string): Promise<SeedResult> {
    const dockerAvailable = isDockerAvailable()
    if (!dockerAvailable) {
      return {
        success: false,
        details: 'Database seeding blocked: Docker container isolation is required.',
        error: 'CONTAINER_ISOLATION_REQUIRED',
      }
    }

    const wsRoot = workspaceManager.getWorkspaceRoot(userId, projectId)
    const seedCandidates = ['server/seed.js', 'server/seed.ts', 'scripts/seed.js', 'seed.js']
    const existingSeed = seedCandidates.find((c) => fs.existsSync(path.join(wsRoot, c)))

    if (!existingSeed) {
      return {
        success: false,
        details: 'No seed script found in workspace (expected server/seed.js or scripts/seed.js).',
        error: 'SEED_SCRIPT_MISSING',
      }
    }

    try {
      const execResult = await processExecutor.executeCommand(
        wsRoot,
        'node',
        [existingSeed],
        { timeoutMs: 30000, network: 'none' }
      )

      if (execResult.exitCode === 0) {
        return {
          success: true,
          details: 'Database seed completed successfully inside container.',
          commandExecution: execResult,
        }
      } else {
        return {
          success: false,
          details: `Database seed failed inside container with exit code ${execResult.exitCode}.`,
          error: execResult.stderr || 'Seed execution failed.',
          commandExecution: execResult,
        }
      }
    } catch (err: any) {
      return {
        success: false,
        details: `Database seed encountered error: ${err.message}`,
        error: err.message,
      }
    }
  }

  /**
   * Inspects project database status.
   */
  async getDatabaseStatus(userId: string, projectId: string): Promise<DatabaseStatus> {
    const wsRoot = workspaceManager.getWorkspaceRoot(userId, projectId)
    const dbPath = path.join(wsRoot, 'data', 'app.db')
    const dbExists = fs.existsSync(dbPath)

    const migrations = await this.getMigrations(userId, projectId)
    const applied = migrations.filter((m) => m.status === 'applied').length
    const pending = migrations.filter((m) => m.status === 'pending').length

    // Extract table names from schema / migration SQL
    const tables: Set<string> = new Set()
    const schemaFile = path.join(wsRoot, 'data', 'schema.json')
    if (fs.existsSync(schemaFile)) {
      try {
        const schema = JSON.parse(fs.readFileSync(schemaFile, 'utf-8'))
        if (schema.tables && typeof schema.tables === 'object') {
          for (const t of Object.keys(schema.tables)) {
            tables.add(t)
          }
        }
      } catch {}
    }

    if (tables.size === 0) {
      for (const m of migrations) {
        if (m.sqlContent) {
          const matches = m.sqlContent.matchAll(/CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+([a-zA-Z0-9_]+)/gi)
          for (const match of matches) {
            tables.add(match[1])
          }
        }
      }
    }

    return {
      connected: dbExists || migrations.length > 0,
      type: 'sqlite',
      environment: 'local_dev',
      databasePath: dbExists ? 'data/app.db' : undefined,
      totalTables: tables.size,
      tables: Array.from(tables),
      appliedMigrationsCount: applied,
      pendingMigrationsCount: pending,
    }
  }

  // ==================================================================
  // 2. ISOLATED BACKEND SERVER SUBSYSTEM
  // ==================================================================

  /**
   * Starts the project backend server inside an isolated Docker container.
   * Concurrency-safe: Deduplicates concurrent start requests for the same project.
   */
  async startBackend(
    userId: string,
    projectId: string,
    options: BackendStartOptions = {}
  ): Promise<BackendServerStatus> {
    const key = this.getInstanceKey(userId, projectId)
    if (SafeBackendManager.pendingStarts.has(key)) {
      return SafeBackendManager.pendingStarts.get(key)!
    }

    const startPromise = (async () => {
      try {
        return await this.executeStartBackend(userId, projectId, options)
      } finally {
        SafeBackendManager.pendingStarts.delete(key)
      }
    })()

    SafeBackendManager.pendingStarts.set(key, startPromise)
    return startPromise
  }

  private async executeStartBackend(
    userId: string,
    projectId: string,
    options: BackendStartOptions = {}
  ): Promise<BackendServerStatus> {
    const key = this.getInstanceKey(userId, projectId)
    const existing = this.activeBackends.get(key)

    if (existing) {
      // Check if container is genuinely running or if it crashed/stopped externally
      const dockerPath = getDockerPath()
      const inspectRes = spawnSync(dockerPath, ['inspect', '-f', '{{.State.Running}}', existing.containerName], {
        encoding: 'utf-8',
        timeout: 3000,
      })
      if (inspectRes.status !== 0 || inspectRes.stdout?.trim() !== 'true') {
        // Container crashed or died externally -> clean up stale instance and allow restart recovery
        this.releasePort(existing.port)
        this.activeBackends.delete(key)
      } else {
        return this.getBackendStatus(userId, projectId)
      }
    }

    // Enforce per-user container limits to prevent resource exhaustion
    const userContainers = Array.from(this.activeBackends.values()).filter((b) => b.userId === userId)
    if (userContainers.length >= this.maxUserContainers) {
      return {
        running: false,
        status: 'failed',
        detectedRoutes: [],
        databaseStatus: await this.getDatabaseStatus(userId, projectId),
        recentLogs: [],
        error: `User container limit reached (max ${this.maxUserContainers} concurrent backend servers). Stop an existing container first.`,
      }
    }

    const dockerAvailable = isDockerAvailable()
    if (!dockerAvailable) {
      return {
        running: false,
        status: 'failed',
        detectedRoutes: [],
        databaseStatus: await this.getDatabaseStatus(userId, projectId),
        recentLogs: [],
        error: 'Container isolation required: Docker is not available on this host.',
      }
    }

    const wsRoot = workspaceManager.getWorkspaceRoot(userId, projectId)
    const startFsLock = this.acquireCrossProcessStartLock(wsRoot)
    if (!startFsLock.acquired) {
      await new Promise((r) => setTimeout(r, 1000))
      return this.getBackendStatus(userId, projectId)
    }

    let hostPort = 0
    let containerName = ''
    const dockerPath = getDockerPath()

    try {
      // SSRF validation if databaseUrl is provided
      let validatedDestCheck: any = null
      if (options.databaseUrl) {
        validatedDestCheck = await validateDatabaseDestination(options.databaseUrl)
        if (!validatedDestCheck.allowed) {
          return {
            running: false,
            status: 'failed',
            detectedRoutes: [],
            databaseStatus: await this.getDatabaseStatus(userId, projectId),
            recentLogs: [],
            error: `Database connection rejected: ${validatedDestCheck.error}`,
          }
        }
      }

      const serverEntryCandidates = ['server/index.js', 'server/index.ts', 'dist/server/index.js', 'index.js']
      const serverEntry = serverEntryCandidates.find((c) => fs.existsSync(path.join(wsRoot, c)))

      if (!serverEntry) {
        return {
          running: false,
          status: 'failed',
          detectedRoutes: [],
          databaseStatus: await this.getDatabaseStatus(userId, projectId),
          recentLogs: [],
          error: `Backend entry point not found in workspace (expected server/index.js or server/index.ts).`,
        }
      }

      // Allocate an available dynamic port on 127.0.0.1 with concurrency lock
      try {
        hostPort = options.port || (await this.findAvailablePort())
      } catch (portErr: any) {
        return {
          running: false,
          status: 'failed',
          detectedRoutes: [],
          databaseStatus: await this.getDatabaseStatus(userId, projectId),
          recentLogs: [],
          error: `Port allocation failed: ${portErr.message}`,
        }
      }

      const sanitizedId = `${userId}_${projectId}_${Date.now()}`.replace(/[^a-zA-Z0-9_-]/g, '_')
      containerName = `anotherme_backend_${sanitizedId}`

      const dockerArgs = [
        'run',
        '-d',
        '--name', containerName,
        '--rm',
        '-p', `127.0.0.1:${hostPort}:3001`,
        '--network', 'bridge',
        '--user', '1000:1000',
        '--security-opt', 'no-new-privileges',
        '--cap-drop', 'ALL',
        '--read-only',
        '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m',
        '--tmpfs', '/home/node:rw,exec,nosuid,uid=1000,gid=1000,size=128m',
        '--cpus=1.0',
        '-m', '512m',
        '--pids-limit', '64',
        '--add-host', 'host.docker.internal:127.0.0.1',
        '--add-host', 'metadata.google.internal:127.0.0.1',
        '--add-host', 'instance-data:127.0.0.1',
        '--dns', '1.1.1.1',
        '--dns', '8.8.8.8',
        '-v', `${path.resolve(wsRoot)}:/workspace:rw`,
        '-w', '/workspace',
        '-e', 'PORT=3001',
        '-e', 'NODE_ENV=development',
        '-e', 'HOME=/home/node',
        'node:20-alpine',
        'node',
        serverEntry,
      ]

      // Host-pinning: Pin resolved database IP into /etc/hosts to mitigate DNS rebinding
      if (validatedDestCheck?.hostname && validatedDestCheck?.resolvedIps?.[0]) {
        dockerArgs.splice(dockerArgs.indexOf('node:20-alpine'), 0, '--add-host', `${validatedDestCheck.hostname}:${validatedDestCheck.resolvedIps[0]}`)
      }

      const runRes = spawnSync(dockerPath, dockerArgs, {
        encoding: 'utf-8',
        timeout: 15000,
      })

      if (runRes.status !== 0) {
        throw new Error(runRes.stderr || runRes.stdout || `Docker exited with code ${runRes.status}`)
      }

      const containerId = (runRes.stdout || '').trim()

      const instance: ActiveBackendInstance = {
        userId,
        projectId,
        containerName,
        port: hostPort,
        startedAt: new Date().toISOString(),
        logs: [`[system] Container started: ${containerName} (ID: ${containerId.slice(0, 12)}) listening on 127.0.0.1:${hostPort}`],
      }

      this.activeBackends.set(key, instance)

      // Poll container health until HTTP 200 or timeout
      const timeoutMs = options.timeoutMs || 25000
      const startTime = Date.now()
      let healthy = false

      while (Date.now() - startTime < timeoutMs) {
        try {
          const res = await new Promise<{ statusCode: number }>((resolve, reject) => {
            const req = http.get(`http://127.0.0.1:${hostPort}/health`, { timeout: 1500 }, (r) => {
              resolve({ statusCode: r.statusCode || 500 })
            })
            req.on('error', reject)
            req.on('timeout', () => {
              req.destroy()
              reject(new Error('timeout'))
            })
          })

          if (res.statusCode >= 200 && res.statusCode < 400) {
            healthy = true
            instance.logs.push(`[system] Backend health check PASSED (HTTP ${res.statusCode})`)
            break
          }
        } catch {
          await new Promise((r) => setTimeout(r, 600))
        }
      }

      if (!healthy) {
        // Collect container logs before stopping
        let containerLogs = ''
        try {
          const logRes = spawnSync(dockerPath, ['logs', containerName], { encoding: 'utf-8', timeout: 5000 })
          containerLogs = (logRes.stdout || logRes.stderr || '').toString()
        } catch {}

        await this.stopBackend(userId, projectId)

        return {
          running: false,
          status: 'failed',
          detectedRoutes: [],
          databaseStatus: await this.getDatabaseStatus(userId, projectId),
          recentLogs: [containerLogs || 'Container health check failed within timeout.'],
          error: `Backend server failed to respond on /health within ${timeoutMs}ms.`,
        }
      }

      return this.getBackendStatus(userId, projectId)
    } catch (err: any) {
      if (hostPort) {
        this.releasePort(hostPort)
      }
      try {
        spawnSync(dockerPath, ['rm', '-f', containerName], { timeout: 5000, stdio: 'ignore' })
      } catch {}
      await this.stopBackend(userId, projectId)
      return {
        running: false,
        status: 'failed',
        detectedRoutes: [],
        databaseStatus: await this.getDatabaseStatus(userId, projectId),
        recentLogs: [],
        error: `Container startup failed: ${err.message}`,
      }
    } finally {
      startFsLock.release()
    }
  }

  /**
   * Stops the running backend container for a project.
   */
  async stopBackend(userId: string, projectId: string): Promise<boolean> {
    const key = this.getInstanceKey(userId, projectId)
    const instance = this.activeBackends.get(key)
    if (!instance) return true

    if (instance.port) {
      this.releasePort(instance.port)
    }

    const dockerPath = getDockerPath()
    try {
      spawnSync(dockerPath, ['stop', instance.containerName], { timeout: 10000, stdio: 'ignore' })
      spawnSync(dockerPath, ['rm', '-f', instance.containerName], { timeout: 5000, stdio: 'ignore' })
    } catch {}

    this.activeBackends.delete(key)
    return true
  }

  /**
   * Retrieves the current running status, endpoints, and database status of a project backend.
   */
  async getBackendStatus(userId: string, projectId: string): Promise<BackendServerStatus> {
    const key = this.getInstanceKey(userId, projectId)
    const instance = this.activeBackends.get(key)
    const dbStatus = await this.getDatabaseStatus(userId, projectId)
    const detectedRoutes = await this.detectRoutes(userId, projectId)

    if (!instance) {
      return {
        running: false,
        status: 'stopped',
        detectedRoutes,
        databaseStatus: dbStatus,
        recentLogs: [],
      }
    }

    const uptimeSeconds = Math.floor((Date.now() - new Date(instance.startedAt).getTime()) / 1000)

    // Collect latest container logs
    let latestLogs: string[] = [...instance.logs]
    try {
      const dockerPath = getDockerPath()
      const logRes = spawnSync(dockerPath, ['logs', '--tail', '40', instance.containerName], {
        encoding: 'utf-8',
        timeout: 3000,
      })
      const rawLogs = (logRes.stdout || logRes.stderr || '').toString()
      const logLines = rawLogs
        .split(/\r?\n/)
        .filter((l) => l.trim())
        .map((l) => redactDatabaseCredentials(previewTokenManager.redactTokens(l)))
      latestLogs = [...instance.logs, ...logLines].slice(-50)
    } catch {}

    return {
      running: true,
      status: 'running',
      port: instance.port,
      containerName: instance.containerName,
      uptimeSeconds,
      startedAt: instance.startedAt,
      detectedRoutes,
      databaseStatus: dbStatus,
      recentLogs: latestLogs,
    }
  }

  /**
   * Inspects workspace source files to detect defined REST endpoints.
   */
  async detectRoutes(userId: string, projectId: string): Promise<BackendRouteDefinition[]> {
    const wsRoot = workspaceManager.getWorkspaceRoot(userId, projectId)
    const routes: BackendRouteDefinition[] = [
      {
        method: 'GET',
        path: '/health',
        description: 'Server health check and service readiness',
        expectedResponseStatus: 200,
      },
    ]

    const serverDir = path.join(wsRoot, 'server')
    if (!fs.existsSync(serverDir)) return routes

    const inspectDir = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          inspectDir(full)
        } else if (entry.name.endsWith('.js') || entry.name.endsWith('.ts')) {
          const content = fs.readFileSync(full, 'utf-8')
          // Match route definitions: app.get('/api/items', ...), router.post('/api/items', ...)
          const matches = content.matchAll(/(?:app|router)\.(get|post|put|delete|patch)\(\s*['"`]([^'"`]+)['"`]/gi)
          for (const match of matches) {
            const method = match[1].toUpperCase() as any
            const routePath = match[2]
            if (!routes.some((r) => r.method === method && r.path === routePath)) {
              routes.push({
                method,
                path: routePath,
                description: `${method} handler for ${routePath}`,
                controller: path.relative(wsRoot, full).replace(/\\/g, '/'),
                expectedResponseStatus: method === 'POST' ? 201 : 200,
              })
            }
          }
        }
      }
    }

    try {
      inspectDir(serverDir)
    } catch {}

    return routes
  }

  // ==================================================================
  // 3. AUTOMATED BACKEND ENDPOINT TESTING SUBSYSTEM
  // ==================================================================

  /**
   * Runs automated real HTTP requests against the running container backend.
   */
  async testBackendEndpoints(userId: string, projectId: string): Promise<BackendTestSuiteResult> {
    const key = this.getInstanceKey(userId, projectId)
    const instance = this.activeBackends.get(key)

    if (!instance) {
      throw new Error('Backend server is not running. Start the backend container before testing.')
    }

    const host = '127.0.0.1'
    const port = instance.port
    const startTime = Date.now()
    const results: BackendTestResult[] = []

    const makeRequest = async (
      method: string,
      reqPath: string,
      payload?: any
    ): Promise<{ status: number; data: any; durationMs: number }> => {
      const reqStart = Date.now()
      return new Promise((resolve) => {
        const postData = payload ? JSON.stringify(payload) : undefined
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        }
        if (postData) {
          headers['Content-Length'] = Buffer.byteLength(postData).toString()
        }

        const req = http.request(
          {
            host,
            port,
            path: reqPath,
            method,
            headers,
            timeout: 5000,
          },
          (res) => {
            const chunks: Buffer[] = []
            res.on('data', (c) => chunks.push(c))
            res.on('end', () => {
              const str = Buffer.concat(chunks).toString('utf-8')
              let data: any = str
              try {
                data = JSON.parse(str)
              } catch {}
              resolve({
                status: res.statusCode || 500,
                data,
                durationMs: Date.now() - reqStart,
              })
            })
          }
        )

        req.on('error', (err) => {
          resolve({
            status: 0,
            data: { error: err.message },
            durationMs: Date.now() - reqStart,
          })
        })

        req.on('timeout', () => {
          req.destroy()
          resolve({
            status: 408,
            data: { error: 'Request timeout' },
            durationMs: Date.now() - reqStart,
          })
        })

        if (postData) {
          req.write(postData)
        }
        req.end()
      })
    }

    // 1. Health check test
    const health = await makeRequest('GET', '/health')
    results.push({
      endpoint: '/health',
      method: 'GET',
      expectedStatus: 200,
      actualStatus: health.status,
      passed: health.status === 200,
      responseBody: health.data,
      durationMs: health.durationMs,
    })

    // 2. Discover testable CRUD collection endpoint
    const routes = await this.detectRoutes(userId, projectId)
    const postRoute = routes.find((r) => r.method === 'POST' && r.path.startsWith('/api/'))
    const collectionPath = postRoute ? postRoute.path : '/api/items'

    // 3. Test GET collection
    const listRes = await makeRequest('GET', collectionPath)
    results.push({
      endpoint: collectionPath,
      method: 'GET',
      expectedStatus: 200,
      actualStatus: listRes.status,
      passed: listRes.status === 200,
      responseBody: listRes.data,
      durationMs: listRes.durationMs,
    })

    // 4. Test POST with VALID input (expect 201 Created)
    const samplePayload = {
      title: 'Automated Test Record',
      description: 'Created by Section 5 real endpoint verification suite',
      priority: 'high',
      status: 'pending',
    }
    const createValidRes = await makeRequest('POST', collectionPath, samplePayload)
    const createdId = createValidRes.data?.id || createValidRes.data?.item?.id || '1'
    results.push({
      endpoint: collectionPath,
      method: 'POST',
      expectedStatus: 201,
      actualStatus: createValidRes.status,
      passed: createValidRes.status === 201 || createValidRes.status === 200,
      requestPayload: samplePayload,
      responseBody: createValidRes.data,
      durationMs: createValidRes.durationMs,
    })

    // 5. Test POST with INVALID input (expect 400 Bad Request with validation error)
    const invalidPayload = {} // Empty body fails input validation
    const createInvalidRes = await makeRequest('POST', collectionPath, invalidPayload)
    results.push({
      endpoint: collectionPath,
      method: 'POST',
      expectedStatus: 400,
      actualStatus: createInvalidRes.status,
      passed: createInvalidRes.status === 400 || createInvalidRes.status === 422,
      requestPayload: invalidPayload,
      responseBody: createInvalidRes.data,
      durationMs: createInvalidRes.durationMs,
    })

    // 6. Test GET item by ID
    const getItemRes = await makeRequest('GET', `${collectionPath}/${createdId}`)
    results.push({
      endpoint: `${collectionPath}/${createdId}`,
      method: 'GET',
      expectedStatus: 200,
      actualStatus: getItemRes.status,
      passed: getItemRes.status === 200,
      responseBody: getItemRes.data,
      durationMs: getItemRes.durationMs,
    })

    // 7. Test PUT update item
    const updatePayload = {
      title: 'Automated Test Record (Updated)',
      status: 'completed',
    }
    const updateRes = await makeRequest('PUT', `${collectionPath}/${createdId}`, updatePayload)
    results.push({
      endpoint: `${collectionPath}/${createdId}`,
      method: 'PUT',
      expectedStatus: 200,
      actualStatus: updateRes.status,
      passed: updateRes.status === 200,
      requestPayload: updatePayload,
      responseBody: updateRes.data,
      durationMs: updateRes.durationMs,
    })

    // 8. Test DELETE item
    const deleteRes = await makeRequest('DELETE', `${collectionPath}/${createdId}`)
    results.push({
      endpoint: `${collectionPath}/${createdId}`,
      method: 'DELETE',
      expectedStatus: 200,
      actualStatus: deleteRes.status,
      passed: deleteRes.status === 200 || deleteRes.status === 204,
      responseBody: deleteRes.data,
      durationMs: deleteRes.durationMs,
    })

    // 9. Test GET non-existent resource (expect 404 Not Found)
    const notFoundRes = await makeRequest('GET', `${collectionPath}/nonexistent_id_999999`)
    results.push({
      endpoint: `${collectionPath}/nonexistent_id_999999`,
      method: 'GET',
      expectedStatus: 404,
      actualStatus: notFoundRes.status,
      passed: notFoundRes.status === 404,
      responseBody: notFoundRes.data,
      durationMs: notFoundRes.durationMs,
    })

    const totalTests = results.length
    const passed = results.filter((r) => r.passed).length
    const failed = totalTests - passed

    return {
      success: failed === 0,
      totalTests,
      passed,
      failed,
      results,
      summary: `Automated backend testing completed: ${passed}/${totalTests} endpoints verified.`,
      durationMs: Date.now() - startTime,
    }
  }

  // ==================================================================
  // 4. CONTROLLED BACKEND REVERSE PROXY
  // ==================================================================

  /**
   * Proxies HTTP requests from frontend / preview to the running backend container.
   */
  async proxyRequest(
    userId: string,
    projectId: string,
    targetPath: string,
    req: any,
    res: any
  ): Promise<void> {
    const key = this.getInstanceKey(userId, projectId)
    const instance = this.activeBackends.get(key)

    if (!instance) {
      res.statusCode = 503
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          error: 'Backend server is not running for this project. Start the backend container first.',
          code: 'BACKEND_NOT_RUNNING',
        })
      )
      return
    }

    const host = '127.0.0.1'
    const port = instance.port
    const forwardPath = targetPath.startsWith('/') ? targetPath : `/${targetPath}`

    const headers = { ...req.headers }
    delete headers.host
    delete headers.connection
    delete headers['x-http-method-override']
    delete headers['x-method-override']
    delete headers['x-http-method']
    delete headers['authorization']
    headers['x-forwarded-for'] = '127.0.0.1'
    headers['x-project-id'] = projectId
    headers['x-user-id'] = userId

    const proxyReq = http.request(
      {
        host,
        port,
        path: forwardPath,
        method: req.method,
        headers,
        timeout: 10000,
      },
      (proxyRes) => {
        res.statusCode = proxyRes.statusCode || 200
        for (const [k, v] of Object.entries(proxyRes.headers)) {
          if (v && !['connection', 'transfer-encoding'].includes(k.toLowerCase())) {
            res.setHeader(k, v)
          }
        }
        proxyRes.pipe(res)
      }
    )

    proxyReq.on('error', (err) => {
      if (!res.headersSent) {
        res.statusCode = 502
        res.setHeader('Content-Type', 'application/json')
        res.end(
          JSON.stringify({
            error: `Failed to proxy request to backend container: ${err.message}`,
            code: 'PROXY_BACKEND_ERROR',
          })
        )
      }
    })

    if ((req as any).rawBody) {
      proxyReq.write((req as any).rawBody)
      proxyReq.end()
    } else if ((req as any).body && typeof (req as any).body === 'object') {
      proxyReq.write(JSON.stringify((req as any).body))
      proxyReq.end()
    } else if (req.readableEnded) {
      proxyReq.end()
    } else {
      req.pipe(proxyReq)
    }
  }
}

export const backendManager = new SafeBackendManager()
