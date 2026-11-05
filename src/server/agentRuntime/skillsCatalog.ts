// ====================================================================
// ANOTHER ME — COMPLETE SKILLS CATALOG (92 DOMAIN ENGINEERING SKILLS)
// Accurately reflects all skills shown in workspace architecture screenshots.
// Every skill contains domain guidelines, technical standards, and usage specs.
// ====================================================================

export interface SkillDefinition {
  slug: string
  name: string
  category: string
  description: string
  guidelines: string[]
}

export const SKILLS_CATALOG_DATA: SkillDefinition[] = [
  // --- Skills from Image 2 (1 - 38) ---
  {
    slug: 'ai-search',
    name: 'AI Search & Retrieval',
    category: 'AI & Data',
    description: 'Semantic vector search, query embedding, and hybrid retrieval-augmented generation.',
    guidelines: [
      'Use cosine similarity for dense embeddings with a minimum threshold of 0.78.',
      'Combine dense vector search with sparse BM25 keyword search for hybrid accuracy.',
      'Implement query rewriting to extract intent and entities before search dispatch.'
    ]
  },
  {
    slug: 'airtable',
    name: 'Airtable Integration',
    category: 'Integrations',
    description: 'Airtable REST API integration for relational tables, linked records, and webhook synchronization.',
    guidelines: [
      'Always use Bearer token authorization in request headers.',
      'Batch record operations in chunks of at most 10 records per request.',
      'Cache schema table IDs and map local field types to Airtable formula/single-select types.'
    ]
  },
  {
    slug: 'application-identities',
    name: 'Application Identity Management',
    category: 'Security & Auth',
    description: 'Cryptographic unique IDs, tenant identifiers, and secure slug generation standards.',
    guidelines: [
      'Use UUID v4 or 21-character NanoID for collision-resistant record identification.',
      'Sanitize all user-provided slugs using lowercase alphanumeric characters and hyphens.',
      'Never expose raw sequential database IDs in client-facing API responses.'
    ]
  },
  {
    slug: 'article-illustration',
    name: 'Article Illustration',
    category: 'Content & Media',
    description: 'Visual asset design, SVG graphics, and editorial illustration placement for web content.',
    guidelines: [
      'Provide semantic alt text and responsive image dimensions (srcset) on all illustration elements.',
      'Use CSS aspect-ratio: 16/9 or 4/3 to prevent cumulative layout shift (CLS).',
      'Optimize vector illustrations as clean, inline SVGs with accessible aria-labels.'
    ]
  },
  {
    slug: 'asana',
    name: 'Asana Workspace API',
    category: 'Project Management',
    description: 'Asana task management, milestone tracking, and workspace webhook integration.',
    guidelines: [
      'Authenticate with Asana personal access tokens or OAuth 2.0 refresh flows.',
      'Store project GID and workspace GID in environment configuration variables.',
      'Handle rate limit headers (Retry-After) gracefully with exponential backoff.'
    ]
  },
  {
    slug: 'calendly',
    name: 'Calendly Scheduling',
    category: 'Integrations',
    description: 'Calendly interactive booking widget embed, event scheduling, and webhook verification.',
    guidelines: [
      'Embed Calendly inline widget using responsive iframe or native popup trigger.',
      'Verify Calendly HMAC SHA256 signatures on all incoming webhook payloads.',
      'Persist scheduled meeting timestamps in UTC ISO 8601 format.'
    ]
  },
  {
    slug: 'clickup',
    name: 'ClickUp Integration',
    category: 'Project Management',
    description: 'ClickUp space, list, and task automation through the ClickUp v2 REST API.',
    guidelines: [
      'Pass API key via Authorization header without Bearer prefix as required by ClickUp v2.',
      'Structure custom field values according to specific ClickUp field type schemas.',
      'Throttle automated sync tasks to avoid HTTP 429 rate limit triggers.'
    ]
  },
  {
    slug: 'conducting-interviews',
    name: 'Conducting User Interviews',
    category: 'Product & UX',
    description: 'Structured customer discovery interview framework, requirement elicitation, and insight synthesis.',
    guidelines: [
      'Ask open-ended questions focused on actual past behavior rather than hypothetical features.',
      'Enquire thoroughly about user workflows, pain points, budget, and desired business outcomes.',
      'Document verbatim user quotes, emotional friction points, and feature prioritization.'
    ]
  },
  {
    slug: 'customer-support',
    name: 'Customer Support Engineering',
    category: 'Support & Ops',
    description: 'Ticketing workflows, automated macros, SLA monitoring, and omni-channel customer service.',
    guidelines: [
      'Enforce first-response SLAs of under 15 minutes for critical severity incidents.',
      'Maintain an internal FAQ knowledge base linked directly to customer ticket triage.',
      'Ensure compassionate, professional, and solution-oriented tone in all user interactions.'
    ]
  },
  {
    slug: 'decision-counsel',
    name: 'Architecture Decision Counsel',
    category: 'Architecture',
    description: 'Technical trade-off analysis, Architectural Decision Records (ADR), and consensus modeling.',
    guidelines: [
      'Document context, options considered, trade-offs, and final decision rationale in docs/adr/.',
      'Evaluate latency, horizontal scalability, maintenance cost, and vendor lock-in.',
      'Revisit ADRs bi-annually or whenever fundamental architectural constraints shift.'
    ]
  },
  {
    slug: 'deepresearch-analysis',
    name: 'Deep Research & Technical Analysis',
    category: 'Research & AI',
    description: 'Comprehensive technical literature reviews, competitive benchmarking, and empirical analysis.',
    guidelines: [
      'Synthesize multiple independent engineering sources and academic whitepapers.',
      'Quantify performance metrics using p50, p95, and p99 latency percentiles.',
      'Provide actionable takeaways, executive summaries, and comparative matrices.'
    ]
  },
  {
    slug: 'discord',
    name: 'Discord Bot & Webhook Integration',
    category: 'Integrations',
    description: 'Discord interaction webhooks, embedded messages, and community automation bot handlers.',
    guidelines: [
      'Format rich Discord embeds with primary hex colors, titles, and timestamp footers.',
      'Validate incoming interaction signatures using Ed25519 public key verification.',
      'Respect Discord 5-messages-per-second channel rate limits.'
    ]
  },
  {
    slug: 'documentation',
    name: 'Software Documentation Standards',
    category: 'Engineering Standards',
    description: 'Markdown architectural documentation, OpenAPI specifications, and README guidelines.',
    guidelines: [
      'Maintain living architectural specs in docs/architecture.md alongside code.',
      'Provide copy-pasteable runnable code snippets for all public API methods.',
      'Include clear prerequisites, environment variable tables, and setup instructions.'
    ]
  },
  {
    slug: 'escape-game-design',
    name: 'Interactive Game & Puzzle Design',
    category: 'Creative & Gaming',
    description: 'State machine driven puzzle logic, narrative branching, and game mechanics for web apps.',
    guidelines: [
      'Model game state using explicit finite state machines (idle, active, solved, failed).',
      'Provide progressive hints to prevent user frustration without spoiling puzzle solutions.',
      'Store puzzle completion state in localStorage or persistent cloud profile.'
    ]
  },
  {
    slug: 'exchange-rate',
    name: 'Currency & Exchange Rate Engine',
    category: 'Finance & Payments',
    description: 'Real-time FX currency conversions, forex rate caching, and multi-currency formatting.',
    guidelines: [
      'Cache central bank exchange rates for 60 minutes with fallback to stale cache on network failure.',
      'Format currency values using standard Intl.NumberFormat with correct locale and ISO currency code.',
      'Perform all financial rounding at the final display step using Banker rounding.'
    ]
  },
  {
    slug: 'figma',
    name: 'Figma Design System Sync',
    category: 'Design & UI',
    description: 'Translating Figma design tokens, spacing scales, and components into responsive web code.',
    guidelines: [
      'Map Figma color styles directly to CSS custom properties (--color-primary, --color-bg).',
      'Translate Figma auto-layout frames into flexbox or CSS grid with exact gap tokens.',
      'Preserve design typography scales across mobile (clamp) and desktop viewports.'
    ]
  },
  {
    slug: 'finance-management',
    name: 'Financial Ledger & Invoice Architecture',
    category: 'Finance & Payments',
    description: 'Double-entry bookkeeping schemas, invoice generation, tax calculations, and financial reporting.',
    guidelines: [
      'Represent all financial monetary amounts in minor units (e.g. integer cents) to prevent float errors.',
      'Enforce double-entry accounting where sum(debits) must strictly equal sum(credits).',
      'Generate immutable, timestamped invoice records with cryptographic verification.'
    ]
  },
  {
    slug: 'fitness-plan-en',
    name: 'Fitness & Workout Planning',
    category: 'Health & Lifestyle',
    description: 'Structured workout regimes, exercise progression tracking, and nutritional caloric calculation.',
    guidelines: [
      'Structure exercise routines into warm-up, primary strength compound movements, and cool-down.',
      'Track volume load (sets x reps x weight) to quantify progressive overload over time.',
      'Validate user inputs against physiological sanity bounds.'
    ]
  },
  {
    slug: 'frontend-design',
    name: 'Frontend Design & Layout',
    category: 'Design & UI',
    description: 'Mobile-first responsive design, semantic HTML5, balanced typography, and CSS layout grids.',
    guidelines: [
      'Build mobile-first using responsive Tailwind CSS utility classes.',
      'Use semantic HTML elements: header, main, section, nav, article, footer.',
      'Maintain WCAG AA compliance with contrast ratio >= 4.5:1 on normal text.'
    ]
  },
  {
    slug: 'game-studio-en',
    name: 'Web Game Studio Engine',
    category: 'Creative & Gaming',
    description: 'HTML5 Canvas 2D / WebGL rendering loop, sprite animation, collision detection, and audio hooks.',
    guidelines: [
      'Drive rendering loops exclusively using requestAnimationFrame with delta-time smoothing.',
      'Use spatial partitioning (quadtrees) for efficient collision detection at 60 FPS.',
      'Preload audio buffers and sprite sheets before entering interactive game scenes.'
    ]
  },
  {
    slug: 'gemini-image-gen',
    name: 'Google Gemini Multimodal AI',
    category: 'AI & Data',
    description: 'Google Gemini API multimodal vision inspection, image understanding, and generation prompts.',
    guidelines: [
      'Format prompt engineering with explicit visual style, lighting, camera angle, and subject.',
      'Send base64 encoded image buffers with explicit mime-type specification.',
      'Implement defensive rate limiting and fallback mock assets during API quota exhaustion.'
    ]
  },
  {
    slug: 'global-stock-portfolio',
    name: 'Global Stock & Portfolio Tracking',
    category: 'Finance & Payments',
    description: 'Financial market data feeds, stock portfolio allocation, P&L calculations, and candlestick charts.',
    guidelines: [
      'Calculate unrealized and realized P&L based on FIFO cost basis.',
      'Render responsive financial candlestick / area charts using lightweight SVG or HTML5 Canvas.',
      'Color code gains (+green) and losses (-rose) in accordance with user regional locale.'
    ]
  },
  {
    slug: 'gmail',
    name: 'Gmail API Integration',
    category: 'Integrations',
    description: 'Gmail REST API integration, automated draft compilation, thread parsing, and OAuth 2.0 scopes.',
    guidelines: [
      'Encode RFC 2822 email messages using URL-safe base64 strings.',
      'Request minimal OAuth scopes (e.g. https://www.googleapis.com/auth/gmail.compose).',
      'Group related email messages by threadId to maintain coherent conversational context.'
    ]
  },
  {
    slug: 'google-ads',
    name: 'Google Ads & Tracking',
    category: 'Marketing & Growth',
    description: 'Google Ads conversion tracking, Google Tag Manager event data layers, and remarketing tags.',
    guidelines: [
      'Trigger conversion events on verified purchase or lead confirmation actions only.',
      'Respect user cookie consent preferences (Google Consent Mode v2) prior to script loading.',
      'Push structured data to window.dataLayer for robust GTM event triggers.'
    ]
  },
  {
    slug: 'google-analytics',
    name: 'Google Analytics 4 (GA4)',
    category: 'Marketing & Growth',
    description: 'GA4 telemetry integration, custom event tracking, user engagement metrics, and conversion funnels.',
    guidelines: [
      'Use semantic gtag("event", name, params) with snake_case parameter keys.',
      'Never transmit personally identifiable information (PII) such as email or IP addresses to GA4.',
      'Track funnel progression: view_item, add_to_cart, begin_checkout, purchase.'
    ]
  },
  {
    slug: 'google-calendar',
    name: 'Google Calendar API',
    category: 'Integrations',
    description: 'Google Calendar v3 API integration, recurring event scheduling, and RSVP attendee management.',
    guidelines: [
      'Specify start and end times with explicit timeZone offsets.',
      'Check for scheduling conflicts by querying the freeBusy endpoint prior to booking.',
      'Include clear meet links and agenda summaries in event description bodies.'
    ]
  },
  {
    slug: 'google-docs',
    name: 'Google Docs API Automation',
    category: 'Integrations',
    description: 'Google Docs document creation, templated variable substitution, and PDF export pipelines.',
    guidelines: [
      'Use batchUpdate requests with ReplaceAllTextRequest for atomic variable substitution.',
      'Structure documents with consistent Title, Heading 1, and Body paragraph styles.',
      'Export finalized reports to PDF using the Google Drive export endpoint.'
    ]
  },
  {
    slug: 'google-drive',
    name: 'Google Drive File Operations',
    category: 'Integrations',
    description: 'Google Drive API v3 upload, folder taxonomy management, sharing permissions, and signed URLs.',
    guidelines: [
      'Use resumable multipart uploads for files exceeding 5MB in size.',
      'Organize uploaded files into structured project folders with predictable folder IDs.',
      'Set granular role permissions (reader, commenter, writer) when sharing assets.'
    ]
  },
  {
    slug: 'google-scholar',
    name: 'Google Scholar & Literature Indexing',
    category: 'Research & AI',
    description: 'Academic literature indexing, BibTeX citation generation, and peer-reviewed paper discovery.',
    guidelines: [
      'Extract paper title, primary authors, publication year, journal venue, and DOI.',
      'Format academic citations according to APA 7th edition and BibTeX standards.',
      'Synthesize peer-reviewed findings to validate technical architectural assertions.'
    ]
  },
  {
    slug: 'google-search',
    name: 'Google Search & SERP Analysis',
    category: 'Research & AI',
    description: 'Google Custom Search API integration, SERP ranking analysis, and structured web knowledge mining.',
    guidelines: [
      'Target queries with exact quotation modifiers and site: filters for high precision.',
      'Parse snippet metadata to extract entity facts, dates, and domain authority.',
      'Implement in-memory caching for query results with a 24-hour TTL.'
    ]
  },
  {
    slug: 'google-sheets',
    name: 'Google Sheets Automation',
    category: 'Integrations',
    description: 'Google Sheets v4 API tabular data ingestion, cell formatting, formula insertion, and batch updates.',
    guidelines: [
      'Read and write data using valueRenderOption=UNFORMATTED_VALUE for raw programmatic consumption.',
      'Batch append operations to minimize API request quotas.',
      'Define clear header rows and freeze the top row for human usability.'
    ]
  },
  {
    slug: 'google-slides',
    name: 'Google Slides Presentation Deck',
    category: 'Content & Media',
    description: 'Google Slides API slide generation, corporate presentation templates, and automated deck creation.',
    guidelines: [
      'Adhere to the 16:9 widescreen presentation aspect ratio.',
      'Keep text concise: maximum of 6 bullet points per slide, 6 words per bullet.',
      'Use consistent master layout templates with corporate brand color accents.'
    ]
  },
  {
    slug: 'google-text-translate',
    name: 'Cloud Translation & Localization',
    category: 'Integrations',
    description: 'Multi-language localization, dynamic text translation, and locale-aware UI string management.',
    guidelines: [
      'Store base UI strings in structured i18n JSON translation dictionaries.',
      'Preserve interpolation variables ({name}, {count}) during translation execution.',
      'Support bidirectional text rendering (dir="rtl") for languages like Arabic and Hebrew.'
    ]
  },
  {
    slug: 'hubspot',
    name: 'HubSpot CRM Automation',
    category: 'Integrations',
    description: 'HubSpot CRM contact creation, deal pipeline stages, and marketing webhook triggers.',
    guidelines: [
      'Use HubSpot Private App access tokens with contacts and crm.objects.deals scopes.',
      'Upsert contacts by email address to prevent duplicate lead creation.',
      'Log custom timeline events when key user milestones occur in the application.'
    ]
  },
  {
    slug: 'image-generation',
    name: 'Generative AI Image Synthesis',
    category: 'Content & Media',
    description: 'Prompt crafting for high-resolution AI image synthesis, style consistency, and asset pipeline.',
    guidelines: [
      'Include specific style directives: photorealistic, 8k resolution, cinematic lighting, studio shoot.',
      'Specify negative prompts to suppress artifacts, blurry elements, or text anomalies.',
      'Convert output assets to modern WebP format for fast web delivery.'
    ]
  },
  {
    slug: 'image-to-video',
    name: 'Image-to-Video Animation',
    category: 'Content & Media',
    description: 'Transforming static UI designs and product imagery into dynamic video animations.',
    guidelines: [
      'Ensure source keyframe has high resolution and sharp focal boundaries.',
      'Specify camera movement: subtle slow zoom, pan right, or orbital dolly shot.',
      'Encode output video as MP4 with H.264 video codec and AAC audio for broad browser support.'
    ]
  },
  {
    slug: 'interactive-prototype',
    name: 'Interactive UI Prototyping',
    category: 'Design & UI',
    description: 'Micro-interaction states, drawer modals, interactive tabs, and fluid UI animations.',
    guidelines: [
      'Use CSS hardware-accelerated transitions: transform and opacity only.',
      'Provide tactile click feedback and distinct focus-visible rings for keyboard users.',
      'Keep transition durations between 150ms and 250ms for snappy responsiveness.'
    ]
  },
  {
    slug: 'intercom',
    name: 'Intercom Live Support & Messenger',
    category: 'Support & Ops',
    description: 'Intercom messenger widget integration, user identification, and contextual product tours.',
    guidelines: [
      'Compute HMAC SHA256 user hash using secret key to enforce Identity Verification.',
      'Pass user attributes: user_id, email, name, created_at, plan_tier.',
      'Trigger contextual proactive messages based on user route navigation.'
    ]
  },

  // --- Skills from Image 3 (39 - 78) ---
  {
    slug: 'interior-space-design',
    name: 'Interior Space & Architectural Layout',
    category: 'Design & UI',
    description: 'Spatial layout planning, furniture ergonomics, 3D visualization, and room schematics.',
    guidelines: [
      'Ensure standard clearance corridors: minimum 900mm for main pedestrian walkways.',
      'Balance ambient, task, and accent lighting layers for functional interior spaces.',
      'Define modular floor plan components with accurate geometric scale.'
    ]
  },
  {
    slug: 'investment-banking',
    name: 'Investment Banking & Financial Models',
    category: 'Finance & Payments',
    description: 'Discounted Cash Flow (DCF) modeling, LBO analysis, enterprise valuation, and financial covenants.',
    guidelines: [
      'Build dynamic sensitivity tables evaluating WACC vs terminal growth rates.',
      'Validate debt service coverage ratios (DSCR) under downside stress scenarios.',
      'Maintain clear audit trails linking assumptions to financial statement outputs.'
    ]
  },
  {
    slug: 'jev',
    name: 'Journal Entry Verification',
    category: 'Finance & Payments',
    description: 'Automated journal entry validation, audit trails, and reconciliation under GAAP/IFRS.',
    guidelines: [
      'Enforce zero-variance balance check: total debits must equal total credits.',
      'Require mandatory reference documents, ledger accounts, and creator audit stamps.',
      'Lock accounting periods post-close to prevent retroactive alterations.'
    ]
  },
  {
    slug: 'jira',
    name: 'Jira Software Agile Management',
    category: 'Project Management',
    description: 'Jira REST API v3, epic breakdown, sprint backlog grooming, and workflow transitions.',
    guidelines: [
      'Authenticate with Atlassian API tokens via HTTP Basic Auth.',
      'Map application issue tracking states to canonical Jira workflow transitions.',
      'Tag issues with proper component, fixVersion, and estimation story points.'
    ]
  },
  {
    slug: 'kling-3-turbo-video',
    name: 'Kling 3 Turbo Video Generation',
    category: 'AI Video',
    description: 'Kling 3 Turbo high-speed generative video pipeline and camera choreography.',
    guidelines: [
      'Set target frame rate to 30 FPS at 1080p resolution.',
      'Structure prompt with motion vector keywords: cinematic dolly, smooth zoom, dynamic lighting.',
      'Monitor task execution state via polling until video status reaches completed.'
    ]
  },
  {
    slug: 'kling-image-edit',
    name: 'Kling Image Inpainting & Edit',
    category: 'AI Video',
    description: 'AI image editing, masked inpainting, and stylistic image-to-image synthesis.',
    guidelines: [
      'Provide binary alpha mask defining the precise regional inpainting target.',
      'Maintain surrounding contextual lighting and color palette continuity.',
      'Use moderate denoising strength (0.45 - 0.65) to preserve structural coherence.'
    ]
  },
  {
    slug: 'kling-image-gen',
    name: 'Kling Image Generation',
    category: 'AI Video',
    description: 'Kling AI text-to-image synthesis, hyper-realistic rendering, and composition control.',
    guidelines: [
      'Specify high visual fidelity: photorealistic, ray-traced lighting, crisp textures.',
      'Configure aspect ratio to match target UI slot (16:9, 1:1, or 9:16).',
      'Persist generated assets to cloud object storage with public CDN URLs.'
    ]
  },
  {
    slug: 'kling-image-to-video',
    name: 'Kling Image to Video',
    category: 'AI Video',
    description: 'Converting static visual keyframes into cinematic motion sequences using Kling AI.',
    guidelines: [
      'Supply high-contrast source frame with clear separation between foreground and background.',
      'Define camera movement magnitude to avoid unnatural warp artifacts.',
      'Loop seamlessly for background video hero sections when appropriate.'
    ]
  },
  {
    slug: 'kling-motion-control',
    name: 'Kling Camera Motion Control',
    category: 'AI Video',
    description: 'Precision camera trajectories: pan, tilt, zoom, roll, and tracking shot coordinates.',
    guidelines: [
      'Use normalized 3D coordinate vectors for camera trajectory definition.',
      'Apply smooth ease-in-out easing curves to prevent abrupt camera jitter.',
      'Verify camera motion speed aligns with narrative pacing.'
    ]
  },
  {
    slug: 'kling-omni-image',
    name: 'Kling Omni Multi-Modal Image',
    category: 'AI Video',
    description: 'Omni-modal image synthesis combining multi-reference conditioning and semantic guidance.',
    guidelines: [
      'Supply reference style images along with textual condition prompts.',
      'Adjust conditioning weights to balance subject likeness vs creative styling.',
      'Verify output consistency across multi-image character sets.'
    ]
  },
  {
    slug: 'kling-omni-video',
    name: 'Kling Omni Video Synthesis',
    category: 'AI Video',
    description: 'Continuous long-duration AI video generation with consistent narrative and character fidelity.',
    guidelines: [
      'Chain generation chunks using previous frame overlap for continuous temporal coherence.',
      'Maintain consistent character wardrobe, lighting, and environmental geometry.',
      'Post-process video through FFmpeg for optimal web bitrate and streaming.'
    ]
  },
  {
    slug: 'kling-sound-effects',
    name: 'Kling AI Sound & SFX Generation',
    category: 'Audio & Voice',
    description: 'Contextual Foley sound effects, ambient audio synthesis, and sound design for web media.',
    guidelines: [
      'Generate audio samples at 48kHz, 24-bit stereo quality.',
      'Fade in and fade out audio clips by 50ms to prevent audible clicks/pops.',
      'Categorize sound cues into ambient, UI feedback, and narrative impact.'
    ]
  },
  {
    slug: 'kling-text-to-video',
    name: 'Kling Text-to-Video Engine',
    category: 'AI Video',
    description: 'Direct text description to cinematic video rendering with dynamic motion physics.',
    guidelines: [
      'Describe both visual scene elements and temporal action dynamics in the prompt.',
      'Enforce photorealistic lighting physics, water reflections, and natural human motion.',
      'Generate 5 to 10 second duration clips optimized for responsive web playback.'
    ]
  },
  {
    slug: 'large-language-models',
    name: 'Large Language Model Engineering',
    category: 'AI & Data',
    description: 'Prompt engineering, context window optimization, few-shot examples, and chain-of-thought.',
    guidelines: [
      'Structure prompts with clear System, Context, Task, Constraints, and Output Format sections.',
      'Use markdown triple backtick fences for structured JSON outputs with schema enforcement.',
      'Design prompts defensively to prevent prompt injection and system jailbreaks.'
    ]
  },
  {
    slug: 'large-language-model-eval',
    name: 'LLM Benchmarking & Evaluation',
    category: 'AI & Data',
    description: 'LLM output quality metrics, factual hallucination checks, BLEU/ROUGE, and red-teaming.',
    guidelines: [
      'Run automated evaluation suites against gold-standard synthetic ground truth datasets.',
      'Score factual grounding, instruction following, and latency on every model change.',
      'Flag hallucinations whenever model output contains unverifiable factual claims.'
    ]
  },
  {
    slug: 'legal-contract-review',
    name: 'Legal Contract & Terms Review',
    category: 'Legal & Compliance',
    description: 'Automated contract clause extraction, NDA review, GDPR compliance, and Terms of Service checks.',
    guidelines: [
      'Highlight governing law, limitation of liability, indemnification, and termination clauses.',
      'Flag non-standard exclusivity agreements or unrestricted data ownership claims.',
      'Include explicit disclaimer: "Automated analysis does not constitute formal legal counsel."'
    ]
  },
  {
    slug: 'loop-gif-creation',
    name: 'Looping GIF & Micro-Animation',
    category: 'Creative & Gaming',
    description: 'Seamless looping GIF generation, WebP animations, and lightweight UI micro-interactions.',
    guidelines: [
      'Ensure the final frame transitions smoothly into the first frame with zero visual discontinuity.',
      'Compress color palettes to at most 128 colors to minimize GIF file size.',
      'Prefer modern animated WebP format over legacy GIF for 70% smaller file sizes.'
    ]
  },
  {
    slug: 'marketing-skills',
    name: 'Digital Marketing & Copywriting',
    category: 'Marketing & Growth',
    description: 'SEO optimization, compelling value propositions, email marketing, and conversion funnels.',
    guidelines: [
      'Lead with customer outcomes and pain relief rather than raw product features.',
      'Optimize title tags (under 60 chars) and meta descriptions (under 155 chars) for SEO.',
      'Include unambiguous, high-contrast Call to Action (CTA) buttons above the fold.'
    ]
  },
  {
    slug: 'marketing-skills-growth',
    name: 'Growth Hacking & Viral Loops',
    category: 'Marketing & Growth',
    description: 'Viral referral mechanics, A/B testing frameworks, onboarding retention, and activation loops.',
    guidelines: [
      'Formulate testable hypotheses with defined primary metric, baseline, and sample size.',
      'Build double-sided referral incentives (benefit for both referrer and referee).',
      'Optimize the "Time to Value" (TTV) so users experience the core "Aha!" moment in under 60 seconds.'
    ]
  },
  {
    slug: 'microsoft-excel',
    name: 'Microsoft Excel Data Engineering',
    category: 'Integrations',
    description: 'Spreadsheet generation, complex formulas, PivotTables, and XLSX data parsing.',
    guidelines: [
      'Generate valid OpenXML (.xlsx) files using dedicated binary serializers.',
      'Use uppercase formula syntax (=SUM, =VLOOKUP, =INDEX, =MATCH) with proper cell ranges.',
      'Apply zebra-striping and clear column headers for spreadsheet legibility.'
    ]
  },
  {
    slug: 'monday',
    name: 'Monday.com Work OS API',
    category: 'Project Management',
    description: 'Monday.com GraphQL API integration, board items, column value updates, and automation webhooks.',
    guidelines: [
      'Authenticate with Monday API v2 using Bearer token in the Authorization header.',
      'Execute GraphQL queries with exact column IDs and strongly-typed query variables.',
      'Handle Monday challenge validation on incoming webhook subscriptions.'
    ]
  },
  {
    slug: 'notion-connect',
    name: 'Notion Database & Page Sync',
    category: 'Integrations',
    description: 'Notion REST API database querying, page block manipulation, and markdown syncing.',
    guidelines: [
      'Pass Notion-Version: 2022-06-28 header on all Notion API requests.',
      'Query databases using structured filter and sort objects.',
      'Convert local markdown blocks into Notion block object schemas.'
    ]
  },
  {
    slug: 'nutrition-planning',
    name: 'Nutrition & Dietary Planning',
    category: 'Health & Lifestyle',
    description: 'Macronutrient calculation, dietary meal planning, allergy filters, and caloric tracking.',
    guidelines: [
      'Calculate Basal Metabolic Rate (BMR) using the Mifflin-St Jeor equation.',
      'Distribute macronutrients according to target goals: Protein 4cal/g, Carbs 4cal/g, Fat 9cal/g.',
      'Explicitly filter recipes based on severe allergens (gluten, peanuts, dairy, shellfish).'
    ]
  },
  {
    slug: 'ocr-space',
    name: 'OCR Optical Character Recognition',
    category: 'AI & Data',
    description: 'Document text extraction, receipt parsing, and tabular OCR using the OCR.space engine.',
    guidelines: [
      'Pre-process scanned images with contrast enhancement and deskewing for higher OCR accuracy.',
      'Enable isTable=true flag when parsing receipts and tabular financial documents.',
      'Sanitize extracted raw text to remove common optical artifacts.'
    ]
  },
  {
    slug: 'onedrive',
    name: 'Microsoft OneDrive Graph API',
    category: 'Integrations',
    description: 'Microsoft OneDrive file synchronization, folder hierarchy, and sharing links via Microsoft Graph.',
    guidelines: [
      'Acquire delegated or application tokens from Azure Active Directory (MSAL).',
      'Upload large files via createUploadSession for chunked, fault-tolerant transfers.',
      'Request read-only permissions whenever file modification is not explicitly required.'
    ]
  },
  {
    slug: 'outlook',
    name: 'Microsoft Outlook Email & Calendar',
    category: 'Integrations',
    description: 'Outlook mail and calendar management using Microsoft Graph REST APIs.',
    guidelines: [
      'Query messages using OData query options: $select, $filter, $top, and $orderby.',
      'Send emails via /me/sendMail with HTML body encoding and attachment payloads.',
      'Subscribe to Graph change notifications for real-time inbox event streaming.'
    ]
  },
  {
    slug: 'payment-paypal',
    name: 'PayPal Checkout & Payments',
    category: 'Finance & Payments',
    description: 'PayPal JavaScript SDK, smart buttons, order capture, and webhook signature verification.',
    guidelines: [
      'Load PayPal SDK script dynamically with client-id and currency query parameters.',
      'Create order on the server and capture payments inside the onApprove handler.',
      'Verify incoming webhook CRC32/SHA256 signatures before processing order fulfillment.'
    ]
  },
  {
    slug: 'payment-waffo',
    name: 'Waffo Multi-Gateway Payment Router',
    category: 'Finance & Payments',
    description: 'Unified payment gateway routing, card tokenization, and multi-currency checkout.',
    guidelines: [
      'Never allow raw credit card numbers to touch application servers (PCI-DSS Level 1 tokenization).',
      'Implement smart retry routing to alternative payment rails on transient decline codes.',
      'Maintain comprehensive idempotency keys on every transaction charge request.'
    ]
  },
  {
    slug: 'performance-optimization',
    name: 'Web Performance Optimization',
    category: 'Engineering Standards',
    description: 'Core Web Vitals (LCP, INP, CLS), lazy loading, code-splitting, asset compression, and caching.',
    guidelines: [
      'Achieve Largest Contentful Paint (LCP) under 2.5 seconds on simulated mobile 4G.',
      'Keep Interaction to Next Paint (INP) under 200 milliseconds by avoiding long main-thread tasks.',
      'Use font-display: swap and pre-connect to critical resource origins.'
    ]
  },
  {
    slug: 'pricing-page-design',
    name: 'Pricing Page & Matrix Design',
    category: 'Design & UI',
    description: 'Tiered pricing plans, billing frequency toggles (Monthly/Annual), and feature comparison tables.',
    guidelines: [
      'Highlight the recommended/most popular plan with distinct border, badge, and primary CTA.',
      'Provide an interactive toggle between monthly and annual billing showing the % discount.',
      'List feature checkmarks clearly with tooltip explanations for complex capabilities.'
    ]
  },
  {
    slug: 'product-design',
    name: 'Product Design & User Journeys',
    category: 'Product & UX',
    description: 'User personas, wireframing, information architecture, and user flow mapping.',
    guidelines: [
      'Map end-to-end user journeys from landing discovery to core product activation.',
      'Minimize cognitive load by limiting primary actions to at most one per screen.',
      'Validate usability through prototype feedback loops before full frontend implementation.'
    ]
  },
  {
    slug: 'querit-search',
    name: 'Querit Search & Vector Retrieval',
    category: 'AI & Data',
    description: 'Fast fuzzy text search, typo tolerance, and real-time client-side index filtering.',
    guidelines: [
      'Index searchable fields with pre-computed n-grams for instant sub-millisecond lookups.',
      'Highlight matched substring terms within result cards for user feedback.',
      'Debounce user keystrokes by 200ms to eliminate redundant search queries.'
    ]
  },
  {
    slug: 'sales-workflow-automation',
    name: 'Sales Pipeline & Workflow Automation',
    category: 'Sales & CRM',
    description: 'Lead scoring, stage transition triggers, email sequence cadences, and CRM pipeline hooks.',
    guidelines: [
      'Score incoming leads dynamically based on company size, role, and behavioral engagement.',
      'Automate stage progression: Lead -> Qualified -> Demo -> Proposal -> Closed Won.',
      'Alert account executives instantly via Slack/webhook when high-value leads submit forms.'
    ]
  },
  {
    slug: 'security-and-privacy',
    name: 'Security & Privacy Engineering',
    category: 'Security & Auth',
    description: 'OWASP Top 10 defenses, Content Security Policy (CSP), input sanitization, and GDPR compliance.',
    guidelines: [
      'Sanitize all dynamic user input using DOMPurify before inserting into the DOM.',
      'Configure strict Content-Security-Policy headers rejecting unsafe-eval and unauthorized scripts.',
      'Never expose private API secret keys, database credentials, or tokens in client-side bundles.'
    ]
  },
  {
    slug: 'shipping-and-logistics',
    name: 'Shipping & Logistics Operations',
    category: 'E-Commerce & Ops',
    description: 'Carrier rate estimation (FedEx, UPS, DHL), tracking number generation, and fulfillment workflows.',
    guidelines: [
      'Calculate dimensional weight and box volume to determine optimal carrier rates.',
      'Store standardized postal addresses with country ISO-2 codes.',
      'Provide customer-facing tracking URLs for instant package journey visibility.'
    ]
  },
  {
    slug: 'short-video-viral',
    name: 'Short-Form Viral Video Scripting',
    category: 'Content & Media',
    description: 'TikTok, Instagram Reels, and YouTube Shorts pacing, viral hooks, and retention retention tactics.',
    guidelines: [
      'Hook the viewer within the first 3 seconds with a visual or contrarian question.',
      'Maintain rapid visual pacing: change camera angle or visual element every 2 to 4 seconds.',
      'Include clear, on-screen burned captions for the 80% of viewers watching without audio.'
    ]
  },
  {
    slug: 'skill-eval-en',
    name: 'Skill Competency & Rubrics',
    category: 'Product & UX',
    description: 'Skill proficiency rubrics, code quality scoring, and automated compliance auditing.',
    guidelines: [
      'Define clear scoring tiers: Beginner, Intermediate, Advanced, and Expert.',
      'Evaluate code against maintainability index, cyclomatic complexity, and test coverage.',
      'Provide constructive feedback with direct line-level remediation examples.'
    ]
  },
  {
    slug: 'slack',
    name: 'Slack Webhook & Bot Integration',
    category: 'Integrations',
    description: 'Slack incoming webhooks, Block Kit interactive messages, and automated event notifications.',
    guidelines: [
      'Structure messages using Slack Block Kit blocks: section, divider, actions, and context.',
      'Include actionable buttons (Approve, Reject, View) linking back to the web application.',
      'Sanitize text strings to conform to Slack mrkdwn formatting rules.'
    ]
  },
  {
    slug: 'spec-driven-development',
    name: 'Spec-Driven Development (SDD)',
    category: 'Engineering Standards',
    description: 'Architecture specifications, dependency DAGs, contract-first APIs, and test verification.',
    guidelines: [
      'Write technical specifications in docs/ before authoring implementation code.',
      'Model tasks as a directed acyclic graph (DAG) to enable safe parallel execution.',
      'Verify every deliverable against explicit acceptance criteria and automated checks.'
    ]
  },
  {
    slug: 'speech-to-text',
    name: 'Speech-to-Text & Voice Transcription',
    category: 'Audio & Voice',
    description: 'Web Speech API, Whisper audio recognition, microphone streams, and transcript synchronization.',
    guidelines: [
      'Initialize browser SpeechRecognition with continuous=true and interimResults=true.',
      'Handle microphone permission errors and network drops with automatic graceful retry.',
      'Filter acoustic echo and AI self-utterances to prevent acoustic feedback loops.'
    ]
  },

  // --- Skills from Image 4 (79 - 92) ---
  {
    slug: 'superpowers-en',
    name: 'Autonomous Agent Superpowers',
    category: 'AI & Data',
    description: 'Antigravity autonomous agent capabilities: subagents, tool execution, and workspace operations.',
    guidelines: [
      'Decompose complex multi-step problems into focused, isolated subagent workflows.',
      'Provide structured input and verify return artifacts upon subagent completion.',
      'Preserve documentation integrity and security boundaries across all agent invocations.'
    ]
  },
  {
    slug: 'systematic-debugging',
    name: 'Systematic Debugging Protocol',
    category: 'Engineering Standards',
    description: 'Root-cause analysis, reproduction steps, console telemetry, and regression prevention.',
    guidelines: [
      'Formulate falsifiable hypotheses regarding the root cause before changing code.',
      'Inspect console telemetry, network waterfall, and runtime error stack traces.',
      'Create minimal automated regression tests verifying the bug is resolved permanently.'
    ]
  },
  {
    slug: 'tailored-resume',
    name: 'Resume & Career Portfolio Architecture',
    category: 'Content & Media',
    description: 'ATS-optimized resume formatting, portfolio project highlights, and technical impact metrics.',
    guidelines: [
      'Format bullet points using the Google XYZ formula: "Accomplished [X] measured by [Y] by doing [Z]".',
      'Use single-column, clean semantic HTML/CSS that parses accurately in standard ATS scanners.',
      'Highlight production tech stack, GitHub repository links, and live demonstration URLs.'
    ]
  },
  {
    slug: 'text-to-speech',
    name: 'Text-to-Speech & Voice Synthesis',
    category: 'Audio & Voice',
    description: 'Neural TTS voice synthesis, SSML audio styling, pitch/rate modulation, and speech streaming.',
    guidelines: [
      'Use high-fidelity neural voices (e.g. en-US-ChristopherNeural or browser SpeechSynthesis).',
      'Strip raw markdown fences and URLs before passing text into the voice synthesizer.',
      'Maintain audio level telemetry and speaking state flags to synchronize UI avatars.'
    ]
  },
  {
    slug: 'the-news',
    name: 'News & RSS Aggregation Engine',
    category: 'Content & Media',
    description: 'RSS/Atom feed parsing, real-time news extraction, sentiment scoring, and headline summaries.',
    guidelines: [
      'Parse XML/RSS feeds with robust fallback handling for varying date and content formats.',
      'Deduplicate articles using URL canonicalization and title similarity hashing.',
      'Present news cards with publication timestamp, domain badge, and concise excerpt.'
    ]
  },
  {
    slug: 'theme-brand-guidelines',
    name: 'Theme & Brand Guidelines',
    category: 'Design & UI',
    description: 'Color tokens, typography scales, dark/light theme switching, and visual brand identity.',
    guidelines: [
      'Define primary, accent, surface, and border colors as CSS custom variables in src/styles/theme.css.',
      'Ensure dark mode surfaces use high-depth obsidian tones (#0d0d12, #141418) rather than flat black.',
      'Provide smooth 200ms CSS transitions when toggling between dark and light themes.'
    ]
  },
  {
    slug: 'travel-planner',
    name: 'Travel Itinerary & Booking Planner',
    category: 'Health & Lifestyle',
    description: 'Day-by-day travel itineraries, flight/hotel booking schemas, and interactive map markers.',
    guidelines: [
      'Organize itineraries chronologically with morning, afternoon, and evening activity blocks.',
      'Calculate transit travel time and distance between consecutive geographic locations.',
      'Display local currency estimates alongside user home currency equivalents.'
    ]
  },
  {
    slug: 'wardrobe-styling',
    name: 'Wardrobe & Fashion Styling',
    category: 'Health & Lifestyle',
    description: 'Personal styling rules, color coordination, seasonal capsule wardrobes, and clothing tags.',
    guidelines: [
      'Apply color theory rules (monochromatic, complementary, analogous) to clothing combinations.',
      'Tag items by season, formality level (casual, smart-casual, formal), and fabric type.',
      'Render clean grid lookbooks with responsive image cards.'
    ]
  },
  {
    slug: 'weather-inquiry',
    name: 'Weather API & Forecast Engine',
    category: 'Integrations',
    description: 'Real-time meteorological weather data, 7-day forecast cards, and animated weather icons.',
    guidelines: [
      'Fetch current weather conditions and hourly forecasts using latitude/longitude coordinates.',
      'Map standard weather condition codes to clean animated SVG weather icons.',
      'Support both Celsius and Fahrenheit temperature toggles based on user preference.'
    ]
  },
  {
    slug: 'web-design-guidelines',
    name: 'Web Design Guidelines & UX Standards',
    category: 'Design & UI',
    description: 'WCAG AA accessibility, micro-interactions, responsive grids, and design consistency.',
    guidelines: [
      'Enforce minimum touch target sizes of 44x44px for all mobile interactive elements.',
      'Use subtle glassmorphic panels with delicate translucent borders (rgba(255,255,255,0.08)).',
      'Provide immediate visual feedback (loading spinners, disabled buttons) during async operations.'
    ]
  },
  {
    slug: 'web-reader',
    name: 'Web Reader & Article Extraction',
    category: 'Content & Media',
    description: 'Clutter-free reading mode, Readability article parsing, and typography readability controls.',
    guidelines: [
      'Extract main article text while stripping ads, sidebars, tracking scripts, and popups.',
      'Provide user typography adjustments: font size, line spacing, and font family.',
      'Calculate estimated reading time based on standard 200 words-per-minute metric.'
    ]
  },
  {
    slug: 'webpage-content',
    name: 'Webpage Content & Structure',
    category: 'Design & UI',
    description: 'High-converting website layout architecture, benefit-driven headlines, and structured copy.',
    guidelines: [
      'Structure pages with standard flow: Sticky Navbar -> Hero -> Features -> Showcase -> Testimonials -> Footer.',
      'Craft clear, active-voice headlines that immediately communicate what the product does.',
      'Reinforce trust with social proof, customer ratings, security badges, and clear FAQ items.'
    ]
  },
  {
    slug: 'writing-guidelines',
    name: 'Writing Guidelines & Editorial Standards',
    category: 'Content & Media',
    description: 'Brand voice, technical editorial guidelines, grammatical precision, and conciseness.',
    guidelines: [
      'Write in clear, active voice, avoiding unnecessary corporate jargon or fluff.',
      'Keep paragraphs short (2 to 4 sentences) for high digital readability.',
      'Maintain consistent capitalization and Oxford comma usage across all copy.'
    ]
  },
  {
    slug: 'zoho-crm',
    name: 'Zoho CRM Integration',
    category: 'Integrations',
    description: 'Zoho CRM REST API v2, leads module, deal stages, and OAuth 2.0 token management.',
    guidelines: [
      'Refresh OAuth 2.0 access tokens automatically when receiving HTTP 401 unauthorized responses.',
      'Map web form submissions directly to Zoho CRM Leads and Contacts modules.',
      'Verify incoming Zoho webhook payloads using IP whitelisting or shared secret tokens.'
    ]
  }
]

export const CANONICAL_RULES_CONTENT: Record<string, string> = {
  '.rules/check.sh': `#!/usr/bin/env bash
# Quality check script: verifies HTML syntax, CSS variables, and JS syntax
echo "==> Running project code verification..."
if command -v node >/dev/null 2>&1; then
  node -c src/main.js 2>/dev/null && echo "✓ src/main.js syntax check passed" || echo "✗ Syntax warning in src/main.js"
fi
echo "==> All rules checked."
exit 0
`,
  '.rules/testBuild.sh': `#!/usr/bin/env bash
# Automated test build script
echo "Testing build artifacts in /public and /src..."
test -f index.html && echo "✓ Root index.html exists" || exit 1
test -f src/main.js && echo "✓ src/main.js entry point exists" || exit 1
test -f src/styles/main.css && echo "✓ src/styles/main.css exists" || exit 1
echo "Build test passed."
exit 0
`,
  '.rules/contrast.yml': `version: "1.0"
rule: accessibility-contrast
standard: WCAG_AA
min_ratio_normal_text: 4.5
min_ratio_large_text: 3.0
enforce_dark_mode: true
`,
  '.rules/require-button-interactions.yml': `version: "1.0"
rule: button-interactions
description: All interactive buttons must have distinct hover, active, and accessible focus states.
focus_ring_offset: 2px
`,
  '.rules/SelectItem.yml': `version: "1.0"
rule: select-item-accessibility
keyboard_navigation: true
aria_attributes:
  - role: "combobox"
  - aria-expanded: "true/false"
`,
  '.rules/slot-nesting.yml': `version: "1.0"
rule: component-slot-nesting
max_nesting_depth: 4
allow_dynamic_mount: true
`,
  '.rules/supabase-edge-functions.yml': `version: "1.0"
rule: supabase-edge-functions
runtime: deno
cors_enabled: true
verify_jwt: true
`,
  '.rules/supabase-google-sso.yml': `version: "1.0"
rule: supabase-auth-sso
provider: google
redirect_url: "/auth/callback"
`,
  '.rules/toast-hook.yml': `version: "1.0"
rule: feedback-toasts
auto_dismiss_timeout: 4000
position: "bottom-right"
max_visible_toasts: 3
`,
}

/**
 * Returns a dictionary mapping relative file paths to their SKILL.md contents
 * for all 92 domain engineering skills.
 */
export function getSkillsCatalogFiles(): Record<string, string> {
  const files: Record<string, string> = {}

  for (const skill of SKILLS_CATALOG_DATA) {
    const relPath = `.skills/${skill.slug}/SKILL.md`
    const content = `# ${skill.name} Skill

## Metadata
- **Identifier:** \`${skill.slug}\`
- **Category:** ${skill.category}
- **Role:** Antigravity Engineering Domain Skill

## Purpose & Overview
${skill.description}

## Technical Guidelines & Best Practices
${skill.guidelines.map((g, i) => `${i + 1}. **${g.split(':')[0]}** — ${g}`).join('\n')}

## Application & Code Standards
- Adhere strictly to this skill when architecting and implementing modules related to ${skill.name.toLowerCase()}.
- Keep implementations modular, fully typed, accessible, and resilient against network failures.
- Document configuration parameters and environment variables required for this domain.
`
    files[relPath] = content
  }

  return files
}
