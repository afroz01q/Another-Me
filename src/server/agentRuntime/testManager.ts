// ====================================================================
// ANOTHER ME — SECTION 7: TESTING & SECURITY MANAGER
// Manages real test suite execution inside isolated Docker containers,
// framework detection, code quality auditing (tsc, eslint, build),
// security scanning (secrets, heuristic pattern rules, dependency CVEs),
// measured code coverage, and test run history.
// Never fabricates clean results when scanners fail or tools are missing.
// ====================================================================

import fs from 'fs'
import path from 'path'
import { workspaceManager } from './workspaceManager'
import { processExecutor } from './processExecutor'
import { packageManager } from './packageManager'
import { previewTokenManager } from './previewTokenManager'
import type {
  TestFramework,
  TestSuiteRunResult,
  TestCaseResult,
  CodeQualityResult,
  CodeQualityDiagnostic,
  CodeQualityFinding,
  SecurityFinding,
  SecurityScanResult,
  CoverageSummary,
  TestRunHistoryEntry,
  ProcessExecutionResult,
} from './types'

export interface TestRunOptions {
  timeoutMs?: number
  filter?: string
  environment?: 'docker' | 'host'
}

export class SafeTestManager {
  private activeExecutions: Map<string, { executionId?: string; abortController: AbortController }> = new Map()

  /**
   * Detects supported test frameworks from project files and package.json.
   */
  public detectTestFramework(workspaceRoot: string): {
    framework: TestFramework
    command: string
    args: string[]
    coverageArgs: string[]
    supported: boolean
    detected: boolean
    reason?: string
  } {
    const pkgJsonPath = path.join(workspaceRoot, 'package.json')
    if (!fs.existsSync(pkgJsonPath)) {
      return {
        framework: null,
        command: '',
        args: [],
        coverageArgs: [],
        supported: false,
        detected: false,
        reason: 'package.json does not exist in workspace root.',
      }
    }

    try {
      const content = fs.readFileSync(pkgJsonPath, 'utf-8')
      const pkg = JSON.parse(content)
      const allDeps = {
        ...(pkg.dependencies || {}),
        ...(pkg.devDependencies || {}),
      }
      const scripts = pkg.scripts || {}
      const testScript = (scripts.test || '').toLowerCase()

      // 1. Vitest
      if (testScript.includes('vitest') || (allDeps['vitest'] && (!scripts.test || testScript.includes('vitest')))) {
        return {
          framework: 'vitest',
          command: 'npx',
          args: ['vitest', 'run', '--reporter=json'],
          coverageArgs: ['vitest', 'run', '--coverage', '--reporter=json'],
          supported: true,
          detected: true,
        }
      }

      // 2. Jest
      if (testScript.includes('jest') || (allDeps['jest'] && (!scripts.test || testScript.includes('jest')))) {
        return {
          framework: 'jest',
          command: 'npx',
          args: ['jest', '--json'],
          coverageArgs: ['jest', '--coverage', '--json'],
          supported: true,
          detected: true,
        }
      }

      // 3. Mocha
      if (testScript.includes('mocha') || (allDeps['mocha'] && (!scripts.test || testScript.includes('mocha')))) {
        return {
          framework: 'mocha',
          command: 'npx',
          args: ['mocha', '--reporter', 'json'],
          coverageArgs: ['mocha', '--reporter', 'json'],
          supported: true,
          detected: true,
        }
      }

      // 4. Custom test script defined in package.json
      if (scripts.test && !testScript.includes('no test specified')) {
        return {
          framework: 'custom',
          command: 'npm',
          args: ['test'],
          coverageArgs: ['test'],
          supported: true,
          detected: true,
        }
      }

      return {
        framework: null,
        command: '',
        args: [],
        coverageArgs: [],
        supported: false,
        detected: false,
        reason: 'No supported test framework (vitest, jest, mocha) or test script detected in package.json.',
      }
    } catch (e: any) {
      return {
        framework: null,
        command: '',
        args: [],
        coverageArgs: [],
        supported: false,
        detected: false,
        reason: `Failed to parse package.json: ${e.message}`,
      }
    }
  }

  /**
   * Executes real test runner inside isolated Docker container.
   */
  public async runTests(
    userId: string,
    projectId: string,
    options: TestRunOptions = {}
  ): Promise<TestSuiteRunResult> {
    const wsRoot = workspaceManager.getWorkspaceRoot(userId, projectId)
    const runId = `test_run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const timestamp = new Date().toISOString()
    const timeoutMs = options.timeoutMs || 90000

    const detection = this.detectTestFramework(wsRoot)

    if (!detection.supported || !detection.framework) {
      const unsupportedResult: TestSuiteRunResult = {
        runId,
        projectId,
        framework: null,
        frameworkDetected: false,
        frameworkNotice: detection.reason || 'Unsupported test framework.',
        status: 'unsupported_framework',
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        durationMs: 0,
        exitCode: 1,
        stdout: '',
        stderr: detection.reason || 'No supported test runner found.',
        testCases: [],
        timestamp,
        sandboxTier: 'container_isolated',
      }
      await this.recordHistory(wsRoot, {
        id: runId,
        type: 'test_run',
        timestamp,
        status: 'unsupported_framework',
        summaryText: detection.reason || 'No supported test framework detected',
        durationMs: 0,
        details: unsupportedResult,
      })
      return unsupportedResult
    }

    // Check if node_modules exists when dependencies are declared
    const pkgJsonPath = path.join(wsRoot, 'package.json')
    const nodeModulesPath = path.join(wsRoot, 'node_modules')
    if (fs.existsSync(pkgJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'))
        const hasDeps = Object.keys(pkg.dependencies || {}).length > 0 || Object.keys(pkg.devDependencies || {}).length > 0
        if (hasDeps && !fs.existsSync(nodeModulesPath)) {
          const missingDepsResult: TestSuiteRunResult = {
            runId,
            projectId,
            framework: detection.framework,
            frameworkDetected: true,
            frameworkNotice: 'Dependencies not installed: node_modules directory missing in workspace.',
            status: 'missing_dependencies',
            total: 0,
            passed: 0,
            failed: 0,
            skipped: 0,
            durationMs: 0,
            exitCode: 1,
            stdout: '',
            stderr: 'Cannot run tests: node_modules directory is missing. Please run dependency installation first.',
            testCases: [],
            timestamp,
            sandboxTier: 'container_isolated',
          }
          await this.recordHistory(wsRoot, {
            id: runId,
            type: 'test_run',
            timestamp,
            status: 'missing_dependencies',
            summaryText: 'Dependencies missing: node_modules not found',
            durationMs: 0,
            details: missingDepsResult,
          })
          return missingDepsResult
        }
      } catch {}
    }

    const abortController = new AbortController()
    this.activeExecutions.set(projectId, { abortController })

    const execArgs = [...detection.args]
    if (options.filter) {
      execArgs.push(options.filter)
    }

    let execResult: ProcessExecutionResult
    try {
      execResult = await processExecutor.executeCommand(wsRoot, detection.command, execArgs, {
        network: 'none',
        timeoutMs,
        allowNpmLifecycle: true,
        abortSignal: abortController.signal,
      })
    } catch (err: any) {
      this.activeExecutions.delete(projectId)
      const errorResult: TestSuiteRunResult = {
        runId,
        projectId,
        framework: detection.framework,
        frameworkDetected: true,
        frameworkNotice: `Execution error: ${err.message}`,
        status: err.code === 'PROCESS_TIMEOUT' ? 'timed_out' : 'failed',
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        durationMs: 0,
        exitCode: err.code === 'PROCESS_TIMEOUT' ? 124 : 1,
        stdout: '',
        stderr: err.message,
        testCases: [],
        timestamp,
        sandboxTier: 'container_isolated',
      }
      await this.recordHistory(wsRoot, {
        id: runId,
        type: 'test_run',
        timestamp,
        status: errorResult.status,
        summaryText: `Test execution failed: ${err.message}`,
        durationMs: 0,
        details: errorResult,
      })
      return errorResult
    } finally {
      this.activeExecutions.delete(projectId)
    }

    // Redact all sensitive tokens and credentials from test stdout/stderr
    const safeStdout = previewTokenManager.redactTokens(execResult.stdout)
    const safeStderr = previewTokenManager.redactTokens(execResult.stderr)

    // Parse structured test output
    const { testCases, total, passed, failed, skipped } = this.parseTestOutput(
      detection.framework,
      safeStdout,
      safeStderr,
      execResult.exitCode
    )

    let finalStatus: TestSuiteRunResult['status'] = 'passed'
    if (execResult.timedOut) {
      finalStatus = 'timed_out'
    } else if (execResult.cancelled) {
      finalStatus = 'cancelled'
    } else if (execResult.exitCode !== 0 || failed > 0) {
      finalStatus = 'failed'
    }

    const runResult: TestSuiteRunResult = {
      runId,
      projectId,
      framework: detection.framework,
      frameworkDetected: true,
      status: finalStatus,
      total,
      passed,
      failed,
      skipped,
      durationMs: execResult.durationMs,
      exitCode: execResult.exitCode,
      stdout: safeStdout,
      stderr: safeStderr,
      testCases,
      timestamp,
      sandboxTier: execResult.sandboxTier,
    }

    await this.recordHistory(wsRoot, {
      id: runId,
      type: 'test_run',
      timestamp,
      status: finalStatus,
      summaryText: `${passed} passed, ${failed} failed (${total} total in ${execResult.durationMs}ms)`,
      durationMs: execResult.durationMs,
      details: runResult,
    })

    return runResult
  }

  /**
   * Cancels a currently running test execution for a project.
   */
  public async cancelTests(userId: string, projectId: string): Promise<boolean> {
    const wsRoot = workspaceManager.getWorkspaceRoot(userId, projectId)
    if (!fs.existsSync(wsRoot)) {
      return false
    }
    const active = this.activeExecutions.get(projectId)
    if (!active) {
      return false
    }
    active.abortController.abort()
    this.activeExecutions.delete(projectId)
    return true
  }

  /**
   * Runs Code Quality checks: TypeScript typecheck, linter, and production build.
   * Distinguishes missing tools from successful checks.
   */
  public async runQualityChecks(userId: string, projectId: string): Promise<CodeQualityResult> {
    const wsRoot = workspaceManager.getWorkspaceRoot(userId, projectId)
    const timestamp = new Date().toISOString()
    const pkgJsonPath = path.join(wsRoot, 'package.json')
    const tsconfigPath = path.join(wsRoot, 'tsconfig.json')

    let pkg: any = {}
    if (fs.existsSync(pkgJsonPath)) {
      try {
        pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'))
      } catch {}
    }

    // 1. TypeScript Check
    let typeCheckResult: CodeQualityResult['typeCheck'] = {
      status: 'not_configured',
      errorsCount: 0,
      diagnostics: [],
      durationMs: 0,
      output: 'tsconfig.json not found in workspace.',
    }

    if (fs.existsSync(tsconfigPath)) {
      try {
        const startTs = Date.now()
        const tscExec = await processExecutor.executeCommand(wsRoot, 'npx', ['tsc', '--noEmit'], {
          network: 'none',
          timeoutMs: 45000,
        })
        const durationMs = Date.now() - startTs
        const combinedOut = previewTokenManager.redactTokens(`${tscExec.stdout}\n${tscExec.stderr}`).trim()

        if (tscExec.exitCode === 0) {
          typeCheckResult = {
            status: 'passed',
            errorsCount: 0,
            diagnostics: [],
            durationMs,
            output: combinedOut || 'Type check passed with zero diagnostics.',
          }
        } else {
          const diagnostics = this.parseTscDiagnostics(combinedOut)
          typeCheckResult = {
            status: 'failed',
            errorsCount: diagnostics.length || 1,
            diagnostics,
            durationMs,
            output: combinedOut,
          }
        }
      } catch (err: any) {
        typeCheckResult = {
          status: 'failed',
          errorsCount: 1,
          diagnostics: [{ message: err.message }],
          durationMs: 0,
          output: err.message,
        }
      }
    }

    // 2. Linter (ESLint)
    let linterResult: CodeQualityResult['linter'] = {
      status: 'not_configured',
      details: 'ESLint is not installed or configured in this project.',
      errorsCount: 0,
      warningsCount: 0,
      findings: [],
      output: 'ESLint configuration not detected.',
    }

    const hasEslintDep = Boolean(
      (pkg.dependencies && pkg.dependencies['eslint']) ||
      (pkg.devDependencies && pkg.devDependencies['eslint'])
    )
    const hasEslintConfig =
      fs.existsSync(path.join(wsRoot, '.eslintrc.json')) ||
      fs.existsSync(path.join(wsRoot, '.eslintrc.js')) ||
      fs.existsSync(path.join(wsRoot, '.eslintrc.cjs')) ||
      fs.existsSync(path.join(wsRoot, 'eslint.config.js')) ||
      fs.existsSync(path.join(wsRoot, 'eslint.config.mjs'))

    if (hasEslintDep && hasEslintConfig) {
      try {
        const startLint = Date.now()
        const lintExec = await processExecutor.executeCommand(
          wsRoot,
          'npx',
          ['eslint', '--format', 'json', '.'],
          { network: 'none', timeoutMs: 45000 }
        )
        const _durationMs = Date.now() - startLint
        void _durationMs
        const safeOut = previewTokenManager.redactTokens(lintExec.stdout)

        let parsedLint: any[] = []
        try {
          parsedLint = JSON.parse(safeOut)
        } catch {}

        const findings: CodeQualityFinding[] = []
        let errorsCount = 0
        let warningsCount = 0

        for (const fileReport of parsedLint) {
          const relFile = path.relative(wsRoot, fileReport.filePath || '')
          for (const msg of fileReport.messages || []) {
            if (msg.severity === 2) errorsCount++
            if (msg.severity === 1) warningsCount++
            findings.push({
              file: relFile,
              line: msg.line || 1,
              column: msg.column || 1,
              rule: msg.ruleId || 'eslint-rule',
              message: msg.message || '',
              severity: msg.severity === 2 ? 'error' : 'warning',
            })
          }
        }

        linterResult = {
          status: errorsCount > 0 ? 'failed' : 'passed',
          details: `ESLint reported ${errorsCount} error(s) and ${warningsCount} warning(s).`,
          errorsCount,
          warningsCount,
          findings,
          output: safeOut,
        }
      } catch (e: any) {
        linterResult = {
          status: 'failed',
          details: `ESLint execution failed: ${e.message}`,
          errorsCount: 1,
          warningsCount: 0,
          findings: [],
          output: e.message,
        }
      }
    }

    // 3. Production Build Check
    let buildResult: CodeQualityResult['build'] = {
      status: 'not_configured',
      exitCode: 0,
      durationMs: 0,
      output: 'No build script defined in package.json.',
    }

    if (pkg.scripts && pkg.scripts.build) {
      try {
        const buildResp = await packageManager.buildProject(userId, projectId)
        buildResult = {
          status: buildResp.success ? 'passed' : 'failed',
          exitCode: buildResp.commandExecution?.exitCode || (buildResp.success ? 0 : 1),
          durationMs: buildResp.commandExecution?.durationMs || 0,
          output: previewTokenManager.redactTokens(
            `${buildResp.commandExecution?.stdout || ''}\n${buildResp.commandExecution?.stderr || ''}`
          ).trim() || buildResp.details,
          error: buildResp.error,
        }
      } catch (err: any) {
        buildResult = {
          status: 'failed',
          exitCode: 1,
          durationMs: 0,
          output: err.message,
          error: err.message,
        }
      }
    }

    let overallStatus: CodeQualityResult['overallStatus'] = 'passed'
    if (typeCheckResult.status === 'failed' || buildResult.status === 'failed' || linterResult.status === 'failed') {
      overallStatus = 'failed'
    } else if (linterResult.warningsCount > 0) {
      overallStatus = 'warning'
    }

    const qualityResult: CodeQualityResult = {
      typeCheck: typeCheckResult,
      linter: linterResult,
      build: buildResult,
      overallStatus,
      timestamp,
    }

    await this.recordHistory(wsRoot, {
      id: `quality_${Date.now()}`,
      type: 'quality_check',
      timestamp,
      status: overallStatus,
      summaryText: `TypeCheck: ${typeCheckResult.status}, Linter: ${linterResult.status}, Build: ${buildResult.status}`,
      durationMs: typeCheckResult.durationMs + buildResult.durationMs,
      details: qualityResult,
    })

    return qualityResult
  }

  /**
   * Executes security scanning: hardcoded secrets, heuristic dangerous code patterns,
   * insecure configurations, and genuine dependency audit via npm audit.
   * Never displays a clean result when a scanner fails or is unavailable.
   */
  public async runSecurityScan(userId: string, projectId: string): Promise<SecurityScanResult> {
    const wsRoot = workspaceManager.getWorkspaceRoot(userId, projectId)
    const scanId = `sec_scan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const timestamp = new Date().toISOString()
    const findings: SecurityFinding[] = []

    // PART 1: Hardcoded Secrets Scanner
    const secretFindings = await this.scanHardcodedSecrets(wsRoot)
    findings.push(...secretFindings)

    // PART 2: Heuristic Static Code & Configuration Analysis
    const patternFindings = await this.scanDangerousPatterns(wsRoot)
    findings.push(...patternFindings)

    // PART 3: Dependency Vulnerability Audit (npm audit)
    const depAudit = await this.auditDependencies(wsRoot)
    if (depAudit.findings.length > 0) {
      findings.push(...depAudit.findings)
    }

    // Calculate Summary Metrics
    const summary = {
      critical: findings.filter((f) => f.severity === 'critical').length,
      high: findings.filter((f) => f.severity === 'high').length,
      moderate: findings.filter((f) => f.severity === 'moderate').length,
      low: findings.filter((f) => f.severity === 'low').length,
      info: findings.filter((f) => f.severity === 'info').length,
      total: findings.length,
    }

    let overallStatus: SecurityScanResult['status'] = 'completed'
    let scannerNotice: string =
      'Heuristic rules identify potential risk patterns, not proof of exploitability.'

    if (depAudit.status === 'scanner_failed') {
      overallStatus = 'scanner_failed'
      scannerNotice = `Heuristic rules identify potential risk patterns, not proof of exploitability. Dependency vulnerability scanner could not complete: ${depAudit.error}. Result does NOT certify zero vulnerabilities.`
    } else if (depAudit.status === 'offline_restricted') {
      overallStatus = 'offline_restricted'
      scannerNotice =
        'Heuristic rules identify potential risk patterns, not proof of exploitability. Network access restricted in sandbox. Upstream advisory feed was unreachable.'
    }

    const scanResult: SecurityScanResult = {
      scanId,
      projectId,
      status: overallStatus,
      scannerNotice,
      timestamp,
      findings,
      summary,
      dependencyAuditStatus: depAudit.status,
      dependencyAuditError: depAudit.error,
    }

    await this.recordHistory(wsRoot, {
      id: scanId,
      type: 'security_scan',
      timestamp,
      status: overallStatus,
      summaryText: `Found ${summary.total} issue(s) (${summary.critical} critical, ${summary.high} high). Scanner: ${overallStatus}`,
      durationMs: 0,
      details: scanResult,
    })

    return scanResult
  }

  /**
   * Runs measured code coverage when supported tools are configured.
   */
  public async runCoverage(userId: string, projectId: string): Promise<CoverageSummary> {
    const wsRoot = workspaceManager.getWorkspaceRoot(userId, projectId)
    const detection = this.detectTestFramework(wsRoot)

    if (!detection.supported || !detection.framework) {
      return {
        available: false,
        reason: 'No supported test framework configured to collect code coverage.',
        lines: { total: 0, covered: 0, pct: 0 },
        statements: { total: 0, covered: 0, pct: 0 },
        functions: { total: 0, covered: 0, pct: 0 },
        branches: { total: 0, covered: 0, pct: 0 },
        untestedFiles: this.findUntestedSourceFiles(wsRoot, []),
      }
    }

    // Check for coverage package in package.json
    const pkgJsonPath = path.join(wsRoot, 'package.json')
    let hasCoverageTool = false
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'))
      const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }
      if (
        allDeps['@vitest/coverage-v8'] ||
        allDeps['@vitest/coverage-istanbul'] ||
        allDeps['c8'] ||
        allDeps['nyc']
      ) {
        hasCoverageTool = true
      }
    } catch {}

    if (!hasCoverageTool) {
      return {
        available: false,
        reason:
          'Coverage tool (e.g. @vitest/coverage-v8) is not installed in project dependencies. Measured coverage is unavailable.',
        lines: { total: 0, covered: 0, pct: 0 },
        statements: { total: 0, covered: 0, pct: 0 },
        functions: { total: 0, covered: 0, pct: 0 },
        branches: { total: 0, covered: 0, pct: 0 },
        untestedFiles: this.findUntestedSourceFiles(wsRoot, []),
      }
    }

    try {
      const covExec = await processExecutor.executeCommand(wsRoot, detection.command, detection.coverageArgs, {
        network: 'none',
        timeoutMs: 90000,
        allowNpmLifecycle: true,
      })

      // Check for coverage report file on disk
      const summaryJsonPath = path.join(wsRoot, 'coverage', 'coverage-summary.json')
      if (fs.existsSync(summaryJsonPath)) {
        const raw = JSON.parse(fs.readFileSync(summaryJsonPath, 'utf-8'))
        const total = raw.total || {}
        const testedFiles: string[] = []
        const fileCoverage: any[] = []

        for (const [filePath, data] of Object.entries<any>(raw)) {
          if (filePath === 'total') continue
          const relPath = path.relative(wsRoot, filePath)
          testedFiles.push(relPath)
          fileCoverage.push({
            file: relPath,
            linesPct: data.lines?.pct || 0,
            branchesPct: data.branches?.pct || 0,
            functionsPct: data.functions?.pct || 0,
            statementsPct: data.statements?.pct || 0,
          })
        }

        const untestedFiles = this.findUntestedSourceFiles(wsRoot, testedFiles)

        return {
          available: true,
          lines: total.lines || { total: 0, covered: 0, pct: 0 },
          statements: total.statements || { total: 0, covered: 0, pct: 0 },
          functions: total.functions || { total: 0, covered: 0, pct: 0 },
          branches: total.branches || { total: 0, covered: 0, pct: 0 },
          untestedFiles,
          fileCoverage,
        }
      }

      return {
        available: false,
        reason: `Coverage command completed with exit code ${covExec.exitCode}, but coverage/coverage-summary.json was not generated.`,
        lines: { total: 0, covered: 0, pct: 0 },
        statements: { total: 0, covered: 0, pct: 0 },
        functions: { total: 0, covered: 0, pct: 0 },
        branches: { total: 0, covered: 0, pct: 0 },
        untestedFiles: this.findUntestedSourceFiles(wsRoot, []),
      }
    } catch (e: any) {
      return {
        available: false,
        reason: `Coverage measurement failed: ${e.message}`,
        lines: { total: 0, covered: 0, pct: 0 },
        statements: { total: 0, covered: 0, pct: 0 },
        functions: { total: 0, covered: 0, pct: 0 },
        branches: { total: 0, covered: 0, pct: 0 },
        untestedFiles: this.findUntestedSourceFiles(wsRoot, []),
      }
    }
  }

  /**
   * Returns test, security, and quality run history for a project.
   */
  public async getHistory(userId: string, projectId: string): Promise<TestRunHistoryEntry[]> {
    const wsRoot = workspaceManager.getWorkspaceRoot(userId, projectId)
    const historyPath = path.join(wsRoot, '.workspace_test_history.jsonl')
    if (!fs.existsSync(historyPath)) {
      return []
    }

    try {
      const lines = fs.readFileSync(historyPath, 'utf-8').split(/\r?\n/).filter(Boolean)
      const entries: TestRunHistoryEntry[] = []
      for (const line of lines) {
        try {
          entries.push(JSON.parse(line))
        } catch {}
      }
      return entries.reverse().slice(0, 50)
    } catch {
      return []
    }
  }

  // ------------------------------------------------------------------
  // INTERNAL HELPERS & SCANNERS
  // ------------------------------------------------------------------

  private async recordHistory(workspaceRoot: string, entry: TestRunHistoryEntry): Promise<void> {
    try {
      const historyPath = path.join(workspaceRoot, '.workspace_test_history.jsonl')
      fs.appendFileSync(historyPath, JSON.stringify(entry) + '\n', 'utf-8')
    } catch {}
  }

  private parseTestOutput(
    _framework: TestFramework,
    stdout: string,
    stderr: string,
    exitCode: number
  ): {
    testCases: TestCaseResult[]
    total: number
    passed: number
    failed: number
    skipped: number
  } {
    const testCases: TestCaseResult[] = []

    // 1. Try parsing JSON output from Vitest / Jest / Mocha
    try {
      // Find JSON object in stdout (sometimes preceded by console banners)
      const jsonStart = stdout.indexOf('{')
      const jsonEnd = stdout.lastIndexOf('}')
      if (jsonStart !== -1 && jsonEnd > jsonStart) {
        const jsonStr = stdout.slice(jsonStart, jsonEnd + 1)
        const parsed = JSON.parse(jsonStr)

        // Vitest / Jest format
        if (Array.isArray(parsed.testResults)) {
          let passed = 0
          let failed = 0
          let skipped = 0

          for (const suite of parsed.testResults) {
            const suiteName = path.basename(suite.name || 'TestSuite')
            for (const assertion of suite.assertionResults || []) {
              const status: TestCaseResult['status'] =
                assertion.status === 'passed' ? 'passed' : assertion.status === 'pending' ? 'skipped' : 'failed'

              if (status === 'passed') passed++
              else if (status === 'failed') failed++
              else skipped++

              testCases.push({
                id: `tc_${testCases.length + 1}`,
                name: assertion.title || assertion.fullName || 'Unnamed Test',
                suite: suiteName,
                status,
                durationMs: assertion.duration || 0,
                error: assertion.failureMessages?.length
                  ? {
                      message: previewTokenManager.redactTokens(assertion.failureMessages[0].split('\n')[0]),
                      stack: previewTokenManager.redactTokens(assertion.failureMessages.join('\n')),
                    }
                  : undefined,
              })
            }
          }

          return {
            testCases,
            total: passed + failed + skipped,
            passed,
            failed,
            skipped,
          }
        }

        // Mocha JSON format
        if (parsed.stats && Array.isArray(parsed.tests)) {
          let passed = parsed.stats.passes || 0
          let failed = parsed.stats.failures || 0
          let skipped = parsed.stats.pending || 0

          for (const t of parsed.tests) {
            const status: TestCaseResult['status'] = t.err ? 'failed' : 'passed'
            testCases.push({
              id: `tc_${testCases.length + 1}`,
              name: t.title || t.fullTitle || 'Unnamed Test',
              suite: t.suite || 'TestSuite',
              status,
              durationMs: t.duration || 0,
              error: t.err
                ? {
                    message: previewTokenManager.redactTokens(t.err.message || ''),
                    stack: previewTokenManager.redactTokens(t.err.stack || ''),
                  }
                : undefined,
            })
          }

          return {
            testCases,
            total: passed + failed + skipped,
            passed,
            failed,
            skipped,
          }
        }
      }
    } catch {}

    // 2. Fallback text parsing for TAP or standard console output
    const combined = `${stdout}\n${stderr}`
    const lines = combined.split('\n')
    let passed = 0
    let failed = 0
    let skipped = 0

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()

      // Match passing test lines (e.g. "✓ test name (12ms)" or "ok 1 - test name")
      if (/^[✓√]\s+|PASS\s+|ok\s+\d+\s+-/i.test(line)) {
        passed++
        testCases.push({
          id: `tc_${testCases.length + 1}`,
          name: line.replace(/^[✓√]\s+|PASS\s+|ok\s+\d+\s+-\s*/i, '').replace(/\([0-9]+ms\)/, '').trim(),
          suite: 'TestSuite',
          status: 'passed',
          durationMs: 0,
        })
      }
      // Match failing test lines (e.g. "✕ test name (15ms)" or "FAIL ...")
      else if (/^[✕✗x]\s+|FAIL\s+|not ok\s+\d+\s+-/i.test(line)) {
        failed++
        const errorLines = lines.slice(i + 1, i + 6).join('\n')
        testCases.push({
          id: `tc_${testCases.length + 1}`,
          name: line.replace(/^[✕✗x]\s+|FAIL\s+|not ok\s+\d+\s+-\s*/i, '').replace(/\([0-9]+ms\)/, '').trim(),
          suite: 'TestSuite',
          status: 'failed',
          durationMs: 0,
          error: {
            message: previewTokenManager.redactTokens(line),
            stack: previewTokenManager.redactTokens(errorLines),
          },
        })
      }
    }

    if (testCases.length === 0) {
      if (exitCode === 0) {
        passed = 1
        testCases.push({
          id: 'tc_1',
          name: 'Project Test Suite',
          suite: 'Root',
          status: 'passed',
          durationMs: 0,
        })
      } else {
        failed = 1
        testCases.push({
          id: 'tc_1',
          name: 'Project Test Suite',
          suite: 'Root',
          status: 'failed',
          durationMs: 0,
          error: {
            message: 'Test command failed with non-zero exit code.',
            stack: previewTokenManager.redactTokens(stderr || stdout),
          },
        })
      }
    }

    return {
      testCases,
      total: passed + failed + skipped,
      passed,
      failed,
      skipped,
    }
  }

  private parseTscDiagnostics(output: string): CodeQualityDiagnostic[] {
    const diagnostics: CodeQualityDiagnostic[] = []
    const cleanOutput = output.replace(/\u001b\[[0-9;]*m/g, '')
    const lines = cleanOutput.split(/\r?\n/)
    const regex1 = /^([^(]+)\((\d+),(\d+)\):\s*error\s*(TS\d+):\s*(.+)$/i
    const regex2 = /^([^:]+):(\d+):(\d+)\s*[-:]\s*error\s*(TS\d+):\s*(.+)$/i

    for (const rawLine of lines) {
      const line = rawLine.trim()
      const m1 = line.match(regex1)
      if (m1) {
        diagnostics.push({
          file: m1[1].trim(),
          line: parseInt(m1[2], 10),
          column: parseInt(m1[3], 10),
          code: m1[4].trim(),
          message: m1[5].trim(),
        })
        continue
      }
      const m2 = line.match(regex2)
      if (m2) {
        diagnostics.push({
          file: m2[1].trim(),
          line: parseInt(m2[2], 10),
          column: parseInt(m2[3], 10),
          code: m2[4].trim(),
          message: m2[5].trim(),
        })
        continue
      }
      const generalMatch = line.match(/(error\s+TS\d+|TS\d+:\s*.+)/i)
      if (generalMatch && !line.startsWith('Found ') && !line.includes('Watching for')) {
        diagnostics.push({
          message: line,
        })
      }
    }

    if (diagnostics.length === 0 && cleanOutput.trim()) {
      diagnostics.push({
        message: cleanOutput.slice(0, 300),
      })
    }

    return diagnostics
  }

  /**
   * Scans workspace source files for hardcoded secrets, API keys, tokens, and private keys.
   */
  private async scanHardcodedSecrets(workspaceRoot: string): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = []
    const files = this.collectSourceFiles(workspaceRoot)

    const secretRules: Array<{
      id: string
      name: string
      severity: SecurityFinding['severity']
      regex: RegExp
      redact: (match: string) => string
    }> = [
      {
        id: 'SEC_RULE_SECRET_PRIVATE_KEY',
        name: 'Hardcoded RSA / Private Cryptographic Key',
        severity: 'critical',
        regex: /-----BEGIN (?:RSA|EC|PGP|OPENSSH|DSA)? ?PRIVATE KEY/i,
        redact: () => '-----BEGIN [REDACTED PRIVATE KEY]-----',
      },
      {
        id: 'SEC_RULE_SECRET_OPENAI_KEY',
        name: 'Hardcoded OpenAI / AI Provider API Key',
        severity: 'critical',
        regex: /sk-[A-Za-z0-9_-]{24,}/,
        redact: (m) => `${m.slice(0, 5)}...[REDACTED]`,
      },
      {
        id: 'SEC_RULE_SECRET_GOOGLE_KEY',
        name: 'Hardcoded Google Cloud / Gemini API Key',
        severity: 'high',
        regex: /AIzaSy[A-Za-z0-9_-]{33}/,
        redact: () => 'AIzaSy...[REDACTED]',
      },
      {
        id: 'SEC_RULE_SECRET_GITHUB_TOKEN',
        name: 'Hardcoded GitHub Personal Access Token',
        severity: 'critical',
        regex: /ghp_[A-Za-z0-9]{36}/,
        redact: () => 'ghp_...[REDACTED]',
      },
      {
        id: 'SEC_RULE_SECRET_AWS_KEY',
        name: 'Hardcoded AWS Access Key ID',
        severity: 'high',
        regex: /(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/,
        redact: (m) => `${m.slice(0, 4)}...[REDACTED]`,
      },
      {
        id: 'SEC_RULE_SECRET_DATABASE_URL',
        name: 'Database Connection String With Plaintext Password',
        severity: 'critical',
        regex: /(?:postgres|postgresql|mysql|mongodb|redis):\/\/[^:\s]+:([^@\s]+)@/i,
        redact: (m) => m.replace(/:([^@\s]+)@/, ':[REDACTED]@'),
      },
      {
        id: 'SEC_RULE_SECRET_JWT',
        name: 'Hardcoded JWT Signing Secret',
        severity: 'high',
        regex: /(?:jwt[_-]?secret|token[_-]?secret)\s*[:=]\s*['"]([^'"]{8,})['"]/i,
        redact: (m) => m.replace(/['"]([^'"]{8,})['"]/, '"[REDACTED]"'),
      },
      {
        id: 'SEC_RULE_SECRET_PASSWORD',
        name: 'Hardcoded Plaintext Password Assignment',
        severity: 'high',
        regex: /(?:password|passwd|db_password)\s*[:=]\s*['"]([^'"]{6,})['"]/i,
        redact: (m) => m.replace(/['"]([^'"]{6,})['"]/, '"[REDACTED]"'),
      },
    ]

    for (const relFile of files) {
      const fullPath = path.join(workspaceRoot, relFile)
      let content = ''
      try {
        content = fs.readFileSync(fullPath, 'utf-8')
      } catch {
        continue
      }

      const lines = content.split('\n')
      for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const lineText = lines[lineIdx]

        for (const rule of secretRules) {
          const match = lineText.match(rule.regex)
          if (match) {
            findings.push({
              id: `sec_${findings.length + 1}`,
              category: 'secret',
              severity: rule.severity,
              title: rule.name,
              description: `A hardcoded credential (${rule.name}) was detected in source code.`,
              file: relFile,
              line: lineIdx + 1,
              evidence: rule.redact(match[0]),
              remediation: 'Remove the credential immediately, rotate the compromised secret, and configure it as an environment variable.',
              ruleId: rule.id,
              heuristic: false,
            })
          }
        }
      }
    }

    return findings
  }

  /**
   * Scans workspace for dangerous code patterns and configurations using heuristic static rules.
   * All findings are explicitly labeled heuristic: true.
   */
  private async scanDangerousPatterns(workspaceRoot: string): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = []
    const files = this.collectSourceFiles(workspaceRoot)

    const heuristicRules: Array<{
      id: string
      title: string
      category: SecurityFinding['category']
      severity: SecurityFinding['severity']
      regex: RegExp
      description: string
      remediation: string
    }> = [
      {
        id: 'SEC_RULE_DANGEROUS_EVAL',
        title: 'Dynamic Code Execution via eval() or Function()',
        category: 'dangerous_pattern',
        severity: 'critical',
        regex: /\b(eval\s*\(|new\s+Function\s*\()/,
        description: 'Dynamic code execution primitives allow arbitrary JavaScript execution if provided untrusted inputs.',
        remediation: 'Avoid eval() and Function() constructor; use structured parsing like JSON.parse() or dedicated interpreters.',
      },
      {
        id: 'SEC_RULE_DANGEROUS_INNER_HTML',
        title: 'Direct HTML Injection (XSS Vector)',
        category: 'dangerous_pattern',
        severity: 'high',
        regex: /(?:\.innerHTML\s*=|\bdangerouslySetInnerHTML\s*=)/,
        description: 'Writing unescaped HTML directly to the DOM can lead to Cross-Site Scripting (XSS) vulnerabilities.',
        remediation: 'Use safe DOM text manipulation (textContent) or sanitize HTML with DOMPurify before insertion.',
      },
      {
        id: 'SEC_RULE_UNRESTRICTED_CHILD_PROCESS',
        title: 'Child Process Shell Execution',
        category: 'dangerous_pattern',
        severity: 'high',
        regex: /\bchild_process\b.*(?:\.exec\s*\(|\.execSync\s*\(|shell\s*:\s*true)/,
        description: 'Executing commands with shell: true or via exec() enables command injection when parameters contain untrusted characters.',
        remediation: 'Use spawnFile or spawn without shell: true and pass arguments as discrete array elements.',
      },
      {
        id: 'SEC_RULE_TLS_REJECT_UNAUTHORIZED',
        title: 'TLS Certificate Verification Disabled',
        category: 'insecure_config',
        severity: 'critical',
        regex: /NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]0['"]/,
        description: 'Disabling Node TLS verification leaves all HTTPS connections vulnerable to Man-in-the-Middle (MitM) attacks.',
        remediation: 'Never disable NODE_TLS_REJECT_UNAUTHORIZED in code. Install legitimate CA certificates in the system store.',
      },
      {
        id: 'SEC_RULE_PERMISSIVE_CORS',
        title: 'Permissive Wildcard CORS Configuration',
        category: 'insecure_config',
        severity: 'moderate',
        regex: /Access-Control-Allow-Origin['"]?\s*:\s*['"]\*['"]/,
        description: 'Allowing all origins via wildcard (*) can expose private APIs if combined with credentials.',
        remediation: 'Configure a strict whitelist of authorized origins instead of wildcard *.',
      },
      {
        id: 'SEC_RULE_UNVALIDATED_SSRF_FETCH',
        title: 'Potential Server-Side Request Forgery (SSRF)',
        category: 'auth_flaw',
        severity: 'high',
        regex: /fetch\s*\(\s*(?:req\.body|req\.query|req\.params)\.[a-zA-Z0-9_]+\s*[,)]/,
        description: 'Forwarding requests directly to user-supplied URLs allows attackers to probe internal networks or cloud metadata.',
        remediation: 'Validate destination URLs against an allowlist and block private IP ranges (RFC 1918) and link-local metadata addresses.',
      },
    ]

    for (const relFile of files) {
      const fullPath = path.join(workspaceRoot, relFile)
      let content = ''
      try {
        content = fs.readFileSync(fullPath, 'utf-8')
      } catch {
        continue
      }

      const lines = content.split('\n')
      for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const lineText = lines[lineIdx]

        for (const rule of heuristicRules) {
          if (rule.regex.test(lineText)) {
            findings.push({
              id: `sec_${findings.length + 1}`,
              category: rule.category,
              severity: rule.severity,
              title: rule.title,
              description: rule.description,
              file: relFile,
              line: lineIdx + 1,
              evidence: previewTokenManager.redactTokens(lineText.trim()),
              remediation: rule.remediation,
              ruleId: rule.id,
              heuristic: true,
            })
          }
        }
      }
    }

    // Check for committed .env file with secrets
    const envPath = path.join(workspaceRoot, '.env')
    if (fs.existsSync(envPath)) {
      findings.push({
        id: `sec_${findings.length + 1}`,
        category: 'insecure_config',
        severity: 'high',
        title: 'Committed .env File Detected in Workspace',
        description: 'A .env file was discovered in the repository workspace. Committing environment files risks secret exposure.',
        file: '.env',
        line: 1,
        evidence: '.env file present in workspace root',
        remediation: 'Add .env to .gitignore and use .env.example with placeholder values.',
        ruleId: 'RULE_COMMITTED_ENV',
        heuristic: true,
      })
    }

    return findings
  }

  /**
   * Executes genuine dependency vulnerability audit via npm audit.
   * If scanner fails or cannot run, preserves error and does NOT report clean status.
   */
  private async auditDependencies(workspaceRoot: string): Promise<{
    status: 'completed' | 'scanner_failed' | 'offline_restricted' | 'not_available'
    error?: string
    findings: SecurityFinding[]
  }> {
    const pkgJsonPath = path.join(workspaceRoot, 'package.json')
    if (!fs.existsSync(pkgJsonPath)) {
      return { status: 'not_available', findings: [] }
    }

    try {
      // Run npm audit --json inside container
      const auditExec = await processExecutor.executeCommand(
        workspaceRoot,
        'npm',
        ['audit', '--json'],
        {
          network: 'bridge',
          timeoutMs: 45000,
          allowNpmLifecycle: true,
        }
      )

      const stdout = auditExec.stdout.trim()
      let parsedAudit: any = null
      try {
        parsedAudit = JSON.parse(stdout)
      } catch {}

      if (!parsedAudit || parsedAudit.error) {
        return {
          status: 'scanner_failed',
          error: parsedAudit?.error?.summary || auditExec.stderr || 'npm audit returned unparseable output or error.',
          findings: [],
        }
      }

      const findings: SecurityFinding[] = []
      const vulnerabilities = parsedAudit.vulnerabilities || {}

      for (const [pkgName, vulnData] of Object.entries<any>(vulnerabilities)) {
        const severityRaw = (vulnData.severity || 'low').toLowerCase()
        const severity: SecurityFinding['severity'] =
          severityRaw === 'critical' ? 'critical' : severityRaw === 'high' ? 'high' : severityRaw === 'moderate' ? 'moderate' : 'low'

        const via = Array.isArray(vulnData.via) ? vulnData.via : []
        const advisory = via.find((v: any) => typeof v === 'object') || {}

        findings.push({
          id: `vuln_${findings.length + 1}`,
          category: 'vulnerable_dependency',
          severity,
          title: advisory.title || `Vulnerable Dependency: ${pkgName}`,
          description: `Package ${pkgName} has a known vulnerability affecting versions ${vulnData.range || 'installed'}.`,
          remediation: vulnData.fixAvailable
            ? `Upgrade ${pkgName} to version ${vulnData.fixAvailable?.version || 'latest secure release'}.`
            : 'Review upstream advisories for manual remediation.',
          ruleId: `CVE_${advisory.cwe?.[0] || 'ADVISORY'}`,
          heuristic: false,
          packageName: pkgName,
          installedVersion: vulnData.nodes?.[0] || vulnData.range,
          fixedVersion: typeof vulnData.fixAvailable === 'object' ? vulnData.fixAvailable.version : undefined,
          advisoryUrl: advisory.url,
          cve: advisory.cwe?.[0],
        })
      }

      return {
        status: 'completed',
        findings,
      }
    } catch (err: any) {
      return {
        status: 'scanner_failed',
        error: `Failed to execute npm audit: ${err.message}`,
        findings: [],
      }
    }
  }

  private collectSourceFiles(dir: string, baseDir: string = dir): string[] {
    const results: string[] = []
    const ignored = new Set(['node_modules', 'dist', '.git', 'coverage', '.cache'])

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (ignored.has(entry.name) || entry.name.startsWith('.')) continue

        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          results.push(...this.collectSourceFiles(fullPath, baseDir))
        } else if (
          /\.(ts|tsx|js|jsx|json|html|css|sql|env)$/i.test(entry.name) &&
          !entry.name.endsWith('.d.ts')
        ) {
          results.push(path.relative(baseDir, fullPath).replace(/\\/g, '/'))
        }
      }
    } catch {}

    return results
  }

  private findUntestedSourceFiles(workspaceRoot: string, testedFiles: string[]): string[] {
    const allFiles = this.collectSourceFiles(workspaceRoot)
    const testedSet = new Set(testedFiles.map((f) => f.replace(/\\/g, '/')))

    return allFiles.filter((f) => {
      if (f.includes('test') || f.includes('spec') || f.endsWith('.json')) return false
      return !testedSet.has(f)
    })
  }
}

export const testManager = new SafeTestManager()
