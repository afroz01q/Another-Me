import React, { useState, useEffect } from 'react'
import {
  User, Lock, Sparkles, Volume2, Moon, Database,
  Check, Save, RotateCcw, AlertTriangle, Key,
  Sliders, Shield, SlidersHorizontal, Camera, Video,
  CheckCircle2, Globe, RefreshCw,
} from 'lucide-react'
import { Button, Input, Select, Toggle, Badge, Card, Modal } from '@/components/ui'
import { useAuthStore, useTwinStore, useMemoryStore, useActivityStore, useAppStore } from '@/store'
import toast from 'react-hot-toast'
import { isSupabaseConfigured } from '@/lib/supabase'
import { CURATED_VOICES, playVoicePreview, stopSpeaking } from '@/lib/voice'
import { VoiceStudioModal } from '@/components/VoiceStudioModal'
import { avatarService } from '@/lib/avatarService'
import type { AvatarProviderConfig } from '@/types'

export default function SettingsPage() {
  const { user, updateUser, clearWorkspaceData } = useAuthStore()
  const { settings: twinSettings, updateSettings } = useTwinStore()
  const { memories } = useMemoryStore()
  const { addLog } = useActivityStore()
  const { soundEffects, toggleSoundEffects, reducedMotion, toggleReducedMotion } = useAppStore()

  // Form states
  const [userName, setUserName] = useState(user?.name || '')
  const [userEmail, setUserEmail] = useState(user?.email || '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false)
  const [isResetModalOpen, setIsResetModalOpen] = useState(false)

  // AI & Model Settings
  const [aiModel, setAiModel] = useState(() => localStorage.getItem('another-me-model') || 'meta-llama/llama-3.3-70b-instruct')
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('another-me-api-key') || '')
  const [temperature, setTemperature] = useState(0.7)
  const [memoryDepth, setMemoryDepth] = useState('10')
  const [enableStreaming, setEnableStreaming] = useState(true)

  // AI Avatar / Digital Twin Video Generation Provider Settings
  const [avatarProvider, setAvatarProvider] = useState<'d-id' | 'replicate' | 'heygen'>('d-id')
  const [didApiKey, setDidApiKey] = useState('')
  const [replicateApiToken, setReplicateApiToken] = useState('')
  const [heygenApiKey, setHeygenApiKey] = useState('')
  const [providerConfig, setProviderConfig] = useState<AvatarProviderConfig>({
    activeProvider: 'd-id',
    hasDidKey: false,
    hasReplicateToken: false,
    hasHeygenKey: false,
  })
  const [isSavingAvatarConfig, setIsSavingAvatarConfig] = useState(false)

  useEffect(() => {
    avatarService.getProviderConfig()
      .then((cfg) => {
        setProviderConfig(cfg)
        if (cfg.activeProvider) setAvatarProvider(cfg.activeProvider as any)
      })
      .catch((err) => console.warn('Could not load avatar provider config', err))
  }, [])

  const handleSaveAvatarConfig = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setIsSavingAvatarConfig(true)
      const updated = await avatarService.saveProviderConfig({
        activeProvider: avatarProvider,
        didApiKey: didApiKey.trim() || undefined,
        replicateApiToken: replicateApiToken.trim() || undefined,
        heygenApiKey: heygenApiKey.trim() || undefined,
      })
      setProviderConfig(updated)
      setDidApiKey('')
      setReplicateApiToken('')
      setHeygenApiKey('')
      toast.success('AI Digital Twin Avatar provider settings saved to server')
    } catch (err: any) {
      toast.error(err.message || 'Failed to save provider config')
    } finally {
      setIsSavingAvatarConfig(false)
    }
  }

  // Voice & Speech Settings
  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const [selectedVoice, setSelectedVoice] = useState(twinSettings?.voice_id || 'atlas')
  const [speechSpeed, setSpeechSpeed] = useState(twinSettings?.voice_speed || 1.0)
  const [autoSpeakResponses, setAutoSpeakResponses] = useState(true)
  const [isPlayingPreview, setIsPlayingPreview] = useState(false)
  const [isVoiceStudioOpen, setIsVoiceStudioOpen] = useState(false)

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault()
    if (!userName.trim()) {
      toast.error('Name cannot be empty')
      return
    }
    updateUser({ name: userName, email: userEmail })
    addLog({
      type: 'settings_updated',
      title: 'Profile Updated',
      description: `Updated profile details for ${userName}`,
    })
    toast.success('Profile settings saved successfully')
  }

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPassword || newPassword.length < 8) {
      toast.error('New password must be at least 8 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }
    setIsPasswordModalOpen(false)
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    addLog({
      type: 'settings_updated',
      title: 'Password Changed',
      description: 'Account security credentials updated',
    })
    toast.success('Password updated successfully')
  }

  const handleSaveAIConfig = (e: React.FormEvent) => {
    e.preventDefault()
    localStorage.setItem('another-me-api-key', apiKey.trim())
    localStorage.setItem('another-me-model', aiModel)
    addLog({
      type: 'settings_updated',
      title: 'AI Configuration Saved',
      description: `Inference model set to ${aiModel}`,
    })
    toast.success('AI engine settings saved successfully')
  }

  const handleClearWorkspace = () => {
    clearWorkspaceData()
    setIsResetModalOpen(false)
    toast.success('Workspace records and conversations cleared')
  }

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-8 animate-fade-in pb-24">
      {/* Page Header */}
      <div className="pb-1">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">Platform Settings</h1>
        <p className="text-sm mt-1.5 leading-normal" style={{ color: 'var(--color-text-secondary)' }}>
          Manage your account profile, AI inference model, audio synthesis, and system configurations.
        </p>
      </div>

      {/* 1. Account Information Card */}
      <Card className="p-6 sm:p-7 space-y-6">
        <div className="flex items-center gap-3.5 pb-5 border-b border-[var(--color-border)]">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(124, 58, 237, 0.15)', color: '#a78bfa' }}
          >
            <User size={20} />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-semibold text-white">Account Information</h2>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              Your personal profile details and security credentials
            </p>
          </div>
        </div>

        <form onSubmit={handleSaveProfile} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="text-xs sm:text-sm font-medium block mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                Full Name
              </label>
              <Input
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="Your full name"
                required
              />
            </div>
            <div>
              <label className="text-xs sm:text-sm font-medium block mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                Email Address
              </label>
              <Input
                type="email"
                value={userEmail}
                onChange={(e) => setUserEmail(e.target.value)}
                placeholder="your.email@domain.com"
                required
              />
            </div>
          </div>

          <div className="pt-4 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--color-border)]">
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={() => setIsPasswordModalOpen(true)}
              className="flex items-center gap-2"
            >
              <Key size={15} />
              Change Password
            </Button>

            <Button type="submit" variant="primary" size="md" className="flex items-center gap-2">
              <Save size={15} />
              Save Profile
            </Button>
          </div>
        </form>
      </Card>

      {/* 2. AI Engine & Inference Card */}
      <Card className="p-6 sm:p-7 space-y-6">
        <div className="flex items-center gap-3.5 pb-5 border-b border-[var(--color-border)]">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa' }}
          >
            <Sparkles size={20} />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-semibold text-white">AI Engine & Inference</h2>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              Configure the foundation intelligence model powering your digital twin
            </p>
          </div>
        </div>

        <form onSubmit={handleSaveAIConfig} className="space-y-6">
          <div>
            <label className="text-xs sm:text-sm font-medium block mb-2" style={{ color: 'var(--color-text-secondary)' }}>
              OpenRouter / LLM Provider API Key
            </label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-or-v1-... (Paste your key here for live AI generation)"
            />
            <p className="text-xs text-[var(--color-text-muted)] mt-2 leading-normal">
              Stored securely in local browser storage. Powers real conversational generation for your AI twin.
            </p>
          </div>

          <div>
            <label className="text-xs sm:text-sm font-medium block mb-2" style={{ color: 'var(--color-text-secondary)' }}>
              Selected Foundation Model
            </label>
            <Select
              value={aiModel}
              onChange={(e) => setAiModel(e.target.value)}
              options={[
                { value: 'meta-llama/llama-3.3-70b-instruct', label: 'Meta Llama 3.3 70B Instruct (Recommended)' },
                { value: 'anthropic/claude-3.5-sonnet', label: 'Anthropic Claude 3.5 Sonnet' },
                { value: 'openai/gpt-4o', label: 'OpenAI GPT-4o' },
                { value: 'google/gemini-2.0-flash-001', label: 'Google Gemini 2.0 Flash' },
                { value: 'meta-llama/llama-3.1-8b-instruct', label: 'Meta Llama 3.1 8B Instruct (Ultra-Fast)' },
              ]}
            />
            <p className="text-xs text-[var(--color-text-muted)] mt-2 leading-normal">
              Selected LLM called via OpenRouter API with your twin persona, speech style, and active memories injected into context.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-1">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs sm:text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                  Response Temperature
                </label>
                <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-[var(--color-surface-3)] text-orange-400">
                  {temperature}
                </span>
              </div>
              <div className="py-2">
                <input
                  type="range"
                  min="0.1"
                  max="1.2"
                  step="0.05"
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="w-full cursor-pointer"
                />
              </div>
              <div className="flex justify-between text-[11px] text-[var(--color-text-muted)]">
                <span>Deterministic (0.1)</span>
                <span>Balanced (0.7)</span>
                <span>Creative (1.2)</span>
              </div>
              <p className="text-xs text-[var(--color-text-muted)] leading-normal pt-1">
                Lower values yield predictable answers; higher values increase exploratory spontaneity.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs sm:text-sm font-medium block" style={{ color: 'var(--color-text-secondary)' }}>
                Semantic Memory Retrieval Depth
              </label>
              <Select
                value={memoryDepth}
                onChange={(e) => setMemoryDepth(e.target.value)}
                options={[
                  { value: '5', label: 'Top 5 Memories (Fastest)' },
                  { value: '10', label: 'Top 10 Memories (Recommended)' },
                  { value: '20', label: 'Top 20 Memories (Deep Context)' },
                ]}
              />
              <p className="text-xs text-[var(--color-text-muted)] leading-normal pt-1">
                Controls the depth of vectorized memory recall queried during response generation.
              </p>
            </div>
          </div>

          <div className="p-4 sm:p-5 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] flex items-center justify-between gap-4 mt-2">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-white">Streaming Token Output</div>
              <div className="text-xs text-[var(--color-text-muted)] mt-0.5 leading-normal">
                Render responses progressively as tokens are generated
              </div>
            </div>
            <Toggle checked={enableStreaming} onChange={setEnableStreaming} />
          </div>

          <div className="pt-2 flex justify-end">
            <Button type="submit" variant="primary" size="md" className="flex items-center gap-2">
              <Save size={15} />
              Save AI Configuration
            </Button>
          </div>
        </form>
      </Card>

      {/* AI Digital Twin Video Generation Provider (Likeness Engine) */}
      <Card className="p-6 sm:p-7 space-y-6">
        <div className="flex items-center gap-3.5 pb-5 border-b border-[var(--color-border)]">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(218, 119, 86, 0.15)', color: '#da7756' }}
          >
            <Camera size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-semibold text-white">AI Avatar & Video Provider</h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#da7756]/15 text-[#da7756] border border-[#da7756]/30 uppercase">
                Digital Twin Likeness
              </span>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              Powers automated talking-head animation generation from your uploaded facial photograph.
            </p>
          </div>
        </div>

        <form onSubmit={handleSaveAvatarConfig} className="space-y-5">
          <div>
            <label className="text-xs sm:text-sm font-medium block mb-2" style={{ color: 'var(--color-text-secondary)' }}>
              Active Video Generation Provider
            </label>
            <Select
              value={avatarProvider}
              onChange={(e) => setAvatarProvider(e.target.value as any)}
              options={[
                { value: 'd-id', label: 'D-ID (Recommended — Real-time & High Quality Lip-Sync)' },
                { value: 'replicate', label: 'Replicate (SadTalker / LivePortrait Open-Source Models)' },
                { value: 'heygen', label: 'HeyGen (Studio Video Generation)' },
              ]}
            />
          </div>

          {avatarProvider === 'd-id' && (
            <div className="space-y-3 p-4 rounded-xl bg-[#201f1c] border border-[#35332d]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#edebe8]">D-ID API Credentials</span>
                {providerConfig.hasDidKey ? (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                    <CheckCircle2 size={11} /> Configured on Server
                  </span>
                ) : (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    Key Required for Video Generation
                  </span>
                )}
              </div>
              <Input
                label="D-ID API Key"
                type="password"
                value={didApiKey}
                onChange={(e) => setDidApiKey(e.target.value)}
                placeholder={providerConfig.hasDidKey ? '•••••••••••••••• (Leave blank to keep current)' : 'base64(apiKey:apiSecret) or API key from studio.d-id.com'}
              />
              <div className="text-[11px] text-[#7d7a73] flex items-center justify-between">
                <span>Stored securely on the backend server; never exposed to browser clients.</span>
                <a
                  href="https://studio.d-id.com/account-settings"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#da7756] hover:underline inline-flex items-center gap-1"
                >
                  Get D-ID Key ↗
                </a>
              </div>
            </div>
          )}

          {avatarProvider === 'replicate' && (
            <div className="space-y-3 p-4 rounded-xl bg-[#201f1c] border border-[#35332d]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#edebe8]">Replicate API Token</span>
                {providerConfig.hasReplicateToken ? (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                    <CheckCircle2 size={11} /> Configured on Server
                  </span>
                ) : (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    Token Required
                  </span>
                )}
              </div>
              <Input
                label="Replicate API Token"
                type="password"
                value={replicateApiToken}
                onChange={(e) => setReplicateApiToken(e.target.value)}
                placeholder={providerConfig.hasReplicateToken ? '•••••••••••••••• (Leave blank to keep current)' : 'r8_... (from replicate.com/account/api-tokens)'}
              />
              <div className="text-[11px] text-[#7d7a73] flex items-center justify-between">
                <span>Runs SadTalker or LivePortrait image-to-video talking head pipelines.</span>
                <a
                  href="https://replicate.com/account/api-tokens"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#da7756] hover:underline inline-flex items-center gap-1"
                >
                  Get Replicate Token ↗
                </a>
              </div>
            </div>
          )}

          {avatarProvider === 'heygen' && (
            <div className="space-y-3 p-4 rounded-xl bg-[#201f1c] border border-[#35332d]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#edebe8]">HeyGen API Key</span>
                {providerConfig.hasHeygenKey ? (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                    <CheckCircle2 size={11} /> Configured on Server
                  </span>
                ) : (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    Key Required
                  </span>
                )}
              </div>
              <Input
                label="HeyGen API Key"
                type="password"
                value={heygenApiKey}
                onChange={(e) => setHeygenApiKey(e.target.value)}
                placeholder={providerConfig.hasHeygenKey ? '•••••••••••••••• (Leave blank to keep current)' : 'Enter HeyGen API Key'}
              />
            </div>
          )}

          <div className="pt-2 flex justify-end">
            <Button
              type="submit"
              variant="primary"
              size="md"
              className="flex items-center gap-2"
              isLoading={isSavingAvatarConfig}
            >
              <Save size={15} />
              Save Provider Configuration
            </Button>
          </div>
        </form>
      </Card>

      {/* 3. Voice & Audio Synthesis Card */}
      <Card className="p-6 sm:p-7 space-y-6">
        <div className="flex items-center gap-3.5 pb-5 border-b border-[var(--color-border)]">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399' }}
          >
            <Volume2 size={20} />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-semibold text-white">Voice & Audio Synthesis</h2>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              Configure speech recognition and spoken audio generation parameters
            </p>
          </div>
        </div>

        <div className="space-y-5">
          <div className="p-4 sm:p-5 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-white">Enable Voice Engine</div>
              <div className="text-xs text-[var(--color-text-muted)] mt-0.5 leading-normal">
                Support speech-to-text mic input and real-time avatar voice synthesis
              </div>
            </div>
            <Toggle checked={voiceEnabled} onChange={setVoiceEnabled} />
          </div>

          {voiceEnabled && (
            <div className="space-y-4 p-5 rounded-xl bg-[var(--color-surface-2)]/60 border border-[var(--color-border)]">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs sm:text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                      Curated Twin Voice (10 Options)
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsVoiceStudioOpen(true)}
                      className="text-xs text-orange-400 hover:text-orange-300 font-medium transition-colors"
                    >
                      Open Voice Studio →
                    </button>
                  </div>
                  <Select
                    value={selectedVoice}
                    onChange={(e) => setSelectedVoice(e.target.value)}
                    options={CURATED_VOICES.map((v) => ({
                      value: v.id,
                      label: `${v.displayName} — ${v.description} (${v.category === 'male' ? 'Male' : 'Female'})`,
                    }))}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs sm:text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                      Speech Speed
                    </label>
                    <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-[var(--color-surface-3)] text-orange-400">
                      {speechSpeed.toFixed(2)}x
                    </span>
                  </div>
                  <div className="py-2">
                    <input
                      type="range"
                      min="0.75"
                      max="1.35"
                      step="0.05"
                      value={speechSpeed}
                      onChange={(e) => setSpeechSpeed(parseFloat(e.target.value))}
                      className="w-full cursor-pointer"
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-[var(--color-text-muted)]">
                    <span>Thoughtful (0.75x)</span>
                    <span>Balanced (1.00x)</span>
                    <span>Rapid (1.35x)</span>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-[var(--color-border)] flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      if (isPlayingPreview) {
                        stopSpeaking()
                        setIsPlayingPreview(false)
                        return
                      }
                      setIsPlayingPreview(true)
                      try {
                        await playVoicePreview(selectedVoice, undefined, {
                          speedMultiplier: speechSpeed,
                          onEnd: () => setIsPlayingPreview(false),
                          onError: () => setIsPlayingPreview(false),
                        })
                      } catch {
                        setIsPlayingPreview(false)
                      }
                    }}
                    className="btn btn-secondary btn-sm flex items-center gap-1.5"
                  >
                    <Volume2 size={13} className="text-orange-400" />
                    <span>{isPlayingPreview ? 'Stop Audio' : 'Test Selected Voice'}</span>
                  </button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsVoiceStudioOpen(true)}
                  >
                    Browse All 10 Voices
                  </Button>
                </div>

                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    updateSettings({ voice_id: selectedVoice, voice_speed: speechSpeed })
                    addLog({
                      type: 'settings_updated',
                      title: 'Voice Updated',
                      description: `Set twin voice to ${selectedVoice} at ${speechSpeed}x speed`,
                    })
                    toast.success('Voice settings saved')
                  }}
                >
                  Save Voice Settings
                </Button>
              </div>
            </div>
          )}

          <div className="p-4 sm:p-5 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-white">Auto-Speak Responses</div>
              <div className="text-xs text-[var(--color-text-muted)] mt-0.5 leading-normal">
                Automatically synthesize audio responses when chatting with your digital twin
              </div>
            </div>
            <Toggle checked={autoSpeakResponses} onChange={setAutoSpeakResponses} />
          </div>
        </div>
      </Card>

      {/* 4. Interface & Experience Card */}
      <Card className="p-6 sm:p-7 space-y-6">
        <div className="flex items-center gap-3.5 pb-5 border-b border-[var(--color-border)]">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24' }}
          >
            <SlidersHorizontal size={20} />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-semibold text-white">Interface & Experience</h2>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              Accessibility, motion preferences, and interaction auditory feedback
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="p-4 sm:p-5 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-white">Subtle Sound Effects</div>
              <div className="text-xs text-[var(--color-text-muted)] mt-0.5 leading-normal">
                Play auditory cues for message send, memory save, and action confirmations
              </div>
            </div>
            <Toggle checked={soundEffects} onChange={toggleSoundEffects} />
          </div>

          <div className="p-4 sm:p-5 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-white">Reduced Motion</div>
              <div className="text-xs text-[var(--color-text-muted)] mt-0.5 leading-normal">
                Minimize avatar float and orbital particle animation speed for accessibility
              </div>
            </div>
            <Toggle checked={reducedMotion} onChange={toggleReducedMotion} />
          </div>
        </div>
      </Card>

      {/* 5. Database & Persistence Card */}
      <Card className="p-6 sm:p-7 space-y-6">
        <div className="flex items-center gap-3.5 pb-5 border-b border-[var(--color-border)]">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(124, 58, 237, 0.15)', color: '#a78bfa' }}
          >
            <Database size={20} />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-semibold text-white">Database & Persistence</h2>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              Storage architecture, memory index status, and data sovereignty
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
          <div className="p-4 sm:p-5 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] space-y-1.5">
            <div className="text-xs text-[var(--color-text-muted)]">Backend Provider</div>
            <div className="text-sm font-semibold text-white flex items-center gap-2">
              <span>{isSupabaseConfigured() ? 'Supabase Cloud' : 'Browser LocalStorage'}</span>
              <Badge variant={isSupabaseConfigured() ? 'success' : 'muted'} size="sm">
                {isSupabaseConfigured() ? 'Connected' : 'Local Mode'}
              </Badge>
            </div>
          </div>

          <div className="p-4 sm:p-5 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] space-y-1.5">
            <div className="text-xs text-[var(--color-text-muted)]">Active Memories Stored</div>
            <div className="text-sm font-semibold text-white">
              {memories.length} records indexed
            </div>
          </div>

          <div className="p-4 sm:p-5 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] space-y-1.5">
            <div className="text-xs text-[var(--color-text-muted)]">Encryption Standard</div>
            <div className="text-sm font-semibold text-emerald-400 flex items-center gap-1.5">
              <Shield size={14} />
              <span>AES-256 at Rest</span>
            </div>
          </div>
        </div>

        <div className="pt-4 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--color-border)]">
          <Button
            variant="secondary"
            size="md"
            onClick={() => {
              const exportBlob = new Blob([
                JSON.stringify({ user, twin: twinSettings, memories }, null, 2)
              ], { type: 'application/json' })
              const url = URL.createObjectURL(exportBlob)
              const a = document.createElement('a')
              a.href = url
              a.download = `another-me-data-${new Date().toISOString().split('T')[0]}.json`
              a.click()
              toast.success('Data exported successfully')
            }}
          >
            Export All Data (JSON)
          </Button>

          <Button
            variant="danger"
            size="md"
            onClick={() => setIsResetModalOpen(true)}
            className="flex items-center gap-2"
          >
            <RotateCcw size={15} />
            Clear Workspace Data
          </Button>
        </div>
      </Card>

      {/* Change Password Modal */}
      <Modal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
        title="Change Account Password"
      >
        <form onSubmit={handleChangePassword} className="space-y-4 pt-2">
          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
              Current Password
            </label>
            <Input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
              New Password (minimum 8 characters)
            </label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
              Confirm New Password
            </label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="ghost" onClick={() => setIsPasswordModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Update Password
            </Button>
          </div>
        </form>
      </Modal>

      {/* Clear Confirmation Modal */}
      <Modal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        title="Clear Workspace Data"
      >
        <div className="space-y-4 pt-2">
          <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200">
            <AlertTriangle size={20} className="shrink-0 mt-0.5" />
            <p className="text-xs leading-relaxed">
              This will clear your local conversations, memories, twin settings, and activity logs. Your authenticated user credentials will remain intact. No sample or demo data will be reloaded.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setIsResetModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleClearWorkspace}>
              Confirm Clear
            </Button>
          </div>
        </div>
      </Modal>

      {/* Voice Studio Modal */}
      <VoiceStudioModal
        isOpen={isVoiceStudioOpen}
        onClose={() => setIsVoiceStudioOpen(false)}
      />
    </div>
  )
}
