// ====================================================================
// ANOTHER ME — SECTION 3: REAL PACKAGE MANAGER ENGINE
// Manages package dependencies, package listing, installation, and builds.
// Strictly enforces container sandbox boundaries:
// Untrusted package installations and lifecycle scripts (preinstall/install/postinstall)
// are strictly blocked when container isolation (Docker) is unavailable.
// Never claims a build or installation succeeded unless the real process exited with 0.
// ====================================================================

import fs from 'fs'
import path from 'path'
import { workspaceManager } from './workspaceManager'
import { processExecutor, isDockerAvailable } from './processExecutor'
import type { PackageManagerResult, ProcessExecutionOptions } from './types'

export class SafePackageManager {
  /**
   * Safely lists declared dependencies and scripts from workspace package.json.
   * Safe to run on host without executing code.
   */
  async listPackages(userId: string, projectId: string): Promise<PackageManagerResult> {
    const wsRoot = workspaceManager.getWorkspaceRoot(userId, projectId)
    const pkgJsonPath = path.join(wsRoot, 'package.json')

    if (!fs.existsSync(pkgJsonPath)) {
      return {
        operation: 'list',
        success: true,
        status: 'verified',
        details: 'package.json does not exist in workspace yet.',
        packages: {},
        devDependencies: {},
        scripts: {},
      }
    }

    try {
      const content = fs.readFileSync(pkgJsonPath, 'utf-8')
      const parsed = JSON.parse(content)

      return {
        operation: 'list',
        success: true,
        status: 'verified',
        details: `Successfully inspected ${parsed.name || 'project'} package dependencies.`,
        packages: parsed.dependencies || {},
        devDependencies: parsed.devDependencies || {},
        scripts: parsed.scripts || {},
      }
    } catch (e: any) {
      return {
        operation: 'list',
        success: false,
        status: 'failed',
        details: `Failed to parse package.json: ${e.message}`,
        error: 'INVALID_PACKAGE_JSON',
      }
    }
  }

  /**
   * Installs packages in the workspace.
   * MANDATORY SECURITY: If container isolation (Docker) is unavailable,
   * this operation fails-closed with a clear blocked status.
   */
  async installPackage(
    userId: string,
    projectId: string,
    packageName?: string,
    options: ProcessExecutionOptions = {}
  ): Promise<PackageManagerResult> {
    const dockerAvailable = isDockerAvailable()

    if (!dockerAvailable) {
      return {
        operation: 'install',
        success: false,
        status: 'blocked_missing_sandbox',
        details:
          'Package installation blocked on host: Docker container isolation is unavailable. Arbitrary package downloads and untrusted lifecycle scripts (preinstall/install/postinstall) are strictly prohibited on the host. An isolated container is required.',
        error: 'CONTAINER_ISOLATION_REQUIRED',
      }
    }

    const wsRoot = workspaceManager.getWorkspaceRoot(userId, projectId)
    const args = packageName ? ['install', packageName] : ['install']

    // Section 4.2 Security Hardening:
    // By default, untrusted npm lifecycle scripts (preinstall, install, postinstall)
    // are strictly suppressed with --ignore-scripts during package installation.
    // Outbound network is restricted to downloading package tarballs from registry.npmjs.org.
    if (!options.allowNpmLifecycle && !args.includes('--ignore-scripts')) {
      args.push('--ignore-scripts')
    }

    try {
      const timeoutMs = options.timeoutMs || 120000
      const result = await processExecutor.executeCommand(wsRoot, 'npm', args, {
        ...options,
        timeoutMs,
        network: 'bridge',
        allowNpmLifecycle: Boolean(options.allowNpmLifecycle),
      })

      if (result.exitCode === 0) {
        return {
          operation: 'install',
          success: true,
          status: 'verified',
          details: `Package installation completed successfully inside container (exit code 0).`,
          commandExecution: result,
        }
      } else {
        return {
          operation: 'install',
          success: false,
          status: 'failed',
          details: `Package installation failed inside container with exit code ${result.exitCode}.`,
          commandExecution: result,
          error: result.stderr || 'Installation process returned non-zero exit code.',
        }
      }
    } catch (err: any) {
      return {
        operation: 'install',
        success: false,
        status: 'failed',
        details: `Package installation encountered execution error: ${err.message}`,
        error: err.message,
      }
    }
  }

  /**
   * Executes the project build script.
   * MANDATORY SECURITY: Package scripts (npm run build) execute arbitrary commands
   * and cannot run on the host without container isolation.
   * Never claims a build succeeded unless the real build command exited with 0.
   */
  async buildProject(
    userId: string,
    projectId: string,
    options: ProcessExecutionOptions = {}
  ): Promise<PackageManagerResult> {
    const dockerAvailable = isDockerAvailable()

    if (!dockerAvailable) {
      return {
        operation: 'build',
        success: false,
        status: 'blocked_missing_sandbox',
        details:
          'Project build script execution blocked on host: Docker container isolation is unavailable. Untrusted package scripts (npm run build) cannot execute safely on the host without container isolation. An isolated container is required.',
        error: 'CONTAINER_ISOLATION_REQUIRED',
      }
    }

    const wsRoot = workspaceManager.getWorkspaceRoot(userId, projectId)

    try {
      const result = await processExecutor.executeCommand(wsRoot, 'npm', ['run', 'build'], {
        ...options,
        network: 'none',
        allowNpmLifecycle: true,
      })

      if (result.exitCode === 0) {
        return {
          operation: 'build',
          success: true,
          status: 'verified',
          details: 'Project build completed successfully inside container (exit code 0).',
          commandExecution: result,
        }
      } else {
        const errorMsg = (result.stdout || result.stderr || '').trim() || 'Build process returned non-zero exit code.'
        return {
          operation: 'build',
          success: false,
          status: 'failed',
          details: `Project build failed inside container with exit code ${result.exitCode}.\n${errorMsg.slice(0, 1000)}`,
          commandExecution: result,
          error: errorMsg,
        }
      }
    } catch (err: any) {
      return {
        operation: 'build',
        success: false,
        status: 'failed',
        details: `Project build encountered execution error: ${err.message}`,
        error: err.message,
      }
    }
  }
}

export const packageManager = new SafePackageManager()
