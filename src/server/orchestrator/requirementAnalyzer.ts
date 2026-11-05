// ====================================================================
// ANOTHER ME — SECTION 1: REQUIREMENT ANALYSIS ENGINE
// Classifies user intent across 9 development categories, extracts parameters,
// and determines if clarification questions are strictly required.
// ====================================================================

import { executeServerChatCompletion, type ChatMessage } from './providerAdapter'
import type { RequirementAnalysisResult, RequestClassificationType } from '../../types/orchestrator'

const VALID_CLASSIFICATIONS: RequestClassificationType[] = [
  'new_website',
  'modify_project',
  'frontend_feature',
  'backend_api',
  'database_connection',
  'install_dependencies',
  'debug_error',
  'run_tests',
  'deploy_app',
  'general_query',
]

/**
 * Analyzes and classifies a user requirement using the real server AI provider.
 */
export async function analyzeUserRequirement(
  userPrompt: string,
  conversationHistory: { role: string; content: string }[] = [],
  apiKeyOverride?: string
): Promise<RequirementAnalysisResult> {
  const cleanPrompt = (userPrompt || '').trim()
  if (!cleanPrompt) {
    return {
      classification: 'general_query',
      confidence: 1.0,
      summary: 'Empty user prompt provided.',
      extractedGoals: [],
      detectedTechStack: [],
      targetDomain: 'general',
      needsClarification: true,
      clarificationQuestion: 'What kind of website or application would you like me to build for you? Please specify the type, key features, and preferred theme.',
      requiresPlanning: false,
    }
  }

  // Fast-path enquiry for generic website build requests
  const normalized = cleanPrompt.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()
  const genericWebsiteTriggers = [
    'build a website',
    'build me a website',
    'create a website',
    'create a site',
    'make a website',
    'build a web app',
    'build an app',
    'code a website',
    'i want to build a website',
    'i want a website',
    'build website',
    'make website',
    'create an app',
    'build me an app',
    'develop a website',
    'website',
    'just build a website',
  ]
  const wordCount = cleanPrompt.split(/\s+/).length
  const mentionsFeatures =
    normalized.includes('hero') ||
    normalized.includes('feature') ||
    normalized.includes('modal') ||
    normalized.includes('pricing') ||
    normalized.includes('contact') ||
    normalized.includes('catalog') ||
    normalized.includes('database') ||
    normalized.includes('supabase') ||
    normalized.includes('dark') ||
    normalized.includes('light') ||
    normalized.includes('theme')
  const mentionsDomain =
    normalized.includes('portfolio') ||
    normalized.includes('ecommerce') ||
    normalized.includes('store') ||
    normalized.includes('restaurant') ||
    normalized.includes('agency') ||
    normalized.includes('dashboard') ||
    normalized.includes('blog') ||
    normalized.includes('saas')

  const isGeneric =
    genericWebsiteTriggers.includes(normalized) ||
    ((normalized.includes('build') || normalized.includes('create') || normalized.includes('make') || normalized.includes('code')) &&
      (normalized.includes('website') || normalized.includes('web app') || normalized.includes('app') || normalized.includes('site')) &&
      (!mentionsFeatures || !mentionsDomain || wordCount < 12))

  if (isGeneric) {
    return {
      classification: 'new_website',
      confidence: 0.98,
      summary: 'Build a custom web application across real code folders (.rules, .skills, docs, public, src, supabase, tasks).',
      extractedGoals: ['Enquire about domain/type', 'Enquire about key features', 'Enquire about theme/style'],
      detectedTechStack: ['HTML5', 'TailwindCSS', 'Modular JavaScript', 'Lucide Icons', 'Supabase'],
      targetDomain: 'web_application',
      needsClarification: true,
      clarificationQuestion:
        'I would love to build that for you! Before I generate the architecture and code folders, tell me: 1. What type of website is this? (e.g. portfolio, e-commerce, SaaS, agency, restaurant) 2. What key sections or features do you need? 3. Do you have a preferred style or color theme in mind?',
      requiresPlanning: true,
    }
  }

  const systemPrompt = `You are the Lead Software Architect & Requirements Engineering AI for Another Me.
Your mission is to perform rigorous technical requirement analysis on the user's prompt.

You must categorize the user's request into EXACTLY ONE of these standard classifications:
1. "new_website" - Build a new website or web application from scratch.
2. "modify_project" - Modify an existing project, restructure, or refactor existing code.
3. "frontend_feature" - Add a specific UI/frontend feature (e.g. mobile navigation, modal, filter tab, theme toggle).
4. "backend_api" - Create backend APIs, server routes, middleware, or webhooks.
5. "database_connection" - Connect a database, design tables, create schemas, or write migrations.
6. "install_dependencies" - Install or configure packages, libraries, or external dependencies.
7. "debug_error" - Investigate and debug an error, fix runtime crashes, or resolve syntax bugs.
8. "run_tests" - Run automated tests, linting, syntax validation, or smoke checks.
9. "deploy_app" - Deploy an application, build production assets, or configure hosting.
10. "general_query" - General conversational message or non-coding question.

CLARIFICATION & ENQUIRY POLICY:
- The user requires that before building any website, the AI must first enquire about the website requirements rather than using demo words, fake assumptions, or guessing.
- If the prompt is generic, open-ended, or lacks key details (e.g., "build a website", "create a website", "make an app", "code a site"), you MUST set "needsClarification": true.
- Formulate a clear, friendly, and structured clarificationQuestion enquiring about:
  1. Website Type & Purpose (e.g., portfolio, e-commerce, SaaS, agency, restaurant, blog)
  2. Key Sections & Features needed (e.g., hero banner, showcase grid, contact form, pricing, booking, auth)
  3. Design Style & Theme (e.g., dark obsidian, clean minimalist, warm terracotta)
- Only set "needsClarification": false if the prompt ALREADY specifies the website domain/type, key features, and scope (e.g., "Build a responsive personal photography portfolio with dark mode, photo gallery grid, and contact form modal").

OUTPUT FORMAT:
Return strictly a valid JSON object matching this schema:
{
  "classification": "new_website",
  "confidence": 0.95,
  "summary": "Build a responsive personal portfolio with hero section, projects gallery, and contact form.",
  "extractedGoals": ["Hero showcase with avatar", "Project card grid with filter tags", "Responsive mobile navigation", "Contact form modal"],
  "detectedTechStack": ["HTML5", "TailwindCSS", "Vanilla JavaScript", "Lucide Icons"],
  "targetDomain": "portfolio",
  "needsClarification": false,
  "clarificationQuestion": "",
  "requiresPlanning": true
}`

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.slice(-6).map((m) => ({
      role: (m.role === 'assistant' ? 'assistant' : 'user') as 'assistant' | 'user',
      content: m.content,
    })),
    { role: 'user', content: `Analyze this user development instruction: "${cleanPrompt}"` },
  ]

  const completion = await executeServerChatCompletion({
    messages,
    temperature: 0.1,
    responseFormat: 'json_object',
    apiKey: apiKeyOverride,
  })

  const json = completion.parsedJson || {}

  let classification: RequestClassificationType = 'new_website'
  if (VALID_CLASSIFICATIONS.includes(json.classification)) {
    classification = json.classification
  } else {
    // Heuristic fallback if LLM returned slight alias
    const lower = cleanPrompt.toLowerCase()
    if (lower.includes('deploy') || lower.includes('publish') || lower.includes('hosting')) classification = 'deploy_app'
    else if (lower.includes('test') || lower.includes('validate') || lower.includes('lint')) classification = 'run_tests'
    else if (lower.includes('error') || lower.includes('bug') || lower.includes('fix') || lower.includes('debug')) classification = 'debug_error'
    else if (lower.includes('database') || lower.includes('postgres') || lower.includes('table') || lower.includes('supabase')) classification = 'database_connection'
    else if (lower.includes('api') || lower.includes('route') || lower.includes('endpoint') || lower.includes('backend')) classification = 'backend_api'
    else if (lower.includes('install') || lower.includes('package') || lower.includes('dependency') || lower.includes('npm')) classification = 'install_dependencies'
    else if (lower.includes('modify') || lower.includes('change') || lower.includes('update') || lower.includes('edit')) classification = 'modify_project'
    else if (lower.includes('feature') || lower.includes('button') || lower.includes('modal') || lower.includes('navbar')) classification = 'frontend_feature'
  }

  const requiresPlanning = classification !== 'general_query'

  return {
    classification,
    confidence: typeof json.confidence === 'number' ? json.confidence : 0.9,
    summary: json.summary || cleanPrompt,
    extractedGoals: Array.isArray(json.extractedGoals) ? json.extractedGoals : [cleanPrompt],
    detectedTechStack: Array.isArray(json.detectedTechStack) ? json.detectedTechStack : ['HTML5', 'TailwindCSS', 'JavaScript'],
    targetDomain: json.targetDomain || 'web_application',
    needsClarification: Boolean(json.needsClarification),
    clarificationQuestion: json.clarificationQuestion ? String(json.clarificationQuestion) : undefined,
    requiresPlanning,
  }
}
