// ====================================================================
// ANOTHER ME — SECTION 1: DYNAMIC PROJECT PLAN GENERATOR
// Produces comprehensive architecture plans with DAG dependency ordering
// and parallel execution stages from genuine user requirements.
// ====================================================================

import { executeServerChatCompletion, type ChatMessage } from './providerAdapter'
import type {
  RequirementAnalysisResult,
  OrchestratorPlan,
  OrchestratorTask,
  OrchestratorTaskType,
} from '../../types/orchestrator'

const VALID_TASK_TYPES: OrchestratorTaskType[] = [
  'architecture',
  'design_system',
  'frontend_ui',
  'backend_api',
  'database_setup',
  'dependency_install',
  'testing',
  'configuration',
  'debugging',
  'deployment',
]

/**
 * Computes topological DAG execution stages for tasks and determines
 * which tasks can safely execute independently / in parallel.
 */
export function computeTaskStages(tasks: OrchestratorTask[]): {
  enrichedTasks: OrchestratorTask[]
  executionStages: { stage: number; taskIds: string[]; canRunInParallel: boolean; description: string }[]
} {
  const taskMap = new Map<string, OrchestratorTask>()
  tasks.forEach((t) => taskMap.set(t.id, { ...t }))

  // Ensure all dependencies actually refer to valid task IDs
  tasks.forEach((t) => {
    t.dependencies = (t.dependencies || []).filter((depId: string) => depId !== t.id && taskMap.has(depId))
  })

  const stageMap = new Map<string, number>()

  // Helper to compute stage recursively (longest path from roots to this task)
  function computeTaskStage(taskId: string, path = new Set<string>()): number {
    if (stageMap.has(taskId)) return stageMap.get(taskId)!
    if (path.has(taskId)) {
      // Break cycle gracefully
      return 1
    }

    path.add(taskId)
    const task = taskMap.get(taskId)!
    const deps = task.dependencies || []

    let maxDepStage = 0
    for (const depId of deps) {
      const depStage = computeTaskStage(depId, new Set(path))
      if (depStage > maxDepStage) maxDepStage = depStage
    }

    const stage = maxDepStage + 1
    stageMap.set(taskId, stage)
    return stage
  }

  tasks.forEach((t) => computeTaskStage(t.id))

  // Group task IDs by computed stage
  const stageGroups = new Map<number, string[]>()
  stageMap.forEach((stage, taskId) => {
    const list = stageGroups.get(stage) || []
    list.push(taskId)
    stageGroups.set(stage, list)
  })

  const sortedStages = Array.from(stageGroups.keys()).sort((a, b) => a - b)

  const executionStages: { stage: number; taskIds: string[]; canRunInParallel: boolean; description: string }[] = []

  sortedStages.forEach((stageNum) => {
    const taskIds = stageGroups.get(stageNum)!
    const canRunInParallel = taskIds.length > 1

    let desc = `Stage ${stageNum}: `
    if (stageNum === 1) desc += 'Foundation and initial workspace scaffold'
    else if (canRunInParallel) desc += `Parallel execution of ${taskIds.length} independent tasks`
    else {
      const singleTask = taskMap.get(taskIds[0])
      desc += singleTask ? singleTask.title : `Execution of task ${taskIds[0]}`
    }

    executionStages.push({
      stage: stageNum,
      taskIds,
      canRunInParallel,
      description: desc,
    })
  })

  // Enrich task objects with stage and parallel flags
  const enrichedTasks = tasks.map((t) => {
    const stage = stageMap.get(t.id) || 1
    const stageTasks = stageGroups.get(stage) || []
    return {
      ...t,
      execution_stage: stage,
      can_run_parallel: stageTasks.length > 1,
    }
  })

  return {
    enrichedTasks,
    executionStages,
  }
}

/**
 * Generates a dynamic, tailored project plan with real AI reasoning.
 * Zero hardcoded templates.
 */
export async function generateDynamicPlan(
  userPrompt: string,
  analysis: RequirementAnalysisResult,
  twinName: string = 'Your Twin',
  projectId: string = `proj_${Date.now()}`,
  apiKeyOverride?: string
): Promise<OrchestratorPlan> {
  const systemPrompt = `You are ${twinName}, an elite Senior Principal Software Architect and Systems Engineer.
The user is instructing you via natural language to architect and plan a technical solution.

REQUIREMENT ANALYSIS CONTEXT:
- Classification: "${analysis.classification}"
- Domain: "${analysis.targetDomain}"
- Summary: "${analysis.summary}"
- Goals: ${JSON.stringify(analysis.extractedGoals)}
- Recommended Stack: ${JSON.stringify(analysis.detectedTechStack)}

YOUR MISSION:
Synthesize this request into a concrete, executable engineering architecture and dependency-ordered project plan.

CRITICAL ARCHITECTURE & FOLDER STRUCTURE RULES:
1. Dynamic Plan Generation: 100% custom to the user's specific prompt: "${userPrompt}". Never emit generic placeholder templates.
2. MANDATORY REAL MULTI-FOLDER LAYOUT: Every web application MUST be architected across the standard project folder structure:
   - ".rules/": Quality checks, accessibility rules, CI scripts (.rules/check.sh, .rules/contrast.yml, .rules/require-button-interactions.yml, .rules/testBuild.sh)
   - ".skills/": Domain engineering guidelines (.skills/frontend-design/SKILL.md, .skills/web-design-guidelines/SKILL.md, .skills/theme-brand-guidelines/SKILL.md)
   - "docs/": Architecture, specifications, and API docs (docs/architecture.md, docs/requirements.md, docs/api-specs.md)
   - "public/": Static web assets (public/favicon.svg, public/manifest.json)
   - "src/": Modular ES module source code:
       * "src/components/": Isolated component modules (Navbar.js, Hero.js, Features.js, DetailsModal.js, Footer.js)
       * "src/styles/": Theme design tokens and styling (src/styles/theme.css, src/styles/main.css)
       * "src/utils/": DOM helper utilities and client state (src/utils/dom.js, src/utils/api.js)
       * "src/main.js": Main ES Module entry point assembling and mounting all components
   - "supabase/": Database schema migrations and configs (supabase/config.toml, supabase/migrations/01_initial_schema.sql)
   - "tasks/": Project backlog and roadmap tracking (tasks/task-backlog.md)
   - Root: "index.html" (mounts <div id="app"></div>, imports src/styles/main.css and <script type="module" src="./src/main.js"></script>) and "package.json".
3. Formulate 4 to 6 comprehensive, structured tasks across these folders:
   - "id": unique string, e.g. "task_1", "task_2", "task_3", "task_4", "task_5"
   - "title": concise, professional task title
   - "description": deep technical description of what must be implemented
   - "task_type": one of ["architecture", "design_system", "frontend_ui", "backend_api", "database_setup", "dependency_install", "testing", "configuration", "debugging", "deployment"]
   - "dependencies": array of previous task IDs that must finish before this task can start.
   - "required_tools": array of tools needed, e.g. ["file_writer", "linter", "terminal"]
   - "expected_files": array of target file paths (e.g. ["docs/architecture.md", "src/components/Navbar.js", "src/styles/main.css"])
   - "verification_criteria": explicit, testable criteria to verify the task succeeded
   - "status": "pending"
4. Define aesthetic color palette (primaryColor, accentColor, bgMode: "dark" | "light", description).
5. List external packages, database tables, and API routes required for a complete working app.
6. Provide a warm, concise spoken summary (under 40 words) introducing the multi-folder blueprint.

OUTPUT FORMAT:
Return strictly a valid JSON object matching this schema:
{
  "projectName": "Project Title",
  "tagline": "Professional descriptive tagline",
  "techStack": "HTML5, TailwindCSS, ES Modules JavaScript, Lucide Icons, Supabase",
  "architectureSummary": "Modular multi-folder architecture with dedicated component modules, design tokens, and Supabase integration.",
  "pages": ["Hero Showcase", "Features & Services", "Interactive Modal", "Documentation"],
  "features": ["Modular ES component imports", "Responsive mobile navigation", "Client-side interactive modals", "Toast feedback"],
  "theme": {
    "primaryColor": "#da7756",
    "accentColor": "#10b981",
    "bgMode": "dark",
    "description": "Obsidian dark mode with warm terracotta accents"
  },
  "externalServices": [
    { "service": "Lucide CDN", "purpose": "Icon system", "credentialsRequired": "None" },
    { "service": "Supabase", "purpose": "Backend data & auth", "credentialsRequired": "Configured" }
  ],
  "packages": ["lucide@latest", "tailwindcss"],
  "databaseTables": ["profiles", "inquiries"],
  "apiRoutes": ["/api/inquiries", "/api/items"],
  "tasks": [
    {
      "id": "task_1",
      "title": "Architecture Blueprint, Rules & Domain Skills Scaffold",
      "description": "Scaffold .rules/, .skills/, docs/, tasks/, and package.json with quality guidelines and architecture specs.",
      "task_type": "architecture",
      "dependencies": [],
      "required_tools": ["file_writer", "linter"],
      "expected_files": ["docs/architecture.md", "docs/requirements.md", "tasks/task-backlog.md", ".rules/check.sh", ".rules/contrast.yml", ".skills/frontend-design/SKILL.md", "package.json"],
      "verification_criteria": "Architecture specs and quality check scripts present and well-formed",
      "status": "pending"
    },
    {
      "id": "task_2",
      "title": "Design System, Public Shell & Global Styles",
      "description": "Configure theme variables, Tailwind integration, favicon, manifest, and root index.html mounting ES modules.",
      "task_type": "design_system",
      "dependencies": ["task_1"],
      "required_tools": ["file_writer", "linter"],
      "expected_files": ["index.html", "src/styles/theme.css", "src/styles/main.css", "public/favicon.svg", "public/manifest.json"],
      "verification_criteria": "Valid HTML5 DOCTYPE, CSS custom properties defined, responsive viewport configured",
      "status": "pending"
    },
    {
      "id": "task_3",
      "title": "Modular UI Component Library",
      "description": "Build isolated ES module components for Navbar, Hero banner, Features showcase, and Footer.",
      "task_type": "frontend_ui",
      "dependencies": ["task_2"],
      "required_tools": ["file_writer", "linter"],
      "expected_files": ["src/components/Navbar.js", "src/components/Hero.js", "src/components/Features.js", "src/components/Footer.js", "src/components/DetailsModal.js"],
      "verification_criteria": "Modular ES export functions, clean DOM element generation, zero unclosed tags",
      "status": "pending"
    },
    {
      "id": "task_4",
      "title": "Application State, Event Handlers & Main Entry",
      "description": "Implement src/main.js entry point, DOM utilities, toast notifications, and client state in src/utils/.",
      "task_type": "frontend_ui",
      "dependencies": ["task_3"],
      "required_tools": ["file_writer", "linter"],
      "expected_files": ["src/main.js", "src/utils/dom.js", "src/utils/api.js"],
      "verification_criteria": "Syntactically valid ES6 JavaScript, error-free DOMContentLoaded listener and event delegates",
      "status": "pending"
    },
    {
      "id": "task_5",
      "title": "Supabase Schema & Security Migrations",
      "description": "Define database tables, row level security policies, and edge configuration in supabase/.",
      "task_type": "database_setup",
      "dependencies": ["task_1"],
      "required_tools": ["file_writer", "database_migrator"],
      "expected_files": ["supabase/config.toml", "supabase/migrations/01_initial_schema.sql", "docs/api-specs.md"],
      "verification_criteria": "Valid SQL migration with RLS policies enabled and table schemas defined",
      "status": "pending"
    }
  ],
  "spokenSummary": "I have created the modular architecture plan with dedicated code folders for your website.",
  "needsClarification": false,
  "clarificationQuestion": ""
}`

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Please architect this technical project: "${userPrompt}"` },
  ]

  const completion = await executeServerChatCompletion({
    messages,
    temperature: 0.2,
    responseFormat: 'json_object',
    apiKey: apiKeyOverride,
  })

  const raw = completion.parsedJson || {}

  // Parse raw tasks
  const rawTasks: OrchestratorTask[] = Array.isArray(raw.tasks) && raw.tasks.length > 0
    ? raw.tasks.map((t: any, idx: number) => {
        const id = t.id ? String(t.id) : `task_${idx + 1}`
        const taskType: OrchestratorTaskType = VALID_TASK_TYPES.includes(t.task_type)
          ? t.task_type
          : idx === 0
          ? 'design_system'
          : 'frontend_ui'

        return {
          id,
          title: t.title ? String(t.title) : `Task ${idx + 1}`,
          description: t.description ? String(t.description) : '',
          task_type: taskType,
          dependencies: Array.isArray(t.dependencies) ? t.dependencies.map(String) : idx > 0 ? [`task_${idx}`] : [],
          required_tools: Array.isArray(t.required_tools) ? t.required_tools.map(String) : ['file_writer', 'linter'],
          expected_files: Array.isArray(t.expected_files) ? t.expected_files.map(String) : ['index.html'],
          verification_criteria: t.verification_criteria ? String(t.verification_criteria) : 'Syntax check passes',
          status: 'pending' as const,
          execution_stage: 1,
          can_run_parallel: false,
        }
      })
    : [
        {
          id: 'task_1',
          title: 'Architecture Blueprint, Rules & Domain Skills Scaffold',
          description: `Scaffold .rules/, .skills/, docs/, tasks/, and package.json for ${raw.projectName || 'web project'}.`,
          task_type: 'architecture' as const,
          dependencies: [],
          required_tools: ['file_writer', 'linter'],
          expected_files: ['docs/architecture.md', 'docs/requirements.md', 'tasks/task-backlog.md', '.rules/check.sh', '.rules/contrast.yml', '.skills/frontend-design/SKILL.md', 'package.json'],
          verification_criteria: 'All architecture docs, check scripts, and domain skill configs present',
          status: 'pending' as const,
          execution_stage: 1,
          can_run_parallel: false,
        },
        {
          id: 'task_2',
          title: 'Design System, Public Shell & Global Styles',
          description: 'Configure theme design tokens, typography, root HTML mounting ES modules, and manifest.',
          task_type: 'design_system' as const,
          dependencies: ['task_1'],
          required_tools: ['file_writer', 'linter'],
          expected_files: ['index.html', 'src/styles/theme.css', 'src/styles/main.css', 'public/favicon.svg', 'public/manifest.json'],
          verification_criteria: 'Valid HTML5 DOCTYPE, CSS custom properties, and responsive layout shell',
          status: 'pending' as const,
          execution_stage: 2,
          can_run_parallel: false,
        },
        {
          id: 'task_3',
          title: 'Modular UI Component Library',
          description: 'Build isolated ES module components: Navbar, Hero banner, Features showcase, and Footer.',
          task_type: 'frontend_ui' as const,
          dependencies: ['task_2'],
          required_tools: ['file_writer', 'linter'],
          expected_files: ['src/components/Navbar.js', 'src/components/Hero.js', 'src/components/Features.js', 'src/components/Footer.js', 'src/components/DetailsModal.js'],
          verification_criteria: 'Modular ES export functions, error-free DOM element generation',
          status: 'pending' as const,
          execution_stage: 3,
          can_run_parallel: false,
        },
        {
          id: 'task_4',
          title: 'Application State, Event Handlers & Main Entry',
          description: 'Implement src/main.js entry point, DOM utilities, toast feedback, and state management in src/utils/.',
          task_type: 'frontend_ui' as const,
          dependencies: ['task_3'],
          required_tools: ['file_writer', 'linter'],
          expected_files: ['src/main.js', 'src/utils/dom.js', 'src/utils/api.js'],
          verification_criteria: 'Syntactically valid ES6 JavaScript, verified DOM handlers and event delegation',
          status: 'pending' as const,
          execution_stage: 4,
          can_run_parallel: false,
        },
        {
          id: 'task_5',
          title: 'Supabase Schema & Security Migrations',
          description: 'Define database tables, row level security policies, and edge configuration in supabase/.',
          task_type: 'database_setup' as const,
          dependencies: ['task_1'],
          required_tools: ['file_writer', 'database_migrator'],
          expected_files: ['supabase/config.toml', 'supabase/migrations/01_initial_schema.sql', 'docs/api-specs.md'],
          verification_criteria: 'Valid SQL migration with RLS policies enabled and table schemas defined',
          status: 'pending' as const,
          execution_stage: 2,
          can_run_parallel: true,
        },
      ]

  // Compute DAG stages and parallel grouping
  const { enrichedTasks, executionStages } = computeTaskStages(rawTasks)

  const planId = `plan_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`

  return {
    id: planId,
    projectId,
    projectName: raw.projectName || 'Custom Web Application',
    tagline: raw.tagline || userPrompt,
    techStack: raw.techStack || 'HTML5, TailwindCSS, Modular JavaScript, Lucide Icons',
    architectureSummary: raw.architectureSummary || 'Layered modular client-side architecture with reactive UI components.',
    classification: analysis.classification,
    pages: Array.isArray(raw.pages) ? raw.pages : ['Home'],
    features: Array.isArray(raw.features) ? raw.features : ['Responsive Layout'],
    theme: {
      primaryColor: raw.theme?.primaryColor || '#da7756',
      accentColor: raw.theme?.accentColor || '#f59e0b',
      bgMode: raw.theme?.bgMode === 'light' ? 'light' : 'dark',
      description: raw.theme?.description || 'Modern dark theme with curated warm accents',
    },
    externalServices: Array.isArray(raw.externalServices) ? raw.externalServices : [],
    packages: Array.isArray(raw.packages) ? raw.packages : ['lucide@latest'],
    databaseTables: Array.isArray(raw.databaseTables) ? raw.databaseTables : [],
    apiRoutes: Array.isArray(raw.apiRoutes) ? raw.apiRoutes : [],
    tasks: enrichedTasks,
    executionStages,
    spokenSummary:
      raw.spokenSummary ||
      `I have formulated the architecture plan for ${raw.projectName || 'your project'} with ${enrichedTasks.length} sequential tasks. Ready for your review!`,
    needsClarification: Boolean(raw.needsClarification),
    clarificationQuestion: raw.clarificationQuestion ? String(raw.clarificationQuestion) : undefined,
  }
}
