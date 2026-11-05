-- ====================================================================
-- ANOTHER ME: PERSONAL AI DIGITAL TWIN AVATAR GENERATION SCHEMA
-- Migration: Add personal digital twin avatar video fields to public.avatars
-- ====================================================================

-- 1. ADD COLUMNS FOR PERSONAL AI PHOTO-TO-VIDEO GENERATION
ALTER TABLE public.avatars
ADD COLUMN IF NOT EXISTS source_image_path TEXT,
ADD COLUMN IF NOT EXISTS generated_video_path TEXT,
ADD COLUMN IF NOT EXISTS thumbnail_path TEXT,
ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'd-id' CHECK (provider IN ('d-id', 'heygen', 'replicate', 'custom')),
ADD COLUMN IF NOT EXISTS provider_job_id TEXT,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'not_started' CHECK (status IN ('not_started', 'queued', 'processing', 'completed', 'failed')),
ADD COLUMN IF NOT EXISTS error_message TEXT,
ADD COLUMN IF NOT EXISTS consent_given BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS consent_timestamp TIMESTAMPTZ;

-- 2. CREATE INDEX FOR FAST USER & STATUS LOOKUPS
CREATE INDEX IF NOT EXISTS idx_avatars_user_status ON public.avatars (user_id, status);

-- 3. STORAGE BUCKET FOR SECURE USER AVATAR MEDIA
INSERT INTO storage.buckets (id, name, public)
VALUES ('user-avatars', 'user-avatars', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: Users can only upload & view their own avatar media
DO $$ BEGIN
    CREATE POLICY "Users can upload own avatar photo"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'user-avatars' AND
        auth.uid()::text = (storage.foldername(name))[1]
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE POLICY "Users can view own avatar media"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'user-avatars' AND
        auth.uid()::text = (storage.foldername(name))[1]
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE POLICY "Users can delete own avatar media"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'user-avatars' AND
        auth.uid()::text = (storage.foldername(name))[1]
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
