-- ====================================================================
-- ANOTHER ME: SECTION 1 AI ORCHESTRATOR & PLANNING ENGINE SCHEMA
-- Migration: Projects, Tasks, Events & RLS User Isolation Policies
-- ====================================================================

-- 1. ORCHESTRATOR PROJECTS TABLE
CREATE TABLE IF NOT EXISTS public.orchestrator_projects (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    user_prompt TEXT NOT NULL,
    request_classification TEXT NOT NULL DEFAULT 'new_website',
    workflow_state TEXT NOT NULL DEFAULT 'received'
        CHECK (workflow_state IN ('received', 'analyzing', 'planning', 'awaiting_approval', 'approved', 'ready_for_execution', 'rejected', 'failed')),
    analysis JSONB DEFAULT '{}'::jsonb,
    plan JSONB DEFAULT '{}'::jsonb,
    execution_bundle JSONB DEFAULT '{}'::jsonb,
    approved_at TIMESTAMPTZ,
    ready_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_orchestrator_projects_user ON public.orchestrator_projects(user_id);
CREATE INDEX IF NOT EXISTS idx_orchestrator_projects_state ON public.orchestrator_projects(workflow_state);

-- 2. ORCHESTRATOR TASKS TABLE (DAG Dependency & Verification Criteria)
CREATE TABLE IF NOT EXISTS public.orchestrator_tasks (
    id TEXT NOT NULL,
    project_id TEXT NOT NULL REFERENCES public.orchestrator_projects(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    task_type TEXT NOT NULL,
    dependencies TEXT[] DEFAULT '{}',
    required_tools TEXT[] DEFAULT '{}',
    expected_files TEXT[] DEFAULT '{}',
    verification_criteria TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
    execution_stage INTEGER NOT NULL DEFAULT 1,
    can_run_parallel BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    PRIMARY KEY (project_id, id)
);

CREATE INDEX IF NOT EXISTS idx_orchestrator_tasks_project ON public.orchestrator_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_orchestrator_tasks_stage ON public.orchestrator_tasks(execution_stage);

-- 3. ORCHESTRATOR EXECUTION EVENTS TABLE (Audit Trail & State Machine Transitions)
CREATE TABLE IF NOT EXISTS public.orchestrator_events (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES public.orchestrator_projects(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    from_state TEXT,
    to_state TEXT NOT NULL,
    message TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_orchestrator_events_project ON public.orchestrator_events(project_id);

-- 4. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.orchestrator_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orchestrator_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orchestrator_events ENABLE ROW LEVEL SECURITY;

-- Projects Isolation Policy (Strict auth.uid() or service_role enforcement)
DO $$ BEGIN
    DROP POLICY IF EXISTS orchestrator_projects_user_policy ON public.orchestrator_projects;
    CREATE POLICY orchestrator_projects_user_policy ON public.orchestrator_projects
        FOR ALL USING (
            auth.role() = 'service_role' OR
            user_id = auth.uid()::text
        );
END $$;

-- Tasks Isolation Policy (Strict auth.uid() or service_role enforcement)
DO $$ BEGIN
    DROP POLICY IF EXISTS orchestrator_tasks_user_policy ON public.orchestrator_tasks;
    CREATE POLICY orchestrator_tasks_user_policy ON public.orchestrator_tasks
        FOR ALL USING (
            auth.role() = 'service_role' OR
            user_id = auth.uid()::text
        );
END $$;

-- Events Isolation Policy (Strict auth.uid() or service_role enforcement)
DO $$ BEGIN
    DROP POLICY IF EXISTS orchestrator_events_user_policy ON public.orchestrator_events;
    CREATE POLICY orchestrator_events_user_policy ON public.orchestrator_events
        FOR ALL USING (
            auth.role() = 'service_role' OR
            user_id = auth.uid()::text
        );
END $$;
