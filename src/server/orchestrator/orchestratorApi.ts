// ====================================================================
// ANOTHER ME — SECTION 1: AI ORCHESTRATOR & PLANNING API PLUGIN
// Manages the complete lifecycle:
// received → analyzing → planning → awaiting_approval → approved → ready_for_execution
// Enforces server-side Supabase token authentication & user isolation.
// ====================================================================

import type { Plugin } from 'vite'
import { URL } from 'url'
import { orchestratorStorage } from './orchestratorStorage'
import { analyzeUserRequirement } from './requirementAnalyzer'
import { generateDynamicPlan } from './planGenerator'
import { isServerAIConfigured } from './providerAdapter'
import { verifyServerAuth } from './authValidator'
import { workspaceManager } from '../agentRuntime/workspaceManager'
import type {
  OrchestratorProject,
  ExecutionBundle,
} from '../../types/orchestrator'

export function orchestratorApiPlugin(): Plugin {
  return {
    name: 'orchestrator-api-endpoint',
    configureServer(server) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        const urlStr = req.url || ''
        if (!urlStr.startsWith('/api/orchestrator')) {
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

        /**
         * Enforce server-side authentication on protected routes.
         * Derives user ID strictly from the verified session identity.
         * Never trusts client-supplied userId.
         */
        const requireAuth = async (): Promise<{ userId: string; email?: string } | null> => {
          const authResult = await verifyServerAuth(req)
          if (!authResult.authenticated || !authResult.userId) {
            sendJson(authResult.statusCode || 401, {
              error: authResult.error || 'Authentication required.',
              code: 'UNAUTHENTICATED',
            })
            return null
          }
          return { userId: authResult.userId, email: authResult.email }
        }

        try {
          // ------------------------------------------------------------------
          // 0. HEALTH & STATUS (Public endpoint)
          // GET /api/orchestrator/status
          // ------------------------------------------------------------------
          if (pathname === '/api/orchestrator/status' && req.method === 'GET') {
            return sendJson(200, {
              status: 'ok',
              section: 'Section 1: Real AI Orchestrator & Planning Engine',
              providerConfigured: isServerAIConfigured(),
              workflowStates: [
                'received',
                'analyzing',
                'planning',
                'awaiting_approval',
                'approved',
                'ready_for_execution',
              ],
            })
          }

          // ------------------------------------------------------------------
          // 1. REQUIREMENT ANALYSIS ONLY (Protected)
          // POST /api/orchestrator/analyze
          // ------------------------------------------------------------------
          if (pathname === '/api/orchestrator/analyze' && req.method === 'POST') {
            const auth = await requireAuth()
            if (!auth) return

            const body = await readJsonBody()
            const { prompt, conversationHistory = [], apiKey } = body

            if (!prompt || !String(prompt).trim()) {
              return sendJson(400, { error: 'Prompt is required for requirement analysis.' })
            }

            const analysis = await analyzeUserRequirement(prompt, conversationHistory, apiKey)
            return sendJson(200, { analysis })
          }

          // ------------------------------------------------------------------
          // 2. ORCHESTRATE NEW PLAN (Protected)
          // POST /api/orchestrator/plan
          // Transitions: received → analyzing → planning → awaiting_approval
          // ------------------------------------------------------------------
          if (pathname === '/api/orchestrator/plan' && req.method === 'POST') {
            const auth = await requireAuth()
            if (!auth) return

            const body = await readJsonBody()
            const {
              prompt,
              twinName = 'Your Twin',
              conversationHistory = [],
              projectId: requestedProjectId,
              apiKey,
            } = body

            // Verify identity: Never trust client-supplied userId
            const verifiedUserId = auth.userId
            if (body.userId && body.userId !== verifiedUserId) {
              return sendJson(403, {
                error: 'Access denied: User ID mismatch between authenticated token and request payload.',
                code: 'USER_MISMATCH',
              })
            }

            if (!prompt || !String(prompt).trim()) {
              return sendJson(400, { error: 'Prompt is required for planning.' })
            }

            const projectId = requestedProjectId || `proj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
            const now = new Date().toISOString()

            // State: received
            await orchestratorStorage.recordEvent(
              projectId,
              verifiedUserId,
              undefined,
              'received',
              `User development instruction received: "${prompt}"`
            )

            // State: analyzing
            await orchestratorStorage.recordEvent(
              projectId,
              verifiedUserId,
              'received',
              'analyzing',
              'Analyzing requirement intent, technical scope, and classification.'
            )

            const analysis = await analyzeUserRequirement(prompt, conversationHistory, apiKey)

            // If prompt is completely ambiguous, stop at analyzing with clarification question
            if (analysis.needsClarification) {
              const project: OrchestratorProject = {
                id: projectId,
                userId: verifiedUserId,
                name: 'Clarification Needed',
                description: prompt,
                userPrompt: prompt,
                requestClassification: analysis.classification,
                workflowState: 'analyzing',
                analysis,
                plan: null,
                tasks: [],
                events: await orchestratorStorage.getEvents(projectId, verifiedUserId),
                createdAt: now,
                updatedAt: now,
              }
              await orchestratorStorage.saveProject(project)

              return sendJson(200, {
                project,
                needsClarification: true,
                clarificationQuestion: analysis.clarificationQuestion,
                workflowState: 'analyzing',
              })
            }

            // State: planning
            await orchestratorStorage.recordEvent(
              projectId,
              verifiedUserId,
              'analyzing',
              'planning',
              `Generating dynamic architecture plan for classification: ${analysis.classification}.`
            )

            const plan = await generateDynamicPlan(prompt, analysis, twinName, projectId, apiKey)

            // State: awaiting_approval
            await orchestratorStorage.recordEvent(
              projectId,
              verifiedUserId,
              'planning',
              'awaiting_approval',
              `Architecture plan "${plan.projectName}" formulated with ${plan.tasks.length} tasks across ${plan.executionStages.length} stages. Awaiting user approval.`,
              { taskCount: plan.tasks.length, stagesCount: plan.executionStages.length }
            )

            const allEvents = await orchestratorStorage.getEvents(projectId, verifiedUserId)

            const project: OrchestratorProject = {
              id: projectId,
              userId: verifiedUserId,
              name: plan.projectName,
              description: plan.tagline,
              userPrompt: prompt,
              requestClassification: analysis.classification,
              workflowState: 'awaiting_approval',
              analysis,
              plan,
              tasks: plan.tasks,
              events: allEvents,
              createdAt: now,
              updatedAt: now,
            }

            try {
              // Pre-scaffold mandatory multi-folder layout (.rules, .skills, docs, public, src, supabase, tasks)
              await workspaceManager.getOrCreateWorkspace(verifiedUserId, projectId)
            } catch (wsErr) {
              console.warn('[orchestratorApi] Workspace pre-scaffold note:', wsErr)
            }

            await orchestratorStorage.saveProject(project)

            return sendJson(200, {
              project,
              plan,
              workflowState: 'awaiting_approval',
              spokenSummary: plan.spokenSummary,
            })
          }

          // ------------------------------------------------------------------
          // 3. LIST USER PROJECTS (Protected)
          // GET /api/orchestrator/projects
          // ------------------------------------------------------------------
          if (pathname === '/api/orchestrator/projects' && req.method === 'GET') {
            const auth = await requireAuth()
            if (!auth) return

            const verifiedUserId = auth.userId
            const queryUserId = url.searchParams.get('userId')
            if (queryUserId && queryUserId !== verifiedUserId) {
              return sendJson(403, {
                error: 'Access denied: Cannot query projects of another user.',
                code: 'USER_MISMATCH',
              })
            }

            const projects = await orchestratorStorage.listProjects(verifiedUserId)
            return sendJson(200, { projects })
          }

          // ------------------------------------------------------------------
          // 4. PROJECT DETAIL / APPROVE / REJECT / EVENTS (Protected)
          // Matches /api/orchestrator/projects/:id[/action]
          // ------------------------------------------------------------------
          const projectMatch = pathname.match(/^\/api\/orchestrator\/projects\/([^/]+)(\/.*)?$/)
          if (projectMatch) {
            const auth = await requireAuth()
            if (!auth) return

            const verifiedUserId = auth.userId
            const queryUserId = url.searchParams.get('userId')
            if (queryUserId && queryUserId !== verifiedUserId) {
              return sendJson(403, {
                error: 'Access denied: User ID parameter does not match authenticated token identity.',
                code: 'USER_MISMATCH',
              })
            }

            const projectId = decodeURIComponent(projectMatch[1])
            const subAction = projectMatch[2] || ''

            // GET /api/orchestrator/projects/:id
            if (subAction === '' && req.method === 'GET') {
              try {
                const project = await orchestratorStorage.getProject(projectId, verifiedUserId)
                if (!project) {
                  return sendJson(404, { error: `Project ${projectId} not found.`, code: 'NOT_FOUND' })
                }
                const events = await orchestratorStorage.getEvents(projectId, verifiedUserId)
                project.events = events
                return sendJson(200, { project })
              } catch (err: any) {
                if (err.message.includes('ACCESS_DENIED')) {
                  return sendJson(403, { error: 'Access denied: You do not own this project.', code: 'FORBIDDEN' })
                }
                throw err
              }
            }

            // DELETE /api/orchestrator/projects/:id
            if (subAction === '' && req.method === 'DELETE') {
              try {
                // Verify project ownership before deletion
                const existing = await orchestratorStorage.getProject(projectId, verifiedUserId)
                if (!existing) {
                  return sendJson(404, { error: `Project ${projectId} not found.`, code: 'NOT_FOUND' })
                }
                const deleted = await orchestratorStorage.deleteProject(projectId, verifiedUserId)
                return sendJson(200, { success: deleted })
              } catch (err: any) {
                if (err.message.includes('ACCESS_DENIED')) {
                  return sendJson(403, { error: 'Access denied: You do not own this project.', code: 'FORBIDDEN' })
                }
                throw err
              }
            }

            // GET /api/orchestrator/projects/:id/events
            if (subAction === '/events' && req.method === 'GET') {
              try {
                const project = await orchestratorStorage.getProject(projectId, verifiedUserId)
                if (!project) {
                  return sendJson(404, { error: `Project ${projectId} not found.`, code: 'NOT_FOUND' })
                }
                const events = await orchestratorStorage.getEvents(projectId, verifiedUserId)
                return sendJson(200, { events })
              } catch (err: any) {
                if (err.message.includes('ACCESS_DENIED')) {
                  return sendJson(403, { error: 'Access denied: You do not own this project.', code: 'FORBIDDEN' })
                }
                throw err
              }
            }

            // ----------------------------------------------------------------
            // STEP 6: APPROVE PLAN
            // POST /api/orchestrator/projects/:id/approve
            // Transitions: awaiting_approval → approved → ready_for_execution
            // ----------------------------------------------------------------
            if (subAction === '/approve' && req.method === 'POST') {
              try {
                const project = await orchestratorStorage.getProject(projectId, verifiedUserId)
                if (!project) {
                  return sendJson(404, { error: `Project ${projectId} not found.`, code: 'NOT_FOUND' })
                }

                if (project.workflowState !== 'awaiting_approval' && project.workflowState !== 'planning') {
                  return sendJson(400, {
                    error: `Cannot approve project in current state '${project.workflowState}'. Must be in 'awaiting_approval'.`,
                  })
                }

                const now = new Date().toISOString()

                // State: approved
                await orchestratorStorage.recordEvent(
                  projectId,
                  verifiedUserId,
                  project.workflowState,
                  'approved',
                  `Project architecture plan "${project.name}" approved by user ${verifiedUserId}.`
                )

                // Collect all tools required across tasks
                const toolSet = new Set<string>()
                project.tasks.forEach((t: any) => (t.required_tools || []).forEach((tool: string) => toolSet.add(tool)))

                // Prepare execution bundle for Section 2 runtime
                const executionBundle: ExecutionBundle = {
                  preparedAt: now,
                  totalTasks: project.tasks.length,
                  stages: project.plan?.executionStages || [],
                  requiredTools: Array.from(toolSet),
                  boundaryNotice:
                    'Execution request bundle formulated. In accordance with Section 1 boundaries, code generation and terminal execution will be invoked by the Section 2 coding-agent runtime.',
                  readyForRuntime: true,
                }

                // State: ready_for_execution
                await orchestratorStorage.recordEvent(
                  projectId,
                  verifiedUserId,
                  'approved',
                  'ready_for_execution',
                  `Execution bundle prepared with ${project.tasks.length} tasks ready for coding-agent execution runtime.`
                )

                project.workflowState = 'ready_for_execution'
                project.approvedAt = now
                project.readyAt = now
                project.executionBundle = executionBundle
                project.events = await orchestratorStorage.getEvents(projectId, verifiedUserId)

                await orchestratorStorage.saveProject(project)

                return sendJson(200, {
                  success: true,
                  workflowState: 'ready_for_execution',
                  project,
                  executionBundle,
                  message: `Plan approved! ${project.tasks.length} tasks staged and ready for execution.`,
                })
              } catch (err: any) {
                if (err.message.includes('ACCESS_DENIED')) {
                  return sendJson(403, { error: 'Access denied: You do not own this project.', code: 'FORBIDDEN' })
                }
                throw err
              }
            }

            // ----------------------------------------------------------------
            // REJECT OR REQUEST PLAN MODIFICATION
            // POST /api/orchestrator/projects/:id/reject
            // Transitions: awaiting_approval → rejected (or re-planning)
            // ----------------------------------------------------------------
            if (subAction === '/reject' && req.method === 'POST') {
              try {
                const body = await readJsonBody()
                const { reason = 'User requested revisions', requestReplan = false, apiKey } = body

                const project = await orchestratorStorage.getProject(projectId, verifiedUserId)
                if (!project) {
                  return sendJson(404, { error: `Project ${projectId} not found.`, code: 'NOT_FOUND' })
                }

                if (requestReplan) {
                  // User requested modifications: transition to planning to re-architect
                  await orchestratorStorage.recordEvent(
                    projectId,
                    verifiedUserId,
                    project.workflowState,
                    'planning',
                    `User requested plan changes: "${reason}". Re-architecting project plan.`
                  )

                  const updatedPrompt = `${project.userPrompt}. Please adjust the plan with these user requirements: ${reason}`
                  const analysis = await analyzeUserRequirement(updatedPrompt, [], apiKey)
                  const plan = await generateDynamicPlan(updatedPrompt, analysis, 'Your Twin', projectId, apiKey)

                  await orchestratorStorage.recordEvent(
                    projectId,
                    verifiedUserId,
                    'planning',
                    'awaiting_approval',
                    `Revised architecture plan generated with ${plan.tasks.length} tasks. Awaiting user approval.`
                  )

                  project.userPrompt = updatedPrompt
                  project.workflowState = 'awaiting_approval'
                  project.analysis = analysis
                  project.plan = plan
                  project.tasks = plan.tasks
                  project.events = await orchestratorStorage.getEvents(projectId, verifiedUserId)

                  await orchestratorStorage.saveProject(project)

                  return sendJson(200, {
                    success: true,
                    workflowState: 'awaiting_approval',
                    project,
                    plan,
                    message: 'Plan revised based on your feedback.',
                  })
                }

                // Explicit rejection without immediate replan
                await orchestratorStorage.recordEvent(
                  projectId,
                  verifiedUserId,
                  project.workflowState,
                  'rejected',
                  `Plan rejected by user: "${reason}".`
                )

                project.workflowState = 'rejected'
                project.events = await orchestratorStorage.getEvents(projectId, verifiedUserId)
                await orchestratorStorage.saveProject(project)

                return sendJson(200, {
                  success: true,
                  workflowState: 'rejected',
                  project,
                  message: 'Plan rejected.',
                })
              } catch (err: any) {
                if (err.message.includes('ACCESS_DENIED')) {
                  return sendJson(403, { error: 'Access denied: You do not own this project.', code: 'FORBIDDEN' })
                }
                throw err
              }
            }
          }

          // Unhandled route under /api/orchestrator
          return sendJson(404, { error: `Orchestrator route ${pathname} not found.` })
        } catch (err: any) {
          console.error('[Orchestrator API Error]:', err)
          const statusCode = err.statusCode || (err.message?.includes('ACCESS_DENIED') ? 403 : 500)
          return sendJson(statusCode, {
            error: err.message || 'Internal Orchestrator Engine Error',
            code: err.code || 'INTERNAL_ERROR',
          })
        }
      })
    },
  }
}
