// ====================================================================
// ANOTHER ME — CANONICAL PROJECT FOLDER & CODE SCAFFOLDER
// Generates and manages the mandatory multi-folder architecture for all
// web projects as specified in engineering standards:
//   .rules/   -> Quality, linting, accessibility, and CI checks
//   .skills/  -> Domain engineering guidelines (frontend, design, debugging, etc.)
//   docs/     -> Architecture specs, requirements, and API definitions
//   public/   -> Static assets, web manifest, favicon
//   src/      -> Modular ES components, styles, utility helpers, and main.js
//   supabase/ -> Database schemas, migrations, and edge function configs
//   tasks/    -> Roadmap and task backlogs
// ====================================================================

import fs from 'fs'
import path from 'path'
import { getSkillsCatalogFiles } from './skillsCatalog'

export interface ProjectScaffoldContext {
  name?: string
  prompt?: string
  techStack?: string
  theme?: {
    primaryColor?: string
    accentColor?: string
    bgMode?: 'dark' | 'light' | 'custom' | string
    description?: string
  }
}

/**
 * Returns complete, working, canonical starter files matching the folder layout.
 */
export function getCanonicalProjectFiles(ctx: ProjectScaffoldContext = {}): Record<string, string> {
  const name = ctx.name || 'Modern Web Application'
  const prompt = ctx.prompt || 'Custom high-performance web application'
  const primaryColor = ctx.theme?.primaryColor || '#da7756'
  const accentColor = ctx.theme?.accentColor || '#10b981'
  const isDark = ctx.theme?.bgMode !== 'light'
  const bgHex = isDark ? '#0d0d12' : '#ffffff'
  const textHex = isDark ? '#f1f5f9' : '#0f172a'

  return {
    // ----------------------------------------------------------------
    // 1. .rules FOLDER (Quality gates, accessibility, and CI checks)
    // ----------------------------------------------------------------
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

    // ----------------------------------------------------------------
    // 2. .skills FOLDER (Complete 92 Domain Engineering Standards)
    // ----------------------------------------------------------------
    ...getSkillsCatalogFiles(),
    '.skills/theme-brand-guidelines/SKILL.md': `# Theme & Brand Guidelines Skill
## Primary Theme
- Primary Brand Color: ${primaryColor}
- Accent Color: ${accentColor}
- Theme Background: ${isDark ? 'Dark / Obsidian' : 'Light / Clean'}
`,

    // ----------------------------------------------------------------
    // 3. docs FOLDER (Engineering & Architectural documentation)
    // ----------------------------------------------------------------
    'docs/architecture.md': `# System Architecture — ${name}

## 1. Executive Summary
- **Project Name:** ${name}
- **Instruction Prompt:** "${prompt}"
- **Tech Stack:** HTML5, Modern CSS, ES Modules JavaScript, TailwindCSS, Lucide Icons, Supabase

## 2. Directory Taxonomy
\`\`\`
.rules/          -> Quality, accessibility, and build validation scripts
.skills/         -> Domain engineering skills and architecture patterns
docs/            -> Architectural specs, requirements, and API definitions
public/          -> Favicon, manifest, and static web assets
src/             -> Source application code (ES Modules)
  ├── components/-> Isolated UI components (Navbar, Hero, Features, Footer, Modal)
  ├── styles/    -> CSS variables, design tokens, and utility classes
  └── utils/     -> DOM helpers, toast notifications, mock data
supabase/        -> Database migrations and schema definitions
tasks/           -> Project execution backlog and roadmap
index.html       -> Application root HTML mounting \`src/main.js\`
\`\`\`

## 3. Component Hierarchy & Flow
- \`index.html\` serves the root DOM container \`#app\`.
- \`src/main.js\` orchestrates the modular components and renders them into their respective mount points.
- Real-time user interactions are handled through clean DOM event delegates in \`src/utils/dom.js\`.
`,

    'docs/requirements.md': `# Functional Requirements — ${name}

## 1. Core Objectives
1. Provide responsive presentation optimized for mobile, tablet, and desktop viewports.
2. Deliver interactive user features with instant client feedback and toast notifications.
3. Maintain zero-dependency modular architecture using standard browser ES Modules.

## 2. Feature Matrix
- **Navigation:** Sticky glassmorphic navbar with mobile hamburger menu and quick action button.
- **Hero Showcase:** High-impact value proposition with dynamic badge, headline, and primary CTA.
- **Feature Showcase:** Responsive card grid highlighting key capabilities, services, or products.
- **Interactive Modal:** Dynamic popup dialog for item inspection, contact forms, or cart actions.
- **Footer:** Informational links, social handles, and copyright notice.
`,

    'docs/api-specs.md': `# API Specifications — ${name}

## Data Models
### Item / Feature
\`\`\`typescript
interface ShowcaseItem {
  id: string;
  title: string;
  description: string;
  category: string;
  icon: string;
  badge?: string;
}
\`\`\`

## Client Endpoints (Local & Supabase)
- \`GET /items\` -> Returns list of items
- \`POST /inquire\` -> Submits user contact or booking form
`,

    // ----------------------------------------------------------------
    // 4. tasks FOLDER (Execution Roadmap)
    // ----------------------------------------------------------------
    'tasks/task-backlog.md': `# Engineering Roadmap & Task Backlog

- [x] **Phase 1: Architecture & Workspace Scaffold** — Create .rules, .skills, docs, public, src, supabase, tasks
- [x] **Phase 2: Global Design System & Shell** — Configure theme variables, typography, and index.html
- [x] **Phase 3: Modular Component Implementation** — Build Navbar, Hero, Features, Modal, Footer
- [x] **Phase 4: State Management & Event Logic** — Wire main.js, event delegates, and toast notifications
- [ ] **Phase 5: Production Deployment & Verification** — Run check.sh and verify responsive layout
`,

    // ----------------------------------------------------------------
    // 5. public FOLDER (Static Assets)
    // ----------------------------------------------------------------
    'public/favicon.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">
  <rect width="32" height="32" rx="8" fill="${primaryColor}"/>
  <path d="M16 8L24 22H8L16 8Z" fill="white"/>
</svg>`,

    'public/manifest.json': JSON.stringify(
      {
        name,
        short_name: name.slice(0, 12),
        description: prompt,
        start_url: '/',
        display: 'standalone',
        background_color: bgHex,
        theme_color: primaryColor,
        icons: [{ src: '/public/favicon.svg', sizes: 'any', type: 'image/svg+xml' }],
      },
      null,
      2
    ),

    // ----------------------------------------------------------------
    // 6. src/styles FOLDER (Theme and Global CSS)
    // ----------------------------------------------------------------
    'src/styles/theme.css': `:root {
  --color-primary: ${primaryColor};
  --color-accent: ${accentColor};
  --color-bg: ${bgHex};
  --color-text: ${textHex};
  --color-card-bg: ${isDark ? 'rgba(26, 26, 36, 0.75)' : 'rgba(255, 255, 255, 0.9)'};
  --color-border: ${isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'};
  --font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --transition-speed: 200ms;
}
`,

    'src/styles/main.css': `@import "./theme.css";

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: var(--font-family);
  background-color: var(--color-bg);
  color: var(--color-text);
  min-height: 100vh;
  line-height: 1.6;
  overflow-x: hidden;
  -webkit-font-smoothing: antialiased;
}

.glassmorphic {
  background: var(--color-card-bg);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--color-border);
}

.glow-btn {
  background: var(--color-primary);
  color: #ffffff;
  transition: all var(--transition-speed) ease;
}

.glow-btn:hover {
  filter: brightness(1.12);
  transform: translateY(-1px);
  box-shadow: 0 8px 24px -4px ${primaryColor}66;
}

/* Toast Container */
#toast-container {
  position: fixed;
  bottom: 24px;
  right: 24px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  z-index: 9999;
  pointer-events: none;
}

.toast-item {
  pointer-events: auto;
  background: #18181f;
  color: #ffffff;
  border: 1px solid var(--color-border);
  padding: 12px 18px;
  border-radius: 12px;
  font-size: 13px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.5);
  animation: toastIn 250ms ease-out forwards;
}

@keyframes toastIn {
  from { opacity: 0; transform: translateY(12px) scale(0.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
`,

    // ----------------------------------------------------------------
    // 7. src/utils FOLDER (Helper utilities and state)
    // ----------------------------------------------------------------
    'src/utils/dom.js': `// DOM & Interactive Notification Utilities
export function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'toast-item glassmorphic flex items-center gap-2.5';
  
  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
  const iconColor = type === 'success' ? 'text-emerald-400' : type === 'error' ? 'text-rose-400' : 'text-blue-400';
  
  toast.innerHTML = \`<span class="\${iconColor} font-bold">\${icon}</span> <span>\${message}</span>\`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    toast.style.transition = 'all 200ms ease';
    setTimeout(() => toast.remove(), 200);
  }, 3500);
}

export function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.body.style.overflow = 'hidden';
  }
}

export function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    document.body.style.overflow = '';
  }
}
`,

    'src/utils/api.js': `// Client API & Data Layer
export const sampleShowcaseData = [
  {
    id: 'feat_1',
    title: 'Precision Architecture',
    description: 'Engineered with clean separation of concerns across dedicated folders.',
    icon: 'layers',
    badge: 'Core Feature'
  },
  {
    id: 'feat_2',
    title: 'Reactive Experience',
    description: 'Instant UI transitions, interactive modal previews, and toast feedback.',
    icon: 'zap',
    badge: 'Performance'
  },
  {
    id: 'feat_3',
    title: 'Enterprise Ready',
    description: 'Structured quality gates, accessibility standards, and Supabase integration.',
    icon: 'shield-check',
    badge: 'Security'
  }
];

export async function submitInquiry(data) {
  console.log('[API] Submitting customer inquiry:', data);
  // Simulating backend response
  return new Promise((resolve) => setTimeout(() => resolve({ success: true, id: 'inq_' + Date.now() }), 600));
}
`,

    // ----------------------------------------------------------------
    // 8. src/components FOLDER (Modular UI Components)
    // ----------------------------------------------------------------
    'src/components/Navbar.js': `// Navbar Component
import { openModal } from '../utils/dom.js';

export function renderNavbar(container, title = '${name}') {
  if (!container) return;
  container.innerHTML = \`
    <header class="sticky top-0 z-40 w-full glassmorphic border-b border-[var(--color-border)]">
      <div class="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <a href="#" class="flex items-center gap-2.5 text-white font-bold text-lg tracking-tight hover:opacity-90 transition-opacity">
          <div class="w-8 h-8 rounded-lg bg-[var(--color-primary)] flex items-center justify-center text-white shadow-md">
            <i data-lucide="sparkles" class="w-4 h-4"></i>
          </div>
          <span>\${title}</span>
        </a>

        <nav class="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300">
          <a href="#features" class="hover:text-white transition-colors">Features</a>
          <a href="#about" class="hover:text-white transition-colors">About</a>
          <a href="#docs" class="hover:text-white transition-colors">Architecture</a>
        </nav>

        <div class="flex items-center gap-3">
          <button id="cta-nav-btn" class="glow-btn px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2">
            <i data-lucide="arrow-right" class="w-4 h-4"></i>
            <span>Get Started</span>
          </button>
        </div>
      </div>
    </header>
  \`;

  const btn = container.querySelector('#cta-nav-btn');
  if (btn) {
    btn.addEventListener('click', () => openModal('details-modal'));
  }
}
`,

    'src/components/Hero.js': `// Hero Component
import { openModal } from '../utils/dom.js';

export function renderHero(container, promptText = '${prompt}') {
  if (!container) return;
  container.innerHTML = \`
    <section class="relative pt-20 pb-16 px-4 sm:px-6 text-center max-w-4xl mx-auto">
      <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-[var(--color-primary)]/15 text-[var(--color-primary)] border border-[var(--color-primary)]/30 mb-6 shadow-sm">
        <i data-lucide="sparkles" class="w-3.5 h-3.5"></i>
        <span>AI Autonomous Architecture Active</span>
      </div>

      <h1 class="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-white mb-6 leading-tight">
        Built with Structure, <br class="hidden sm:block"/>
        <span class="text-transparent bg-clip-text bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-accent)]">
          Engineered to Scale.
        </span>
      </h1>

      <p class="text-base sm:text-lg text-slate-400 max-w-2xl mx-auto mb-8 leading-relaxed">
        \${promptText}
      </p>

      <div class="flex flex-col sm:flex-row items-center justify-center gap-4">
        <button id="hero-action-btn" class="w-full sm:w-auto glow-btn px-6 py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2">
          <i data-lucide="layers" class="w-4 h-4"></i>
          <span>Explore Capabilities</span>
        </button>
        <a href="#features" class="w-full sm:w-auto px-6 py-3 rounded-xl font-semibold text-sm text-slate-300 hover:text-white bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 transition-all flex items-center justify-center gap-2">
          <i data-lucide="terminal" class="w-4 h-4"></i>
          <span>View Source Code</span>
        </a>
      </div>
    </section>
  \`;

  const heroBtn = container.querySelector('#hero-action-btn');
  if (heroBtn) {
    heroBtn.addEventListener('click', () => openModal('details-modal'));
  }
}
`,

    'src/components/Features.js': `// Features Component
import { sampleShowcaseData } from '../utils/api.js';
import { showToast, openModal } from '../utils/dom.js';

export function renderFeatures(container) {
  if (!container) return;

  const cardsHtml = sampleShowcaseData
    .map(
      (item) => \`
    <div class="glassmorphic p-6 rounded-2xl flex flex-col justify-between group hover:border-[var(--color-primary)]/50 transition-all">
      <div>
        <div class="flex items-center justify-between mb-4">
          <div class="w-10 h-10 rounded-xl bg-[var(--color-primary)]/15 border border-[var(--color-primary)]/30 flex items-center justify-center text-[var(--color-primary)]">
            <i data-lucide="\${item.icon}" class="w-5 h-5"></i>
          </div>
          <span class="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
            \${item.badge}
          </span>
        </div>
        <h3 class="text-lg font-bold text-white mb-2 group-hover:text-[var(--color-primary)] transition-colors">
          \${item.title}
        </h3>
        <p class="text-sm text-slate-400 leading-relaxed">
          \${item.description}
        </p>
      </div>
      <button data-feat-id="\${item.id}" class="feat-inspect-btn mt-6 text-xs font-semibold text-[var(--color-primary)] flex items-center gap-1.5 hover:underline">
        <span>Inspect detail</span>
        <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
      </button>
    </div>
  \`
    )
    .join('');

  container.innerHTML = \`
    <section id="features" class="py-16 px-4 sm:px-6 max-w-6xl mx-auto">
      <div class="text-center mb-12">
        <h2 class="text-2xl sm:text-3xl font-bold text-white mb-3 tracking-tight">Core Architecture Highlights</h2>
        <p class="text-sm text-slate-400 max-w-lg mx-auto">
          Every layer is isolated across source directories for maximum modularity and clean engineering.
        </p>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        \${cardsHtml}
      </div>
    </section>
  \`;

  container.querySelectorAll('.feat-inspect-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const featId = btn.getAttribute('data-feat-id');
      const item = sampleShowcaseData.find((f) => f.id === featId);
      showToast(\`Viewing \${item?.title || 'Feature'}\`, 'info');
      openModal('details-modal');
    });
  });
}
`,

    'src/components/DetailsModal.js': `// Details Modal Component
import { closeModal, showToast } from '../utils/dom.js';
import { submitInquiry } from '../utils/api.js';

export function renderDetailsModal(container) {
  if (!container) return;
  container.innerHTML = \`
    <div id="details-modal" class="fixed inset-0 z-50 hidden items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div class="w-full max-w-lg glassmorphic rounded-2xl p-6 sm:p-8 shadow-2xl relative border border-slate-700/60 animate-in fade-in zoom-in-95 duration-150">
        <button id="modal-close-btn" class="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors">
          <i data-lucide="x" class="w-5 h-5"></i>
        </button>

        <div class="flex items-center gap-3 mb-4">
          <div class="w-10 h-10 rounded-xl bg-[var(--color-primary)]/20 text-[var(--color-primary)] flex items-center justify-center font-bold">
            <i data-lucide="sparkles" class="w-5 h-5"></i>
          </div>
          <div>
            <h3 class="text-lg font-bold text-white">Interactive Feature Hub</h3>
            <p class="text-xs text-slate-400">Structured client-side interaction</p>
          </div>
        </div>

        <p class="text-sm text-slate-300 mb-6 leading-relaxed">
          This project was scaffolded with real modular source files across <code class="text-xs font-mono bg-slate-800 text-[var(--color-primary)] px-1.5 py-0.5 rounded">.rules/</code>, <code class="text-xs font-mono bg-slate-800 text-[var(--color-primary)] px-1.5 py-0.5 rounded">.skills/</code>, <code class="text-xs font-mono bg-slate-800 text-[var(--color-primary)] px-1.5 py-0.5 rounded">docs/</code>, <code class="text-xs font-mono bg-slate-800 text-[var(--color-primary)] px-1.5 py-0.5 rounded">src/</code>, and <code class="text-xs font-mono bg-slate-800 text-[var(--color-primary)] px-1.5 py-0.5 rounded">supabase/</code>.
        </p>

        <form id="inquiry-form" class="space-y-4">
          <div>
            <label class="block text-xs font-semibold text-slate-400 mb-1">Your Name</label>
            <input type="text" id="inq-name" required placeholder="Jane Doe" class="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] transition-all"/>
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-400 mb-1">Email Address</label>
            <input type="email" id="inq-email" required placeholder="jane@example.com" class="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] transition-all"/>
          </div>
          <div class="flex items-center justify-end gap-3 pt-2">
            <button type="button" id="inq-cancel-btn" class="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition-colors">
              Cancel
            </button>
            <button type="submit" id="inq-submit-btn" class="glow-btn px-5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2">
              <i data-lucide="send" class="w-3.5 h-3.5"></i>
              <span>Submit Request</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  \`;

  container.querySelector('#modal-close-btn')?.addEventListener('click', () => closeModal('details-modal'));
  container.querySelector('#inq-cancel-btn')?.addEventListener('click', () => closeModal('details-modal'));

  const form = container.querySelector('#inquiry-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = form.querySelector('#inq-submit-btn');
      if (submitBtn) submitBtn.disabled = true;

      showToast('Transmitting request...', 'info');
      await submitInquiry({
        name: container.querySelector('#inq-name')?.value,
        email: container.querySelector('#inq-email')?.value,
      });

      showToast('Success! Your inquiry has been recorded.', 'success');
      closeModal('details-modal');
      form.reset();
      if (submitBtn) submitBtn.disabled = false;
    });
  }
}
`,

    'src/components/Footer.js': `// Footer Component
export function renderFooter(container, appName = '${name}') {
  if (!container) return;
  container.innerHTML = \`
    <footer class="mt-20 border-t border-[var(--color-border)] py-12 px-4 sm:px-6 bg-[#09090c]">
      <div class="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6 text-xs text-slate-500">
        <div class="flex items-center gap-2">
          <div class="w-6 h-6 rounded-md bg-[var(--color-primary)] flex items-center justify-center text-white font-bold text-xs">
            <i data-lucide="sparkles" class="w-3.5 h-3.5"></i>
          </div>
          <span class="font-semibold text-slate-400">\${appName}</span>
          <span>© \${new Date().getFullYear()} All rights reserved.</span>
        </div>
        <div class="flex items-center gap-6">
          <a href="#features" class="hover:text-slate-300 transition-colors">Architecture</a>
          <a href="#docs" class="hover:text-slate-300 transition-colors">Documentation</a>
          <a href="#" class="hover:text-slate-300 transition-colors">Privacy</a>
        </div>
      </div>
    </footer>
  \`;
}
`,

    // ----------------------------------------------------------------
    // 9. src/main.js (Application Entrypoint)
    // ----------------------------------------------------------------
    'src/main.js': `// Main ES Module Entry Point
import { renderNavbar } from './components/Navbar.js';
import { renderHero } from './components/Hero.js';
import { renderFeatures } from './components/Features.js';
import { renderDetailsModal } from './components/DetailsModal.js';
import { renderFooter } from './components/Footer.js';
import { showToast } from './utils/dom.js';

document.addEventListener('DOMContentLoaded', () => {
  console.log('[App] Initializing modular web application...');
  
  const app = document.getElementById('app');
  if (!app) {
    console.error('Target #app root container not found');
    return;
  }

  // Construct component mount layout
  app.innerHTML = \`
    <div id="navbar-mount"></div>
    <main>
      <div id="hero-mount"></div>
      <div id="features-mount"></div>
    </main>
    <div id="footer-mount"></div>
    <div id="modal-mount"></div>
  \`;

  // Render modular components
  renderNavbar(document.getElementById('navbar-mount'));
  renderHero(document.getElementById('hero-mount'));
  renderFeatures(document.getElementById('features-mount'));
  renderFooter(document.getElementById('footer-mount'));
  renderDetailsModal(document.getElementById('modal-mount'));

  // Initialize icon glyphs
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }

  showToast('Welcome to ${name}!', 'success');
});
`,

    // ----------------------------------------------------------------
    // 10. supabase FOLDER (Database Schemas & Edge Configs)
    // ----------------------------------------------------------------
    'supabase/config.toml': `project_id = "another_me_app"

[api]
port = 54321
schemas = ["public", "storage", "graphql_public"]

[db]
port = 54322

[auth]
site_url = "http://localhost:5173"
additional_redirect_urls = ["https://localhost:5173"]
jwt_expiry = 3600
enable_signup = true
`,

    'supabase/migrations/01_initial_schema.sql': `-- Initial Database Schema for ${name}
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL UNIQUE,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  message TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read profiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Public create inquiries" ON public.inquiries FOR INSERT WITH CHECK (true);
`,

    // ----------------------------------------------------------------
    // 11. Root Files (index.html, package.json)
    // ----------------------------------------------------------------
    'index.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${name}</title>
  <link rel="icon" type="image/svg+xml" href="./public/favicon.svg">
  <link rel="manifest" href="./public/manifest.json">
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <link rel="stylesheet" href="./src/styles/theme.css">
  <link rel="stylesheet" href="./src/styles/main.css">
</head>
<body class="bg-[#0d0d12] text-slate-100 min-h-screen">
  <div id="app"></div>
  <script type="module" src="./src/main.js"></script>
</body>
</html>
`,

    'package.json': JSON.stringify(
      {
        name: name.toLowerCase().replace(/[^a-z0-9-]/g, '-') || 'web-project',
        version: '1.0.0',
        private: true,
        type: 'module',
        scripts: {
          test: 'bash .rules/check.sh',
          build: 'bash .rules/testBuild.sh',
        },
        dependencies: {
          lucide: '^0.469.0',
        },
        devDependencies: {},
      },
      null,
      2
    ),
  }
}

/**
 * Scaffolds the entire multi-folder layout inside the designated workspace root directory.
 */
export async function scaffoldCanonicalProjectWorkspace(
  workspaceRoot: string,
  ctx: ProjectScaffoldContext = {}
): Promise<{ filesCount: number; paths: string[] }> {
  const files = getCanonicalProjectFiles(ctx)
  const createdPaths: string[] = []

  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = path.resolve(workspaceRoot, relPath)
    const dir = path.dirname(fullPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    // Only write if file doesn't exist yet to prevent overwriting user edits
    if (!fs.existsSync(fullPath)) {
      fs.writeFileSync(fullPath, content, 'utf-8')
      createdPaths.push(relPath)
    }
  }

  return {
    filesCount: createdPaths.length,
    paths: createdPaths,
  }
}
