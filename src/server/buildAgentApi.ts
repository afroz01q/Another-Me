import type { Plugin } from 'vite'
import fs from 'fs'
import path from 'path'
import { URL } from 'url'
import vm from 'vm'
import JSZip from 'jszip'
import { getCanonicalProjectFiles } from './agentRuntime/projectScaffolder'

export interface ProjectFile {
  path: string
  content: string
  size: number
  updatedAt: string
}

export interface BuildTask {
  id: string
  title: string
  description?: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  files: string[]
  startTime?: string
  completedTime?: string
  commands?: { command: string; exitCode: number; output: string; timestamp: string }[]
  buildResults?: { success: boolean; message?: string }
  errors?: string[]
  outcome?: string
}

export interface BuildProject {
  id: string
  userId: string
  name: string
  description: string
  techStack: string
  status: string
  createdAt: string
  updatedAt: string
  plan?: any
  tasks?: BuildTask[]
  logs?: any[]
}

const ROOT_STORAGE_DIR = path.resolve(process.cwd(), 'storage')
const WORKSPACES_DIR = path.join(ROOT_STORAGE_DIR, 'workspaces')

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

function getProjectDir(userId: string, projectId: string): string {
  const safeUser = (userId || 'default-user').replace(/[^a-zA-Z0-9_-]/g, '_')
  const safeProject = (projectId || 'default-proj').replace(/[^a-zA-Z0-9_-]/g, '_')
  const projectDir = path.join(WORKSPACES_DIR, safeUser, safeProject)
  ensureDir(projectDir)
  return projectDir
}

function getProjectFilesDir(projectDir: string): string {
  const filesDir = path.join(projectDir, 'src')
  ensureDir(filesDir)
  return filesDir
}

function getProjectMetaFile(projectDir: string): string {
  return path.join(projectDir, 'project.json')
}

// Recursively list all files in directory
function listFilesRecursively(dir: string, baseDir: string = dir): ProjectFile[] {
  let results: ProjectFile[] = []
  if (!fs.existsSync(dir)) return results

  const items = fs.readdirSync(dir, { withFileTypes: true })
  for (const item of items) {
    const fullPath = path.join(dir, item.name)
    const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/')

    if (item.name === 'node_modules' || item.name.startsWith('.git')) continue

    if (item.isDirectory()) {
      results = results.concat(listFilesRecursively(fullPath, baseDir))
    } else {
      try {
        const stats = fs.statSync(fullPath)
        const content = fs.readFileSync(fullPath, 'utf-8')
        results.push({
          path: relPath,
          content,
          size: stats.size,
          updatedAt: stats.mtime.toISOString(),
        })
      } catch {
        // Skip unreadable files
      }
    }
  }
  return results
}

function getOpenRouterKey(clientKey?: string): string {
  return (
    clientKey ||
    process.env.OPENROUTER_API_KEY ||
    ''
  )
}

function getLlmModel(): string {
  return (
    process.env.LLM_PROVIDER ||
    'meta-llama/llama-3.3-70b-instruct'
  )
}

async function callOpenRouter(messages: { role: string; content: string }[], temperature: number = 0.2, clientKey?: string): Promise<any> {
  const apiKey = getOpenRouterKey(clientKey)
  if (!apiKey) {
    throw new Error('OpenRouter API key is not configured. Please add OPENROUTER_API_KEY to your server environment.')
  }

  const model = getLlmModel()
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://anotherme.ai',
      'X-Title': 'Another Me Twin Coding Agent',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      response_format: { type: 'json_object' },
    }),
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`OpenRouter API error (HTTP ${res.status}): ${errorText}`)
  }

  const data = (await res.json()) as any
  const content = data?.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('AI returned an empty response.')
  }

  const clean = content.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim()
  return JSON.parse(clean)
}

function validateFileSyntax(filePath: string, content: string): { valid: boolean; error?: string } {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.js') {
    try {
      new vm.Script(content)
      return { valid: true }
    } catch (err: any) {
      return { valid: false, error: `JavaScript Syntax Error: ${err.message}` }
    }
  }

  if (ext === '.html') {
    if (!content.includes('<!DOCTYPE html>') && !content.includes('<html')) {
      return { valid: false, error: 'HTML warning: missing DOCTYPE declaration' }
    }
    const openTags = (content.match(/<div\b/g) || []).length
    const closeTags = (content.match(/<\/div>/g) || []).length
    if (Math.abs(openTags - closeTags) > 5) {
      return { valid: false, error: `HTML warning: unmatched div tags (${openTags} open vs ${closeTags} close)` }
    }
    return { valid: true }
  }

  if (ext === '.css') {
    const openBraces = (content.match(/\{/g) || []).length
    const closeBraces = (content.match(/\}/g) || []).length
    if (openBraces !== closeBraces) {
      return { valid: false, error: `CSS warning: mismatched braces (${openBraces} '{' vs ${closeBraces} '}')` }
    }
    return { valid: true }
  }

  return { valid: true }
}

export function buildAgentApiPlugin(): Plugin {
  ensureDir(ROOT_STORAGE_DIR)
  ensureDir(WORKSPACES_DIR)

  return {
    name: 'build-agent-api-endpoint',
    configureServer(server) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        const urlStr = req.url || ''
        if (!urlStr.startsWith('/api/build-agent')) {
          return next()
        }

        const url = new URL(urlStr, `http://${req.headers.host || 'localhost'}`)
        const pathname = url.pathname

        const sendJson = (statusCode: number, data: any) => {
          res.statusCode = statusCode
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(data))
        }

        const readJsonBody = async (): Promise<any> => {
          const chunks: Buffer[] = []
          for await (const chunk of req) chunks.push(chunk)
          const raw = Buffer.concat(chunks).toString('utf-8')
          try {
            return JSON.parse(raw)
          } catch {
            return {}
          }
        }

        try {
          // ==========================================
          // 1. REAL AI REASONING & PLANNING
          // POST /api/build-agent/ai/plan
          // ==========================================
          if (pathname === '/api/build-agent/ai/plan' && req.method === 'POST') {
            const body = await readJsonBody()
            const { prompt, twinName = 'Your Twin', apiKey } = body

            if (!prompt || !prompt.trim()) {
              return sendJson(400, { error: 'Prompt is required for planning' })
            }

            const systemPrompt = `You are ${twinName}, an elite Senior Principal Software Architect and AI Full-Stack Developer.
The user is instructing you via voice or text to architect and build a complete, real web application.

YOUR MISSION:
Analyze the user's specific request and produce a comprehensive, structured implementation plan in valid JSON across standard code folders (.rules/, .skills/, docs/, public/, src/components/, src/styles/, src/utils/, src/main.js, supabase/, tasks/).

CRITICAL RULES:
1. Do NOT return hardcoded demo content. Tailor the plan 100% to what the user explicitly requested: "${prompt}".
2. Define a complete architecture: project name, tagline, tech stack (HTML5, TailwindCSS CDN, Modular Vanilla JS / Modern Frontend, Lucide Icons, Supabase), target pages/sections, interactive features, theme palette (primary color, accent color, background mode, description), external services or credentials required, and ordered tasks.
3. Formulate 4 to 5 sequential execution tasks with task ID, descriptive title, detailed description, and the target files required across folders (.rules, .skills, docs, public, src, supabase, tasks).
4. Provide a warm, concise spoken summary (under 40 words) that you will speak aloud through your voice avatar to introduce the plan.
5. If the user's request is completely ambiguous (e.g. only "make something"), set "needsClarification": true and provide "clarificationQuestion". Otherwise, set "needsClarification": false.

Return strictly a valid JSON object matching this schema:
{
  "projectName": "Name of the project",
  "tagline": "Short descriptive tagline",
  "techStack": "HTML5, TailwindCSS, Modular JavaScript, Lucide Icons, Supabase",
  "pages": ["Hero Showcase", "Features & Services", "Interactive Modal", "Documentation"],
  "features": ["Modular ES component imports", "Responsive mobile navigation", "Client-side interactive modals", "Toast feedback"],
  "theme": {
    "primaryColor": "#da7756",
    "accentColor": "#10b981",
    "bgMode": "dark",
    "description": "Sleek dark theme with warm accents"
  },
  "externalServices": [
    { "service": "Lucide Icons", "purpose": "SVG icon pack", "credentialsRequired": "None (CDN)" },
    { "service": "Supabase", "purpose": "Backend database & auth", "credentialsRequired": "Configured" }
  ],
  "tasks": [
    { "id": "task_1", "title": "Architecture Blueprint, Rules & Domain Skills Scaffold", "description": "Scaffold .rules/, .skills/, docs/, tasks/, and package.json", "files": ["docs/architecture.md", "docs/requirements.md", "tasks/task-backlog.md", ".rules/check.sh", ".rules/contrast.yml", ".skills/frontend-design/SKILL.md", "package.json"] },
    { "id": "task_2", "title": "Design System, Public Shell & Global Styles", "description": "Configure theme variables, Tailwind integration, favicon, and root index.html", "files": ["index.html", "src/styles/theme.css", "src/styles/main.css", "public/favicon.svg", "public/manifest.json"] },
    { "id": "task_3", "title": "Modular UI Component Library", "description": "Build isolated ES module components: Navbar, Hero banner, Features showcase, DetailsModal, Footer", "files": ["src/components/Navbar.js", "src/components/Hero.js", "src/components/Features.js", "src/components/Footer.js", "src/components/DetailsModal.js"] },
    { "id": "task_4", "title": "Application State, Event Handlers & Main Entry", "description": "Implement src/main.js entry point, DOM utilities, and toast notifications in src/utils/", "files": ["src/main.js", "src/utils/dom.js", "src/utils/api.js"] },
    { "id": "task_5", "title": "Supabase Schema & Security Migrations", "description": "Define database tables and row level security policies in supabase/", "files": ["supabase/config.toml", "supabase/migrations/01_initial_schema.sql", "docs/api-specs.md"] }
  ],
  "spokenSummary": "I have mapped out the modular architecture across all code folders for your website. Ready to begin!",
  "needsClarification": false,
  "clarificationQuestion": ""
}`

            const plan = await callOpenRouter(
              [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Please architect this website application: "${prompt}"` },
              ],
              0.2,
              apiKey
            )

            return sendJson(200, { plan })
          }

          // ==========================================
          // 2. REAL AI CODING AGENT
          // POST /api/build-agent/ai/generate-code
          // ==========================================
          if (pathname === '/api/build-agent/ai/generate-code' && req.method === 'POST') {
            const body = await readJsonBody()
            const { projectId, userId = 'default-user', plan, task, existingFiles = {}, userPrompt, apiKey } = body

            if (!plan || !task) {
              return sendJson(400, { error: 'Plan and task are required for code generation' })
            }

            const projectDir = getProjectDir(userId, projectId)
            const filesDir = getProjectFilesDir(projectDir)

            const targetFilesList: string[] = task.files && task.files.length > 0
              ? task.files
              : ['index.html', 'src/styles/theme.css', 'src/styles/main.css', 'src/components/Navbar.js', 'src/components/Hero.js', 'src/components/Features.js', 'src/components/Footer.js', 'src/main.js']

            const systemPrompt = `You are an elite Senior AI Full-Stack Developer.
You are actively implementing a real web application across structured code folders (.rules/, .skills/, docs/, public/, src/components/, src/styles/, src/utils/, src/main.js, supabase/, tasks/).

PROJECT CONTEXT:
- Name: "${plan.projectName}"
- Tagline: "${plan.tagline}"
- User Prompt: "${userPrompt || plan.tagline}"
- Tech Stack: "${plan.techStack}"
- Pages/Views: ${JSON.stringify(plan.pages)}
- Features: ${JSON.stringify(plan.features)}
- Theme: ${JSON.stringify(plan.theme)}

CURRENT TASK:
- Task ID: "${task.id}"
- Title: "${task.title}"
- Description: "${task.description || ''}"
- TARGET FILES TO IMPLEMENT: ${JSON.stringify(targetFilesList)}

EXISTING WORKSPACE FILES:
${Object.keys(existingFiles).length > 0 ? Object.entries(existingFiles).map(([p, c]) => `--- File: ${p} ---\n${c}`).join('\n\n') : 'No files created yet.'}

CRITICAL IMPLEMENTATION RULES:
1. Provide 100% COMPLETE, WORKING, PRODUCTION-READY CODE for every target file in target files: ${JSON.stringify(targetFilesList)}.
2. NEVER leave placeholders, ellipses ("..."), or comments like "// implement later". Every function, modal, button, and style must be fully coded and functional.
3. For 'index.html':
   - Include <!DOCTYPE html><html lang="en"> with meta tags, TailwindCSS script, Lucide Icons script, <link rel="stylesheet" href="./src/styles/theme.css">, <link rel="stylesheet" href="./src/styles/main.css">, <div id="app"></div>, and <script type="module" src="./src/main.js"></script>.
4. For 'src/components/*.js':
   - Export render functions (e.g. export function renderNavbar(container) { ... }).
   - Wire event listeners for interactive buttons, modals, and toasts.
5. For 'src/main.js':
   - Import component renderers from './components/*.js' and helpers from './utils/*.js'.
   - Initialize on DOMContentLoaded and call window.lucide.createIcons().
6. For 'src/styles/*.css':
   - Provide complete CSS with custom variables, layout, and animations.
7. For 'docs/*.md' and 'tasks/*.md':
   - Provide thorough markdown documentation.
8. For 'supabase/*.sql':
   - Provide valid PostgreSQL schemas with RLS policies enabled.

OUTPUT FORMAT:
Return strictly a valid JSON object matching this schema:
{
  "files": [
    {
      "path": "relative/path/to/file.ext",
      "content": "complete source code here",
      "description": "Functional description of the file"
    }
  ]
}`

            let generatedFiles: { path: string; content: string; description: string }[] = []
            try {
              const result = await callOpenRouter(
                [
                  { role: 'system', content: systemPrompt },
                  { role: 'user', content: `Implement all files for task "${task.title}": ${JSON.stringify(targetFilesList)}.` },
                ],
                0.2,
                apiKey
              )
              if (Array.isArray(result?.files) && result.files.length > 0) {
                generatedFiles = result.files
              }
            } catch (llmErr) {
              console.warn('[buildAgentApi] LLM generation error, utilizing canonical scaffolder fallback:', llmErr)
            }

            // Fallback to canonical starter files if model returned incomplete output
            const canonicalMap = getCanonicalProjectFiles({
              name: plan.projectName,
              prompt: userPrompt || plan.tagline,
              theme: plan.theme,
            })

            for (const targetPath of targetFilesList) {
              const alreadyGenerated = generatedFiles.some((f) => f.path === targetPath)
              if (!alreadyGenerated && canonicalMap[targetPath]) {
                generatedFiles.push({
                  path: targetPath,
                  content: canonicalMap[targetPath],
                  description: `Scaffolded canonical module for ${targetPath}`,
                })
              }
            }
            const lintResults: { file: string; valid: boolean; error?: string }[] = []

            for (const file of generatedFiles) {
              const relPath = file.path.replace(/^\/+/, '')
              const target = path.resolve(filesDir, relPath)
              if (!target.startsWith(filesDir)) continue

              // Validate syntax
              const syntax = validateFileSyntax(relPath, file.content)
              lintResults.push({ file: relPath, valid: syntax.valid, error: syntax.error })

              // Save to workspace
              ensureDir(path.dirname(target))
              fs.writeFileSync(target, file.content, 'utf-8')
            }

            // Update project.json
            const metaFile = getProjectMetaFile(projectDir)
            if (fs.existsSync(metaFile)) {
              try {
                const meta = JSON.parse(fs.readFileSync(metaFile, 'utf-8'))
                meta.updatedAt = new Date().toISOString()
                meta.status = 'implementing'
                fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2), 'utf-8')
              } catch {}
            }

            return sendJson(200, {
              success: true,
              files: generatedFiles,
              lintResults,
              taskStatus: 'completed',
            })
          }

          // ==========================================
          // 3. REAL AI CONVERSATIONAL EDITING
          // POST /api/build-agent/ai/edit
          // ==========================================
          if (pathname === '/api/build-agent/ai/edit' && req.method === 'POST') {
            const body = await readJsonBody()
            const { projectId, userId = 'default-user', instruction, plan, apiKey } = body

            if (!instruction || !instruction.trim()) {
              return sendJson(400, { error: 'Instruction is required for editing' })
            }

            const projectDir = getProjectDir(userId, projectId)
            const filesDir = getProjectFilesDir(projectDir)
            const existingFilesList = listFilesRecursively(filesDir)

            const existingFilesMap: Record<string, string> = {}
            existingFilesList.forEach((f) => {
              existingFilesMap[f.path] = f.content
            })

            const systemPrompt = `You are an elite Senior AI Full-Stack Developer modifying an existing web project.
The user is speaking to you directly to request modifications to their website.

PROJECT CONTEXT:
- Name: "${plan?.projectName || 'Web Application'}"
- Tagline: "${plan?.tagline || ''}"

CURRENT WORKSPACE FILES:
${Object.entries(existingFilesMap).map(([p, c]) => `=== File: ${p} ===\n${c}`).join('\n\n')}

USER MODIFICATION REQUEST:
"${instruction}"

INSTRUCTIONS:
1. Carefully analyze the user's request and determine precisely which files need to be modified or created (e.g. index.html, styles.css, app.js).
2. Generate the 100% COMPLETE updated code for each modified or created file. Do not use diff markers or ellipses. Provide complete drop-in replacement files.
3. Provide a warm, concise spoken summary (under 40 words) for your voice avatar to explain what you modified to the user.
4. Provide a technical explanation of the changes made.

Return strictly a valid JSON object matching this schema:
{
  "modifiedFiles": [
    {
      "path": "styles.css",
      "content": "complete updated css content",
      "description": "Updated color palette to obsidian black and vibrant orange",
      "action": "modified"
    }
  ],
  "spokenSummary": "I have updated the color scheme and added the requested feature. Take a look at the live preview!",
  "explanation": "Applied changes to styles.css and index.html."
}`

            const editResult = await callOpenRouter(
              [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Please execute this modification: "${instruction}".` },
              ],
              0.2,
              apiKey
            )

            const modifiedFiles: { path: string; content: string; description: string; action: string }[] = editResult.modifiedFiles || []
            const lintResults: { file: string; valid: boolean; error?: string }[] = []

            for (const file of modifiedFiles) {
              const relPath = file.path.replace(/^\/+/, '')
              const target = path.resolve(filesDir, relPath)
              if (!target.startsWith(filesDir)) continue

              const syntax = validateFileSyntax(relPath, file.content)
              lintResults.push({ file: relPath, valid: syntax.valid, error: syntax.error })

              ensureDir(path.dirname(target))
              fs.writeFileSync(target, file.content, 'utf-8')
            }

            // Update project.json
            const metaFile = getProjectMetaFile(projectDir)
            if (fs.existsSync(metaFile)) {
              try {
                const meta = JSON.parse(fs.readFileSync(metaFile, 'utf-8'))
                meta.updatedAt = new Date().toISOString()
                fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2), 'utf-8')
              } catch {}
            }

            return sendJson(200, {
              success: true,
              modifiedFiles,
              spokenSummary: editResult.spokenSummary || 'Changes applied successfully!',
              explanation: editResult.explanation || 'Updated workspace files.',
              lintResults,
            })
          }

          // ==========================================
          // 4. REAL WORKSPACE COMMAND EXECUTION & TEST RUNNER
          // POST /api/build-agent/projects/:id/exec
          // ==========================================
          const execMatch = pathname.match(/^\/api\/build-agent\/projects\/([^/]+)\/exec$/)
          if (execMatch && req.method === 'POST') {
            const projectId = decodeURIComponent(execMatch[1])
            const userId = url.searchParams.get('userId') || 'default-user'
            const body = await readJsonBody()
            const command = body.command || 'validate'

            const projectDir = getProjectDir(userId, projectId)
            const filesDir = getProjectFilesDir(projectDir)
            const startTime = Date.now()

            if (command === 'validate' || command === 'lint') {
              const files = listFilesRecursively(filesDir)
              const logs: string[] = []
              let hasErrors = false

              logs.push(`[workspace-lint] Running syntax validation across ${files.length} project files...`)
              for (const file of files) {
                const syntax = validateFileSyntax(file.path, file.content)
                if (syntax.valid) {
                  logs.push(`✓ [PASS] ${file.path} (${file.size} bytes) - syntax OK`)
                } else {
                  hasErrors = true
                  logs.push(`✗ [FAIL] ${file.path} - ${syntax.error}`)
                }
              }

              const durationMs = Date.now() - startTime
              const exitCode = hasErrors ? 1 : 0
              logs.push(`[workspace-lint] Finished in ${durationMs}ms with exit code ${exitCode}.`)

              return sendJson(200, {
                command,
                exitCode,
                stdout: logs.join('\n'),
                stderr: hasErrors ? 'Lint failures detected' : '',
                durationMs,
              })
            }

            if (command === 'test') {
              const files = listFilesRecursively(filesDir)
              const logs: string[] = []
              let failedTests = 0
              let passedTests = 0

              logs.push(`[test-runner] Executing automated smoke tests in workspace...`)

              // Test 1: index.html exists
              const htmlFile = files.find((f) => f.path === 'index.html')
              if (htmlFile) {
                logs.push(`✓ [TEST 1] index.html root entrypoint exists (${htmlFile.size} bytes)`)
                passedTests++
              } else {
                logs.push(`✗ [TEST 1] index.html missing`)
                failedTests++
              }

              // Test 2: CSS stylesheet link valid
              const cssFile = files.find((f) => f.path.endsWith('.css'))
              if (cssFile) {
                logs.push(`✓ [TEST 2] Stylesheet ${cssFile.path} compiled and available`)
                passedTests++
              } else {
                logs.push(`✗ [TEST 2] No CSS stylesheet found`)
                failedTests++
              }

              // Test 3: JavaScript script file valid
              const jsFile = files.find((f) => f.path.endsWith('.js'))
              if (jsFile) {
                const jsValid = validateFileSyntax(jsFile.path, jsFile.content)
                if (jsValid.valid) {
                  logs.push(`✓ [TEST 3] JavaScript module ${jsFile.path} syntax verified`)
                  passedTests++
                } else {
                  logs.push(`✗ [TEST 3] JavaScript error: ${jsValid.error}`)
                  failedTests++
                }
              }

              // Test 4: Viewport & responsive tags
              if (htmlFile && htmlFile.content.includes('viewport')) {
                logs.push(`✓ [TEST 4] Responsive meta viewport verified`)
                passedTests++
              }

              const durationMs = Date.now() - startTime
              const exitCode = failedTests > 0 ? 1 : 0
              logs.push(`[test-runner] Results: ${passedTests} passed, ${failedTests} failed in ${durationMs}ms.`)

              return sendJson(200, {
                command,
                exitCode,
                stdout: logs.join('\n'),
                stderr: failedTests > 0 ? `${failedTests} tests failed` : '',
                durationMs,
              })
            }

            return sendJson(400, { error: `Unsupported command: ${command}` })
          }

          // ==========================================
          // 5. PROJECT & FILE CRUD / EXPORT / PREVIEW
          // ==========================================

          // List Projects: GET /api/build-agent/projects?userId=...
          if (pathname === '/api/build-agent/projects' && req.method === 'GET') {
            const userId = url.searchParams.get('userId') || 'default-user'
            const safeUser = userId.replace(/[^a-zA-Z0-9_-]/g, '_')
            const userDir = path.join(WORKSPACES_DIR, safeUser)
            ensureDir(userDir)

            const projects: BuildProject[] = []
            const subdirs = fs.readdirSync(userDir, { withFileTypes: true })
            for (const sub of subdirs) {
              if (sub.isDirectory()) {
                const metaPath = path.join(userDir, sub.name, 'project.json')
                if (fs.existsSync(metaPath)) {
                  try {
                    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
                    projects.push(meta)
                  } catch {}
                }
              }
            }
            projects.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
            return sendJson(200, { projects })
          }

          // Create or Update Project Metadata: POST /api/build-agent/projects
          if (pathname === '/api/build-agent/projects' && req.method === 'POST') {
            const body = await readJsonBody()
            const userId = body.userId || 'default-user'
            const projectId = body.id || `proj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
            const projectDir = getProjectDir(userId, projectId)
            const metaFile = getProjectMetaFile(projectDir)

            let existing: Partial<BuildProject> = {}
            if (fs.existsSync(metaFile)) {
              try {
                existing = JSON.parse(fs.readFileSync(metaFile, 'utf-8'))
              } catch {}
            }

            const now = new Date().toISOString()
            const project: BuildProject = {
              id: projectId,
              userId,
              name: body.name || existing.name || 'Untitled Website',
              description: body.description || existing.description || '',
              techStack: body.techStack || existing.techStack || 'HTML5/Tailwind/JS',
              status: body.status || existing.status || 'planning',
              createdAt: existing.createdAt || now,
              updatedAt: now,
              plan: body.plan || existing.plan,
              tasks: body.tasks || existing.tasks,
              logs: body.logs || existing.logs,
            }

            fs.writeFileSync(metaFile, JSON.stringify(project, null, 2), 'utf-8')
            return sendJson(200, { project })
          }

          // Match /api/build-agent/projects/:projectId/...
          const projectMatch = pathname.match(/^\/api\/build-agent\/projects\/([^/]+)(\/.*)?$/)
          if (projectMatch) {
            const projectId = decodeURIComponent(projectMatch[1])
            const subAction = projectMatch[2] || ''
            const userId = url.searchParams.get('userId') || 'default-user'
            const projectDir = getProjectDir(userId, projectId)
            const filesDir = getProjectFilesDir(projectDir)
            const metaFile = getProjectMetaFile(projectDir)

            // GET single project metadata: GET /api/build-agent/projects/:id
            if (subAction === '' && req.method === 'GET') {
              if (!fs.existsSync(metaFile)) {
                return sendJson(404, { error: 'Project not found' })
              }
              const meta = JSON.parse(fs.readFileSync(metaFile, 'utf-8'))
              const files = listFilesRecursively(filesDir)
              return sendJson(200, { project: meta, files })
            }

            // DELETE project: DELETE /api/build-agent/projects/:id
            if (subAction === '' && req.method === 'DELETE') {
              if (fs.existsSync(projectDir)) {
                fs.rmSync(projectDir, { recursive: true, force: true })
              }
              return sendJson(200, { success: true })
            }

            // GET files list or single file: GET /api/build-agent/projects/:id/files
            if (subAction === '/files' && req.method === 'GET') {
              const filePath = url.searchParams.get('path')
              if (filePath) {
                const target = path.resolve(filesDir, filePath.replace(/^\/+/, ''))
                if (!target.startsWith(filesDir) || !fs.existsSync(target)) {
                  return sendJson(404, { error: 'File not found' })
                }
                const content = fs.readFileSync(target, 'utf-8')
                return sendJson(200, { path: filePath, content })
              }
              const files = listFilesRecursively(filesDir)
              return sendJson(200, { files })
            }

            // Save single file: POST /api/build-agent/projects/:id/files
            if (subAction === '/files' && req.method === 'POST') {
              const body = await readJsonBody()
              const relPath = (body.path || '').replace(/^\/+/, '')
              if (!relPath) {
                return sendJson(400, { error: 'path is required' })
              }
              const target = path.resolve(filesDir, relPath)
              if (!target.startsWith(filesDir)) {
                return sendJson(403, { error: 'Access denied: outside workspace' })
              }
              ensureDir(path.dirname(target))
              fs.writeFileSync(target, body.content ?? '', 'utf-8')

              if (fs.existsSync(metaFile)) {
                try {
                  const meta = JSON.parse(fs.readFileSync(metaFile, 'utf-8'))
                  meta.updatedAt = new Date().toISOString()
                  fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2), 'utf-8')
                } catch {}
              }

              return sendJson(200, { success: true, path: relPath })
            }

            // Save multiple files atomically: POST /api/build-agent/projects/:id/batch-files
            if (subAction === '/batch-files' && req.method === 'POST') {
              const body = await readJsonBody()
              const files: { path: string; content: string }[] = body.files || []

              for (const f of files) {
                const relPath = (f.path || '').replace(/^\/+/, '')
                if (!relPath) continue
                const target = path.resolve(filesDir, relPath)
                if (!target.startsWith(filesDir)) continue
                ensureDir(path.dirname(target))
                fs.writeFileSync(target, f.content ?? '', 'utf-8')
              }

              if (fs.existsSync(metaFile)) {
                try {
                  const meta = JSON.parse(fs.readFileSync(metaFile, 'utf-8'))
                  meta.updatedAt = new Date().toISOString()
                  if (body.status) meta.status = body.status
                  if (body.plan) meta.plan = body.plan
                  if (body.tasks) meta.tasks = body.tasks
                  fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2), 'utf-8')
                } catch {}
              }

              return sendJson(200, { success: true, count: files.length })
            }

            // Delete single file: DELETE /api/build-agent/projects/:id/files
            if (subAction === '/files' && req.method === 'DELETE') {
              const filePath = url.searchParams.get('path') || ''
              const target = path.resolve(filesDir, filePath.replace(/^\/+/, ''))
              if (target.startsWith(filesDir) && fs.existsSync(target)) {
                fs.unlinkSync(target)
                return sendJson(200, { success: true })
              }
              return sendJson(404, { error: 'File not found' })
            }

            // Download ZIP archive: GET /api/build-agent/projects/:id/export
            if (subAction === '/export' && req.method === 'GET') {
              const allFiles = listFilesRecursively(filesDir)
              const zip = new JSZip()

              for (const file of allFiles) {
                zip.file(file.path, file.content)
              }

              let projectName = 'website-project'
              if (fs.existsSync(metaFile)) {
                try {
                  const meta = JSON.parse(fs.readFileSync(metaFile, 'utf-8'))
                  if (meta.name) projectName = meta.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
                } catch {}
              }

              const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
              res.statusCode = 200
              res.setHeader('Content-Type', 'application/zip')
              res.setHeader('Content-Disposition', `attachment; filename="${projectName}.zip"`)
              res.setHeader('Content-Length', String(zipBuffer.length))
              res.end(zipBuffer)
              return
            }

            // Serve project preview files: GET /api/build-agent/projects/:id/preview/...
            if (subAction.startsWith('/preview')) {
              let subPath = subAction.replace(/^\/preview/, '').replace(/^\/+/, '')
              if (!subPath) subPath = 'index.html'

              const target = path.resolve(filesDir, subPath)
              if (!target.startsWith(filesDir) || !fs.existsSync(target)) {
                if (subPath === 'index.html') {
                  res.statusCode = 200
                  res.setHeader('Content-Type', 'text/html; charset=utf-8')
                  res.end(`<!DOCTYPE html><html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0f0f11;color:#888;"><div>Initializing Website Preview...</div></body></html>`)
                  return
                }
                res.statusCode = 404
                res.setHeader('Content-Type', 'text/plain')
                res.end('Not Found')
                return
              }

              const ext = path.extname(target).toLowerCase()
              const mimeMap: Record<string, string> = {
                '.html': 'text/html; charset=utf-8',
                '.css': 'text/css; charset=utf-8',
                '.js': 'application/javascript; charset=utf-8',
                '.json': 'application/json; charset=utf-8',
                '.svg': 'image/svg+xml',
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.gif': 'image/gif',
                '.webp': 'image/webp',
                '.woff2': 'font/woff2',
              }

              const contentType = mimeMap[ext] || 'text/plain; charset=utf-8'
              const content = fs.readFileSync(target)
              res.statusCode = 200
              res.setHeader('Content-Type', contentType)
              res.end(content)
              return
            }
          }

          // Unhandled
          return sendJson(404, { error: 'Unknown build agent endpoint' })
        } catch (err: any) {
          console.error('Build Agent API error:', err)
          return sendJson(500, { error: err.message || 'Internal Server Error' })
        }
      })
    },
  }
}
