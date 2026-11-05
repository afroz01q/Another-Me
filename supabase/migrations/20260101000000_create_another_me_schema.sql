-- ====================================================================
-- ANOTHER ME: PERSONAL AI DIGITAL TWIN SAAS
-- Database Migration: Full Schema with Row Level Security (RLS) & Seed
-- ====================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- 2. ENUMS
DO $$ BEGIN
    CREATE TYPE communication_style_enum AS ENUM ('friendly', 'professional', 'casual', 'concise');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE formality_level_enum AS ENUM ('informal', 'neutral', 'formal');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE response_length_enum AS ENUM ('brief', 'balanced', 'detailed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE memory_category_enum AS ENUM (
        'personal_preferences',
        'interests',
        'goals',
        'projects',
        'important_facts',
        'communication_preferences',
        'experiences'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE action_status_enum AS ENUM (
        'pending',
        'awaiting_confirmation',
        'confirmed',
        'executing',
        'completed',
        'failed',
        'cancelled'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. PROFILES TABLE (Mirrors auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 4. TWIN SETTINGS
CREATE TABLE IF NOT EXISTS public.twin_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    tagline TEXT,
    communication_style communication_style_enum NOT NULL DEFAULT 'friendly',
    formality_level formality_level_enum NOT NULL DEFAULT 'neutral',
    preferred_language TEXT NOT NULL DEFAULT 'English',
    response_length response_length_enum NOT NULL DEFAULT 'balanced',
    vocabulary_style TEXT NOT NULL DEFAULT 'standard',
    interests TEXT[] NOT NULL DEFAULT '{}',
    goals TEXT[] NOT NULL DEFAULT '{}',
    writing_samples TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT uq_user_twin UNIQUE (user_id)
);

-- 5. AVATARS
CREATE TABLE IF NOT EXISTS public.avatars (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    preset_id TEXT NOT NULL DEFAULT 'preset-orb-violet',
    visual_style TEXT NOT NULL DEFAULT 'stylized',
    background_id TEXT NOT NULL DEFAULT 'bg-deep-space',
    accent_color TEXT NOT NULL DEFAULT '#7c3aed',
    lighting TEXT NOT NULL DEFAULT 'soft',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT uq_user_avatar UNIQUE (user_id)
);

-- 6. CONVERSATIONS
CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'New Conversation',
    summary TEXT,
    message_count INTEGER NOT NULL DEFAULT 0,
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    is_archived BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 7. MESSAGES
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 8. MEMORIES & EMBEDDINGS (pgvector)
CREATE TABLE IF NOT EXISTS public.memories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category memory_category_enum NOT NULL DEFAULT 'important_facts',
    source_reference TEXT,
    is_user_editable BOOLEAN NOT NULL DEFAULT true,
    is_archived BOOLEAN NOT NULL DEFAULT false,
    confidence NUMERIC(3, 2) DEFAULT 1.00 CHECK (confidence >= 0 AND confidence <= 1),
    embedding vector(1536), -- Vector embedding for semantic recall
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 9. MEMORY SOURCES (Documents, notes, or messages imported)
CREATE TABLE IF NOT EXISTS public.memory_sources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    memory_id UUID NOT NULL REFERENCES public.memories(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL, -- 'chat_message', 'uploaded_document', 'manual_entry'
    source_uri TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 10. AUTHORIZED ACTIONS DEFINITION
CREATE TABLE IF NOT EXISTS public.authorized_actions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    requires_confirmation BOOLEAN NOT NULL DEFAULT true,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT uq_user_action UNIQUE (user_id, action_type)
);

-- 11. ACTION EXECUTIONS (Audit log of verified task runs)
CREATE TABLE IF NOT EXISTS public.action_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL,
    operation_name TEXT NOT NULL,
    input_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    expected_outcome TEXT,
    status action_status_enum NOT NULL DEFAULT 'pending',
    result_data JSONB,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 12. ACTIVITY LOGS
CREATE TABLE IF NOT EXISTS public.activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    activity_type TEXT NOT NULL,
    description TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 13. CONNECTED INTEGRATIONS
CREATE TABLE IF NOT EXISTS public.connected_integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    provider TEXT NOT NULL, -- 'google_calendar', 'notion', 'slack'
    account_identifier TEXT NOT NULL,
    scopes TEXT[] NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT uq_user_provider UNIQUE (user_id, provider)
);

-- 14. USER CONSENTS (Explicit Privacy Opt-ins)
CREATE TABLE IF NOT EXISTS public.user_consents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    consent_type TEXT NOT NULL, -- 'voice_processing', 'memory_auto_creation', 'external_api_dispatch'
    granted BOOLEAN NOT NULL DEFAULT false,
    granted_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT uq_user_consent UNIQUE (user_id, consent_type)
);

-- ====================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ====================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.twin_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avatars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.authorized_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connected_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_consents ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can view & update their own profile
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Twin Settings: Users manage their own twin
CREATE POLICY "Users can view own twin_settings" ON public.twin_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own twin_settings" ON public.twin_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own twin_settings" ON public.twin_settings FOR UPDATE USING (auth.uid() = user_id);

-- Avatars
CREATE POLICY "Users can view own avatar" ON public.avatars FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own avatar" ON public.avatars FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own avatar" ON public.avatars FOR UPDATE USING (auth.uid() = user_id);

-- Conversations
CREATE POLICY "Users can view own conversations" ON public.conversations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own conversations" ON public.conversations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own conversations" ON public.conversations FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own conversations" ON public.conversations FOR DELETE USING (auth.uid() = user_id);

-- Messages
CREATE POLICY "Users can view own messages" ON public.messages FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own messages" ON public.messages FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Memories
CREATE POLICY "Users can view own memories" ON public.memories FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own memories" ON public.memories FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own memories" ON public.memories FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own memories" ON public.memories FOR DELETE USING (auth.uid() = user_id);

-- Actions & Executions
CREATE POLICY "Users can view own action executions" ON public.action_executions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own action executions" ON public.action_executions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own action executions" ON public.action_executions FOR UPDATE USING (auth.uid() = user_id);

-- Activities
CREATE POLICY "Users can view own activity logs" ON public.activity_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own activity logs" ON public.activity_logs FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Consents
CREATE POLICY "Users can view own consents" ON public.user_consents FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own consents" ON public.user_consents FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own consents" ON public.user_consents FOR UPDATE USING (auth.uid() = user_id);

-- ====================================================================
-- INDEXES FOR PERFORMANCE & SEARCH
-- ====================================================================
CREATE INDEX IF NOT EXISTS idx_conversations_user ON public.conversations (user_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON public.messages (conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_memories_user_category ON public.memories (user_id, category);
CREATE INDEX IF NOT EXISTS idx_action_executions_user ON public.action_executions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON public.activity_logs (user_id, created_at DESC);

-- ====================================================================
-- SEED DATA: Omitted in production to ensure clean new user workspaces
-- ====================================================================

