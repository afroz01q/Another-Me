// Core Types for Another Me Platform

export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export interface TwinSettings {
  id: string;
  user_id: string;
  name: string;
  tagline?: string;
  communication_style: 'friendly' | 'professional' | 'casual' | 'concise';
  formality_level: 'informal' | 'neutral' | 'formal';
  preferred_language: string;
  response_length: 'brief' | 'balanced' | 'detailed';
  vocabulary_style: 'simple' | 'standard' | 'advanced';
  interests: string[];
  goals: string[];
  writing_samples?: string[];
  voice_id?: string;
  voice_speed?: number;
  created_at: string;
  updated_at: string;
}

export type VoiceCategory = 'male' | 'female';

export interface VoiceOption {
  id: string;
  displayName: string;
  category: VoiceCategory;
  description: string;
  provider: string;
  providerVoiceId: string;
  gender: 'male' | 'female';
  previewPhrase: string;
  pitch: number;
  rate: number;
}

export type VoiceInteractionState =
  | 'idle'
  | 'requesting_permission'
  | 'listening'
  | 'processing'
  | 'thinking'
  | 'generating_speech'
  | 'speaking'
  | 'interrupted'
  | 'error';

export interface Conversation {
  id: string;
  user_id: string;
  title: string;
  summary?: string;
  message_count: number;
  last_message_at: string;
  created_at: string;
  updated_at: string;
  is_archived: boolean;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: {
    memory_ids?: string[];
    action_id?: string;
    tokens_used?: number;
    model?: string;
  };
  created_at: string;
}

export type MemoryCategory =
  | 'personal_preferences'
  | 'interests'
  | 'goals'
  | 'projects'
  | 'important_facts'
  | 'communication_preferences'
  | 'experiences';

export interface Memory {
  id: string;
  user_id: string;
  title: string;
  content: string;
  category: MemoryCategory;
  source_reference?: string;
  is_user_editable: boolean;
  is_archived: boolean;
  confidence?: number;
  created_at: string;
  updated_at: string;
}

export type AvatarState = 'idle' | 'listening' | 'speaking' | 'thinking';

export type AvatarGenerationStatus =
  | 'not_started'
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed';

export type AvatarProvider = 'd-id' | 'heygen' | 'replicate' | 'custom';

export interface Avatar {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  preset_id: string;
  visual_style: 'realistic' | 'stylized' | 'minimal' | 'geometric';
  background_id: string;
  accent_color: string;
  lighting: 'soft' | 'dramatic' | 'neutral';
  // Personal AI Digital Twin Fields
  source_image_path?: string | null;
  generated_video_path?: string | null;
  thumbnail_path?: string | null;
  provider?: AvatarProvider;
  provider_job_id?: string | null;
  status?: AvatarGenerationStatus;
  error_message?: string | null;
  consent_given?: boolean;
  consent_timestamp?: string | null;
  avatar_type?: 'animated_character' | '3d_orb' | 'video';
  created_at: string;
  updated_at: string;
}

export interface AvatarUploadResponse {
  success: boolean;
  sourceImagePath: string;
  avatar: Avatar;
  message?: string;
}

export interface AvatarGenerateResponse {
  success: boolean;
  jobId?: string;
  status: AvatarGenerationStatus;
  provider: AvatarProvider;
  avatar: Avatar;
  error?: string;
  message?: string;
  setupHelpUrl?: string;
}

export interface AvatarProviderConfig {
  d_id_api_key?: string;
  replicate_api_token?: string;
  heygen_api_key?: string;
  active_provider?: AvatarProvider;
  d_id_configured?: boolean;
  replicate_configured?: boolean;
  heygen_configured?: boolean;
  activeProvider?: AvatarProvider;
  didApiKey?: string;
  replicateApiToken?: string;
  heygenApiKey?: string;
  hasDidKey?: boolean;
  hasReplicateToken?: boolean;
  hasHeygenKey?: boolean;
}

export type ActionType =
  | 'create_reminder'
  | 'organize_note'
  | 'summarize_document'
  | 'draft_message'
  | 'create_task'
  | 'search_memory';

export type ActionStatus = 'pending' | 'awaiting_confirmation' | 'confirmed' | 'executing' | 'completed' | 'failed' | 'cancelled';

export interface AuthorizedAction {
  id: string;
  user_id: string;
  action_type: ActionType;
  is_enabled: boolean;
  requires_confirmation: boolean;
  created_at: string;
  updated_at: string;
}

export interface ActionExecution {
  id: string;
  user_id: string;
  action_type: ActionType;
  title: string;
  input_data: Record<string, unknown>;
  expected_outcome: string;
  status: ActionStatus;
  result?: Record<string, unknown>;
  error_message?: string;
  confirmed_at?: string;
  executed_at?: string;
  created_at: string;
  updated_at: string;
}

export type ActivityType =
  | 'conversation_started'
  | 'conversation_ended'
  | 'memory_created'
  | 'memory_edited'
  | 'memory_deleted'
  | 'memory_archived'
  | 'action_requested'
  | 'action_confirmed'
  | 'action_completed'
  | 'action_failed'
  | 'action_cancelled'
  | 'permission_changed'
  | 'settings_updated'
  | 'avatar_updated'
  | 'account_exported'
  | 'login'
  | 'logout';

export interface ActivityLog {
  id: string;
  user_id: string;
  activity_type: ActivityType;
  description: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface UserConsent {
  id: string;
  user_id: string;
  consent_type: 'voice_processing' | 'data_export' | 'analytics' | 'memory_auto_creation';
  granted: boolean;
  granted_at?: string;
  revoked_at?: string;
  created_at: string;
  updated_at: string;
}

// UI State Types
export interface ChatState {
  isGenerating: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  error: string | null;
}

export interface OnboardingStep {
  id: number;
  title: string;
  description: string;
  isCompleted: boolean;
}

export interface AvatarPreset {
  id: string;
  name: string;
  description: string;
  thumbnail: string;
  style: Avatar['visual_style'];
}

export interface AvatarBackground {
  id: string;
  name: string;
  color: string;
  gradient?: string;
}

// API Response Types
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
  has_more: boolean;
}

export interface StreamChunk {
  type: 'token' | 'done' | 'error';
  content?: string;
  error?: string;
}

// Autopilot Voice-Controlled Messaging
export * from './autopilot';

// AI Orchestrator & Planning Engine
export * from './orchestrator';

