import React, { useState, useRef, useEffect, useMemo } from 'react'
import {
  Play, RefreshCw, Smartphone, Tablet, Monitor, Download, ExternalLink,
  Code, Terminal, CheckCircle2, Circle, AlertCircle, Sparkles, Send,
  Mic, ChevronRight, ChevronDown, Layers, FileCode, Check, Copy, ArrowLeft,
  Settings, Undo, Eye, Palette, CheckCheck, ShieldAlert,
  Package, StopCircle, Trash2, Plus, ShieldCheck, Box,
  Database, Server, RotateCcw, AlertTriangle, Activity,
  Lock, Bug, XCircle, FileText,
  GitBranch, GitCommit, GitPullRequest, UploadCloud, Globe, Archive, FolderDown,
  Folder, FolderOpen, ListTodo, HelpCircle
} from 'lucide-react'
import { useBuildStore, useAuthStore, useTwinStore } from '@/store'
import { TwinPiPWidget } from './TwinPiPWidget'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'
import type { DeploymentProvider, GitHubResolutionStrategy, GitHubFileResolution } from '../../server/agentRuntime/types'
import { SKILLS_CATALOG_DATA, getSkillsCatalogFiles, CANONICAL_RULES_CONTENT } from '../../server/agentRuntime/skillsCatalog'

interface FileTreeNode {
  name: string
  path: string
  isDirectory: boolean
  children: FileTreeNode[]
}

function buildTreeFromFileList(paths: string[]): FileTreeNode[] {
  const root: FileTreeNode = { name: '', path: '', isDirectory: true, children: [] }

  for (const rawPath of paths) {
    const normalized = rawPath.replace(/\\/g, '/').replace(/^\/+/, '')
    const parts = normalized.split('/').filter(Boolean)
    let current = root

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isLast = i === parts.length - 1
      let existing = current.children.find((c) => c.name === part)

      if (!existing) {
        existing = {
          name: part,
          path: parts.slice(0, i + 1).join('/'),
          isDirectory: !isLast,
          children: [],
        }
        current.children.push(existing)
      }
      current = existing
    }
  }

  function sortNodes(nodes: FileTreeNode[]) {
    nodes.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1
      if (!a.isDirectory && b.isDirectory) return 1
      return a.name.localeCompare(b.name)
    })
    for (const n of nodes) {
      if (n.isDirectory) sortNodes(n.children)
    }
  }

  sortNodes(root.children)
  return root.children
}

interface TreeItemProps {
  node: FileTreeNode
  depth: number
  activePath: string
  expandedFolders: Set<string>
  toggleFolder: (path: string) => void
  onSelectFile: (path: string) => void
}

const TreeItem: React.FC<TreeItemProps> = ({
  node,
  depth,
  activePath,
  expandedFolders,
  toggleFolder,
  onSelectFile,
}) => {
  const isExpanded = expandedFolders.has(node.path)
  const isSelected = activePath === node.path

  if (node.isDirectory) {
    let FolderIcon = isExpanded ? FolderOpen : Folder
    let folderColor = 'text-[#da7756]'

    if (node.name === '.rules') {
      FolderIcon = ShieldCheck
      folderColor = 'text-amber-400'
    } else if (node.name === '.skills') {
      FolderIcon = Sparkles
      folderColor = 'text-emerald-400'
    } else if (node.name === 'docs') {
      FolderIcon = FileText
      folderColor = 'text-blue-400'
    } else if (node.name === 'public') {
      FolderIcon = Globe
      folderColor = 'text-cyan-400'
    } else if (node.name === 'src') {
      FolderIcon = Code
      folderColor = 'text-[#da7756]'
    } else if (node.name === 'supabase') {
      FolderIcon = Database
      folderColor = 'text-emerald-400'
    } else if (node.name === 'tasks') {
      FolderIcon = ListTodo
      folderColor = 'text-purple-400'
    }

    return (
      <div>
        <button
          onClick={() => toggleFolder(node.path)}
          className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-mono text-zinc-300 hover:bg-zinc-800/80 transition-all text-left group"
          style={{ paddingLeft: `${depth * 10 + 6}px` }}
        >
          {isExpanded ? (
            <ChevronDown size={12} className="text-zinc-500 shrink-0 group-hover:text-zinc-300" />
          ) : (
            <ChevronRight size={12} className="text-zinc-500 shrink-0 group-hover:text-zinc-300" />
          )}
          <FolderIcon size={14} className={cn('shrink-0', folderColor)} />
          <span className="truncate font-semibold text-zinc-200">{node.name}</span>
        </button>
        {isExpanded && (
          <div className="space-y-0.5">
            {node.children.map((child) => (
              <TreeItem
                key={child.path}
                node={child}
                depth={depth + 1}
                activePath={activePath}
                expandedFolders={expandedFolders}
                toggleFolder={toggleFolder}
                onSelectFile={onSelectFile}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  // Determine icon by file extension
  const ext = node.name.split('.').pop()?.toLowerCase()
  let IconComp = FileCode
  let iconClass = 'text-blue-400'

  if (ext === 'sh') {
    IconComp = Terminal
    iconClass = 'text-amber-400'
  } else if (ext === 'yml' || ext === 'yaml' || ext === 'toml') {
    IconComp = Settings
    iconClass = 'text-rose-400'
  } else if (ext === 'md') {
    IconComp = FileText
    iconClass = 'text-zinc-400'
  } else if (ext === 'css') {
    IconComp = Palette
    iconClass = 'text-cyan-400'
  } else if (ext === 'sql') {
    IconComp = Database
    iconClass = 'text-purple-400'
  } else if (ext === 'svg' || ext === 'png') {
    IconComp = Globe
    iconClass = 'text-emerald-400'
  } else if (ext === 'html') {
    IconComp = FileCode
    iconClass = 'text-[#da7756]'
  }

  return (
    <button
      onClick={() => onSelectFile(node.path)}
      className={cn(
        'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-mono transition-all text-left truncate',
        isSelected
          ? 'bg-[#da7756]/20 text-[#da7756] font-semibold border border-[#da7756]/30'
          : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
      )}
      style={{ paddingLeft: `${depth * 10 + 16}px` }}
      title={node.path}
    >
      <IconComp size={13} className={cn('shrink-0', iconClass)} />
      <span className="truncate">{node.name}</span>
    </button>
  )
}

interface TwinBuildWorkspaceProps {
  onBackToTwin?: () => void
}

export function TwinBuildWorkspace({ onBackToTwin }: TwinBuildWorkspaceProps) {
  const { user } = useAuthStore()
  const { settings: twinSettings } = useTwinStore()
  const {
    currentProject,
    isBuilding,
    isEditing,
    activeTab,
    setActiveTab,
    setActiveFile,
    setViewportMode,
    refreshPreview,
    applyUserEdit,
    approveAndBuild,
    requestPlanChanges,
    rejectPlan,
    startNewProject,
    loadProject,
    startRuntimeExecution,
    cancelRuntimeExecution,
    retryRuntimeTask,
    fetchWorkspaceFiles,
    loadWorkspaceFileContent,
    runtimeStatus,
    isRuntimeExecuting,
    workspaceFiles,
    fileChanges,
    runtimeActiveFileContent,
    downloadProjectZip,

    // Section 3 Terminal & Package Manager
    terminalSessions,
    activeTerminalSessionId,
    terminalHistory,
    isTerminalExecuting,
    packageInfo,
    loadTerminalSessions,
    createTerminalSession,
    setActiveTerminalSessionId,
    executeTerminalCommand,
    cancelTerminalCommand,
    clearTerminalHistory,
    inspectPackages,
    installPackage,
    buildProject,

    // Section 5 Real Backend & Database
    backendStatus,
    migrations,
    backendTestResults,
    isBackendLoading,
    backendError,
    fetchBackendStatus,
    startBackendServer,
    stopBackendServer,
    fetchMigrations,
    applyMigrations,
    rollbackMigration,
    seedDatabase,
    runBackendTests,
    generateBackendApi,

    // Section 6 Live Preview & Debugging
    previewLifecycleState,
    previewLogs,
    previewNetworkErrors,
    previewRuntimeErrors,
    activeDebugResult,
    isDebugging,
    fetchPreviewStatus,
    startLivePreview,
    stopLivePreview,
    restartLivePreview,
    fetchPreviewLogs,
    debugLiveError,
    addPreviewNetworkError,
    addPreviewRuntimeError,
    clearPreviewErrors,

    // Section 7 Testing & Security
    testSuiteResult,
    codeQualityResult,
    securityScanResult,
    coverageSummary,
    testHistory,
    activeTestFixProposal,
    isTesting,
    isQualityChecking,
    isSecurityScanning,
    isCoverageRunning,
    isFixingTest,
    runProjectTests,
    cancelProjectTests,
    fetchTestHistory,
    runCodeQualityAudit,
    runSecurityAudit,
    runCoverageAnalysis,
    proposeFixForFinding,
    applyTestFixProposal,
    clearTestFixProposal,

    // Section 8 GitHub, Export & Deployment
    githubStatus,
    githubRepos,
    githubBranches,
    githubCommits,
    githubDiff,
    githubConflict,
    exportManifest,
    exportValidation,
    deploymentConfig,
    configuredProviders,
    deploymentPlan,
    deploymentsList,
    activeDeployment,
    isGitHubLoading,
    isExportLoading,
    isDeployLoading,
    fetchGitHubStatus,
    connectGitHubToken,
    disconnectGitHubSession,
    loadGitHubRepos,
    createNewGitHubRepo,
    loadGitHubBranches,
    loadGitHubCommits,
    fetchGitHubDiff,
    pushToGitHubRepo,
    clearGitHubConflict,
    resolveGitHubConflictAndPush,
    inspectProjectExport,
    validateProjectExport,
    downloadCleanZip,
    fetchDeploymentConfig,
    fetchDeploymentPlan,
    triggerDeployment,
    cancelActiveDeployment,
    rollbackActiveDeployment,
    fetchDeploymentHistory,
  } = useBuildStore()

  const [inputPrompt, setInputPrompt] = useState('')
  const [emptyPrompt, setEmptyPrompt] = useState('')
  const [backendPrompt, setBackendPrompt] = useState('')
  const [showDestructiveModal, setShowDestructiveModal] = useState(false)
  const [pendingDestructiveReasons, setPendingDestructiveReasons] = useState<string[]>([])
  const [copiedCode, setCopiedCode] = useState(false)
  const [iframeError, setIframeError] = useState<string | null>(null)
  const [previewRuntimeError, setPreviewRuntimeError] = useState<{ message: string; filename?: string; lineno?: number } | null>(null)
  const [showDebugModal, setShowDebugModal] = useState(false)
  const [activeDebugError, setActiveDebugError] = useState<{ error: string; errorType: 'runtime' | 'build' | 'network'; file?: string; line?: number } | null>(null)
  const [showChangeInput, setShowChangeInput] = useState(false)
  const [changeInstruction, setChangeInstruction] = useState('')
  const [clarificationAnswer, setClarificationAnswer] = useState('')
  const [isRestoring, setIsRestoring] = useState(false)
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const logsEndRef = useRef<HTMLDivElement>(null)

  // Section 7 Testing & Security local state
  const [testingSubTab, setTestingSubTab] = useState<'tests' | 'quality' | 'security' | 'dependencies' | 'coverage' | 'history'>('tests')
  const [testFilterPath, setTestFilterPath] = useState('')

  // Section 8 GitHub, Export & Deployment local state
  const [exportDeploySubTab, setExportDeploySubTab] = useState<'github' | 'export' | 'deploy'>('github')
  const [githubTokenInput, setGithubTokenInput] = useState('')
  const [selectedRepoFullName, setSelectedRepoFullName] = useState('')
  const [selectedBranch, setSelectedBranch] = useState('main')
  const [commitMessageInput, setCommitMessageInput] = useState('Update project via Another Me')
  const [newRepoName, setNewRepoName] = useState('')
  const [newRepoDesc, setNewRepoDesc] = useState('')
  const [newRepoPrivate, setNewRepoPrivate] = useState(true)
  const [showNewRepoModal, setShowNewRepoModal] = useState(false)
  const [showPushConfirmModal, setShowPushConfirmModal] = useState(false)
  const [selectedDeployProvider, setSelectedDeployProvider] = useState<DeploymentProvider>('vercel')
  const [showDeployApprovalModal, setShowDeployApprovalModal] = useState(false)
  const [overrideCriticalSecurity, setOverrideCriticalSecurity] = useState(false)
  const [conflictStrategy, setConflictStrategy] = useState<GitHubResolutionStrategy>('theirs')
  const [fileResolutions, setFileResolutions] = useState<Record<string, { action: 'ours' | 'theirs' | 'custom'; customContent?: string }>>({})
  const [activeConflictFile, setActiveConflictFile] = useState<string | null>(null)
  const [editingCustomContent, setEditingCustomContent] = useState<string>('')

  // Load Section 8 data when active tab is export_deploy
  useEffect(() => {
    if (currentProject?.id && activeTab === 'export_deploy') {
      fetchGitHubStatus().then(() => {
        if (useBuildStore.getState().githubStatus?.connected) {
          loadGitHubRepos()
        }
      })
      inspectProjectExport()
      fetchDeploymentConfig()
      fetchDeploymentHistory()
    }
  }, [currentProject?.id, activeTab])

  // Load backend status and migrations when active tab is backend
  useEffect(() => {
    if (currentProject?.id && activeTab === 'backend') {
      fetchBackendStatus()
      fetchMigrations()
    }
  }, [currentProject?.id, activeTab])

  // Load preview status when active tab is preview
  useEffect(() => {
    if (currentProject?.id && activeTab === 'preview') {
      fetchPreviewStatus()
    }
  }, [currentProject?.id, activeTab])

  // Load test history when testing tab is active
  useEffect(() => {
    if (currentProject?.id && activeTab === 'testing') {
      fetchTestHistory().catch(() => {})
    }
  }, [currentProject?.id, activeTab])

  // Listen for preview runtime error, network error, and loaded events from isolated iframe
  useEffect(() => {
    const handlePreviewMessage = (event: MessageEvent) => {
      if (event.data?.type === 'PREVIEW_RUNTIME_ERROR') {
        const errObj = {
          message: event.data.message || 'Unknown runtime error',
          filename: event.data.filename,
          lineno: event.data.lineno,
        }
        setPreviewRuntimeError(errObj)
        addPreviewRuntimeError(errObj)
      } else if (event.data?.type === 'PREVIEW_NETWORK_ERROR') {
        addPreviewNetworkError({
          url: event.data.url,
          method: event.data.method,
          status: event.data.status,
          statusText: event.data.statusText,
          message: event.data.message,
        })
      } else if (event.data?.type === 'PREVIEW_LOADED') {
        setPreviewRuntimeError(null)
      }
    }
    window.addEventListener('message', handlePreviewMessage)
    return () => window.removeEventListener('message', handlePreviewMessage)
  }, [])

  // Section 3 Terminal UI State
  const [terminalViewMode, setTerminalViewMode] = useState<'terminal' | 'logs' | 'packages'>('terminal')
  const [terminalInput, setTerminalInput] = useState('')
  const [packageInstallInput, setPackageInstallInput] = useState('')
  const [isPackageOperationRunning, setIsPackageOperationRunning] = useState(false)
  const terminalBottomRef = useRef<HTMLDivElement>(null)

  // Load terminal sessions when project workspace is active
  useEffect(() => {
    const isRuntimeActive =
      currentProject?.id &&
      !currentProject.id.startsWith('temp_') &&
      currentProject.status !== 'received' &&
      currentProject.status !== 'analyzing' &&
      currentProject.status !== 'planning' &&
      currentProject.status !== 'awaiting_approval'

    if (isRuntimeActive) {
      loadTerminalSessions(currentProject.id)
      inspectPackages(true).catch(() => {})
    }
  }, [currentProject?.id, currentProject?.status])

  // Auto-scroll terminal history
  useEffect(() => {
    if (activeTab === 'logs' && terminalViewMode === 'terminal') {
      terminalBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [terminalHistory, activeTab, terminalViewMode])

  // Auto-scroll terminal logs
  useEffect(() => {
    if (activeTab === 'logs') {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [currentProject?.logs, activeTab])

  // Restore Active Project after refresh or navigation
  useEffect(() => {
    if (currentProject || isBuilding) return

    const urlParams = new URLSearchParams(window.location.search)
    const savedProjectId = urlParams.get('projectId') || localStorage.getItem('another-me-active-project-id')

    if (!savedProjectId) return

    let isMounted = true
    setIsRestoring(true)
    setRestoreError(null)

    loadProject(savedProjectId, user?.id || '')
      .then(() => {
        if (!isMounted) return
        setIsRestoring(false)
      })
      .catch((err: any) => {
        if (!isMounted) return
        setIsRestoring(false)
        const statusCode =
          err.statusCode ||
          (err.message?.includes('404')
            ? 404
            : err.message?.includes('401')
            ? 401
            : err.message?.includes('403')
            ? 403
            : 500)

        if (statusCode === 404 || err.message?.includes('not found')) {
          localStorage.removeItem('another-me-active-project-id')
          if (urlParams.has('projectId')) window.history.replaceState({}, '', window.location.pathname)
          toast.error('The active project was not found or has been deleted.')
        } else if (statusCode === 401 || err.message?.includes('expired') || err.message?.includes('Authentication')) {
          localStorage.removeItem('another-me-active-project-id')
          if (urlParams.has('projectId')) window.history.replaceState({}, '', window.location.pathname)
          toast.error('Session expired. Please log in again to restore your project.')
        } else if (statusCode === 403 || err.message?.includes('Access denied')) {
          localStorage.removeItem('another-me-active-project-id')
          if (urlParams.has('projectId')) window.history.replaceState({}, '', window.location.pathname)
          toast.error('Cannot access project owned by another user.')
        } else {
          setRestoreError(err.message || 'Failed to restore project')
          toast.error(`Could not restore project: ${err.message}`)
        }
      })

    return () => {
      isMounted = false
    }
  }, [user?.id])

  // Loading State: Restoring active project
  if (isRestoring) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[85vh] p-6 max-w-md mx-auto text-center space-y-4 select-none animate-fadeIn">
        <div className="w-16 h-16 rounded-2xl bg-[#da7756]/15 border border-[#da7756]/30 flex items-center justify-center text-[#da7756] shadow-xl">
          <RefreshCw size={28} className="animate-spin" />
        </div>
        <div className="space-y-1.5">
          <h3 className="text-xl font-bold text-white font-serif tracking-tight">Restoring Active Project...</h3>
          <p className="text-xs text-zinc-400 max-w-sm leading-relaxed">
            Reconnecting to your authenticated session and loading the architecture blueprint, task DAG, and roadmap status.
          </p>
        </div>
      </div>
    )
  }

  // Error State: Project restore failed
  if (restoreError && !currentProject) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[85vh] p-6 max-w-md mx-auto text-center space-y-4 select-none animate-fadeIn">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 shadow-xl">
          <ShieldAlert size={28} />
        </div>
        <div className="space-y-1.5">
          <h3 className="text-xl font-bold text-white font-serif tracking-tight">Could Not Restore Project</h3>
          <p className="text-xs text-red-300 leading-relaxed max-w-sm">{restoreError}</p>
        </div>
        <div className="flex gap-3 pt-2">
          <button
            onClick={() => {
              setRestoreError(null)
              localStorage.removeItem('another-me-active-project-id')
            }}
            className="btn-primary px-4 py-2 rounded-xl text-xs font-semibold"
          >
            Start New Project
          </button>
        </div>
      </div>
    )
  }

  // Empty State: Full conversational creation interface
  if (!currentProject) {
    const promptExamples = [
      {
        title: 'Personal Portfolio',
        prompt: 'Build a responsive personal portfolio website with a hero section, About page, Projects section, contact form, mobile navigation, and dark theme.',
        tag: 'Portfolio',
      },
      {
        title: 'Modern E-Commerce Store',
        prompt: 'Build a modern e-commerce website with product listings, search, shopping cart, authentication, and an admin dashboard.',
        tag: 'E-Commerce',
      },
      {
        title: 'SaaS Product Landing Page',
        prompt: 'Build a modern SaaS product landing page with interactive feature tabs, dynamic pricing calculator, testimonials carousel, and FAQ accordion.',
        tag: 'SaaS',
      },
    ]

    const handleStartBuild = (promptText: string) => {
      const text = promptText.trim()
      if (!text) {
        toast.error('Please enter a website description')
        return
      }
      startNewProject(text, user?.id || 'user', twinSettings?.name)
    }

    return (
      <div className="flex flex-col items-center justify-center min-h-[85vh] p-6 max-w-4xl mx-auto space-y-8 select-none">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-3xl bg-[#da7756]/15 border border-[#da7756]/30 flex items-center justify-center text-[#da7756] shadow-xl mx-auto">
            <Sparkles size={32} />
          </div>
          <h2 className="font-serif text-3xl font-bold text-white tracking-tight">Twin Build Mode</h2>
          <p className="text-zinc-400 text-sm max-w-xl mx-auto">
            Instruct your personal AI Twin to architect and code complete, responsive websites from scratch using real-time AI reasoning, full-stack code generation, and sandboxed live preview.
          </p>
        </div>

        {/* Primary Prompt Input Box */}
        <div className="w-full glass-panel p-5 rounded-2xl border border-zinc-800 shadow-2xl space-y-4 bg-[#141418]/90 text-left">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">
              What would you like your Twin to build?
            </label>
            <span className="text-[11px] text-zinc-500 font-mono">
              Scaffolds: .rules/ .skills/ docs/ public/ src/ supabase/ tasks/
            </span>
          </div>

          {/* Quick Setup Category Chips */}
          <div className="space-y-1.5">
            <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 block">
              1. Choose Website Type:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {[
                'Personal Portfolio',
                'E-Commerce Store',
                'SaaS Landing Page',
                'Creative Agency',
                'Restaurant & Online Menu',
                'Tech Blog & Docs',
              ].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() =>
                    setEmptyPrompt((prev) =>
                      prev ? `${prev}, Type: ${cat}` : `Build a modern ${cat}`
                    )
                  }
                  className="px-2.5 py-1 rounded-lg text-xs bg-zinc-900 border border-zinc-800 hover:border-[#da7756]/50 text-zinc-300 hover:text-white transition-all cursor-pointer"
                >
                  + {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Quick Feature Chips */}
          <div className="space-y-1.5">
            <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 block">
              2. Add Key Sections & Features:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {[
                'Hero Showcase',
                'Product/Service Grid',
                'Interactive Modal',
                'Pricing Matrix',
                'Contact Form',
                'Supabase Database',
                'Obsidian Dark Mode',
              ].map((feat) => (
                <button
                  key={feat}
                  type="button"
                  onClick={() =>
                    setEmptyPrompt((prev) =>
                      prev ? `${prev} with ${feat}` : `Include ${feat}`
                    )
                  }
                  className="px-2.5 py-1 rounded-lg text-xs bg-zinc-900 border border-zinc-800 hover:border-[#da7756]/50 text-zinc-300 hover:text-white transition-all cursor-pointer"
                >
                  + {feat}
                </button>
              ))}
            </div>
          </div>

          <div className="relative pt-1">
            <textarea
              rows={3}
              value={emptyPrompt}
              onChange={(e) => setEmptyPrompt(e.target.value)}
              placeholder="e.g. Build a responsive personal portfolio website with a hero section, About page, Projects section, contact form, mobile navigation, and dark theme..."
              className="w-full bg-zinc-900 border border-zinc-800 focus:border-[#da7756] rounded-xl p-3.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-[#da7756] resize-none transition-all"
            />
          </div>
          <div className="flex items-center justify-between gap-3 pt-1">
            <span className="text-xs text-zinc-500 flex items-center gap-1.5">
              <Sparkles size={14} className="text-[#da7756]" />
              Modular ES components, design tokens, and quality checks
            </span>
            <button
              onClick={() => handleStartBuild(emptyPrompt)}
              disabled={!emptyPrompt.trim()}
              className="btn-primary px-6 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 shadow-lg disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <Play size={16} />
              <span>Start Building with Twin</span>
            </button>
          </div>
        </div>

        {/* Prompt Inspiration Presets */}
        <div className="w-full space-y-3">
          <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider text-left">
            Or select an example prompt to start:
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {promptExamples.map((item, idx) => (
              <button
                key={idx}
                onClick={() => handleStartBuild(item.prompt)}
                className="p-4 rounded-xl bg-zinc-900/70 hover:bg-zinc-800/80 border border-zinc-800 hover:border-[#da7756]/50 text-left transition-all group flex flex-col justify-between space-y-2"
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-white group-hover:text-[#da7756] transition-colors">
                      {item.title}
                    </span>
                    <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                      {item.tag}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 line-clamp-3 leading-relaxed">
                    "{item.prompt}"
                  </p>
                </div>
                <div className="text-[11px] text-[#da7756] font-semibold flex items-center gap-1 pt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span>Build this project</span>
                  <ChevronRight size={12} />
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const canonicalFallbackFiles = [
    'index.html',
    'package.json',
    'docs/architecture.md',
    'docs/requirements.md',
    'docs/api-specs.md',
    'tasks/task-backlog.md',
    '.rules/check.sh',
    '.rules/contrast.yml',
    '.rules/require-button-interactions.yml',
    '.rules/SelectItem.yml',
    '.rules/slot-nesting.yml',
    '.rules/supabase-edge-functions.yml',
    '.rules/supabase-google-sso.yml',
    '.rules/testBuild.sh',
    '.rules/toast-hook.yml',
    ...SKILLS_CATALOG_DATA.map((s) => `.skills/${s.slug}/SKILL.md`),
    'public/favicon.svg',
    'public/manifest.json',
    'src/main.js',
    'src/components/Navbar.js',
    'src/components/Hero.js',
    'src/components/Features.js',
    'src/components/DetailsModal.js',
    'src/components/Footer.js',
    'src/styles/theme.css',
    'src/styles/main.css',
    'src/utils/dom.js',
    'src/utils/api.js',
    'supabase/config.toml',
    'supabase/migrations/01_initial_schema.sql',
    'supabase/edge-functions/inquire/index.ts',
  ]

  const realWorkspaceFiles = workspaceFiles.filter((f) => !f.isDirectory).map((f) => f.relativePath)
  const rawFilesList = realWorkspaceFiles.length > 0 ? realWorkspaceFiles : Object.keys(currentProject.files)
  const filesList = rawFilesList.length > 0 ? rawFilesList : canonicalFallbackFiles
  const fallbackSkills = useMemo(() => getSkillsCatalogFiles(), [])
  const activeCode =
    runtimeActiveFileContent ||
    currentProject.files[currentProject.activeFilePath] ||
    CANONICAL_RULES_CONTENT[currentProject.activeFilePath] ||
    fallbackSkills[currentProject.activeFilePath] ||
    ''

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => {
    return new Set([
      '.rules',
      '.skills',
      'docs',
      'public',
      'src',
      'src/components',
      'src/styles',
      'src/utils',
      'supabase',
      'tasks',
    ])
  })

  const toggleFolder = (folderPath: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(folderPath)) {
        next.delete(folderPath)
      } else {
        next.add(folderPath)
      }
      return next
    })
  }

  const fileTree = useMemo(() => {
    return buildTreeFromFileList(filesList)
  }, [filesList])

  const handleCopyCode = () => {
    if (!activeCode) return
    navigator.clipboard.writeText(activeCode)
    setCopiedCode(true)
    setTimeout(() => setCopiedCode(false), 2000)
    toast.success('Code copied to clipboard')
  }

  const handlePromptSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!inputPrompt.trim() || isEditing || isBuilding) return
    const text = inputPrompt.trim()
    setInputPrompt('')
    await applyUserEdit(text)
  }

  const handleQuickChip = (instruction: string) => {
    if (isEditing || isBuilding) return
    applyUserEdit(instruction)
  }

  const viewportWidths = {
    desktop: 'w-full',
    tablet: 'w-[768px] max-w-full',
    mobile: 'w-[375px] max-w-full',
  }

  return (
    <div className="flex flex-col h-full w-full bg-[#0d0d10] text-zinc-100 overflow-hidden select-none">
      {/* 1. Top Workspace Navigation & Action Bar */}
      <header className="h-14 px-4 bg-[#141418] border-b border-zinc-800 flex items-center justify-between gap-4 shrink-0 z-30">
        <div className="flex items-center gap-3 min-w-0">
          {onBackToTwin && (
            <button
              onClick={onBackToTwin}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              title="Back to Twin"
            >
              <ArrowLeft size={16} />
            </button>
          )}

          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#da7756] to-[#c15f3e] flex items-center justify-center text-white shrink-0 shadow-md">
              <Sparkles size={14} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-white truncate max-w-[200px] sm:max-w-xs">
                  {currentProject.name}
                </span>
                <span
                  className={cn(
                    'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border',
                    currentProject.status === 'completed'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : currentProject.status === 'awaiting_approval'
                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 animate-pulse'
                      : currentProject.status === 'implementing' || currentProject.status === 'planning'
                      ? 'bg-[#da7756]/15 text-[#da7756] border-[#da7756]/30 animate-pulse'
                      : currentProject.status === 'failed'
                      ? 'bg-red-500/10 text-red-400 border-red-500/30'
                      : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                  )}
                >
                  {currentProject.status.replace('_', ' ')}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Center Workspace Mode Tabs */}
        <div className="hidden md:flex items-center p-1 bg-zinc-900 border border-zinc-800 rounded-xl">
          <button
            onClick={() => setActiveTab('preview')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
              activeTab === 'preview'
                ? 'bg-[#da7756] text-white shadow-sm'
                : 'text-zinc-400 hover:text-white'
            )}
          >
            <Eye size={14} />
            <span>Live Preview</span>
          </button>
          <button
            onClick={() => setActiveTab('code')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
              activeTab === 'code'
                ? 'bg-[#da7756] text-white shadow-sm'
                : 'text-zinc-400 hover:text-white'
            )}
          >
            <Code size={14} />
            <span>Code Editor</span>
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all relative',
              activeTab === 'logs'
                ? 'bg-[#da7756] text-white shadow-sm'
                : 'text-zinc-400 hover:text-white'
            )}
          >
            <Terminal size={14} />
            <span>Terminal Logs</span>
            {isBuilding && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping absolute top-1 right-1" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('plan')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
              activeTab === 'plan'
                ? 'bg-[#da7756] text-white shadow-sm'
                : 'text-zinc-400 hover:text-white'
            )}
          >
            <Layers size={14} />
            <span>Roadmap Plan</span>
          </button>
          <button
            onClick={() => setActiveTab('backend')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all relative',
              activeTab === 'backend'
                ? 'bg-[#da7756] text-white shadow-sm'
                : 'text-zinc-400 hover:text-white'
            )}
          >
            <Database size={14} />
            <span>Backend & DB</span>
            {backendStatus?.running && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 absolute top-1 right-1" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('testing')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all relative',
              activeTab === 'testing'
                ? 'bg-[#da7756] text-white shadow-sm'
                : 'text-zinc-400 hover:text-white'
            )}
          >
            <ShieldCheck size={14} />
            <span>Testing & Security</span>
            {(testSuiteResult?.failed || 0) > 0 && (
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 absolute top-1 right-1" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('export_deploy')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all relative',
              activeTab === 'export_deploy'
                ? 'bg-[#da7756] text-white shadow-sm'
                : 'text-zinc-400 hover:text-white'
            )}
          >
            <UploadCloud size={14} />
            <span>Export & Deploy</span>
            {activeDeployment?.status === 'ready' && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 absolute top-1 right-1" />
            )}
            {activeDeployment?.status === 'failed' && (
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 absolute top-1 right-1" />
            )}
          </button>
        </div>

        {/* Right Action Buttons */}
        <div className="flex items-center gap-2">
          {currentProject.status === 'awaiting_approval' && (
            <button
              onClick={() => approveAndBuild()}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md flex items-center gap-1.5 animate-pulse"
            >
              <CheckCheck size={14} />
              <span>Approve Blueprint</span>
            </button>
          )}

          {currentProject.status === 'ready_for_execution' && (
            <div className="flex items-center gap-2">
              {isRuntimeExecuting || runtimeStatus?.executionState === 'running' ? (
                <>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#da7756]/15 border border-[#da7756]/30 text-[#da7756] text-xs font-semibold shadow-sm animate-pulse">
                    <RefreshCw size={12} className="animate-spin" />
                    <span>
                      Coding Agent (Stage {runtimeStatus?.currentStage || 1}/{runtimeStatus?.totalStages || 1})
                    </span>
                  </div>
                  <button
                    onClick={() => cancelRuntimeExecution()}
                    className="px-2.5 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 text-xs font-semibold transition-all shadow-sm"
                    title="Cancel runtime execution"
                  >
                    Cancel
                  </button>
                </>
              ) : runtimeStatus?.executionState === 'failed' ? (
                <>
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 text-xs font-semibold shadow-sm">
                    <AlertCircle size={13} />
                    <span>Task Failed</span>
                  </div>
                  <button
                    onClick={() => {
                      const failedId = runtimeStatus?.failedTaskIds?.[0] || currentProject.tasks?.find((t) => t.status === 'failed')?.id
                      if (failedId) retryRuntimeTask(failedId)
                    }}
                    className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-semibold transition-all shadow-sm flex items-center gap-1.5"
                  >
                    <RefreshCw size={12} />
                    <span>Retry Task</span>
                  </button>
                </>
              ) : runtimeStatus?.executionState === 'completed' ? (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold shadow-sm">
                  <CheckCircle2 size={14} />
                  <span>Verified & Built</span>
                </div>
              ) : (
                <button
                  onClick={() => startRuntimeExecution()}
                  className="px-3.5 py-1.5 rounded-lg bg-[#da7756] hover:bg-[#c66848] text-white text-xs font-bold transition-all shadow-md flex items-center gap-1.5 animate-pulse"
                >
                  <Play size={13} />
                  <span>Start Coding Agent</span>
                </button>
              )}
            </div>
          )}

          {activeTab === 'preview' && (
            <div className="hidden sm:flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-0.5">
              <button
                onClick={() => setViewportMode('desktop')}
                className={cn(
                  'p-1.5 rounded text-zinc-400 hover:text-white transition-colors',
                  currentProject.viewportMode === 'desktop' && 'bg-zinc-800 text-white'
                )}
                title="Desktop View (100%)"
              >
                <Monitor size={14} />
              </button>
              <button
                onClick={() => setViewportMode('tablet')}
                className={cn(
                  'p-1.5 rounded text-zinc-400 hover:text-white transition-colors',
                  currentProject.viewportMode === 'tablet' && 'bg-zinc-800 text-white'
                )}
                title="Tablet View (768px)"
              >
                <Tablet size={14} />
              </button>
              <button
                onClick={() => setViewportMode('mobile')}
                className={cn(
                  'p-1.5 rounded text-zinc-400 hover:text-white transition-colors',
                  currentProject.viewportMode === 'mobile' && 'bg-zinc-800 text-white'
                )}
                title="Mobile View (375px)"
              >
                <Smartphone size={14} />
              </button>
            </div>
          )}

          {activeTab === 'preview' && (
            <button
              onClick={refreshPreview}
              className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white transition-colors"
              title="Refresh Live Preview"
            >
              <RefreshCw size={14} />
            </button>
          )}

          <button
            onClick={downloadProjectZip}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-semibold text-zinc-300 hover:text-white transition-colors shadow-sm"
            title="Download project as ZIP archive"
          >
            <Download size={14} />
            <span className="hidden sm:inline">Export ZIP</span>
          </button>
        </div>
      </header>

      {/* Workflow State Pipeline Stepper (Section 1 Orchestrator) */}
      <div className="bg-[#101014] border-b border-zinc-800/80 px-4 py-2 flex items-center justify-between text-xs overflow-x-auto shrink-0 select-none">
        <div className="flex items-center gap-1 sm:gap-2">
          {[
            { key: 'received', label: '1. Received' },
            { key: 'analyzing', label: '2. Analyzing' },
            { key: 'planning', label: '3. Planning' },
            { key: 'awaiting_approval', label: '4. Awaiting Approval' },
            { key: 'approved', label: '5. Approved' },
            { key: 'ready_for_execution', label: '6. Ready for Execution' },
          ].map((step, idx) => {
            const stages = ['received', 'analyzing', 'planning', 'awaiting_approval', 'approved', 'ready_for_execution']
            const currentIndex = stages.indexOf(currentProject.status)
            const isDone = currentIndex > idx
            const isCurrent = currentProject.status === step.key

            return (
              <React.Fragment key={step.key}>
                <div
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-mono text-[11px] font-medium transition-all whitespace-nowrap',
                    isCurrent
                      ? 'bg-[#da7756] text-white shadow-sm ring-1 ring-[#da7756]/60 font-semibold'
                      : isDone
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-zinc-900/80 text-zinc-500 border border-zinc-800'
                  )}
                >
                  {isDone ? (
                    <CheckCircle2 size={12} className="text-emerald-400" />
                  ) : isCurrent ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
                  )}
                  <span>{step.label}</span>
                </div>
                {idx < 5 && <ChevronRight size={12} className="text-zinc-700 shrink-0" />}
              </React.Fragment>
            )
          })}
        </div>
      </div>

      {/* 2. Main Workspace Body */}
      <div className="flex-1 relative overflow-hidden flex flex-col bg-[#0f0f13]">
        {/* A. LIVE PREVIEW TAB */}
        {activeTab === 'preview' && (
          <div className="flex-1 w-full h-full flex flex-col items-center justify-center p-2 sm:p-4 bg-[#0a0a0d] overflow-auto">
            <div
              className={cn(
                'h-full transition-all duration-300 rounded-xl overflow-hidden shadow-2xl border border-zinc-800/80 bg-black flex flex-col',
                viewportWidths[currentProject.viewportMode]
              )}
            >
              {/* Preview Browser Address Bar Header */}
              <div className="h-9 bg-zinc-900 border-b border-zinc-800 px-3 flex items-center justify-between gap-2 shrink-0 select-none">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
                    <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                  </div>
                  {/* Status badge */}
                  {previewLifecycleState === 'ready' && (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      Live Ready
                    </span>
                  )}
                  {previewLifecycleState === 'building' && (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      <span className="w-1.5 h-1.5 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
                      Building
                    </span>
                  )}
                  {previewLifecycleState === 'stopped' && (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-800 text-zinc-400 border border-zinc-700">
                      <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
                      Stopped
                    </span>
                  )}
                  {previewLifecycleState === 'failed' && (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                      Error
                    </span>
                  )}
                </div>

                <div className="flex-1 max-w-sm mx-auto bg-black/40 border border-zinc-800 rounded px-2.5 py-0.5 text-[11px] text-zinc-400 font-mono truncate text-center">
                  localhost:5173/preview/{currentProject.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}
                </div>

                <div className="flex items-center gap-1 text-zinc-400">
                  {previewLifecycleState === 'stopped' ? (
                    <button
                      onClick={startLivePreview}
                      className="p-1 hover:text-emerald-400 transition-colors"
                      title="Start Live Preview"
                    >
                      <Play size={13} />
                    </button>
                  ) : (
                    <button
                      onClick={stopLivePreview}
                      className="p-1 hover:text-amber-400 transition-colors"
                      title="Stop Live Preview"
                    >
                      <StopCircle size={13} />
                    </button>
                  )}
                  <button
                    onClick={restartLivePreview}
                    className="p-1 hover:text-zinc-200 transition-colors"
                    title="Rebuild & Restart Live Preview"
                  >
                    <RotateCcw size={13} />
                  </button>
                  <button
                    onClick={refreshPreview}
                    className="p-1 hover:text-zinc-200 transition-colors"
                    title="Refresh Preview"
                  >
                    <RefreshCw size={13} />
                  </button>
                  <a
                    href={currentProject.previewUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1 hover:text-zinc-200 transition-colors"
                    title="Open in new window"
                  >
                    <ExternalLink size={13} />
                  </a>
                </div>
              </div>

              {/* Iframe Viewport with isolated origin */}
              <div className="flex-1 w-full h-full relative bg-white">
                {/* Network error banner */}
                {previewNetworkErrors.length > 0 && !previewRuntimeError && (
                  <div className="absolute top-2 left-2 right-2 z-20 px-3 py-2 rounded-lg bg-amber-950/95 border border-amber-500/60 text-amber-200 text-xs flex items-center justify-between shadow-2xl backdrop-blur-sm animate-fadeIn">
                    <div className="flex items-center gap-2 truncate">
                      <AlertTriangle size={14} className="text-amber-400 shrink-0" />
                      <span className="truncate font-mono">
                        Network Error: {previewNetworkErrors[previewNetworkErrors.length - 1].message}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => {
                          const lastErr = previewNetworkErrors[previewNetworkErrors.length - 1]
                          setActiveDebugError({
                            error: lastErr.message,
                            errorType: 'network',
                          })
                          setShowDebugModal(true)
                          debugLiveError({
                            error: lastErr.message,
                            errorType: 'network',
                          })
                        }}
                        className="px-2 py-0.5 rounded bg-amber-800/80 hover:bg-amber-700 text-[11px] font-semibold text-white transition-colors"
                      >
                        Debug with Twin
                      </button>
                      <button
                        onClick={() => clearPreviewErrors()}
                        className="text-zinc-400 hover:text-white text-xs px-1.5 py-0.5 rounded bg-black/40"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )}

                {previewRuntimeError && (
                  <div className="absolute top-2 left-2 right-2 z-20 px-3 py-2 rounded-lg bg-red-950/95 border border-red-500/60 text-red-200 text-xs flex items-center justify-between shadow-2xl backdrop-blur-sm animate-fadeIn">
                    <div className="flex items-center gap-2 truncate">
                      <AlertCircle size={14} className="text-red-400 shrink-0" />
                      <span className="truncate font-mono">
                        Preview Runtime Error: {previewRuntimeError.message}
                        {previewRuntimeError.lineno ? ` (line ${previewRuntimeError.lineno})` : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => {
                          setActiveDebugError({
                            error: previewRuntimeError.message,
                            errorType: 'runtime',
                            file: previewRuntimeError.filename,
                            line: previewRuntimeError.lineno,
                          })
                          setShowDebugModal(true)
                          debugLiveError({
                            error: previewRuntimeError.message,
                            errorType: 'runtime',
                            file: previewRuntimeError.filename,
                            line: previewRuntimeError.lineno,
                          })
                        }}
                        className="px-2 py-0.5 rounded bg-red-800/80 hover:bg-red-700 text-[11px] font-semibold text-white transition-colors"
                      >
                        Debug with Twin
                      </button>
                      <button
                        onClick={() => setPreviewRuntimeError(null)}
                        className="text-zinc-400 hover:text-white text-xs px-1.5 py-0.5 rounded bg-black/40"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )}

                {currentProject.previewUrl ? (
                  <iframe
                    key={currentProject.previewKey}
                    src={currentProject.previewUrl}
                    className="w-full h-full border-0"
                    title={currentProject.name}
                    sandbox="allow-scripts allow-forms allow-modals allow-popups"
                    onError={() => setIframeError('Failed to load live preview')}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full bg-[#0d0d11] text-zinc-500 text-sm space-y-2 p-6 text-center select-none">
                    {isBuilding || isRuntimeExecuting ? (
                      <>
                        <div className="w-8 h-8 rounded-full border-2 border-[#da7756] border-t-transparent animate-spin mb-1" />
                        <span className="text-zinc-300 font-medium">Generating & compiling project preview...</span>
                        <span className="text-xs text-zinc-500">Executing isolated Docker build and bundler</span>
                      </>
                    ) : (
                      <>
                        <Box size={32} className="text-zinc-600 mb-1" />
                        <span className="text-zinc-400 font-medium">No live preview loaded yet</span>
                        <span className="text-xs text-zinc-600 max-w-sm">
                          Click "Start Coding Agent" or submit an instruction below to build your website.
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* B. CODE EXPLORER & EDITOR TAB */}
        {activeTab === 'code' && (
          <div className="flex-1 flex h-full overflow-hidden">
            {/* File Tree Sidebar with Collapsible Folder Structure */}
            <aside className="w-64 bg-[#121216] border-r border-zinc-800 flex flex-col shrink-0 select-none">
              <div className="p-3 border-b border-zinc-800 text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-zinc-300">
                  <Folder size={14} className="text-[#da7756]" />
                  <span>Project Folders</span>
                </span>
                <span className="text-[10px] bg-zinc-800 px-1.5 py-0.5 rounded font-mono text-zinc-400">
                  {filesList.length} files
                </span>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                {fileTree.map((node) => (
                  <TreeItem
                    key={node.path}
                    node={node}
                    depth={0}
                    activePath={currentProject.activeFilePath}
                    expandedFolders={expandedFolders}
                    toggleFolder={toggleFolder}
                    onSelectFile={(selectedPath) => {
                      setActiveFile(selectedPath)
                      loadWorkspaceFileContent(selectedPath)
                    }}
                  />
                ))}
              </div>
            </aside>

            {/* Code Content Viewer */}
            <div className="flex-1 flex flex-col bg-[#16161b] overflow-hidden">
              <div className="h-10 px-4 bg-[#141418] border-b border-zinc-800 flex items-center justify-between text-xs font-mono text-zinc-400 shrink-0">
                <span className="text-zinc-300 font-semibold">{currentProject.activeFilePath}</span>
                <button
                  onClick={handleCopyCode}
                  className="flex items-center gap-1.5 text-zinc-400 hover:text-white transition-colors"
                >
                  {copiedCode ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  <span>{copiedCode ? 'Copied' : 'Copy Code'}</span>
                </button>
              </div>
              <div className="flex-1 p-4 overflow-auto font-mono text-xs text-zinc-300 leading-relaxed bg-[#0e0e12]">
                <pre className="whitespace-pre">{activeCode}</pre>
              </div>
            </div>
          </div>
        )}

        {/* C. SECTION 3: REAL TERMINAL & PACKAGE MANAGER TAB */}
        {activeTab === 'logs' && (
          <div className="flex-1 flex flex-col bg-[#0b0b0e] overflow-hidden font-mono text-xs">
            {/* Terminal Header & Mode Switcher */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800 bg-[#121217] shrink-0">
              <div className="flex items-center gap-1.5 bg-black/40 p-1 rounded-lg border border-zinc-800">
                <button
                  onClick={() => setTerminalViewMode('terminal')}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-semibold transition-all',
                    terminalViewMode === 'terminal'
                      ? 'bg-[#da7756] text-white shadow-sm'
                      : 'text-zinc-400 hover:text-white'
                  )}
                >
                  <Terminal size={12} />
                  <span>Interactive Terminal</span>
                  {terminalHistory.length > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full bg-black/40 text-[9px]">
                      {terminalHistory.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setTerminalViewMode('packages')}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-semibold transition-all',
                    terminalViewMode === 'packages'
                      ? 'bg-[#da7756] text-white shadow-sm'
                      : 'text-zinc-400 hover:text-white'
                  )}
                >
                  <Package size={12} />
                  <span>Package Manager</span>
                </button>
                <button
                  onClick={() => setTerminalViewMode('logs')}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-semibold transition-all',
                    terminalViewMode === 'logs'
                      ? 'bg-[#da7756] text-white shadow-sm'
                      : 'text-zinc-400 hover:text-white'
                  )}
                >
                  <FileCode size={12} />
                  <span>Agent Task Logs</span>
                </button>
              </div>

              {/* Session Controls & Actions */}
              <div className="flex items-center gap-2">
                {terminalSessions.length > 1 && (
                  <select
                    value={activeTerminalSessionId || ''}
                    onChange={(e) => setActiveTerminalSessionId(e.target.value)}
                    className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-[11px] text-zinc-300 focus:outline-none"
                  >
                    {terminalSessions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                )}

                <button
                  onClick={() => createTerminalSession(`Terminal ${terminalSessions.length + 1}`)}
                  className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] flex items-center gap-1 transition-colors"
                  title="Create new terminal session"
                >
                  <Plus size={11} />
                  <span>Session</span>
                </button>

                <button
                  onClick={() => clearTerminalHistory()}
                  className="px-2 py-1 rounded bg-zinc-800/80 hover:bg-red-500/20 hover:text-red-300 text-zinc-400 text-[11px] flex items-center gap-1 transition-colors"
                  title="Clear history"
                >
                  <Trash2 size={11} />
                  <span>Clear</span>
                </button>
              </div>
            </div>

            {/* VIEW 1: INTERACTIVE TERMINAL */}
            {terminalViewMode === 'terminal' && (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {terminalHistory.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-500 space-y-3">
                      <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-[#da7756]">
                        <Terminal size={24} />
                      </div>
                      <div className="space-y-1">
                        <div className="text-zinc-200 font-bold text-sm">Isolated Workspace Terminal</div>
                        <div className="text-xs text-zinc-400 max-w-md">
                          Execute inspected commands directly inside the project workspace. Real stdout, stderr, execution duration, and exit codes are captured live.
                        </div>
                      </div>
                      <div className="pt-2 flex flex-wrap gap-2 justify-center">
                        <button
                          onClick={() => executeTerminalCommand('node -v')}
                          className="px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs transition-colors"
                        >
                          $ node -v
                        </button>
                        <button
                          onClick={() => executeTerminalCommand('npm -v')}
                          className="px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs transition-colors"
                        >
                          $ npm -v
                        </button>
                        <button
                          onClick={() => executeTerminalCommand('npx tsc --noEmit')}
                          className="px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs transition-colors"
                        >
                          $ npx tsc --noEmit
                        </button>
                      </div>
                    </div>
                  ) : (
                    terminalHistory.map((cmd) => {
                      const isSuccess = cmd.status === 'succeeded'
                      const isBlocked = cmd.status === 'blocked_sandbox_required'
                      const isCancelled = cmd.status === 'cancelled'
                      const isTimedOut = cmd.status === 'timed_out'
                      const isRunning = cmd.status === 'running'

                      return (
                        <div
                          key={cmd.id}
                          className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3 space-y-2 text-left"
                        >
                          {/* Command Header */}
                          <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
                            <div className="flex items-center gap-2 font-bold text-white">
                              <span className="text-[#da7756]">$</span>
                              <span>{cmd.rawCommandString}</span>
                            </div>
                            <div className="flex items-center gap-2 text-[10px]">
                              {cmd.durationMs > 0 && (
                                <span className="text-zinc-500 font-mono">{cmd.durationMs}ms</span>
                              )}
                              {isRunning && (
                                <div className="flex items-center gap-1.5">
                                  <span className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/30 text-amber-300 animate-pulse flex items-center gap-1">
                                    <RefreshCw size={10} className="animate-spin" />
                                    <span>Running</span>
                                  </span>
                                  <button
                                    onClick={() => cancelTerminalCommand(cmd.id)}
                                    className="px-1.5 py-0.5 rounded bg-red-500/20 border border-red-500/30 text-red-300 hover:bg-red-500/30 text-[10px]"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              )}
                              {isSuccess && (
                                <span className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 font-bold">
                                  Exit 0
                                </span>
                              )}
                              {isBlocked && (
                                <span className="px-2 py-0.5 rounded bg-purple-500/20 border border-purple-500/30 text-purple-300 font-bold">
                                  Blocked (Sandbox Required)
                                </span>
                              )}
                              {isCancelled && (
                                <span className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/30 text-amber-300 font-bold">
                                  Exit 130 (Cancelled)
                                </span>
                              )}
                              {isTimedOut && (
                                <span className="px-2 py-0.5 rounded bg-red-500/20 border border-red-500/30 text-red-300 font-bold">
                                  Exit 124 (Timed Out)
                                </span>
                              )}
                              {!isRunning && !isSuccess && !isBlocked && !isCancelled && !isTimedOut && (
                                <span className="px-2 py-0.5 rounded bg-red-500/20 border border-red-500/30 text-red-300 font-bold">
                                  Exit {cmd.exitCode !== null ? cmd.exitCode : 1}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Blocked Reason Banner */}
                          {cmd.blockedReason && (
                            <div className="p-2.5 rounded bg-purple-950/40 border border-purple-800/40 text-purple-200 text-xs flex items-start gap-2">
                              <ShieldAlert size={14} className="text-purple-400 shrink-0 mt-0.5" />
                              <div className="space-y-0.5">
                                <div className="font-semibold text-purple-300">Security Gate Enforcement</div>
                                <div className="text-[11px] text-purple-300/80 leading-relaxed font-sans">
                                  {cmd.blockedReason}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Stdout Output */}
                          {cmd.stdout && (
                            <div className="p-2.5 rounded bg-black/60 border border-zinc-800/70 text-zinc-300 whitespace-pre-wrap font-mono text-[11px] leading-relaxed overflow-x-auto max-h-60">
                              {cmd.stdout}
                            </div>
                          )}

                          {/* Stderr Output */}
                          {cmd.stderr && !cmd.blockedReason && (
                            <div className="p-2.5 rounded bg-red-950/20 border border-red-900/30 text-red-300 whitespace-pre-wrap font-mono text-[11px] leading-relaxed overflow-x-auto max-h-60">
                              {cmd.stderr}
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}
                  <div ref={terminalBottomRef} />
                </div>

                {/* Command Input Prompt Form */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (terminalInput.trim() && !isTerminalExecuting) {
                      executeTerminalCommand(terminalInput.trim())
                      setTerminalInput('')
                    }
                  }}
                  className="p-3 border-t border-zinc-800 bg-[#121217] flex items-center gap-2 shrink-0"
                >
                  <span className="text-[#da7756] font-bold text-sm select-none pl-1">$</span>
                  <input
                    type="text"
                    value={terminalInput}
                    onChange={(e) => setTerminalInput(e.target.value)}
                    placeholder="Enter command (e.g. npm -v, node -v, npx tsc --noEmit)..."
                    disabled={isTerminalExecuting}
                    className="flex-1 bg-black/50 border border-zinc-800 rounded px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#da7756] font-mono"
                  />
                  {isTerminalExecuting ? (
                    <button
                      type="button"
                      onClick={() => cancelTerminalCommand()}
                      className="px-3 py-1.5 rounded bg-red-600 hover:bg-red-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
                    >
                      <StopCircle size={13} />
                      <span>Cancel</span>
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={!terminalInput.trim()}
                      className="px-3 py-1.5 rounded bg-[#da7756] hover:bg-[#e08364] disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
                    >
                      <Play size={12} />
                      <span>Run</span>
                    </button>
                  )}
                </form>
              </div>
            )}

            {/* VIEW 2: PACKAGE MANAGER */}
            {terminalViewMode === 'packages' && (
              <div className="flex-1 overflow-y-auto p-5 space-y-5 text-left">
                {/* Actions Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-zinc-900/60 border border-zinc-800">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Package size={16} className="text-[#da7756]" />
                      <span>Workspace Package Manager</span>
                    </h3>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Inspect declared dependencies, build project, or install packages inside container isolation.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => inspectPackages()}
                      className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold transition-colors flex items-center gap-1.5"
                    >
                      <RefreshCw size={12} />
                      <span>Refresh</span>
                    </button>
                    <button
                      onClick={() => buildProject()}
                      className="px-3 py-1.5 rounded bg-[#da7756] hover:bg-[#e08364] text-white text-xs font-semibold transition-colors flex items-center gap-1.5"
                    >
                      <Play size={12} />
                      <span>Run Build</span>
                    </button>
                  </div>
                </div>

                {/* Package Install Box */}
                <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800 space-y-2">
                  <div className="text-xs font-bold text-zinc-300">Install Package (Container Required)</div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={packageInstallInput}
                      onChange={(e) => setPackageInstallInput(e.target.value)}
                      placeholder="Package name (e.g. lucide-react, lodash)..."
                      className="flex-1 bg-black/50 border border-zinc-800 rounded px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#da7756]"
                    />
                    <button
                      onClick={() => {
                        if (packageInstallInput.trim()) {
                          installPackage(packageInstallInput.trim())
                          setPackageInstallInput('')
                        }
                      }}
                      disabled={!packageInstallInput.trim()}
                      className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white text-xs font-semibold transition-colors"
                    >
                      Install
                    </button>
                  </div>
                </div>

                {/* Dependencies Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Production Dependencies */}
                  <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800 space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-zinc-300 border-b border-zinc-800 pb-2">
                      <span>Dependencies</span>
                      <span className="text-zinc-500 font-mono">
                        {Object.keys(packageInfo?.packages || {}).length}
                      </span>
                    </div>
                    {Object.keys(packageInfo?.packages || {}).length === 0 ? (
                      <div className="text-xs text-zinc-500 py-3 text-center">No dependencies declared</div>
                    ) : (
                      <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
                        {Object.entries(packageInfo?.packages || {}).map(([pkg, ver]) => (
                          <div
                            key={pkg}
                            className="flex items-center justify-between py-1 px-2 rounded bg-black/30 text-xs"
                          >
                            <span className="text-white font-mono">{pkg}</span>
                            <span className="text-emerald-400 font-mono text-[11px]">{ver}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Dev Dependencies */}
                  <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800 space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-zinc-300 border-b border-zinc-800 pb-2">
                      <span>Dev Dependencies</span>
                      <span className="text-zinc-500 font-mono">
                        {Object.keys(packageInfo?.devDependencies || {}).length}
                      </span>
                    </div>
                    {Object.keys(packageInfo?.devDependencies || {}).length === 0 ? (
                      <div className="text-xs text-zinc-500 py-3 text-center">No devDependencies declared</div>
                    ) : (
                      <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
                        {Object.entries(packageInfo?.devDependencies || {}).map(([pkg, ver]) => (
                          <div
                            key={pkg}
                            className="flex items-center justify-between py-1 px-2 rounded bg-black/30 text-xs"
                          >
                            <span className="text-white font-mono">{pkg}</span>
                            <span className="text-amber-400 font-mono text-[11px]">{ver}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Declared Scripts */}
                {packageInfo?.scripts && Object.keys(packageInfo.scripts).length > 0 && (
                  <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800 space-y-2">
                    <div className="text-xs font-bold text-zinc-300 border-b border-zinc-800 pb-2">
                      Declared Package Scripts (Container Sandbox Required)
                    </div>
                    <div className="space-y-1.5 pt-1">
                      {Object.entries(packageInfo.scripts).map(([script, cmd]) => (
                        <div
                          key={script}
                          className="flex items-center justify-between py-1.5 px-3 rounded bg-black/30 text-xs gap-3"
                        >
                          <span className="text-[#da7756] font-mono font-bold shrink-0">{script}</span>
                          <span className="text-zinc-400 font-mono text-[11px] truncate">{cmd}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* VIEW 3: AGENT TASK LOGS */}
            {terminalViewMode === 'logs' && (
              <div className="flex-1 overflow-y-auto space-y-2 p-4 text-zinc-300 leading-relaxed pr-2">
                {((runtimeStatus?.terminalLogs && runtimeStatus.terminalLogs.length > 0)
                  ? runtimeStatus.terminalLogs
                  : currentProject.logs
                ).map((log: any) => {
                  const isError = log.type === 'error' || log.type === 'stderr'
                  const isSuccess = log.type === 'success'
                  const isAgent = log.type === 'agent'
                  const isCommand = log.type === 'command'
                  const isSystem = log.type === 'system'
                  return (
                    <div
                      key={log.id}
                      className={cn(
                        'p-2.5 rounded-lg border transition-all text-left space-y-1',
                        isError
                          ? 'bg-red-500/10 border-red-500/20 text-red-300'
                          : isSuccess
                          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                          : isCommand
                          ? 'bg-zinc-900 border-zinc-800 text-amber-300 font-bold'
                          : isAgent
                          ? 'bg-[#da7756]/10 border-[#da7756]/20 text-[#e08364]'
                          : isSystem
                          ? 'bg-blue-500/10 border-blue-500/20 text-blue-300'
                          : 'bg-zinc-900/60 border-zinc-800 text-zinc-400'
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <span className="text-zinc-600 text-[10px] shrink-0 font-mono select-none">
                          [{log.timestamp}]
                        </span>
                        {log.taskId && (
                          <span className="text-[10px] px-1 rounded bg-black/40 text-zinc-400 font-mono shrink-0">
                            {log.taskId}
                          </span>
                        )}
                        <span className="font-semibold text-zinc-200">{log.message}</span>
                      </div>
                      {log.detail && (
                        <div className="pl-6 text-[11px] text-zinc-400 whitespace-pre-wrap font-mono bg-black/30 p-2 rounded border border-zinc-800/50 mt-1">
                          {log.detail}
                        </div>
                      )}
                    </div>
                  )
                })}
                <div ref={logsEndRef} />
              </div>
            )}
          </div>
        )}

        {/* D. ROADMAP PLAN TAB */}
        {activeTab === 'plan' && currentProject.plan && (
          <div className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto space-y-6 w-full text-left">
            {/* Section 1 Boundary Banner: Ready for Execution */}
            {currentProject.status === 'ready_for_execution' && (
              <div className="p-5 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 space-y-3 text-left shadow-lg">
                <div className="flex items-center gap-3 text-emerald-300">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-300">
                    <CheckCheck size={24} />
                  </div>
                  <div>
                    <div className="text-base font-bold text-white tracking-tight">
                      Architecture Blueprint Approved & Ready for Execution
                    </div>
                    <div className="text-xs text-emerald-400 font-mono">
                      Workflow state: ready_for_execution (Section 1 Engine Complete)
                    </div>
                  </div>
                </div>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  The AI Orchestrator & Planning Engine has analyzed the requirements, classified the project scope, generated the dynamic DAG dependency graph, and persisted the approved plan. The Execution Request Bundle is now packaged and waiting for the Section 2 Coding Agent runtime.
                </p>
                <div className="pt-2 flex flex-wrap gap-2 text-[11px] font-mono">
                  <span className="px-2.5 py-1 rounded-md bg-black/50 border border-emerald-500/30 text-emerald-300">
                    Project ID: {currentProject.id}
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-black/50 border border-emerald-500/30 text-emerald-300">
                    Staged Tasks: {currentProject.plan.tasks.length}
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-black/50 border border-emerald-500/30 text-emerald-300">
                    Execution Stages: {currentProject.plan.executionStages?.length || 1}
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-black/50 border border-emerald-500/30 text-emerald-300">
                    Boundary: Staged for Section 2 Runtime
                  </span>
                </div>
              </div>
            )}

            {/* Requirement Analysis Badge & Classification Card */}
            {currentProject.analysis && (
              <div className="glass-panel p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 block">Category</span>
                  <span className="text-xs font-semibold text-white capitalize mt-0.5 inline-block">
                    {currentProject.analysis.classification.replace(/_/g, ' ')}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 block">Domain</span>
                  <span className="text-xs font-semibold text-white mt-0.5 inline-block">
                    {currentProject.analysis.targetDomain || 'General Web'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 block">AI Confidence</span>
                  <span className="text-xs font-semibold text-emerald-400 mt-0.5 inline-block">
                    {Math.round((currentProject.analysis.confidence || 0.95) * 100)}%
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 block">Architecture</span>
                  <span className="text-xs font-semibold text-zinc-300 mt-0.5 inline-block truncate max-w-[150px]">
                    {currentProject.analysis.detectedTechStack?.join(', ') || currentProject.plan.techStack}
                  </span>
                </div>
              </div>
            )}

            {/* Interactive Website Requirement Enquiry Card */}
            {currentProject.plan.needsClarification && (
              <div className="p-5 rounded-2xl border border-amber-500/40 bg-amber-500/10 space-y-4 text-left shadow-xl">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                    <HelpCircle size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-white tracking-tight flex items-center gap-2">
                      <span>Website Requirement Enquiry</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        Interactive Setup
                      </span>
                    </h3>
                    <p className="text-xs text-amber-200 mt-1 leading-relaxed">
                      {currentProject.plan.clarificationQuestion ||
                        'Before formulating your architecture and code folders, please specify what kind of website you want to build:'}
                    </p>
                  </div>
                </div>

                {/* Quick Domain Selection Chips */}
                <div className="space-y-1.5 pt-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
                    1. Website Type & Domain
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      'Personal Portfolio',
                      'Luxury E-Commerce Store',
                      'SaaS Landing & Web App',
                      'Creative Digital Agency',
                      'Restaurant & Online Menu',
                      'Modern Tech Blog',
                    ].map((typeOption) => (
                      <button
                        key={typeOption}
                        type="button"
                        onClick={() =>
                          setClarificationAnswer((prev) =>
                            prev ? `${prev}, Type: ${typeOption}` : `Type: ${typeOption}`
                          )
                        }
                        className="px-2.5 py-1 rounded-lg text-xs bg-black/40 border border-zinc-700/80 hover:border-amber-400/80 text-zinc-300 hover:text-white transition-all cursor-pointer"
                      >
                        + {typeOption}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Quick Feature Selection Chips */}
                <div className="space-y-1.5 pt-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
                    2. Core Sections & Features (Will generate in src/components/)
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      'Hero Showcase',
                      'Product/Service Catalog',
                      'Interactive Details Modal',
                      'Pricing Matrix',
                      'Customer Inquiry Form',
                      'Supabase Database & Auth',
                      'Obsidian Dark Mode',
                    ].map((feat) => (
                      <button
                        key={feat}
                        type="button"
                        onClick={() =>
                          setClarificationAnswer((prev) =>
                            prev ? `${prev}, Feature: ${feat}` : `Feature: ${feat}`
                          )
                        }
                        className="px-2.5 py-1 rounded-lg text-xs bg-black/40 border border-zinc-700/80 hover:border-amber-400/80 text-zinc-300 hover:text-white transition-all cursor-pointer"
                      >
                        + {feat}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5 pt-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
                    Your Requirements & Custom Instructions
                  </label>
                  <textarea
                    rows={2}
                    value={clarificationAnswer}
                    onChange={(e) => setClarificationAnswer(e.target.value)}
                    placeholder="e.g. Build a sleek portfolio for an AI developer with dark theme, showcase grid, contact modal, and Supabase backend..."
                    className="w-full bg-zinc-900 border border-zinc-700 focus:border-amber-400 rounded-xl p-3 text-xs text-white placeholder-zinc-500 focus:outline-none transition-all"
                  />
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-1">
                  <button
                    onClick={() => {
                      if (!clarificationAnswer.trim()) return
                      requestPlanChanges(`Requirement details: ${clarificationAnswer.trim()}`)
                      setClarificationAnswer('')
                    }}
                    disabled={!clarificationAnswer.trim()}
                    className="px-5 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-amber-500 to-[#da7756] text-white hover:brightness-110 shadow-lg disabled:opacity-40 transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Sparkles size={14} />
                    <span>Confirm & Generate Architecture Folders</span>
                  </button>
                </div>
              </div>
            )}

            {/* Plan Header Card */}
            <div className="glass-panel p-6 space-y-4 border-l-4 border-l-[#da7756]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-bold font-serif text-white">{currentProject.plan.projectName}</h2>
                  <p className="text-zinc-400 text-xs sm:text-sm mt-1">{currentProject.plan.tagline}</p>
                </div>

                {currentProject.status === 'awaiting_approval' && (
                  <div className="flex items-center gap-2 shrink-0">
                    {currentProject.plan.needsClarification ? (
                      <span className="px-3.5 py-1.5 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-semibold flex items-center gap-1.5">
                        <HelpCircle size={14} />
                        <span>Enquiry In Progress</span>
                      </span>
                    ) : (
                      <button
                        onClick={() => approveAndBuild()}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-lg flex items-center gap-1.5 animate-pulse"
                      >
                        <CheckCheck size={16} />
                        <span>Approve Blueprint</span>
                      </button>
                    )}
                    <button
                      onClick={() => setShowChangeInput(!showChangeInput)}
                      className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-xs font-semibold transition-all border border-zinc-700"
                    >
                      <span>Request Changes</span>
                    </button>
                    <button
                      onClick={() => rejectPlan('User cancelled proposal')}
                      className="px-3 py-2 rounded-xl hover:bg-red-500/20 text-zinc-400 hover:text-red-400 text-xs font-semibold transition-all border border-zinc-800"
                    >
                      <span>Reject</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Request Changes Input Box */}
              {showChangeInput && (
                <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl space-y-2 animate-fadeIn">
                  <label className="text-xs font-semibold text-zinc-300">
                    Describe what you would like to change in the plan:
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={changeInstruction}
                      onChange={(e) => setChangeInstruction(e.target.value)}
                      placeholder='e.g. "Use TypeScript instead of vanilla JS", "Add user authentication and Stripe payments"'
                      className="flex-1 bg-black/60 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#da7756]"
                    />
                    <button
                      onClick={() => {
                        if (!changeInstruction.trim()) return
                        requestPlanChanges(changeInstruction)
                        setChangeInstruction('')
                        setShowChangeInput(false)
                      }}
                      className="btn-primary px-3 py-1.5 rounded-lg text-xs font-semibold"
                    >
                      Submit Revisions
                    </button>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#da7756]/15 text-[#da7756] border border-[#da7756]/30">
                  {currentProject.plan.techStack}
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-zinc-900 text-zinc-300 border border-zinc-800">
                  Theme: {currentProject.plan.theme.description}
                </span>
                {currentProject.plan.packages && currentProject.plan.packages.length > 0 && (
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-zinc-900 text-zinc-400 border border-zinc-800 font-mono">
                    Packages: {currentProject.plan.packages.join(', ')}
                  </span>
                )}
              </div>
            </div>

            {/* Implementation Tasks Checklist with DAG dependency stages */}
            <div className="glass-panel p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                  DAG Implementation Tasks ({currentProject.plan.tasks.length})
                </h3>
                <span className="text-[11px] text-zinc-500 font-mono">
                  {currentProject.plan.executionStages?.length || 1} Execution Stages
                </span>
              </div>

              <div className="space-y-3">
                {currentProject.plan.tasks.map((task) => {
                  const isDone = task.status === 'completed'
                  const isDoing = task.status === 'in_progress'

                  return (
                    <div
                      key={task.id}
                      className={cn(
                        'p-3.5 rounded-xl border flex flex-col gap-2.5 transition-all text-left',
                        isDone
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                          : isDoing
                          ? 'bg-[#da7756]/15 border-[#da7756]/40 text-white animate-pulse'
                          : 'bg-zinc-900/60 border-zinc-800 text-zinc-400'
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          {isDone ? (
                            <CheckCircle2 size={18} className="text-emerald-400 shrink-0 mt-0.5" />
                          ) : isDoing ? (
                            <div className="w-4 h-4 rounded-full border-2 border-[#da7756] border-t-transparent animate-spin shrink-0 mt-0.5" />
                          ) : (
                            <Circle size={18} className="text-zinc-600 shrink-0 mt-0.5" />
                          )}
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono font-bold text-[#da7756] bg-[#da7756]/10 px-1.5 py-0.5 rounded">
                                {task.id}
                              </span>
                              <span className="text-sm font-semibold text-white">{task.title}</span>
                              {task.can_run_parallel && (
                                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 rounded font-mono">
                                  ⚡ Parallel Safe
                                </span>
                              )}
                            </div>
                            {task.description && (
                              <div className="text-xs text-zinc-400 mt-1">{task.description}</div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {task.status === 'failed' && (
                            <button
                              onClick={() => retryRuntimeTask(task.id)}
                              className="px-2 py-1 rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[11px] font-semibold flex items-center gap-1 transition-all"
                            >
                              <RefreshCw size={11} />
                              <span>Retry</span>
                            </button>
                          )}
                          <span className={cn(
                            "text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-black/40",
                            task.status === 'completed' && "text-emerald-400 border border-emerald-500/30",
                            task.status === 'failed' && "text-red-400 border border-red-500/30",
                            task.status === 'in_progress' && "text-[#da7756] border border-[#da7756]/30",
                          )}>
                            Stage {task.execution_stage || 1} • {task.status.replace('_', ' ')}
                          </span>
                        </div>
                      </div>

                      {/* Runtime Execution Record Details (if executed) */}
                      {runtimeStatus?.taskRecords?.[task.id] && (
                        <div className="p-2.5 rounded-lg bg-black/40 border border-zinc-800 text-[11px] font-mono space-y-1">
                          <div className="flex items-center justify-between text-zinc-400">
                            <span>
                              Files modified: {runtimeStatus.taskRecords[task.id].filesModified.length}
                            </span>
                            {runtimeStatus.taskRecords[task.id].durationMs && (
                              <span>Duration: {runtimeStatus.taskRecords[task.id].durationMs}ms</span>
                            )}
                          </div>
                          {runtimeStatus.taskRecords[task.id].verificationDetails && (
                            <div className="text-zinc-300">
                              {runtimeStatus.taskRecords[task.id].verificationDetails}
                            </div>
                          )}
                          {runtimeStatus.taskRecords[task.id].error && (
                            <div className="text-red-400">
                              Error: {runtimeStatus.taskRecords[task.id].error}
                            </div>
                          )}
                        </div>
                      )}

                      {/* DAG Metadata & Verification Criteria */}
                      <div className="flex flex-wrap gap-2 pt-1 border-t border-zinc-800/60 text-[11px] font-mono">
                        {task.dependencies && task.dependencies.length > 0 && (
                          <span className="text-amber-400/90 bg-amber-500/10 px-2 py-0.5 rounded">
                            Depends on: {task.dependencies.join(', ')}
                          </span>
                        )}
                        {task.required_tools && task.required_tools.length > 0 && (
                          <span className="text-zinc-400 bg-zinc-800/80 px-2 py-0.5 rounded">
                            Tools: {task.required_tools.join(', ')}
                          </span>
                        )}
                        {task.files && task.files.length > 0 && (
                          <span className="text-cyan-400/90 bg-cyan-500/10 px-2 py-0.5 rounded">
                            Files: {task.files.join(', ')}
                          </span>
                        )}
                        {task.verification_criteria && (
                          <span className="text-emerald-400/90 bg-emerald-500/10 px-2 py-0.5 rounded">
                            Verify: {task.verification_criteria}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Architecture Details Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="glass-panel p-4 space-y-2">
                <span className="text-xs font-semibold text-zinc-400 uppercase">Pages / Views</span>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {currentProject.plan.pages.map((p) => (
                    <span key={p} className="px-2.5 py-1 rounded-lg text-xs bg-zinc-900 border border-zinc-800 text-zinc-300">
                      {p}
                    </span>
                  ))}
                </div>
              </div>

              <div className="glass-panel p-4 space-y-2">
                <span className="text-xs font-semibold text-zinc-400 uppercase">Core Interactive Features</span>
                <div className="space-y-1 pt-1">
                  {currentProject.plan.features.map((f, i) => (
                    <div key={i} className="text-xs text-zinc-300 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#da7756]" />
                      <span>{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* E. BACKEND & DATABASE TAB */}
        {activeTab === 'backend' && (
          <div className="flex-1 overflow-y-auto p-6 max-w-5xl mx-auto space-y-6 w-full text-left">
            {/* 1. Header Bar: Server Status & Isolation Badge */}
            <div className="glass-panel p-5 rounded-2xl border border-zinc-800 bg-zinc-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'w-12 h-12 rounded-xl flex items-center justify-center border transition-all',
                    backendStatus?.running
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                  )}
                >
                  <Server size={24} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-white tracking-tight">Isolated Backend Engine</h2>
                    <span
                      className={cn(
                        'px-2 py-0.5 rounded-full text-[11px] font-semibold border flex items-center gap-1',
                        backendStatus?.running
                          ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                          : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                      )}
                    >
                      <span
                        className={cn(
                          'w-1.5 h-1.5 rounded-full',
                          backendStatus?.running ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'
                        )}
                      />
                      {backendStatus?.running ? `Running on 127.0.0.1:${backendStatus.port}` : 'Container Stopped'}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-400 flex flex-wrap items-center gap-2 mt-1 font-mono">
                    <span className="flex items-center gap-1 text-zinc-300">
                      <ShieldCheck size={13} className="text-emerald-400" />
                      1 CPU • 512MB RAM • 64 PIDs • Isolated Docker Container
                    </span>
                    <span>•</span>
                    <span className="text-zinc-400">Loopback only (127.0.0.1)</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {backendStatus?.running ? (
                  <button
                    onClick={() => stopBackendServer()}
                    disabled={isBackendLoading}
                    className="px-3.5 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 text-xs font-semibold flex items-center gap-1.5 transition-all disabled:opacity-50"
                  >
                    <StopCircle size={14} />
                    <span>Stop Server</span>
                  </button>
                ) : (
                  <button
                    onClick={() => startBackendServer()}
                    disabled={isBackendLoading}
                    className="btn-primary px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all disabled:opacity-50 shadow-md"
                  >
                    <Play size={14} />
                    <span>Start Server</span>
                  </button>
                )}

                <button
                  onClick={() => runBackendTests()}
                  disabled={isBackendLoading || !backendStatus?.running}
                  className="px-3.5 py-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 text-xs font-semibold flex items-center gap-1.5 transition-all disabled:opacity-50"
                  title={!backendStatus?.running ? 'Start backend container to run tests' : 'Execute HTTP endpoint tests'}
                >
                  <Activity size={14} />
                  <span>Run HTTP Tests</span>
                </button>
              </div>
            </div>

            {/* 2. Backend Natural Language Requirements Generator */}
            <div className="glass-panel p-5 rounded-2xl border border-zinc-800 bg-zinc-900/60 space-y-3">
              <div className="flex items-center gap-2 text-zinc-200">
                <Sparkles size={16} className="text-[#da7756]" />
                <h3 className="text-sm font-bold text-white">Generate Backend API & Database</h3>
              </div>
              <p className="text-xs text-zinc-400">
                Describe your data models and backend requirements in natural language. Another Me creates routes, controllers, input validation schemas, database migrations, and seed data.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={backendPrompt}
                  onChange={(e) => setBackendPrompt(e.target.value)}
                  placeholder="e.g. Build a REST CRUD API for items with title, priority, status, and validation schemas..."
                  className="flex-1 bg-zinc-950 border border-zinc-800 focus:border-[#da7756] rounded-xl px-4 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none"
                />
                <button
                  onClick={() => {
                    if (backendPrompt.trim()) {
                      generateBackendApi(backendPrompt.trim())
                      setBackendPrompt('')
                    }
                  }}
                  disabled={!backendPrompt.trim() || isBackendLoading}
                  className="btn-primary px-4 py-2.5 rounded-xl text-xs font-semibold shrink-0 disabled:opacity-50"
                >
                  Generate Backend
                </button>
              </div>
            </div>

            {/* 3. Detected REST API Endpoints & Live Test Results */}
            <div className="glass-panel p-5 rounded-2xl border border-zinc-800 bg-zinc-900/60 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <FileCode size={16} className="text-[#da7756]" />
                    <span>REST API Endpoints ({backendStatus?.detectedRoutes?.length || 0})</span>
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Project-scoped endpoints accessible via reverse proxy and direct container loopback.
                  </p>
                </div>
                {backendTestResults && (
                  <span
                    className={cn(
                      'px-2.5 py-1 rounded-full text-xs font-mono font-semibold border',
                      backendTestResults.success
                        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                        : 'bg-red-500/15 border-red-500/30 text-red-300'
                    )}
                  >
                    Tests: {backendTestResults.passed}/{backendTestResults.totalTests} Passed
                  </span>
                )}
              </div>

              {/* Endpoints List */}
              <div className="space-y-2">
                {backendStatus?.detectedRoutes && backendStatus.detectedRoutes.length > 0 ? (
                  backendStatus.detectedRoutes.map((r, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-zinc-950 border border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className={cn(
                            'px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase',
                            r.method === 'GET' && 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
                            r.method === 'POST' && 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
                            r.method === 'PUT' && 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
                            r.method === 'DELETE' && 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          )}
                        >
                          {r.method}
                        </span>
                        <span className="font-mono text-xs text-white font-semibold">{r.path}</span>
                        {r.description && <span className="text-xs text-zinc-400 hidden md:inline">• {r.description}</span>}
                      </div>

                      <div className="text-[11px] text-zinc-500 font-mono">
                        Proxy: <span className="text-zinc-400">/api/agent-runtime/.../backend-proxy{r.path}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-4 rounded-xl bg-zinc-950 border border-dashed border-zinc-800 text-center text-xs text-zinc-500">
                    No backend endpoints detected yet. Click "Generate Backend" to create server routes.
                  </div>
                )}
              </div>

              {/* Live Test Suite Results */}
              {backendTestResults && (
                <div className="pt-2 border-t border-zinc-800 space-y-2">
                  <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
                    Automated Real HTTP Test Results ({backendTestResults.durationMs}ms)
                  </h4>
                  <div className="grid grid-cols-1 gap-2">
                    {backendTestResults.results.map((res, i) => (
                      <div
                        key={i}
                        className={cn(
                          'p-3 rounded-xl border text-xs font-mono space-y-1',
                          res.passed
                            ? 'bg-emerald-500/5 border-emerald-500/30 text-zinc-200'
                            : 'bg-red-500/5 border-red-500/30 text-zinc-200'
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {res.passed ? (
                              <CheckCircle2 size={14} className="text-emerald-400" />
                            ) : (
                              <AlertCircle size={14} className="text-red-400" />
                            )}
                            <span className="font-bold">
                              {res.method} {res.endpoint}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px]">
                            <span className={res.passed ? 'text-emerald-400' : 'text-red-400'}>
                              HTTP {res.actualStatus} (expected {res.expectedStatus})
                            </span>
                            <span className="text-zinc-500">{res.durationMs}ms</span>
                          </div>
                        </div>

                        {res.responseBody && (
                          <div className="p-2 rounded bg-black/50 text-[10px] text-zinc-400 overflow-x-auto max-h-20">
                            {typeof res.responseBody === 'object'
                              ? JSON.stringify(res.responseBody)
                              : String(res.responseBody)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 4. Database Schema, Migrations & Seeding Card */}
            <div className="glass-panel p-5 rounded-2xl border border-zinc-800 bg-zinc-900/60 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                    <Database size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Database & Migrations</h3>
                    <div className="text-xs text-zinc-400 font-mono flex items-center gap-2 mt-0.5">
                      <span>Type: SQLite</span>
                      <span>•</span>
                      <span>Path: {backendStatus?.databaseStatus?.databasePath || 'data/app.db'}</span>
                      <span>•</span>
                      <span>Tables: {backendStatus?.databaseStatus?.totalTables || 0}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const pendingDestructive = migrations.filter(
                        (m) => m.status === 'pending' && m.isDestructive
                      )
                      if (pendingDestructive.length > 0) {
                        setPendingDestructiveReasons(pendingDestructive.flatMap((m) => m.destructiveReasons))
                        setShowDestructiveModal(true)
                      } else {
                        applyMigrations(false)
                      }
                    }}
                    disabled={isBackendLoading}
                    className="btn-primary px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
                  >
                    Apply Migrations
                  </button>

                  <button
                    onClick={() => rollbackMigration()}
                    disabled={isBackendLoading}
                    className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-xs font-semibold flex items-center gap-1 transition-all disabled:opacity-50"
                  >
                    <RotateCcw size={12} />
                    <span>Rollback</span>
                  </button>

                  <button
                    onClick={() => seedDatabase()}
                    disabled={isBackendLoading}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 text-xs font-semibold transition-all disabled:opacity-50"
                  >
                    Seed Data
                  </button>
                </div>
              </div>

              {/* Table Tags */}
              {backendStatus?.databaseStatus?.tables && backendStatus.databaseStatus.tables.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] text-zinc-500 uppercase font-bold tracking-wider">Tables:</span>
                  {backendStatus.databaseStatus.tables.map((t) => (
                    <span
                      key={t}
                      className="px-2.5 py-1 rounded-md bg-zinc-950 border border-zinc-800 text-zinc-300 text-xs font-mono"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}

              {/* Migration Records */}
              <div className="space-y-2 pt-2">
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">
                  Declared Migrations ({migrations.length})
                </span>
                {migrations.length > 0 ? (
                  migrations.map((m) => (
                    <div
                      key={m.id}
                      className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className={cn(
                            'w-2 h-2 rounded-full',
                            m.status === 'applied' ? 'bg-emerald-400' : 'bg-amber-400'
                          )}
                        />
                        <span className="font-mono text-zinc-200 font-semibold">{m.filename}</span>
                        {m.isDestructive && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1">
                            <AlertTriangle size={10} />
                            Destructive
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-[11px] font-mono">
                        <span
                          className={cn(
                            'px-2 py-0.5 rounded',
                            m.status === 'applied'
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : 'bg-amber-500/10 text-amber-400'
                          )}
                        >
                          {m.status.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-4 rounded-xl bg-zinc-950 border border-dashed border-zinc-800 text-center text-xs text-zinc-500">
                    No migration files found in migrations/ directory.
                  </div>
                )}
              </div>
            </div>

            {/* 5. Container Stdout / Stderr Log Stream */}
            <div className="glass-panel p-5 rounded-2xl border border-zinc-800 bg-zinc-900/60 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Terminal size={15} className="text-[#da7756]" />
                  <span>Backend Container Logs</span>
                </h3>
                <span className="text-xs text-zinc-500 font-mono">Tail: 50 lines</span>
              </div>
              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800/80 font-mono text-[11px] text-zinc-300 space-y-1 max-h-48 overflow-y-auto">
                {backendStatus?.recentLogs && backendStatus.recentLogs.length > 0 ? (
                  backendStatus.recentLogs.map((log, i) => (
                    <div key={i} className="leading-relaxed">
                      {log}
                    </div>
                  ))
                ) : (
                  <div className="text-zinc-500">Container log stream is idle. Start backend to view logs.</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Destructive Migration Confirmation Modal */}
        {showDestructiveModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[#18181f] border border-rose-500/50 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
              <div className="flex items-center gap-3 text-rose-400">
                <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center">
                  <AlertTriangle size={22} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Confirm Destructive Migration</h3>
                  <p className="text-xs text-rose-400">Data loss warning</p>
                </div>
              </div>

              <p className="text-xs text-zinc-300 leading-relaxed">
                The migration you are applying contains destructive operations that may delete existing tables or columns. Destructive migrations require explicit user confirmation.
              </p>

              {pendingDestructiveReasons.length > 0 && (
                <div className="p-3 rounded-xl bg-black/50 border border-rose-500/30 text-xs font-mono space-y-1">
                  {pendingDestructiveReasons.map((r, i) => (
                    <div key={i} className="text-rose-300">
                      • {r}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowDestructiveModal(false)}
                  className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    setShowDestructiveModal(false)
                    await applyMigrations(true)
                  }}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold transition-all shadow-lg"
                >
                  Confirm & Apply Destructive Changes
                </button>
              </div>
            </div>
          </div>
        )}

        {/* F. TESTING & SECURITY WORKSPACE */}
        {activeTab === 'testing' && (
          <div className="flex-1 overflow-y-auto p-6 max-w-5xl mx-auto space-y-6 w-full text-left">
            {/* 1. Header Bar: Testing & Security Suite */}
            <div className="glass-panel p-5 rounded-2xl border border-zinc-800 bg-zinc-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center border bg-blue-500/20 border-blue-500/40 text-blue-400">
                  <ShieldCheck size={24} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-white tracking-tight">Testing & Security Suite</h2>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      Isolated Docker Sandbox
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400">
                    Real test runner, code quality diagnostics, security heuristic scanning, and dependency audit
                  </p>
                </div>
              </div>

              {/* Sub-tab Navigation */}
              <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800 overflow-x-auto text-xs">
                <button
                  onClick={() => setTestingSubTab('tests')}
                  className={cn(
                    'px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 shrink-0',
                    testingSubTab === 'tests' ? 'bg-[#da7756] text-white shadow-sm' : 'text-zinc-400 hover:text-white'
                  )}
                >
                  <Play size={12} />
                  <span>Test Runs</span>
                  {testSuiteResult && (
                    <span className={cn(
                      'px-1.5 py-0.2 rounded-full text-[10px] font-bold',
                      testSuiteResult.status === 'passed' ? 'bg-emerald-950 text-emerald-400' : 'bg-rose-950 text-rose-400'
                    )}>
                      {testSuiteResult.passed}/{testSuiteResult.total}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setTestingSubTab('quality')}
                  className={cn(
                    'px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 shrink-0',
                    testingSubTab === 'quality' ? 'bg-[#da7756] text-white shadow-sm' : 'text-zinc-400 hover:text-white'
                  )}
                >
                  <CheckCircle2 size={12} />
                  <span>Code Quality</span>
                  {codeQualityResult && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-zinc-800 text-zinc-300">
                      {codeQualityResult.typeCheck.diagnostics.length + codeQualityResult.linter.findings.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setTestingSubTab('security')}
                  className={cn(
                    'px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 shrink-0',
                    testingSubTab === 'security' ? 'bg-[#da7756] text-white shadow-sm' : 'text-zinc-400 hover:text-white'
                  )}
                >
                  <ShieldAlert size={12} />
                  <span>Security Findings</span>
                  {securityScanResult && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-zinc-800 text-zinc-300">
                      {securityScanResult.findings.filter((f) => f.category !== 'vulnerable_dependency').length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setTestingSubTab('dependencies')}
                  className={cn(
                    'px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 shrink-0',
                    testingSubTab === 'dependencies' ? 'bg-[#da7756] text-white shadow-sm' : 'text-zinc-400 hover:text-white'
                  )}
                >
                  <Package size={12} />
                  <span>Dependencies</span>
                  {securityScanResult && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-zinc-800 text-zinc-300">
                      {securityScanResult.findings.filter((f) => f.category === 'vulnerable_dependency').length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setTestingSubTab('coverage')}
                  className={cn(
                    'px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 shrink-0',
                    testingSubTab === 'coverage' ? 'bg-[#da7756] text-white shadow-sm' : 'text-zinc-400 hover:text-white'
                  )}
                >
                  <Activity size={12} />
                  <span>Coverage</span>
                </button>
                <button
                  onClick={() => setTestingSubTab('history')}
                  className={cn(
                    'px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 shrink-0',
                    testingSubTab === 'history' ? 'bg-[#da7756] text-white shadow-sm' : 'text-zinc-400 hover:text-white'
                  )}
                >
                  <RotateCcw size={12} />
                  <span>Run History</span>
                </button>
              </div>
            </div>

            {/* SUB-TAB 1: TEST RUNS */}
            {testingSubTab === 'tests' && (
              <div className="space-y-4">
                {/* Control Panel */}
                <div className="glass-panel p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-zinc-400">Framework:</span>
                    <span className="px-2.5 py-1 rounded-lg text-xs font-mono font-semibold bg-zinc-800 text-zinc-200 border border-zinc-700">
                      {testSuiteResult?.framework || 'Auto-detect'}
                    </span>
                    <input
                      type="text"
                      placeholder="Filter test path (optional)..."
                      value={testFilterPath}
                      onChange={(e) => setTestFilterPath(e.target.value)}
                      className="bg-black/40 border border-zinc-800 rounded-lg px-3 py-1 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-[#da7756] w-48"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    {isTesting ? (
                      <button
                        onClick={() => cancelProjectTests()}
                        className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md"
                      >
                        <StopCircle size={14} />
                        <span>Cancel Test Run</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => runProjectTests(testFilterPath.trim() || undefined)}
                        disabled={isTesting}
                        className="btn-primary px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-md"
                      >
                        <Play size={14} />
                        <span>Run All Tests</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Test Results Banner */}
                {testSuiteResult && (
                  <div className={cn(
                    'p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs',
                    testSuiteResult.status === 'passed'
                      ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-200'
                      : testSuiteResult.status === 'timed_out'
                      ? 'bg-amber-950/30 border-amber-500/30 text-amber-200'
                      : 'bg-rose-950/30 border-rose-500/30 text-rose-200'
                  )}>
                    <div className="flex items-center gap-3">
                      {testSuiteResult.status === 'passed' ? (
                        <CheckCircle2 size={20} className="text-emerald-400 shrink-0" />
                      ) : (
                        <AlertCircle size={20} className="text-rose-400 shrink-0" />
                      )}
                      <div>
                        <div className="font-bold text-sm">
                          {testSuiteResult.status === 'passed'
                            ? 'All Tests Passed Successfully'
                            : testSuiteResult.status === 'timed_out'
                            ? 'Test Execution Timed Out'
                            : 'Test Failures Encountered'}
                        </div>
                        <div className="text-[11px] opacity-80 font-mono">
                          Duration: {testSuiteResult.durationMs}ms | Exit code: {testSuiteResult.exitCode}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-center px-3 py-1 rounded-lg bg-black/30 border border-white/10">
                        <div className="text-[10px] text-zinc-400 uppercase">Total</div>
                        <div className="font-bold text-white text-sm">{testSuiteResult.total}</div>
                      </div>
                      <div className="text-center px-3 py-1 rounded-lg bg-emerald-950/40 border border-emerald-500/30">
                        <div className="text-[10px] text-emerald-400 uppercase">Passed</div>
                        <div className="font-bold text-emerald-300 text-sm">{testSuiteResult.passed}</div>
                      </div>
                      <div className="text-center px-3 py-1 rounded-lg bg-rose-950/40 border border-rose-500/30">
                        <div className="text-[10px] text-rose-400 uppercase">Failed</div>
                        <div className="font-bold text-rose-300 text-sm">{testSuiteResult.failed}</div>
                      </div>
                      <div className="text-center px-3 py-1 rounded-lg bg-zinc-900 border border-zinc-700">
                        <div className="text-[10px] text-zinc-400 uppercase">Skipped</div>
                        <div className="font-bold text-zinc-300 text-sm">{testSuiteResult.skipped}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Test Cases List */}
                {testSuiteResult && testSuiteResult.testCases.length > 0 ? (
                  <div className="space-y-2">
                    {testSuiteResult.testCases.map((tc, idx) => (
                      <div
                        key={idx}
                        className={cn(
                          'p-3.5 rounded-xl border text-xs transition-all',
                          tc.status === 'passed'
                            ? 'bg-zinc-900/60 border-zinc-800'
                            : tc.status === 'failed'
                            ? 'bg-rose-950/20 border-rose-500/40'
                            : 'bg-zinc-900/30 border-zinc-800'
                        )}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5">
                            {tc.status === 'passed' && <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />}
                            {tc.status === 'failed' && <XCircle size={16} className="text-rose-400 shrink-0" />}
                            {tc.status === 'skipped' && <Circle size={16} className="text-zinc-500 shrink-0" />}
                            <span className="font-mono text-zinc-400 text-[11px]">{tc.suite} ›</span>
                            <span className="font-semibold text-white">{tc.name}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-[11px] font-mono text-zinc-500">{tc.durationMs}ms</span>
                            {tc.status === 'failed' && (
                              <button
                                onClick={() => proposeFixForFinding({
                                  fixType: 'test_failure',
                                  title: `Fix ${tc.name}`,
                                  description: `Test failure in ${tc.name}: ${tc.error?.message || 'Failed assertion'}`,
                                  file: tc.suite,
                                  errorStack: tc.error?.stack || tc.error?.message,
                                })}
                                disabled={isFixingTest}
                                className="px-2.5 py-1 rounded-lg bg-[#da7756] hover:bg-[#c66848] text-white text-[11px] font-bold flex items-center gap-1 shadow-sm transition-all"
                              >
                                <Sparkles size={11} />
                                <span>Fix with Twin</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {tc.error && (
                          <pre className="mt-2.5 p-3 rounded-lg bg-black/60 border border-rose-500/20 text-rose-300 font-mono text-[11px] overflow-x-auto whitespace-pre-wrap leading-relaxed">
                            {tc.error.stack || tc.error.message}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-12 text-center border border-zinc-800 rounded-2xl bg-zinc-900/30 space-y-3">
                    <Play size={32} className="mx-auto text-zinc-600" />
                    <p className="text-sm font-semibold text-zinc-300">No test results recorded</p>
                    <p className="text-xs text-zinc-500 max-w-md mx-auto">
                      Click "Run All Tests" above to execute your test suite safely inside the isolated Docker sandbox with network restrictions and CPU/memory limits.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* SUB-TAB 2: CODE QUALITY */}
            {testingSubTab === 'quality' && (
              <div className="space-y-4">
                <div className="glass-panel p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">Static Quality Checks</h3>
                    <p className="text-xs text-zinc-400">TypeScript strict compiler, linter verification, and production build</p>
                  </div>
                  <button
                    onClick={() => runCodeQualityAudit()}
                    disabled={isQualityChecking}
                    className="btn-primary px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-md"
                  >
                    <CheckCircle2 size={14} />
                    <span>Run Quality Checks</span>
                  </button>
                </div>

                {/* 3 Status Cards */}
                {codeQualityResult && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* TypeScript */}
                    <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white">TypeScript Check</span>
                        <span className={cn(
                          'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase',
                          codeQualityResult.typeCheck.status === 'passed' ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30' :
                          codeQualityResult.typeCheck.status === 'not_configured' ? 'bg-zinc-800 text-zinc-400' : 'bg-rose-950 text-rose-400 border border-rose-500/30'
                        )}>
                          {codeQualityResult.typeCheck.status === 'passed' ? 'Passed' : codeQualityResult.typeCheck.status === 'not_configured' ? 'Not Configured' : 'Failed'}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 font-mono">tsc --noEmit</p>
                      <p className="text-[11px] text-zinc-500">{codeQualityResult.typeCheck.output.slice(0, 100) || 'Zero type errors.'}</p>
                    </div>

                    {/* Linter */}
                    <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white">ESLint Rules</span>
                        <span className={cn(
                          'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase',
                          codeQualityResult.linter.status === 'passed' ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30' :
                          codeQualityResult.linter.status === 'not_configured' ? 'bg-zinc-800 text-zinc-400' : 'bg-rose-950 text-rose-400 border border-rose-500/30'
                        )}>
                          {codeQualityResult.linter.status === 'passed' ? 'Passed' : codeQualityResult.linter.status === 'not_configured' ? 'Not Configured' : 'Failed'}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 font-mono">eslint</p>
                      <p className="text-[11px] text-zinc-500">{codeQualityResult.linter.output.slice(0, 100) || 'Zero lint warnings.'}</p>
                    </div>

                    {/* Build */}
                    <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white">Production Build</span>
                        <span className={cn(
                          'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase',
                          codeQualityResult.build.status === 'passed' ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30' :
                          codeQualityResult.build.status === 'not_configured' ? 'bg-zinc-800 text-zinc-400' : 'bg-rose-950 text-rose-400 border border-rose-500/30'
                        )}>
                          {codeQualityResult.build.status === 'passed' ? 'Passed' : codeQualityResult.build.status === 'not_configured' ? 'Not Configured' : 'Failed'}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 font-mono">npm run build</p>
                      <p className="text-[11px] text-zinc-500">{codeQualityResult.build.output.slice(0, 100) || 'Bundle compiled cleanly.'}</p>
                    </div>
                  </div>
                )}

                {/* Diagnostics List */}
                {codeQualityResult && (codeQualityResult.typeCheck.diagnostics.length > 0 || codeQualityResult.linter.findings.length > 0) && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                      Quality Diagnostics ({codeQualityResult.typeCheck.diagnostics.length + codeQualityResult.linter.findings.length})
                    </h4>
                    {codeQualityResult.typeCheck.diagnostics.map((diag, i) => (
                      <div key={`tc-${i}`} className="p-3.5 rounded-xl border border-zinc-800 bg-zinc-900/50 text-xs space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-rose-950 text-rose-400">
                              error
                            </span>
                            <span className="font-mono text-zinc-300 font-semibold">{diag.file}:{diag.line || 1}</span>
                            {diag.code && <span className="font-mono text-zinc-500 text-[11px]">({diag.code})</span>}
                          </div>
                          <button
                            onClick={() => proposeFixForFinding({
                              fixType: 'quality_issue',
                              title: `Fix ${diag.code || 'Type error'}`,
                              description: diag.message,
                              file: diag.file,
                              line: diag.line,
                            })}
                            disabled={isFixingTest}
                            className="px-2.5 py-1 rounded-lg bg-[#da7756] hover:bg-[#c66848] text-white text-[11px] font-bold flex items-center gap-1 shadow-sm transition-all"
                          >
                            <Sparkles size={11} />
                            <span>Fix with Twin</span>
                          </button>
                        </div>
                        <p className="text-zinc-200">{diag.message}</p>
                      </div>
                    ))}
                    {codeQualityResult.linter.findings.map((f, i) => (
                      <div key={`lint-${i}`} className="p-3.5 rounded-xl border border-zinc-800 bg-zinc-900/50 text-xs space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              'px-2 py-0.5 rounded text-[10px] font-bold uppercase',
                              f.severity === 'error' ? 'bg-rose-950 text-rose-400' : 'bg-amber-950 text-amber-400'
                            )}>
                              {f.severity}
                            </span>
                            <span className="font-mono text-zinc-300 font-semibold">{f.file}:{f.line || 1}</span>
                            {f.rule && <span className="font-mono text-zinc-500 text-[11px]">({f.rule})</span>}
                          </div>
                          <button
                            onClick={() => proposeFixForFinding({
                              fixType: 'quality_issue',
                              title: `Fix ${f.rule || 'Lint finding'}`,
                              description: f.message,
                              file: f.file,
                              line: f.line,
                            })}
                            disabled={isFixingTest}
                            className="px-2.5 py-1 rounded-lg bg-[#da7756] hover:bg-[#c66848] text-white text-[11px] font-bold flex items-center gap-1 shadow-sm transition-all"
                          >
                            <Sparkles size={11} />
                            <span>Fix with Twin</span>
                          </button>
                        </div>
                        <p className="text-zinc-200">{f.message}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* SUB-TAB 3: SECURITY FINDINGS */}
            {testingSubTab === 'security' && (
              <div className="space-y-4">
                <div className="glass-panel p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">Static Security Scanning</h3>
                    <p className="text-xs text-zinc-400">Secret detection with redaction and heuristic unsafe code pattern checks</p>
                  </div>
                  <button
                    onClick={() => runSecurityAudit()}
                    disabled={isSecurityScanning}
                    className="btn-primary px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-md"
                  >
                    <ShieldAlert size={14} />
                    <span>Run Security Scan</span>
                  </button>
                </div>

                {/* Honesty Heuristic Alert */}
                <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-950/20 text-xs text-amber-300 flex items-start gap-2.5">
                  <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <div className="font-semibold">Security Heuristic Disclaimer</div>
                    <div className="text-[11px] opacity-90 leading-relaxed">
                      Static rule matches are heuristics, not proof of exploitability or total security. Clean automated results do not guarantee that your application is immune to authorization flaws or runtime attack vectors.
                    </div>
                  </div>
                </div>

                {/* Security Findings List */}
                {securityScanResult && (
                  <div className="space-y-3">
                    {securityScanResult.findings.filter((f) => f.category !== 'vulnerable_dependency').length === 0 ? (
                      <div className="p-8 text-center border border-zinc-800 rounded-xl bg-zinc-900/40 space-y-2">
                        <CheckCircle2 size={24} className="mx-auto text-emerald-400" />
                        <p className="text-xs font-semibold text-zinc-200">0 Heuristic Security Findings Detected</p>
                        <p className="text-[11px] text-zinc-500 max-w-sm mx-auto">
                          No exposed secrets or dangerous code patterns detected in scanned workspace source files.
                        </p>
                      </div>
                    ) : (
                      securityScanResult.findings
                        .filter((f) => f.category !== 'vulnerable_dependency')
                        .map((f, i) => (
                          <div key={i} className="p-4 rounded-xl border border-rose-500/30 bg-rose-950/10 text-xs space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className={cn(
                                  'px-2 py-0.5 rounded text-[10px] font-bold uppercase',
                                  f.severity === 'critical' ? 'bg-rose-900 text-rose-200' :
                                  f.severity === 'high' ? 'bg-rose-950 text-rose-400' : 'bg-amber-950 text-amber-400'
                                )}>
                                  {f.severity}
                                </span>
                                <span className="font-semibold text-white">{f.title}</span>
                                <span className="font-mono text-zinc-400 text-[11px]">{f.file}:{f.line || 1}</span>
                              </div>
                              <button
                                onClick={() => proposeFixForFinding({
                                  fixType: 'security_finding',
                                  title: f.title,
                                  description: `${f.title}: ${f.remediation || f.description}`,
                                  file: f.file,
                                  line: f.line,
                                })}
                                disabled={isFixingTest}
                                className="px-2.5 py-1 rounded-lg bg-[#da7756] hover:bg-[#c66848] text-white text-[11px] font-bold flex items-center gap-1 shadow-sm transition-all"
                              >
                                <Sparkles size={11} />
                                <span>Fix with Twin</span>
                              </button>
                            </div>

                            <p className="text-zinc-300">{f.description}</p>

                            {f.evidence && (
                              <div className="p-2.5 rounded bg-black/60 border border-zinc-800 font-mono text-[11px] text-zinc-400 space-y-1">
                                <span className="text-[10px] text-zinc-500 uppercase font-bold">Redacted Evidence:</span>
                                <div className="text-rose-300">{f.evidence}</div>
                              </div>
                            )}

                            {f.remediation && (
                              <div className="text-[11px] text-emerald-300/90 bg-emerald-950/20 p-2 rounded border border-emerald-500/20">
                                <span className="font-bold">Remediation:</span> {f.remediation}
                              </div>
                            )}
                          </div>
                        ))
                    )}
                  </div>
                )}
              </div>
            )}

            {/* SUB-TAB 4: DEPENDENCY AUDIT */}
            {testingSubTab === 'dependencies' && (
              <div className="space-y-4">
                <div className="glass-panel p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">Dependency Vulnerability Audit</h3>
                    <p className="text-xs text-zinc-400">Queries registry vulnerability database via npm audit</p>
                  </div>
                  <button
                    onClick={() => runSecurityAudit()}
                    disabled={isSecurityScanning}
                    className="btn-primary px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-md"
                  >
                    <Package size={14} />
                    <span>Run Dependency Audit</span>
                  </button>
                </div>

                {/* Audit Policy Notice */}
                <div className="p-3.5 rounded-xl border border-blue-500/30 bg-blue-950/20 text-xs text-blue-300 flex items-start gap-2.5">
                  <Lock size={16} className="text-blue-400 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <div className="font-semibold">Explicit Approval Policy</div>
                    <div className="text-[11px] opacity-90 leading-relaxed">
                      Packages are never automatically upgraded. Any dependency resolution requires explicit diff approval to prevent supply chain breaks.
                    </div>
                  </div>
                </div>

                {/* Failed Scanner Notification */}
                {securityScanResult && securityScanResult.dependencyAuditStatus !== 'completed' && securityScanResult.dependencyAuditError && (
                  <div className="p-3.5 rounded-xl border border-rose-500/40 bg-rose-950/30 text-xs text-rose-300 space-y-1">
                    <div className="font-bold flex items-center gap-2">
                      <AlertCircle size={14} className="text-rose-400" />
                      <span>Scanner Execution Failed (Fail-Closed)</span>
                    </div>
                    <p className="text-[11px] opacity-90">{securityScanResult.dependencyAuditError}</p>
                    <p className="text-[10px] text-zinc-400">A clean result is never claimed when scanner execution fails.</p>
                  </div>
                )}

                {/* Vulnerabilities List */}
                {securityScanResult && (
                  <div className="space-y-2">
                    {securityScanResult.findings.filter((f) => f.category === 'vulnerable_dependency').length === 0 ? (
                      <div className="p-8 text-center border border-zinc-800 rounded-xl bg-zinc-900/40 space-y-2">
                        <CheckCircle2 size={24} className="mx-auto text-emerald-400" />
                        <p className="text-xs font-semibold text-zinc-200">0 Known Vulnerabilities</p>
                        <p className="text-[11px] text-zinc-500 max-w-sm mx-auto">
                          Dependencies conform to registry security advisories.
                        </p>
                      </div>
                    ) : (
                      securityScanResult.findings
                        .filter((f) => f.category === 'vulnerable_dependency')
                        .map((vuln, i) => (
                          <div key={i} className="p-3.5 rounded-xl border border-zinc-800 bg-zinc-900/60 text-xs space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className={cn(
                                  'px-2 py-0.5 rounded text-[10px] font-bold uppercase',
                                  vuln.severity === 'critical' ? 'bg-rose-900 text-rose-200' :
                                  vuln.severity === 'high' ? 'bg-rose-950 text-rose-400' :
                                  vuln.severity === 'moderate' ? 'bg-amber-950 text-amber-400' : 'bg-zinc-800 text-zinc-400'
                                )}>
                                  {vuln.severity}
                                </span>
                                <span className="font-bold text-white font-mono">{vuln.packageName}</span>
                                <span className="text-zinc-500 font-mono">v{vuln.installedVersion}</span>
                              </div>
                              {vuln.advisoryUrl && (
                                <a
                                  href={vuln.advisoryUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[11px] text-[#da7756] hover:underline flex items-center gap-1"
                                >
                                  <span>Advisory</span>
                                  <ExternalLink size={10} />
                                </a>
                              )}
                            </div>

                            <p className="text-zinc-300">{vuln.description}</p>
                            <div className="text-[11px] text-zinc-400 font-mono">
                              Fixed in: <span className="text-emerald-400 font-semibold">{vuln.fixedVersion || 'Manual review required'}</span>
                            </div>
                          </div>
                        ))
                    )}
                  </div>
                )}
              </div>
            )}

            {/* SUB-TAB 5: COVERAGE */}
            {testingSubTab === 'coverage' && (
              <div className="space-y-4">
                <div className="glass-panel p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">Test Coverage Metrics</h3>
                    <p className="text-xs text-zinc-400">Measured coverage only reported when generated by test framework</p>
                  </div>
                  <button
                    onClick={() => runCoverageAnalysis()}
                    disabled={isCoverageRunning}
                    className="btn-primary px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-md"
                  >
                    <Activity size={14} />
                    <span>Run Coverage</span>
                  </button>
                </div>

                <div className="p-3.5 rounded-xl border border-zinc-800 bg-zinc-900/30 text-xs text-zinc-400 space-y-1">
                  <div className="font-semibold text-zinc-300">Coverage Policy</div>
                  <p className="text-[11px] text-zinc-500 leading-relaxed">
                    Test coverage numbers are only presented when produced by genuine instrumentation (@vitest/coverage-v8 or Jest). Coverage indicates which code lines were exercised during test execution, but does not constitute proof of correctness.
                  </p>
                </div>

                {coverageSummary && (
                  coverageSummary.available ? (
                    <div className="space-y-4">
                      {/* Metric Bars */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                          { label: 'Lines', data: coverageSummary.lines },
                          { label: 'Statements', data: coverageSummary.statements },
                          { label: 'Functions', data: coverageSummary.functions },
                          { label: 'Branches', data: coverageSummary.branches },
                        ].map((m, idx) => (
                          <div key={idx} className="p-3.5 rounded-xl border border-zinc-800 bg-zinc-900/60 text-center space-y-1.5">
                            <div className="text-[11px] font-bold text-zinc-400 uppercase">{m.label}</div>
                            <div className="text-xl font-bold text-white font-mono">{m.data.pct}%</div>
                            <div className="text-[10px] text-zinc-500">{m.data.covered}/{m.data.total} covered</div>
                            <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                              <div
                                className={cn(
                                  'h-full rounded-full transition-all',
                                  m.data.pct >= 80 ? 'bg-emerald-400' : m.data.pct >= 50 ? 'bg-amber-400' : 'bg-rose-500'
                                )}
                                style={{ width: `${Math.min(100, m.data.pct)}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Untested Modules */}
                      {coverageSummary.untestedFiles.length > 0 && (
                        <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-950/10 space-y-2">
                          <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                            Untested Modules ({coverageSummary.untestedFiles.length})
                          </h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs font-mono text-zinc-300">
                            {coverageSummary.untestedFiles.map((file, i) => (
                              <div key={i} className="p-1.5 rounded bg-black/40 border border-zinc-800 flex items-center justify-between">
                                <span className="truncate">{file}</span>
                                <span className="text-[10px] text-rose-400 uppercase font-bold shrink-0">0%</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-8 text-center border border-zinc-800 rounded-xl bg-zinc-900/30 space-y-2">
                      <Activity size={24} className="mx-auto text-zinc-600" />
                      <p className="text-xs font-semibold text-zinc-300">Coverage tooling not configured</p>
                      <p className="text-[11px] text-zinc-500 max-w-sm mx-auto">
                        To measure code coverage, install a coverage provider such as @vitest/coverage-v8 in your project dependencies.
                      </p>
                    </div>
                  )
                )}
              </div>
            )}

            {/* SUB-TAB 6: RUN HISTORY */}
            {testingSubTab === 'history' && (
              <div className="space-y-4">
                <div className="glass-panel p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">Execution Audit Log</h3>
                    <p className="text-xs text-zinc-400">Audit trail of container test and scan runs</p>
                  </div>
                  <button
                    onClick={() => fetchTestHistory()}
                    className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold flex items-center gap-1.5"
                  >
                    <RefreshCw size={12} />
                    <span>Refresh History</span>
                  </button>
                </div>

                {testHistory.length > 0 ? (
                  <div className="space-y-2">
                    {testHistory.map((h, i) => (
                      <div key={i} className="p-3 rounded-xl border border-zinc-800 bg-zinc-900/50 text-xs flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className={cn(
                            'px-2 py-0.5 rounded text-[10px] font-bold uppercase',
                            h.status === 'passed' ? 'bg-emerald-950 text-emerald-400' :
                            h.status === 'cancelled' ? 'bg-zinc-800 text-zinc-400' : 'bg-rose-950 text-rose-400'
                          )}>
                            {h.status}
                          </span>
                          <span className="font-bold text-white capitalize">{h.type.replace('_', ' ')}</span>
                          <span className="text-zinc-400 text-[11px]">{new Date(h.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <div className="flex items-center gap-3 text-zinc-400 text-[11px] font-mono">
                          <span>{h.durationMs}ms</span>
                          <span>{h.summaryText}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center border border-zinc-800 rounded-xl bg-zinc-900/30 text-xs text-zinc-500">
                    No run history recorded yet.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* F. EXPORT & DEPLOYMENT TAB (Section 8) */}
        {activeTab === 'export_deploy' && (
          <div className="flex-1 w-full h-full flex flex-col p-4 bg-[#0a0a0d] overflow-y-auto space-y-4">
            {/* Header & Sub-tab bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#da7756]/20 border border-[#da7756]/40 flex items-center justify-center text-[#da7756]">
                  <UploadCloud size={18} />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white uppercase tracking-wider">GitHub, Export & Deployment</h2>
                  <p className="text-xs text-zinc-400">Authenticated repository publishing, clean project archives, and containerized deployments</p>
                </div>
              </div>

              {/* Sub-Tabs: GitHub | Clean Export ZIP | Cloud Deployment */}
              <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl p-1 gap-1">
                <button
                  onClick={() => setExportDeploySubTab('github')}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5',
                    exportDeploySubTab === 'github' ? 'bg-[#da7756] text-white shadow-sm' : 'text-zinc-400 hover:text-white'
                  )}
                >
                  <Globe size={13} />
                  <span>GitHub</span>
                  {githubStatus?.connected && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 ml-0.5" />
                  )}
                </button>
                <button
                  onClick={() => setExportDeploySubTab('export')}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5',
                    exportDeploySubTab === 'export' ? 'bg-[#da7756] text-white shadow-sm' : 'text-zinc-400 hover:text-white'
                  )}
                >
                  <Archive size={13} />
                  <span>Export ZIP</span>
                  {(exportManifest?.secretWarnings?.length || 0) > 0 && (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 ml-0.5" />
                  )}
                </button>
                <button
                  onClick={() => setExportDeploySubTab('deploy')}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5',
                    exportDeploySubTab === 'deploy' ? 'bg-[#da7756] text-white shadow-sm' : 'text-zinc-400 hover:text-white'
                  )}
                >
                  <Server size={13} />
                  <span>Deploy</span>
                  {activeDeployment?.status === 'ready' && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 ml-0.5" />
                  )}
                  {activeDeployment?.status === 'failed' && (
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400 ml-0.5" />
                  )}
                </button>
              </div>
            </div>

            {/* SUB-TAB 1: GITHUB INTEGRATION */}
            {exportDeploySubTab === 'github' && (
              <div className="space-y-4">
                {/* Connection Status Card */}
                <div className="glass-panel p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center text-white font-bold">
                      <Globe size={20} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-white">GitHub Integration</h3>
                        <span className={cn(
                          'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase',
                          githubStatus?.connected ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30' : 'bg-zinc-800 text-zinc-400'
                        )}>
                          {githubStatus?.connected ? `@${githubStatus.username}` : 'Not Connected'}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400">
                        {githubStatus?.connected
                          ? `Least-privilege OAuth session active (scopes: ${githubStatus.scopes?.join(', ') || 'repo, read:user'}). Token kept strictly server-side.`
                          : 'Connect your GitHub account or supply a least-privilege Personal Access Token (repo, read:user).'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {githubStatus?.connected ? (
                      <button
                        onClick={() => disconnectGitHubSession()}
                        className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-xs font-semibold transition-all"
                      >
                        Disconnect
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <input
                          type="password"
                          value={githubTokenInput}
                          onChange={(e) => setGithubTokenInput(e.target.value)}
                          placeholder="Paste PAT (ghp_...)"
                          className="px-3 py-1.5 rounded-lg bg-black/60 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#da7756]"
                        />
                        <button
                          onClick={async () => {
                            if (!githubTokenInput.trim()) {
                              toast.error('Please enter a GitHub Personal Access Token')
                              return
                            }
                            const ok = await connectGitHubToken(githubTokenInput)
                            if (ok) {
                              setGithubTokenInput('')
                              await loadGitHubRepos()
                            }
                          }}
                          disabled={isGitHubLoading}
                          className="btn-primary px-3 py-1.5 rounded-lg text-xs font-semibold"
                        >
                          Connect PAT
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {githubStatus?.connected && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Column 1: Repositories & Creation */}
                    <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/50 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-white uppercase tracking-wider">Repositories ({githubRepos.length})</h4>
                        <button
                          onClick={() => setShowNewRepoModal(true)}
                          className="px-2 py-1 rounded-lg bg-[#da7756] hover:bg-[#c66848] text-white text-[11px] font-bold flex items-center gap-1 shadow-sm"
                        >
                          <Plus size={11} />
                          <span>New Repo</span>
                        </button>
                      </div>

                      <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                        {githubRepos.map((r) => (
                          <div
                            key={r.id}
                            onClick={async () => {
                              setSelectedRepoFullName(r.fullName)
                              setSelectedBranch(r.defaultBranch || 'main')
                              const [owner, name] = r.fullName.split('/')
                              await loadGitHubBranches(owner, name)
                              await loadGitHubCommits(owner, name, r.defaultBranch)
                              await fetchGitHubDiff(owner, name, r.defaultBranch)
                            }}
                            className={cn(
                              'p-2.5 rounded-lg border text-xs cursor-pointer transition-all',
                              selectedRepoFullName === r.fullName
                                ? 'bg-[#da7756]/15 border-[#da7756]/50 text-white'
                                : 'bg-black/40 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold truncate">{r.name}</span>
                              <span className="text-[10px] text-zinc-500 uppercase">{r.private ? 'Private' : 'Public'}</span>
                            </div>
                            <div className="text-[10px] text-zinc-500 truncate mt-0.5">{r.fullName}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Column 2: Working Diffs & Pre-Push Review */}
                    <div className="md:col-span-2 p-4 rounded-xl border border-zinc-800 bg-zinc-900/50 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-xs font-bold text-white uppercase tracking-wider">Working Tree Diff</h4>
                          <p className="text-[11px] text-zinc-400">
                            {selectedRepoFullName
                              ? `Comparing local workspace with ${selectedRepoFullName}:${selectedBranch}`
                              : 'Select a repository on the left to inspect diffs'}
                          </p>
                        </div>
                        {selectedRepoFullName && (
                          <button
                            onClick={() => setShowPushConfirmModal(true)}
                            disabled={isGitHubLoading}
                            className="btn-primary px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-md"
                          >
                            <GitCommit size={13} />
                            <span>Push Changes</span>
                          </button>
                        )}
                      </div>

                      {githubDiff ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-3 p-2.5 rounded-lg bg-black/60 border border-zinc-800 text-xs">
                            <span className="text-zinc-400">{githubDiff.changedFilesCount} changed file(s)</span>
                            <span className="text-emerald-400 font-mono">+{githubDiff.totalAdditions}</span>
                            <span className="text-rose-400 font-mono">-{githubDiff.totalDeletions}</span>
                          </div>

                          <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                            {githubDiff.files.map((f, i) => (
                              <div key={i} className="p-2 rounded bg-black/40 border border-zinc-800 text-xs font-mono flex items-center justify-between">
                                <div className="flex items-center gap-2 truncate">
                                  <span className={cn(
                                    'px-1.5 py-0.5 rounded text-[10px] font-bold uppercase',
                                    f.status === 'added' ? 'bg-emerald-950 text-emerald-400' :
                                    f.status === 'deleted' ? 'bg-rose-950 text-rose-400' : 'bg-amber-950 text-amber-400'
                                  )}>
                                    {f.status}
                                  </span>
                                  <span className="text-zinc-300 truncate">{f.path}</span>
                                </div>
                                <span className="text-[11px] text-zinc-500 shrink-0">+{f.additions}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="p-8 text-center text-xs text-zinc-500">
                          Select a repository to inspect working changes and branch diffs.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* SUB-TAB 2: PROJECT EXPORT ZIP */}
            {exportDeploySubTab === 'export' && (
              <div className="space-y-4">
                <div className="glass-panel p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">Clean Workspace Export</h3>
                    <p className="text-xs text-zinc-400">Download standalone ZIP archive with automatic secret redaction and cache exclusions</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => validateProjectExport()}
                      disabled={isExportLoading}
                      className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold flex items-center gap-1.5"
                    >
                      <CheckCircle2 size={13} />
                      <span>Validate Archive</span>
                    </button>
                    <button
                      onClick={() => downloadCleanZip()}
                      className="btn-primary px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md"
                    >
                      <Download size={14} />
                      <span>Download Clean ZIP</span>
                    </button>
                  </div>
                </div>

                {/* Secret Warnings */}
                {exportManifest && exportManifest.secretWarnings.length > 0 && (
                  <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-950/20 space-y-2">
                    <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
                      <AlertTriangle size={15} />
                      <span>Possible Secrets Warning ({exportManifest.secretWarnings.length})</span>
                    </div>
                    <ul className="space-y-1 text-xs text-amber-200/90 list-disc list-inside">
                      {exportManifest.secretWarnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Inclusions & Exclusions Grid */}
                {exportManifest && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/50 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                          Included Files ({exportManifest.includedFiles.length})
                        </span>
                        <span className="text-xs font-mono text-zinc-400">
                          {(exportManifest.estimatedSizeBytes / 1024).toFixed(1)} KB
                        </span>
                      </div>
                      <div className="space-y-1 max-h-60 overflow-y-auto pr-1 text-xs font-mono text-zinc-300">
                        {exportManifest.includedFiles.map((file, i) => (
                          <div key={i} className="p-1.5 rounded bg-black/40 border border-zinc-800 truncate">
                            {file}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/50 space-y-2">
                      <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                        Excluded Files ({exportManifest.excludedFiles.length})
                      </span>
                      <div className="space-y-1 max-h-60 overflow-y-auto pr-1 text-xs font-mono text-zinc-400">
                        {exportManifest.excludedFiles.map((ex, i) => (
                          <div key={i} className="p-1.5 rounded bg-black/40 border border-zinc-800 flex items-center justify-between gap-2">
                            <span className="truncate">{ex.path}</span>
                            <span className="text-[10px] text-zinc-500 uppercase shrink-0">{ex.reason}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* SUB-TAB 3: DEPLOYMENT */}
            {exportDeploySubTab === 'deploy' && (
              <div className="space-y-4">
                {/* Provider Selection Header */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { id: 'vercel', label: 'Vercel', desc: 'Global Edge Network' },
                    { id: 'netlify', label: 'Netlify', desc: 'Static & Serverless' },
                    { id: 'cloudflare_pages', label: 'Cloudflare Pages', desc: 'Global CDN Edge' },
                    { id: 'docker_container', label: 'Docker Container', desc: 'Self-Hosted Image' },
                  ].map((p) => (
                    <div
                      key={p.id}
                      onClick={async () => {
                        setSelectedDeployProvider(p.id as DeploymentProvider)
                        await fetchDeploymentPlan(p.id as DeploymentProvider)
                      }}
                      className={cn(
                        'p-3.5 rounded-xl border cursor-pointer transition-all space-y-1 text-left',
                        selectedDeployProvider === p.id
                          ? 'bg-[#da7756]/15 border-[#da7756] text-white shadow-md'
                          : 'bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                      )}
                    >
                      <div className="text-xs font-bold text-white flex items-center justify-between">
                        <span>{p.label}</span>
                        {selectedDeployProvider === p.id && <CheckCircle2 size={14} className="text-[#da7756]" />}
                      </div>
                      <p className="text-[10px] text-zinc-500">{p.desc}</p>
                    </div>
                  ))}
                </div>

                {/* Pre-Deployment Plan Card */}
                {deploymentPlan && (
                  <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-zinc-800">
                      <div>
                        <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                          Pre-Deployment Plan: {selectedDeployProvider.toUpperCase()}
                        </h4>
                        <p className="text-[11px] text-zinc-400 font-mono">
                          Framework: {deploymentPlan.detectedConfig.framework} | Output: {deploymentPlan.detectedConfig.outputDir}
                        </p>
                      </div>
                      <button
                        onClick={() => setShowDeployApprovalModal(true)}
                        disabled={isDeployLoading}
                        className="btn-primary px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md"
                      >
                        <Server size={14} />
                        <span>Deploy with Approval</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="p-2.5 rounded-lg bg-black/40 border border-zinc-800">
                        <div className="text-[10px] text-zinc-500 uppercase">Build Command</div>
                        <div className="font-mono text-zinc-200 truncate">{deploymentPlan.detectedConfig.buildCommand || 'None (Static)'}</div>
                      </div>
                      <div className="p-2.5 rounded-lg bg-black/40 border border-zinc-800">
                        <div className="text-[10px] text-zinc-500 uppercase">Expected Cost</div>
                        <div className="font-semibold text-emerald-400 truncate">{deploymentPlan.expectedCostTier.split(':')[1] || '$0.00'}</div>
                      </div>
                      <div className="p-2.5 rounded-lg bg-black/40 border border-zinc-800">
                        <div className="text-[10px] text-zinc-500 uppercase">Package Size</div>
                        <div className="font-mono text-zinc-200">{(deploymentPlan.estimatedSizeBytes / 1024).toFixed(1)} KB ({deploymentPlan.filesCount} files)</div>
                      </div>
                      <div className="p-2.5 rounded-lg bg-black/40 border border-zinc-800">
                        <div className="text-[10px] text-zinc-500 uppercase">Security Check</div>
                        <div className={cn('font-bold uppercase', deploymentPlan.hasCriticalSecurityFindings ? 'text-rose-400' : 'text-emerald-400')}>
                          {deploymentPlan.hasCriticalSecurityFindings ? 'Critical Blockers' : 'Cleared'}
                        </div>
                      </div>
                    </div>

                    {/* Critical Security Warning */}
                    {deploymentPlan.hasCriticalSecurityFindings && (
                      <div className="p-3.5 rounded-xl border border-rose-500/40 bg-rose-950/20 space-y-2">
                        <div className="flex items-center gap-2 text-rose-400 font-bold text-xs uppercase">
                          <ShieldAlert size={16} />
                          <span>Deployment Blocked: Unresolved Critical Security Findings</span>
                        </div>
                        <ul className="space-y-1 text-xs text-rose-200 list-disc list-inside">
                          {deploymentPlan.criticalFindings.map((cf, i) => (
                            <li key={i}>{cf}</li>
                          ))}
                        </ul>
                        <label className="flex items-center gap-2 text-xs text-rose-300 pt-1 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={overrideCriticalSecurity}
                            onChange={(e) => setOverrideCriticalSecurity(e.target.checked)}
                            className="rounded border-rose-500"
                          />
                          <span>I understand the security risks and explicitly authorize an override deployment.</span>
                        </label>
                      </div>
                    )}
                  </div>
                )}

                {/* Active Deployment Card & Logs */}
                {activeDeployment && (
                  <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase',
                          activeDeployment.status === 'ready' ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30' :
                          activeDeployment.status === 'failed' ? 'bg-rose-950 text-rose-400 border border-rose-500/30' :
                          activeDeployment.status === 'cancelled' ? 'bg-zinc-800 text-zinc-400' :
                          'bg-amber-950 text-amber-400 border border-amber-500/30'
                        )}>
                          {activeDeployment.status}
                        </span>
                        <span className="text-xs text-zinc-300 font-mono">Target: {activeDeployment.provider.toUpperCase()}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        {activeDeployment.deploymentUrl && (
                          <a
                            href={activeDeployment.deploymentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1 shadow-sm"
                          >
                            <ExternalLink size={12} />
                            <span>Visit Live</span>
                          </a>
                        )}
                        {(activeDeployment.status === 'building' || activeDeployment.status === 'deploying') && (
                          <button
                            onClick={() => cancelActiveDeployment(activeDeployment.id)}
                            className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold"
                          >
                            Cancel
                          </button>
                        )}
                        {activeDeployment.rollbackAvailable && (
                          <button
                            onClick={() => rollbackActiveDeployment()}
                            className="px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold flex items-center gap-1"
                          >
                            <RotateCcw size={12} />
                            <span>Rollback</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Logs Window */}
                    <pre className="p-3 rounded-lg bg-black/80 border border-zinc-800 text-[11px] font-mono text-zinc-300 max-h-48 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                      {activeDeployment.logs.join('\n') || 'No logs recorded.'}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Section 8: Create GitHub Repo Modal */}
        {showNewRepoModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[#18181f] border border-zinc-700 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <h3 className="text-base font-bold text-white">Create GitHub Repository</h3>
                <button onClick={() => setShowNewRepoModal(false)} className="text-zinc-400 hover:text-white">✕</button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="text-zinc-400 block mb-1">Repository Name</label>
                  <input
                    type="text"
                    value={newRepoName}
                    onChange={(e) => setNewRepoName(e.target.value)}
                    placeholder="e.g. my-awesome-app"
                    className="w-full px-3 py-2 rounded-xl bg-black/60 border border-zinc-800 text-white focus:outline-none focus:border-[#da7756]"
                  />
                </div>
                <div>
                  <label className="text-zinc-400 block mb-1">Description</label>
                  <input
                    type="text"
                    value={newRepoDesc}
                    onChange={(e) => setNewRepoDesc(e.target.value)}
                    placeholder="Description of the project"
                    className="w-full px-3 py-2 rounded-xl bg-black/60 border border-zinc-800 text-white focus:outline-none focus:border-[#da7756]"
                  />
                </div>
                <label className="flex items-center gap-2 text-zinc-300 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={newRepoPrivate}
                    onChange={(e) => setNewRepoPrivate(e.target.checked)}
                    className="rounded border-zinc-700"
                  />
                  <span>Private Repository</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800">
                <button
                  onClick={() => setShowNewRepoModal(false)}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (!newRepoName.trim()) {
                      toast.error('Repository name is required')
                      return
                    }
                    const repo = await createNewGitHubRepo(newRepoName.trim(), newRepoDesc.trim(), newRepoPrivate)
                    if (repo) {
                      setShowNewRepoModal(false)
                      setSelectedRepoFullName(repo.fullName)
                    }
                  }}
                  className="btn-primary px-4 py-2 rounded-xl text-xs font-bold"
                >
                  Confirm & Create Repo
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Section 8: Push Changes Confirmation Modal */}
        {showPushConfirmModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[#18181f] border border-zinc-700 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <h3 className="text-base font-bold text-white">Review & Push Changes</h3>
                <button onClick={() => setShowPushConfirmModal(false)} className="text-zinc-400 hover:text-white">✕</button>
              </div>

              <div className="space-y-3 text-xs">
                <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 space-y-1">
                  <div className="text-zinc-400">Target: <span className="font-semibold text-white">{selectedRepoFullName}:{selectedBranch}</span></div>
                  <div className="text-zinc-400">Files to push: <span className="font-semibold text-white">{githubDiff?.changedFilesCount || 0} file(s)</span></div>
                </div>

                <div>
                  <label className="text-zinc-400 block mb-1">Commit Message</label>
                  <input
                    type="text"
                    value={commitMessageInput}
                    onChange={(e) => setCommitMessageInput(e.target.value)}
                    placeholder="Describe your changes..."
                    className="w-full px-3 py-2 rounded-xl bg-black/60 border border-zinc-800 text-white focus:outline-none focus:border-[#da7756]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800">
                <button
                  onClick={() => setShowPushConfirmModal(false)}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (!commitMessageInput.trim()) {
                      toast.error('Commit message is required')
                      return
                    }
                    const [owner, repo] = selectedRepoFullName.split('/')
                    setShowPushConfirmModal(false)
                    await pushToGitHubRepo(owner, repo, selectedBranch, commitMessageInput.trim())
                  }}
                  className="btn-primary px-4 py-2 rounded-xl text-xs font-bold"
                >
                  Confirm & Push
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Section 8: GitHub Push Conflict Resolution Modal */}
        {githubConflict && (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-[#18181f] border border-amber-500/40 rounded-2xl max-w-3xl w-full p-6 space-y-5 shadow-2xl animate-fadeIn my-8">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                    <AlertTriangle size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      Remote Branch Diverged <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono">PUSH CONFLICT</span>
                    </h3>
                    <p className="text-xs text-zinc-400">
                      Remote branch <span className="text-white font-mono">{githubConflict.branch}</span> has advanced from <span className="font-mono text-zinc-300">{githubConflict.expectedBaseSha.slice(0, 7)}</span> to <span className="font-mono text-amber-300">{githubConflict.currentRemoteSha.slice(0, 7)}</span>.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => clearGitHubConflict()}
                  className="text-zinc-400 hover:text-white text-lg p-1"
                >
                  ✕
                </button>
              </div>

              {/* Remote commits summary */}
              {githubConflict.remoteCommits && githubConflict.remoteCommits.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                    <GitCommit size={14} className="text-amber-400" />
                    Remote Commits ({githubConflict.remoteCommits.length}):
                  </div>
                  <div className="max-h-32 overflow-y-auto space-y-1.5 p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800 text-xs">
                    {githubConflict.remoteCommits.map((c) => (
                      <div key={c.sha} className="flex items-center justify-between text-zinc-400">
                        <div className="flex items-center gap-2 truncate">
                          <span className="font-mono text-amber-400 text-[11px]">{c.sha.slice(0, 7)}</span>
                          <span className="text-zinc-200 truncate">{c.message}</span>
                        </div>
                        <span className="text-[11px] text-zinc-500 flex-shrink-0">{c.authorName || 'Remote'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Resolution strategy choices */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-zinc-300">Conflict Resolution Strategy</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setConflictStrategy('theirs')}
                    className={`p-3 rounded-xl border text-left transition-all text-xs space-y-1 ${
                      conflictStrategy === 'theirs'
                        ? 'border-emerald-500/60 bg-emerald-500/10 text-white'
                        : 'border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <div className="font-bold flex items-center gap-1 text-emerald-400">
                      <CheckCircle2 size={13} />
                      Accept Remote (Theirs)
                    </div>
                    <div className="text-[11px] text-zinc-400">Overwrite local workspace with remote changes.</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setConflictStrategy('ours')}
                    className={`p-3 rounded-xl border text-left transition-all text-xs space-y-1 ${
                      conflictStrategy === 'ours'
                        ? 'border-blue-500/60 bg-blue-500/10 text-white'
                        : 'border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <div className="font-bold flex items-center gap-1 text-blue-400">
                      <Layers size={13} />
                      Keep Local (Ours)
                    </div>
                    <div className="text-[11px] text-zinc-400">Create new commit using local files on top of remote HEAD.</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setConflictStrategy('merge_resolved')}
                    className={`p-3 rounded-xl border text-left transition-all text-xs space-y-1 ${
                      conflictStrategy === 'merge_resolved'
                        ? 'border-[#da7756]/60 bg-[#da7756]/10 text-white'
                        : 'border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <div className="font-bold flex items-center gap-1 text-[#da7756]">
                      <FileCode size={13} />
                      Review Per-File & Custom
                    </div>
                    <div className="text-[11px] text-zinc-400">Inspect conflict markers and choose per-file action.</div>
                  </button>
                </div>
              </div>

              {/* Per-file review when merge_resolved is active */}
              {conflictStrategy === 'merge_resolved' && githubConflict.conflicts.length > 0 && (
                <div className="space-y-3 pt-2 border-t border-zinc-800">
                  <div className="text-xs font-semibold text-zinc-300">
                    Conflicting Files ({githubConflict.conflicts.length}):
                  </div>
                  <div className="space-y-2 max-h-60 overflow-y-auto p-2 rounded-xl bg-black/40 border border-zinc-800">
                    {githubConflict.conflicts.map((file) => {
                      const res = fileResolutions[file.path] || { action: 'theirs' }
                      const isSelected = activeConflictFile === file.path
                      return (
                        <div key={file.path} className="p-2.5 rounded-lg bg-zinc-900/70 border border-zinc-800 space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-mono text-white font-medium">{file.path}</span>
                            <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-amber-500/20 text-amber-300">
                              {file.type.replace('_', ' ')}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 text-[11px]">
                            <button
                              type="button"
                              onClick={() => {
                                setFileResolutions((prev) => ({ ...prev, [file.path]: { action: 'theirs' } }))
                              }}
                              className={`px-2.5 py-1 rounded-md border font-semibold ${
                                res.action === 'theirs'
                                  ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                                  : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                              }`}
                            >
                              Theirs (Remote)
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setFileResolutions((prev) => ({ ...prev, [file.path]: { action: 'ours' } }))
                              }}
                              className={`px-2.5 py-1 rounded-md border font-semibold ${
                                res.action === 'ours'
                                  ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
                                  : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                              }`}
                            >
                              Ours (Local)
                            </button>
                            {file.conflictMarkers && (
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveConflictFile(isSelected ? null : file.path)
                                  setEditingCustomContent(res.customContent || file.conflictMarkers || '')
                                  setFileResolutions((prev) => ({
                                    ...prev,
                                    [file.path]: { action: 'custom', customContent: res.customContent || file.conflictMarkers },
                                  }))
                                }}
                                className={`px-2.5 py-1 rounded-md border font-semibold ${
                                  res.action === 'custom'
                                    ? 'bg-[#da7756]/20 border-[#da7756]/50 text-[#da7756]'
                                    : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                                }`}
                              >
                                {isSelected ? 'Hide Markers' : 'Edit Markers'}
                              </button>
                            )}
                          </div>

                          {isSelected && file.conflictMarkers && (
                            <div className="space-y-1.5 pt-2">
                              <label className="text-[11px] text-zinc-400">Resolve Conflict Markers (Edit directly):</label>
                              <textarea
                                value={editingCustomContent}
                                onChange={(e) => {
                                  setEditingCustomContent(e.target.value)
                                  setFileResolutions((prev) => ({
                                    ...prev,
                                    [file.path]: { action: 'custom', customContent: e.target.value },
                                  }))
                                }}
                                rows={6}
                                className="w-full p-2 text-xs font-mono bg-black/80 border border-zinc-700 rounded-lg text-zinc-200 focus:outline-none focus:border-[#da7756]"
                              />
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Commit message input */}
              <div className="space-y-1 text-xs">
                <label className="text-zinc-400 block">Commit Message for Resolution</label>
                <input
                  type="text"
                  value={commitMessageInput}
                  onChange={(e) => setCommitMessageInput(e.target.value)}
                  placeholder="Resolved remote push conflict..."
                  className="w-full px-3 py-2 rounded-xl bg-black/60 border border-zinc-800 text-white focus:outline-none focus:border-[#da7756]"
                />
              </div>

              {/* Modal footer */}
              <div className="flex items-center justify-between pt-3 border-t border-zinc-800">
                <div className="text-[11px] text-zinc-500">
                  Strictly verified without force-push (`force: false`).
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => clearGitHubConflict()}
                    className="px-3.5 py-2 rounded-xl bg-zinc-800 text-zinc-300 text-xs font-semibold hover:bg-zinc-700 transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      const [owner, repo] = selectedRepoFullName.split('/')
                      if (!owner || !repo) {
                        toast.error('Repository must be selected')
                        return
                      }
                      const resolvedList: GitHubFileResolution[] = []
                      if (conflictStrategy === 'merge_resolved') {
                        for (const file of githubConflict.conflicts) {
                          const r = fileResolutions[file.path] || { action: 'theirs' }
                          resolvedList.push({
                            path: file.path,
                            action: r.action,
                            customContent: r.customContent,
                          })
                        }
                      }
                      await resolveGitHubConflictAndPush(
                        owner,
                        repo,
                        githubConflict.branch,
                        commitMessageInput.trim() || 'Resolved remote push conflict',
                        conflictStrategy,
                        resolvedList.length > 0 ? resolvedList : undefined
                      )
                    }}
                    className="btn-primary px-4 py-2 rounded-xl text-xs font-bold"
                  >
                    Apply Resolution & Retry Push
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Section 8: Deploy Approval Modal */}
        {showDeployApprovalModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[#18181f] border border-zinc-700 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <h3 className="text-base font-bold text-white">Approve Deployment to {selectedDeployProvider.toUpperCase()}</h3>
                <button onClick={() => setShowDeployApprovalModal(false)} className="text-zinc-400 hover:text-white">✕</button>
              </div>

              <div className="space-y-3 text-xs">
                <div className="p-3.5 rounded-xl bg-zinc-900 border border-zinc-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Target Provider</span>
                    <span className="font-bold text-white uppercase">{selectedDeployProvider}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Build Command (Sandbox)</span>
                    <span className="font-mono text-zinc-300">{deploymentPlan?.detectedConfig.buildCommand || 'None'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Output Directory</span>
                    <span className="font-mono text-zinc-300">{deploymentPlan?.detectedConfig.outputDir || '.'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Expected Cost</span>
                    <span className="font-bold text-emerald-400">{deploymentPlan?.expectedCostTier.split(':')[1] || '$0.00'}</span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-blue-950/20 border border-blue-500/30 text-[11px] text-blue-300 leading-relaxed">
                  The build command will execute inside the isolated Docker sandbox with zero network egress. Only compiled assets and verified files will be uploaded.
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800">
                <button
                  onClick={() => setShowDeployApprovalModal(false)}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    setShowDeployApprovalModal(false)
                    await triggerDeployment(selectedDeployProvider, undefined, overrideCriticalSecurity)
                  }}
                  className="btn-primary px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5"
                >
                  <Server size={14} />
                  <span>Authorize & Deploy</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Section 6 Live Debugging Modal */}
        {showDebugModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[#18181f] border border-zinc-700 rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#da7756]/20 border border-[#da7756]/40 flex items-center justify-center text-[#da7756]">
                    <Sparkles size={20} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Twin Live Debugger</h3>
                    <p className="text-xs text-zinc-400">Automated diagnosis, root-cause diff, and sandbox verification</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowDebugModal(false)}
                  className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3 overflow-y-auto flex-1 pr-1">
                {/* Captured error details */}
                {activeDebugError && (
                  <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/30 text-xs font-mono space-y-1">
                    <div className="flex items-center justify-between text-red-400 font-semibold">
                      <span>Captured {activeDebugError.errorType.toUpperCase()} Error:</span>
                      {activeDebugError.file && (
                        <span className="text-[11px] text-zinc-400">
                          {activeDebugError.file}:{activeDebugError.line || 1}
                        </span>
                      )}
                    </div>
                    <div className="text-red-200 break-words">{activeDebugError.error}</div>
                  </div>
                )}

                {/* Loading state */}
                {isDebugging && (
                  <div className="py-8 flex flex-col items-center justify-center text-center space-y-3">
                    <RefreshCw size={28} className="animate-spin text-[#da7756]" />
                    <p className="text-sm font-medium text-white">Analyzing workspace & generating fix...</p>
                    <p className="text-xs text-zinc-500 max-w-sm">
                      Locating error root cause in workspace files, crafting unified diff, and executing Docker build verification.
                    </p>
                  </div>
                )}

                {/* Result state */}
                {!isDebugging && activeDebugResult && (
                  <div className="space-y-3">
                    {/* Diagnosis */}
                    <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 space-y-1.5">
                      <div className="text-xs font-semibold text-[#da7756] uppercase tracking-wider">Diagnosis</div>
                      <p className="text-xs text-zinc-200 leading-relaxed">{activeDebugResult.diagnosis}</p>
                      {activeDebugResult.spokenSummary && (
                        <p className="text-xs text-zinc-400 italic">"{activeDebugResult.spokenSummary}"</p>
                      )}
                    </div>

                    {/* Diff Viewer */}
                    {activeDebugResult.diff && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs text-zinc-400">
                          <span className="font-semibold uppercase tracking-wider text-[11px]">Proposed Unified Diff:</span>
                          <span className="font-mono text-[10px] text-zinc-500">
                            {activeDebugResult.modifiedFiles?.join(', ') || 'workspace changes'}
                          </span>
                        </div>
                        <pre className="p-3 rounded-xl bg-black/80 border border-zinc-800 font-mono text-[11px] text-zinc-300 max-h-56 overflow-auto leading-relaxed whitespace-pre">
                          {activeDebugResult.diff.split('\n').map((line: string, i: number) => {
                            let color = 'text-zinc-400'
                            if (line.startsWith('+') && !line.startsWith('+++')) color = 'text-emerald-400 bg-emerald-950/30'
                            else if (line.startsWith('-') && !line.startsWith('---')) color = 'text-red-400 bg-red-950/30'
                            else if (line.startsWith('@@') || line.startsWith('---') || line.startsWith('+++')) color = 'text-cyan-400 font-bold'
                            return (
                              <div key={i} className={`px-1 rounded-sm ${color}`}>
                                {line}
                              </div>
                            )
                          })}
                        </pre>
                      </div>
                    )}

                    {/* Build Verification Badge */}
                    {activeDebugResult.verificationPassed !== undefined && (
                      <div
                        className={cn(
                          'p-3 rounded-xl border flex items-center gap-2.5 text-xs',
                          activeDebugResult.verificationPassed
                            ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                            : 'bg-amber-950/40 border-amber-500/30 text-amber-300'
                        )}
                      >
                        {activeDebugResult.verificationPassed ? (
                          <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                        ) : (
                          <AlertTriangle size={16} className="text-amber-400 shrink-0" />
                        )}
                        <div>
                          <div className="font-semibold">
                            {activeDebugResult.verificationPassed
                              ? 'Build Re-verified Successfully inside Docker'
                              : 'Build Verification Warning'}
                          </div>
                          <div className="text-[11px] opacity-80">
                            {activeDebugResult.verificationPassed
                              ? 'Project compiles cleanly and preview container is updated.'
                              : activeDebugResult.buildResult?.error || 'Check terminal logs for remaining warnings.'}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800 shrink-0">
                <button
                  onClick={() => setShowDebugModal(false)}
                  className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition-all"
                >
                  Close
                </button>
                {!isDebugging && activeDebugResult && (
                  <button
                    onClick={async () => {
                      setShowDebugModal(false)
                      await refreshPreview()
                    }}
                    className="px-4 py-2 rounded-xl bg-[#da7756] hover:bg-[#c66848] text-white text-xs font-semibold transition-all shadow-lg flex items-center gap-1.5"
                  >
                    <RefreshCw size={12} />
                    <span>Apply & Refresh Preview</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Section 7 AI Test & Security Fix Proposal Modal */}
        {activeTestFixProposal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[#18181f] border border-zinc-700 rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#da7756]/20 border border-[#da7756]/40 flex items-center justify-center text-[#da7756]">
                    <Sparkles size={20} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">AI Twin Proposed Fix</h3>
                    <p className="text-xs text-zinc-400">Review unified diff and approve changes before workspace application</p>
                  </div>
                </div>
                <button
                  onClick={() => clearTestFixProposal()}
                  className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3 overflow-y-auto flex-1 pr-1">
                {/* Proposal Target & Summary */}
                <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-xs font-semibold text-[#da7756] uppercase tracking-wider">Target File</span>
                    <span className="font-mono text-zinc-300 font-semibold">{activeTestFixProposal.targetFile}</span>
                  </div>
                  <p className="text-xs text-zinc-200 leading-relaxed">{activeTestFixProposal.explanation}</p>
                </div>

                {/* Unified Diff */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span className="font-semibold uppercase tracking-wider text-[11px]">Proposed Unified Diff:</span>
                    <span className="font-mono text-[10px] text-zinc-500">{activeTestFixProposal.targetFile}</span>
                  </div>
                  <pre className="p-3 rounded-xl bg-black/80 border border-zinc-800 font-mono text-[11px] text-zinc-300 max-h-64 overflow-auto leading-relaxed whitespace-pre">
                    {activeTestFixProposal.diff.split('\n').map((line: string, i: number) => {
                      let color = 'text-zinc-400'
                      if (line.startsWith('+') && !line.startsWith('+++')) color = 'text-emerald-400 bg-emerald-950/30'
                      else if (line.startsWith('-') && !line.startsWith('---')) color = 'text-red-400 bg-red-950/30'
                      else if (line.startsWith('@@') || line.startsWith('---') || line.startsWith('+++')) color = 'text-cyan-400 font-bold'
                      return (
                        <div key={i} className={`px-1 rounded-sm ${color}`}>
                          {line}
                        </div>
                      )
                    })}
                  </pre>
                </div>

                {/* Audit Safety Warning */}
                <div className="p-3 rounded-xl bg-blue-950/30 border border-blue-500/30 text-xs text-blue-300 flex items-start gap-2">
                  <Lock size={14} className="text-blue-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] leading-relaxed">
                    Applying this fix will safely write the modified file through verified file operations, append an audit entry to the workspace log, and trigger a test re-run.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800 shrink-0">
                <button
                  onClick={() => clearTestFixProposal()}
                  className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition-all"
                >
                  Reject & Close
                </button>
                <button
                  onClick={async () => {
                    await applyTestFixProposal(activeTestFixProposal)
                  }}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-lg flex items-center gap-1.5"
                >
                  <CheckCheck size={14} />
                  <span>Approve & Apply Fix</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. Conversational Bottom Bar: Voice / Text instruction input */}
      <footer className="p-3 bg-[#121216] border-t border-zinc-800 shrink-0 space-y-2">
        {/* Dynamic Suggestion Chips */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs no-scrollbar">
          <span className="text-zinc-500 text-[11px] shrink-0 font-medium">Quick Edits:</span>
          <button
            onClick={() => handleQuickChip('Add a responsive mobile hamburger navigation menu')}
            className="px-3 py-1 rounded-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-[#da7756] text-zinc-300 hover:text-white shrink-0 transition-colors flex items-center gap-1.5"
          >
            <span>Mobile Menu</span>
          </button>
          <button
            onClick={() => handleQuickChip('Add a modern contact form with client-side validation and feedback modal')}
            className="px-3 py-1 rounded-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-[#da7756] text-zinc-300 hover:text-white shrink-0 transition-colors flex items-center gap-1.5"
          >
            <span>Contact Form Modal</span>
          </button>
          <button
            onClick={() => handleQuickChip('Change the primary color scheme to dark obsidian with emerald accents')}
            className="px-3 py-1 rounded-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-[#da7756] text-zinc-300 hover:text-white shrink-0 transition-colors flex items-center gap-1.5"
          >
            <Palette size={12} className="text-[#da7756]" />
            <span>Theme: Dark & Emerald</span>
          </button>
          <button
            onClick={() => handleQuickChip('Add interactive filter tabs for projects or categories')}
            className="px-3 py-1 rounded-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-[#da7756] text-zinc-300 hover:text-white shrink-0 transition-colors flex items-center gap-1.5"
          >
            <span>Category Filters</span>
          </button>
        </div>

        {/* Input Form */}
        <form onSubmit={handlePromptSubmit} className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              disabled={isEditing || isBuilding}
              placeholder='Instruct your Twin (e.g. "Add a contact form modal", "Change theme to dark navy with gold accents")...'
              className="w-full bg-zinc-900/90 border border-zinc-800 focus:border-[#da7756] rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-[#da7756] transition-all disabled:opacity-50"
            />
          </div>
          <button
            type="submit"
            disabled={!inputPrompt.trim() || isEditing || isBuilding}
            className="btn-primary px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
          >
            <Send size={15} />
            <span className="hidden sm:inline">Instruct Twin</span>
          </button>
        </form>
      </footer>

      {/* 4. Floating Picture-in-Picture Twin Avatar */}
      <TwinPiPWidget onInstructionSubmit={(instruction) => applyUserEdit(instruction)} />
    </div>
  )
}
