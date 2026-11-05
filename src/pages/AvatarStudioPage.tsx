import React, { useState } from 'react'
import {
  Save, RotateCcw, Zap, Brain, Sun, Moon, Camera,
  Upload, Sparkles, CheckCircle2, ShieldCheck, AlertCircle, Play, Smile,
} from 'lucide-react'
import { Button, Badge } from '@/components/ui'
import { useTwinStore, useAuthStore } from '@/store'
import { AvatarStudioPreview } from '@/components/Avatar3D'
import { PersonalTwinUploadModal } from '@/components/PersonalTwinUploadModal'
import type { Avatar } from '@/types'
import { generateId, cn } from '@/lib/utils'
import toast from 'react-hot-toast'

type AvatarState = 'idle' | 'listening' | 'speaking' | 'thinking'

const PRESETS = [
  { id: 'preset-orb-violet', name: 'Violet Orb', color: '#7c3aed', description: 'Bold and expressive' },
  { id: 'preset-orb-cyan', name: 'Cyan Orb', color: '#06b6d4', description: 'Clear and calm' },
  { id: 'preset-orb-emerald', name: 'Emerald Orb', color: '#10b981', description: 'Warm and grounded' },
  { id: 'preset-orb-amber', name: 'Amber Orb', color: '#f59e0b', description: 'Creative and energetic' },
  { id: 'preset-orb-rose', name: 'Rose Orb', color: '#ec4899', description: 'Playful and bright' },
  { id: 'preset-orb-indigo', name: 'Indigo Orb', color: '#4f46e5', description: 'Focused and analytical' },
  { id: 'preset-orb-teal', name: 'Teal Orb', color: '#14b8a6', description: 'Balanced and clear' },
  { id: 'preset-orb-orange', name: 'Orange Orb', color: '#f97316', description: 'Dynamic and bold' },
]

const BACKGROUNDS = [
  { id: 'bg-deep-space', name: 'Deep Space', color: '#0d0d0f' },
  { id: 'bg-dark-navy', name: 'Dark Navy', color: '#0f1629' },
  { id: 'bg-charcoal', name: 'Charcoal', color: '#1a1a1f' },
  { id: 'bg-forest', name: 'Forest Night', color: '#0d1a0f' },
  { id: 'bg-cosmic', name: 'Cosmic', color: '#110d1a' },
  { id: 'bg-ocean', name: 'Deep Ocean', color: '#0d1520' },
]

const CUSTOM_COLORS = [
  '#7c3aed', '#06b6d4', '#10b981', '#f59e0b', '#ec4899',
  '#4f46e5', '#14b8a6', '#f97316', '#ef4444', '#8b5cf6',
]

export default function AvatarStudioPage() {
  const { user } = useAuthStore()
  const { avatar, settings, setAvatar, deletePersonalTwin } = useTwinStore()

  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
  const [selectedPreset, setSelectedPreset] = useState(
    PRESETS.find((p) => p.id === avatar?.preset_id) || PRESETS[0]
  )
  const [selectedBg, setSelectedBg] = useState(
    BACKGROUNDS.find((b) => b.id === avatar?.background_id) || BACKGROUNDS[0]
  )
  const [customColor, setCustomColor] = useState(avatar?.accent_color || selectedPreset.color)
  const [useCustomColor, setUseCustomColor] = useState(false)
  const [avatarType, setAvatarType] = useState<'animated_character' | '3d_orb'>(
    avatar?.avatar_type === '3d_orb' ? '3d_orb' : 'animated_character'
  )
  const [avatarState, setAvatarState] = useState<AvatarState>('idle')
  const [isSaving, setIsSaving] = useState(false)
  const [isDirty, setIsDirty] = useState(false)

  const accentColor = useCustomColor ? customColor : selectedPreset.color

  const handlePresetSelect = (preset: typeof PRESETS[0]) => {
    setSelectedPreset(preset)
    setUseCustomColor(false)
    setIsDirty(true)
  }

  const handleSave = async () => {
    setIsSaving(true)
    await new Promise((r) => setTimeout(r, 800))

    const updatedAvatar: Avatar = {
      id: avatar?.id || generateId(),
      user_id: user?.id || avatar?.user_id || 'user',
      name: settings?.name || 'My Twin',
      preset_id: selectedPreset.id,
      visual_style: avatar?.source_image_path ? 'realistic' : 'stylized',
      background_id: selectedBg.id,
      accent_color: accentColor,
      lighting: 'soft',
      source_image_path: avatar?.source_image_path,
      generated_video_path: avatar?.generated_video_path,
      thumbnail_path: avatar?.thumbnail_path,
      provider: avatar?.provider,
      provider_job_id: avatar?.provider_job_id,
      consent_given: avatar?.consent_given,
      consent_timestamp: avatar?.consent_timestamp,
      avatar_type: avatarType,
      created_at: avatar?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    setAvatar(updatedAvatar)
    setIsSaving(false)
    setIsDirty(false)
    toast.success('Avatar settings saved')
  }

  const handleReset = () => {
    const original = PRESETS.find((p) => p.id === avatar?.preset_id) || PRESETS[0]
    setSelectedPreset(original)
    setSelectedBg(BACKGROUNDS.find((b) => b.id === avatar?.background_id) || BACKGROUNDS[0])
    setCustomColor(avatar?.accent_color || original.color)
    setUseCustomColor(false)
    setAvatarType(avatar?.avatar_type === '3d_orb' ? '3d_orb' : 'animated_character')
    setIsDirty(false)
    toast('Avatar reset to saved settings')
  }

  const handleClearPersonalLikeness = async () => {
    if (!user?.id) return
    if (confirm('Are you sure you want to remove your personal photo likeness and revert to the 3D orb?')) {
      await deletePersonalTwin()
      toast.success('Reverted to 3D dynamic orb')
    }
  }

  return (
    <div className="flex h-full overflow-hidden" style={{ background: 'var(--color-background)' }}>
      {/* Controls */}
      <div className="flex-1 overflow-y-auto p-6 md:p-8">
        <div className="max-w-4xl mx-auto flex flex-col gap-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Avatar Studio</h2>
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                Customize the visual identity of your personal digital twin.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isDirty && (
                <Button variant="ghost" size="sm" leftIcon={<RotateCcw size={14} />} onClick={handleReset}>
                  Reset
                </Button>
              )}
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Save size={14} />}
                isLoading={isSaving}
                onClick={handleSave}
                disabled={!isDirty}
              >
                Save avatar
              </Button>
            </div>
          </div>

          {/* 1. PERSONAL AI DIGITAL TWIN LIKENESS SECTION */}
          <section className="p-5 sm:p-6 rounded-2xl bg-[#201f1c] border border-[#35332d] shadow-lg">
            <div className="flex items-center justify-between gap-4 mb-4 pb-4 border-b border-[#35332d]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#da7756]/15 border border-[#da7756]/40 flex items-center justify-center text-[#da7756]">
                  <Camera size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[#edebe8] flex items-center gap-2">
                    Personal AI Digital Twin Likeness
                    {avatar?.generated_video_path ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-mono">
                        Active Twin Video
                      </span>
                    ) : avatar?.source_image_path ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 font-mono">
                        Photo Uploaded
                      </span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#7d7a73]/20 text-[#7d7a73] font-mono">
                        Not Created Yet
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-[#7d7a73] mt-0.5">
                    Generate an animated talking avatar of your own face powered by D-ID or Replicate.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsUploadModalOpen(true)}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-[#da7756] hover:bg-[#e28a6c] text-[#181816] flex items-center gap-1.5 transition-all shadow cursor-pointer shrink-0"
              >
                <Camera size={14} />
                {avatar?.source_image_path ? 'Regenerate Twin' : 'Create My Twin'}
              </button>
            </div>

            {avatar?.source_image_path ? (
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 p-4 rounded-xl bg-[#181816] border border-[#35332d]">
                <div className="w-24 h-24 rounded-2xl overflow-hidden border-2 border-[#da7756]/50 shrink-0 bg-[#282622] relative">
                  <img
                    src={`/api/avatar/media?type=photo&userId=${encodeURIComponent(user?.id || 'user')}`}
                    alt="Facial Likeness"
                    className="w-full h-full object-cover"
                  />
                  {avatar.generated_video_path && (
                    <div className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow">
                      <CheckCircle2 size={12} />
                    </div>
                  )}
                </div>

                <div className="flex-1 space-y-1.5 text-center sm:text-left">
                  <div className="text-xs font-medium text-[#edebe8] flex items-center justify-center sm:justify-start gap-2">
                    <span>Provider: <strong className="font-mono text-[#da7756] uppercase">{avatar.provider || 'D-ID'}</strong></span>
                    <span className="text-[#7d7a73]">•</span>
                    <span>Status: <strong className="font-mono capitalize text-emerald-400">{avatar.status || 'Ready'}</strong></span>
                  </div>
                  <p className="text-xs text-[#b5b1a8]">
                    Your personal likeness is securely saved in private storage. Your talking-head avatar displays in the <strong className="text-[#edebe8]">Your Twin</strong> voice workspace.
                  </p>
                  <div className="pt-2 flex items-center justify-center sm:justify-start gap-2">
                    <button
                      type="button"
                      onClick={() => setIsUploadModalOpen(true)}
                      className="px-3 py-1 rounded-lg text-xs bg-[#282622] hover:bg-[#35332d] text-[#edebe8] border border-[#35332d] flex items-center gap-1.5 cursor-pointer"
                    >
                      <Upload size={12} /> Change Photo / Regenerate
                    </button>
                    <button
                      type="button"
                      onClick={handleClearPersonalLikeness}
                      className="px-3 py-1 rounded-lg text-xs bg-red-950/20 hover:bg-red-900/40 text-red-400 border border-red-900/40 cursor-pointer"
                    >
                      Revert to 3D Orb
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-[#181816] border border-[#35332d] flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-xs text-[#b5b1a8] leading-relaxed">
                  You are currently using an abstract 3D orb. Upload a photo of your face to generate a realistic AI digital twin video that speaks with natural expressions in Your Twin.
                </div>
                <button
                  type="button"
                  onClick={() => setIsUploadModalOpen(true)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#da7756] hover:bg-[#e28a6c] text-[#181816] flex items-center gap-2 cursor-pointer shrink-0 shadow"
                >
                  <Camera size={14} /> Upload Photo & Create Twin
                </button>
              </div>
            )}
          </section>

          {/* 2. AVATAR PRESENTATION ENGINE SELECTOR */}
          <section className="p-5 sm:p-6 rounded-2xl bg-[#201f1c] border border-[#35332d] shadow-lg">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-[#da7756] mb-2 font-mono">
              Presentation Engine
            </h3>
            <p className="text-xs text-[#b5b1a8] mb-4">
              Select how your digital twin presents itself during voice interactions and conversations.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <button
                type="button"
                onClick={() => {
                  setAvatarType('animated_character')
                  setIsDirty(true)
                }}
                className={cn(
                  "p-4 rounded-xl text-left transition-all border cursor-pointer relative",
                  avatarType === 'animated_character'
                    ? "bg-[#da7756]/15 border-[#da7756] shadow-[0_0_20px_rgba(218,119,86,0.2)]"
                    : "bg-[#181816] border-[#35332d] hover:border-[#da7756]/40"
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-[#da7756]/20 text-[#da7756] flex items-center justify-center font-bold">
                      <Smile size={18} />
                    </div>
                    <span className="text-sm font-semibold text-[#edebe8]">Animated Twin</span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#da7756]/20 text-[#da7756] border border-[#da7756]/30 uppercase">
                    Talking Vector
                  </span>
                </div>
                <p className="text-xs text-[#b5b1a8] leading-relaxed">
                  Smooth 60fps illustrated avatar with active lip-syncing mouth movements, glasses, and natural blinking.
                </p>
                {avatarType === 'animated_character' && (
                  <div className="absolute top-2 right-2 text-[#da7756]">
                    <CheckCircle2 size={16} />
                  </div>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setAvatarType('3d_orb')
                  setIsDirty(true)
                }}
                className={cn(
                  "p-4 rounded-xl text-left transition-all border cursor-pointer relative",
                  avatarType === '3d_orb'
                    ? "bg-[#7c3aed]/15 border-[#7c3aed] shadow-[0_0_20px_rgba(124,58,237,0.2)]"
                    : "bg-[#181816] border-[#35332d] hover:border-[#7c3aed]/40"
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-[#7c3aed]/20 text-[#a78bfa] flex items-center justify-center font-bold">
                      <Sparkles size={18} />
                    </div>
                    <span className="text-sm font-semibold text-[#edebe8]">3D Dynamic Orb</span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#7c3aed]/20 text-[#a78bfa] border border-[#7c3aed]/30 uppercase">
                    WebGL 3D
                  </span>
                </div>
                <p className="text-xs text-[#b5b1a8] leading-relaxed">
                  Interactive Three.js humanoid sphere core with pulsating soundwave halos and floating orbital particles.
                </p>
                {avatarType === '3d_orb' && (
                  <div className="absolute top-2 right-2 text-[#a78bfa]">
                    <CheckCircle2 size={16} />
                  </div>
                )}
              </button>
            </div>
          </section>

          {/* Avatar presets */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: 'var(--color-text-muted)' }}>
              Color Preset & Ambient Accent
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handlePresetSelect(preset)}
                  className="p-3 rounded-xl text-left transition-all"
                  style={{
                    background: selectedPreset.id === preset.id && !useCustomColor ? 'rgba(124,58,237,0.1)' : 'var(--color-surface-2)',
                    border: `1px solid ${selectedPreset.id === preset.id && !useCustomColor ? preset.color + '60' : 'var(--color-border)'}`,
                    boxShadow: selectedPreset.id === preset.id && !useCustomColor ? `0 0 20px ${preset.color}15` : 'none',
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      background: `radial-gradient(circle at 35% 35%, ${preset.color}ee, ${preset.color}88)`,
                      boxShadow: `0 0 10px ${preset.color}60`,
                      marginBottom: 8,
                    }}
                  />
                  <div className="text-xs font-medium">{preset.name}</div>
                  <div className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{preset.description}</div>
                </button>
              ))}
            </div>
          </section>

          {/* Custom color */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: 'var(--color-text-muted)' }}>
              Custom Accent Color
            </h3>
            <div className="flex flex-wrap gap-2 mb-3">
              {CUSTOM_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => { setCustomColor(color); setUseCustomColor(true); setIsDirty(true) }}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: color,
                    border: `2px solid ${useCustomColor && customColor === color ? 'white' : 'transparent'}`,
                    boxShadow: useCustomColor && customColor === color ? `0 0 12px ${color}80` : 'none',
                    transition: 'all 0.15s',
                    cursor: 'pointer',
                  }}
                />
              ))}

              {/* Color picker */}
              <label
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  border: '2px dashed var(--color-border)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 16,
                }}
                title="Custom color"
              >
                +
                <input
                  type="color"
                  value={customColor}
                  onChange={(e) => { setCustomColor(e.target.value); setUseCustomColor(true); setIsDirty(true) }}
                  style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
                />
              </label>
            </div>
            {useCustomColor && (
              <Badge variant="violet" className="text-xs">
                Custom: {customColor}
              </Badge>
            )}
          </section>

          {/* Background */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: 'var(--color-text-muted)' }}>
              Background
            </h3>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {BACKGROUNDS.map((bg) => (
                <button
                  key={bg.id}
                  onClick={() => { setSelectedBg(bg); setIsDirty(true) }}
                  className="flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all"
                  style={{
                    background: selectedBg.id === bg.id ? 'rgba(124,58,237,0.1)' : 'var(--color-surface-2)',
                    border: `1px solid ${selectedBg.id === bg.id ? 'rgba(124,58,237,0.4)' : 'var(--color-border)'}`,
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: bg.color,
                      border: '1px solid rgba(255,255,255,0.05)',
                    }}
                  />
                  <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{bg.name}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Animation state preview */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: 'var(--color-text-muted)' }}>
              Preview States
            </h3>
            <div className="flex gap-2 flex-wrap">
              {(['idle', 'listening', 'speaking', 'thinking'] as AvatarState[]).map((state) => (
                <button
                  key={state}
                  onClick={() => setAvatarState(state)}
                  className="btn btn-secondary btn-sm capitalize"
                  style={{
                    borderColor: avatarState === state ? accentColor + '60' : undefined,
                    background: avatarState === state ? accentColor + '15' : undefined,
                    color: avatarState === state ? '#a78bfa' : undefined,
                  }}
                >
                  {state}
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* Live preview */}
      <div
        className="hidden lg:flex flex-col items-center justify-center gap-6 w-80 xl:w-96 shrink-0 border-l p-6 xl:p-8"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
      >
        <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>
          LIVE PREVIEW
        </div>

        <div
          className="w-full rounded-2xl overflow-hidden"
          style={{
            background: selectedBg.color,
            aspectRatio: '1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AvatarStudioPreview
            state={avatarState}
            accentColor={accentColor}
            background={selectedBg.color}
            avatarType={avatarType}
          />
        </div>

        <div className="text-center">
          <div className="font-semibold">{settings?.name || 'My Twin'}</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
            {avatarType === 'animated_character' ? 'Animated Twin Character' : selectedPreset.name} · {selectedBg.name}
          </div>
        </div>

        <div className="w-full flex flex-col gap-2 text-sm">
          <div className="flex items-center justify-between">
            <span style={{ color: 'var(--color-text-muted)' }}>Accent color</span>
            <div className="flex items-center gap-2">
              <div style={{ width: 14, height: 14, borderRadius: '50%', background: accentColor }} />
              <span className="text-xs font-mono">{accentColor}</span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span style={{ color: 'var(--color-text-muted)' }}>State</span>
            <Badge variant={avatarState === 'speaking' ? 'success' : avatarState === 'listening' ? 'violet' : 'muted'} className="capitalize">
              {avatarState}
            </Badge>
          </div>
        </div>

        <div className="text-xs p-3 rounded-xl w-full" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}>
          Click the state buttons to preview how your twin looks during conversations.
        </div>
      </div>

      {/* Personal Twin Likeness Upload / Generation Modal */}
      <PersonalTwinUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
      />
    </div>
  )
}
