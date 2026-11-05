# Another Me — Personal AI Digital Twin SaaS

> **"Your Personality. Your Memories. Your Digital Twin."**

A personal AI digital twin platform that empowers users to create their own interactive, high-fidelity AI version. The twin learns from explicitly shared memories, speaks in the user's authentic style, maintains a searchable personal memory bank, and executes approved tasks on their behalf.

---

## Key Features

1. **Interactive 3D Avatar Experience**
   - Procedural & WebGL 3D avatar built with Three.js & React Three Fiber (`@react-three/fiber`, `@react-three/drei`).
   - Dynamic states: `idle`, `listening`, `speaking`, and `thinking` with orbital particles, light refraction, and sound synthesis.
   - Comprehensive **Avatar Studio** (`/app/avatar`) to customize visual style, color palettes, ambient lighting, and backgrounds.

2. **Main Conversational Workspace ("My Twin")**
   - High-throughput streaming conversational interface (`/app/twin`).
   - Natural conversational responses reflecting the user's configured communication style, tone, and response length.
   - Contextual memory triggers: **"Remember this"**, **"Why do you remember this?"**, and **"Forget this information"**.
   - Spoken audio synthesis and speech-to-text input support.

3. **Personal Memory System**
   - Structured categorization: *Personal Preferences*, *Interests*, *Goals*, *Projects*, *Important Facts*, *Communication Style*, and *Experiences*.
   - Searchable memory index with confidence scoring and source references.
   - Full user-level CRUD: add, edit, archive, and delete memories with verified privacy enforcement.

4. **Personality Profile Engine**
   - Configuration for tone (*friendly, professional, casual, concise*), formality level, response length (*brief, balanced, detailed*), vocabulary level, and writing samples.
   - Interactive live simulation pane demonstrating responses under varying configurations.

5. **Actions & Tool Execution Engine**
   - Autonomous verified execution for:
     - ⏰ **Create Reminder**
     - 📝 **Organize Note**
     - 📄 **Summarize Document**
     - ✉️ **Draft Message**
     - ✅ **Create Task**
     - 🔍 **Search Memory**
   - Real permission gating: requires explicit user confirmation before consequential actions are performed.

6. **Activity History & Audit Trail**
   - Comprehensive audit log tracking every conversation, memory creation/deletion, action execution, and consent modification.

7. **Privacy & Security First Architecture**
   - Transparent consent toggles for optional capabilities (voice synthesis, automated memory extraction, analytics).
   - One-click full data export (JSON).
   - Complete account and memory wiping with phrase confirmation.

---

## Tech Stack

- **Frontend**: React 19 + TypeScript + Vite
- **Styling**: Tailwind CSS + Custom Dark Theme Tokens (`index.css`)
- **State Management**: Zustand with persistent storage
- **3D Graphics**: Three.js, `@react-three/fiber`, `@react-three/drei`
- **Icons**: Lucide React
- **Notifications**: React Hot Toast
- **Database / Backend**: Supabase PostgreSQL + `pgvector` for semantic memory retrieval
- **Security**: PostgreSQL Row-Level Security (RLS) on all user-owned tables

---

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
*(Note: If Supabase credentials are not provided, Another Me automatically operates in zero-config interactive **Demo Sandbox Mode** with pre-seeded data).*

### 3. Run Development Server
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### 4. Build for Production
```bash
npm run build
```

---

## Database Architecture & Migrations

The database schema is defined in [`supabase/migrations/20260101000000_create_another_me_schema.sql`](./supabase/migrations/20260101000000_create_another_me_schema.sql).

### Tables Included:
- `profiles` — User account data tied to Supabase Auth
- `twin_settings` — Personality, tone, language, and response length
- `avatars` — 3D avatar preset, accent color, and lighting
- `conversations` & `messages` — Chat trajectory and metadata
- `memories` & `memory_sources` — Memory entries with `vector(1536)` embeddings
- `authorized_actions` & `action_executions` — Permissions and verified task run logs
- `activity_logs` — Audit log of user and twin activities
- `connected_integrations` — Authorized external OAuth providers
- `user_consents` — Granular privacy opt-ins

---

## Demo Credentials

For quick evaluation without setting up an external database:
- Click **"Instant Demo Access"** on the login screen or navigate directly to `/app/twin`.
- Sample Account: `demo@anotherm.ai` / `demo1234`
- Twin Persona: **Alex AI**
