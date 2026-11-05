import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Check, ArrowRight, ArrowLeft, Brain, User, Layers, Palette,
  Shield, Sparkles, Cpu, Upload, Camera, Image, ShieldCheck,
  CheckCircle2, AlertCircle, RefreshCw, X,
} from 'lucide-react'
import { Button, Input, Textarea, Select, Toggle, Badge, Progress } from '@/components/ui'
import { useAuthStore, useTwinStore, useMemoryStore, useConversationStore } from '@/store'
import { AvatarStudioPreview } from '@/components/Avatar3D'
import { generateId } from '@/lib/utils'
import type { TwinSettings, Memory, Avatar } from '@/types'
import toast from 'react-hot-toast'

const STEPS = [
  { id: 1, label: 'Welcome', icon: Sparkles },
  { id: 2, label: 'Personality', icon: User },
  { id: 3, label: 'Memory', icon: Layers },
  { id: 4, label: 'Avatar', icon: Palette },
  { id: 5, label: 'Permissions', icon: Shield },
  { id: 6, label: 'Preview', icon: Brain },
]

const AVATAR_PRESETS = [
  { id: 'preset-orb-violet', name: 'Violet Orb', color: '#7c3aed', description: 'Bold and expressive' },
  { id: 'preset-orb-cyan', name: 'Cyan Orb', color: '#06b6d4', description: 'Clear and calm' },
  { id: 'preset-orb-emerald', name: 'Emerald Orb', color: '#10b981', description: 'Warm and grounded' },
  { id: 'preset-orb-amber', name: 'Amber Orb', color: '#f59e0b', description: 'Creative and energetic' },
  { id: 'preset-orb-rose', name: 'Rose Orb', color: '#ec4899', description: 'Playful and bright' },
  { id: 'preset-orb-indigo', name: 'Indigo Orb', color: '#4f46e5', description: 'Focused and analytical' },
]

const INTEREST_OPTIONS = [
  'Technology', 'Design', 'Science', 'Business', 'Music', 'Reading', 'Travel',
  'Health', 'Finance', 'Art', 'Writing', 'Gaming', 'Cooking', 'Sports', 'Philosophy',
]

export default function OnboardingPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { avatar, setSettings, setAvatar, setIsOnboarded, onboardingStep, setOnboardingStep, uploadPersonalPhoto } = useTwinStore()
  const { addMemory } = useMemoryStore()
  const { newConversation } = useConversationStore()

  const [step, setStep] = useState(onboardingStep)
  const [isTransitioning, setIsTransitioning] = useState(false)

  // Step 1: Welcome
  const [helpWith, setHelpWith] = useState<string[]>([])

  // Step 2: Personality
  const [twinName, setTwinName] = useState(user?.name ? `${user.name.split(' ')[0]} AI` : 'My Twin')
  const [twinTagline, setTwinTagline] = useState('')
  const [commStyle, setCommStyle] = useState<TwinSettings['communication_style']>('friendly')
  const [formalityLevel, setFormalityLevel] = useState<TwinSettings['formality_level']>('neutral')
  const [responseLength, setResponseLength] = useState<TwinSettings['response_length']>('balanced')
  const [language, setLanguage] = useState('English')
  const [selectedInterests, setSelectedInterests] = useState<string[]>([])
  const [goals, setGoals] = useState('')

  // Step 3: Memory
  const [memoryNotes, setMemoryNotes] = useState('')
  const [projectInfo, setProjectInfo] = useState('')
  const [writingSample, setWritingSample] = useState('')

  // Step 4: Avatar & Personal Likeness
  const [avatarMode, setAvatarMode] = useState<'personal' | 'preset'>('personal')
  const [selectedPreset, setSelectedPreset] = useState(AVATAR_PRESETS[0])
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [consentGiven, setConsentGiven] = useState(false)
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false)
  const [uploadSuccess, setUploadSuccess] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Step 5: Permissions
  const [voiceEnabled, setVoiceEnabled] = useState(false)
  const [autoMemory, setAutoMemory] = useState(true)

  // Step 6: Done
  const [isCreating, setIsCreating] = useState(false)
  const [isReady, setIsReady] = useState(false)

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type.toLowerCase())) {
      toast.error('Please select a PNG, JPG, or WebP photo')
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('Photo must be less than 10MB')
      return
    }

    setPhotoFile(file)
    const reader = new FileReader()
    reader.onload = () => {
      setPhotoPreview(reader.result as string)
      setUploadSuccess(false)
    }
    reader.readAsDataURL(file)
  }

  const handleRemovePhoto = () => {
    setPhotoFile(null)
    setPhotoPreview(null)
    setUploadSuccess(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleUploadLikeness = async () => {
    if (!photoFile) {
      toast.error('Please choose a photo first')
      return
    }
    if (!consentGiven) {
      toast.error('Please check the likeness consent box before uploading')
      return
    }

    try {
      setIsUploadingPhoto(true)
      await uploadPersonalPhoto(photoFile, consentGiven, twinName)
      setUploadSuccess(true)
      toast.success('Likeness photo uploaded and saved to your private storage!')
    } catch (err: any) {
      toast.error(err.message || 'Failed to upload photo')
    } finally {
      setIsUploadingPhoto(false)
    }
  }

  const goNext = () => {
    if (step < STEPS.length) {
      setIsTransitioning(true)
      setTimeout(() => {
        setStep((s) => s + 1)
        setOnboardingStep(step + 1)
        setIsTransitioning(false)
      }, 200)
    }
  }

  const goBack = () => {
    if (step > 1) {
      setIsTransitioning(true)
      setTimeout(() => {
        setStep((s) => s - 1)
        setIsTransitioning(false)
      }, 200)
    }
  }

  const handleFinish = async () => {
    setIsCreating(true)

    await new Promise((r) => setTimeout(r, 1500))

    // Save twin settings
    const twinSettings: TwinSettings = {
      id: generateId(),
      user_id: user?.id || 'user',
      name: twinName,
      tagline: twinTagline,
      communication_style: commStyle,
      formality_level: formalityLevel,
      preferred_language: language,
      response_length: responseLength,
      vocabulary_style: 'standard',
      interests: selectedInterests,
      goals: goals.split('\n').filter(Boolean),
      writing_samples: writingSample ? [writingSample] : [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    setSettings(twinSettings)

    // Save avatar (preserving personal photo likeness if uploaded)
    const currentAvatar = useTwinStore.getState().avatar
    const finalAvatar: Avatar = {
      id: currentAvatar?.id || generateId(),
      user_id: user?.id || 'user',
      name: twinName,
      preset_id: selectedPreset.id,
      visual_style: avatarMode === 'personal' ? 'realistic' : 'stylized',
      background_id: 'bg-deep-space',
      accent_color: selectedPreset.color,
      lighting: 'soft',
      source_image_path: currentAvatar?.source_image_path,
      generated_video_path: currentAvatar?.generated_video_path,
      thumbnail_path: currentAvatar?.thumbnail_path,
      provider: currentAvatar?.provider,
      provider_job_id: currentAvatar?.provider_job_id,
      status: currentAvatar?.status || (currentAvatar?.generated_video_path ? 'completed' : 'not_started'),
      consent_given: currentAvatar?.consent_given ?? consentGiven,
      consent_timestamp: currentAvatar?.consent_timestamp ?? (consentGiven ? new Date().toISOString() : undefined),
      created_at: currentAvatar?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    setAvatar(finalAvatar)

    // Save memories
    if (memoryNotes.trim()) {
      addMemory({
        id: generateId(),
        user_id: user?.id || 'user',
        title: 'Personal notes',
        content: memoryNotes.trim(),
        category: 'personal_preferences',
        source_reference: 'Onboarding setup',
        is_user_editable: true,
        is_archived: false,
        confidence: 1.0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    }

    if (projectInfo.trim()) {
      addMemory({
        id: generateId(),
        user_id: user?.id || 'user',
        title: 'Current projects',
        content: projectInfo.trim(),
        category: 'projects',
        source_reference: 'Onboarding setup',
        is_user_editable: true,
        is_archived: false,
        confidence: 1.0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    }

    if (selectedInterests.length > 0) {
      addMemory({
        id: generateId(),
        user_id: user?.id || 'user',
        title: 'Interests and hobbies',
        content: `Interested in: ${selectedInterests.join(', ')}`,
        category: 'interests',
        source_reference: 'Onboarding setup',
        is_user_editable: true,
        is_archived: false,
        confidence: 1.0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    }

    if (goals.trim()) {
      addMemory({
        id: generateId(),
        user_id: user?.id || 'user',
        title: 'Current goals',
        content: goals.trim(),
        category: 'goals',
        source_reference: 'Onboarding setup',
        is_user_editable: true,
        is_archived: false,
        confidence: 1.0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    }

    setIsOnboarded(true)
    setIsReady(true)
    setIsCreating(false)
  }

  const toggleInterest = (interest: string) => {
    setSelectedInterests((prev) =>
      prev.includes(interest) ? prev.filter((i) => i !== interest) : [...prev, interest]
    )
  }

  const toggleHelp = (item: string) => {
    setHelpWith((prev) =>
      prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item]
    )
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{ background: 'var(--color-background)' }}
    >
      {/* Background */}
      <div
        style={{
          position: 'fixed',
          top: '20%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 600,
          height: 600,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(124,58,237,0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      {/* Logo */}
      <div className="flex items-center gap-2 mb-8">
        <div style={{ width: 32, height: 32, borderRadius: 10, background: 'linear-gradient(135deg, #7c3aed, #06b6d4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Cpu size={16} color="white" />
        </div>
        <span className="font-bold">Another Me</span>
      </div>

      {/* Progress */}
      <div className="w-full max-w-md mb-6">
        <div className="flex items-center justify-between mb-3">
          {STEPS.map((s, i) => {
            const Icon = s.icon
            const isActive = step === s.id
            const isCompleted = step > s.id
            return (
              <div key={s.id} className="flex items-center">
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: isCompleted ? 'var(--color-violet-primary)' : isActive ? 'rgba(124,58,237,0.2)' : 'var(--color-surface-3)',
                    border: `1px solid ${isCompleted || isActive ? 'var(--color-violet-primary)' : 'var(--color-border)'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: isCompleted ? 'white' : isActive ? '#a78bfa' : 'var(--color-text-muted)',
                    transition: 'all 0.3s',
                    flexShrink: 0,
                  }}
                >
                  {isCompleted ? <Check size={12} /> : <Icon size={12} />}
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    style={{
                      height: 1,
                      width: 28,
                      background: step > s.id ? 'var(--color-violet-primary)' : 'var(--color-border)',
                      transition: 'background 0.3s',
                    }}
                  />
                )}
              </div>
            )
          })}
        </div>
        <Progress value={step} max={STEPS.length} variant="violet" size="sm" />
        <div className="text-center mt-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Step {step} of {STEPS.length} — {STEPS[step - 1].label}
        </div>
      </div>

      {/* Step content */}
      <div
        className="onboarding-step w-full"
        style={{ opacity: isTransitioning ? 0 : 1, transform: isTransitioning ? 'translateY(8px)' : 'none', transition: 'all 0.2s ease' }}
      >
        {/* Step 1: Welcome */}
        {step === 1 && (
          <div className="flex flex-col gap-6">
            <div>
              <Badge variant="violet" className="mb-3">Step 1</Badge>
              <h2 className="font-serif text-3xl font-normal text-white mb-2">
                Welcome{user?.name ? `, ${user.name.split(' ')[0]}` : ''}!
              </h2>
              <p style={{ color: 'var(--color-text-secondary)' }}>
                Let's create your personal AI digital twin. First, tell us what you'd like your twin to help with.
              </p>
            </div>
            <div>
              <p className="text-sm font-medium mb-3" style={{ color: 'var(--color-text-secondary)' }}>
                I want my twin to help me with:
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  'Planning and productivity',
                  'Writing and communication',
                  'Ideas and brainstorming',
                  'Personal organization',
                  'Research and summaries',
                  'Goal tracking',
                  'Task management',
                  'Creative projects',
                ].map((item) => (
                  <button
                    key={item}
                    onClick={() => toggleHelp(item)}
                    className="px-3 py-1.5 rounded-full text-sm transition-all"
                    style={{
                      background: helpWith.includes(item) ? 'rgba(124,58,237,0.15)' : 'var(--color-surface-2)',
                      border: `1px solid ${helpWith.includes(item) ? 'rgba(124,58,237,0.4)' : 'var(--color-border)'}`,
                      color: helpWith.includes(item) ? '#a78bfa' : 'var(--color-text-secondary)',
                    }}
                  >
                    {helpWith.includes(item) && <Check size={10} className="inline mr-1" />}
                    {item}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-xl p-4 text-sm" style={{ background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.15)' }}>
              <div className="font-semibold mb-1 text-violet-300">Your privacy matters</div>
              <p style={{ color: 'var(--color-text-secondary)' }}>
                Another Me only learns from information you explicitly share. Nothing is inferred without your knowledge. You can inspect, edit, or delete everything at any time.
              </p>
            </div>
          </div>
        )}

        {/* Step 2: Personality */}
        {step === 2 && (
          <div className="flex flex-col gap-5">
            <div>
              <Badge variant="violet" className="mb-3">Step 2</Badge>
              <h2 className="font-serif text-3xl font-normal text-white mb-2">Configure your twin's personality</h2>
              <p style={{ color: 'var(--color-text-secondary)' }}>
                Set how your twin communicates. These settings influence tone, style, and response format.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Twin name"
                id="twin-name"
                value={twinName}
                onChange={(e) => setTwinName(e.target.value)}
                placeholder="e.g. My AI Twin"
              />
              <Input
                label="Tagline (optional)"
                id="twin-tagline"
                value={twinTagline}
                onChange={(e) => setTwinTagline(e.target.value)}
                placeholder="Curious mind, builder of ideas"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="Communication style"
                id="comm-style"
                value={commStyle}
                onChange={(e) => setCommStyle(e.target.value as TwinSettings['communication_style'])}
                options={[
                  { value: 'friendly', label: 'Friendly & warm' },
                  { value: 'professional', label: 'Professional' },
                  { value: 'casual', label: 'Casual & relaxed' },
                  { value: 'concise', label: 'Concise & direct' },
                ]}
              />
              <Select
                label="Formality level"
                id="formality"
                value={formalityLevel}
                onChange={(e) => setFormalityLevel(e.target.value as TwinSettings['formality_level'])}
                options={[
                  { value: 'informal', label: 'Informal' },
                  { value: 'neutral', label: 'Neutral' },
                  { value: 'formal', label: 'Formal' },
                ]}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="Response length"
                id="response-length"
                value={responseLength}
                onChange={(e) => setResponseLength(e.target.value as TwinSettings['response_length'])}
                options={[
                  { value: 'brief', label: 'Brief & to the point' },
                  { value: 'balanced', label: 'Balanced' },
                  { value: 'detailed', label: 'Detailed & thorough' },
                ]}
              />
              <Select
                label="Preferred language"
                id="language"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                options={[
                  { value: 'English', label: 'English' },
                  { value: 'Spanish', label: 'Spanish' },
                  { value: 'French', label: 'French' },
                  { value: 'German', label: 'German' },
                  { value: 'Portuguese', label: 'Portuguese' },
                  { value: 'Arabic', label: 'Arabic' },
                  { value: 'Hindi', label: 'Hindi' },
                  { value: 'Japanese', label: 'Japanese' },
                  { value: 'Mandarin', label: 'Mandarin' },
                ]}
              />
            </div>

            <div>
              <p className="text-sm font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                Interests (select all that apply)
              </p>
              <div className="flex flex-wrap gap-2">
                {INTEREST_OPTIONS.map((interest) => (
                  <button
                    key={interest}
                    onClick={() => toggleInterest(interest)}
                    className="px-3 py-1 rounded-full text-xs transition-all"
                    style={{
                      background: selectedInterests.includes(interest) ? 'rgba(124,58,237,0.15)' : 'var(--color-surface-2)',
                      border: `1px solid ${selectedInterests.includes(interest) ? 'rgba(124,58,237,0.4)' : 'var(--color-border)'}`,
                      color: selectedInterests.includes(interest) ? '#a78bfa' : 'var(--color-text-secondary)',
                    }}
                  >
                    {interest}
                  </button>
                ))}
              </div>
            </div>

            <Textarea
              label="Current goals (one per line)"
              id="goals"
              value={goals}
              onChange={(e) => setGoals(e.target.value)}
              placeholder="Learn to play guitar&#10;Read 20 books this year&#10;Launch my side project"
              style={{ minHeight: 80 }}
            />
          </div>
        )}

        {/* Step 3: Memory */}
        {step === 3 && (
          <div className="flex flex-col gap-5">
            <div>
              <Badge variant="violet" className="mb-3">Step 3</Badge>
              <h2 className="font-serif text-3xl font-normal text-white mb-2">Seed your twin's memory</h2>
              <p style={{ color: 'var(--color-text-secondary)' }}>
                Share optional context to help your twin understand you better. You can add, edit, or delete this later.
              </p>
            </div>

            <div className="rounded-xl p-4 text-sm" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}>
              <div className="font-semibold mb-1" style={{ color: '#34d399' }}>What gets stored?</div>
              <p style={{ color: 'var(--color-text-secondary)' }}>
                Only the text you enter below. Nothing else is processed or inferred. These become searchable memories your twin references during conversations.
              </p>
            </div>

            <Textarea
              label="Personal notes and preferences (optional)"
              id="memory-notes"
              value={memoryNotes}
              onChange={(e) => setMemoryNotes(e.target.value)}
              placeholder="E.g. I prefer direct communication. I work best in the mornings. I like getting to the point without excessive pleasantries."
              style={{ minHeight: 100 }}
            />

            <Textarea
              label="Current projects (optional)"
              id="project-info"
              value={projectInfo}
              onChange={(e) => setProjectInfo(e.target.value)}
              placeholder="E.g. I'm building a SaaS product for freelancers using React and Supabase. Currently in beta testing."
              style={{ minHeight: 80 }}
            />

            <Textarea
              label="Writing sample (optional)"
              id="writing-sample"
              value={writingSample}
              onChange={(e) => setWritingSample(e.target.value)}
              placeholder="Paste a paragraph of your writing to help your twin understand your voice and style..."
              style={{ minHeight: 80 }}
            />

            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              All fields are optional. Your twin works best when it has relevant context, but it won't assume facts about you that you haven't provided.
            </p>
          </div>
        )}

        {/* Step 4: Avatar & Personal Digital Twin */}
        {step === 4 && (
          <div className="flex flex-col gap-6">
            <div>
              <Badge variant="violet" className="mb-3">Step 4</Badge>
              <h2 className="font-serif text-3xl font-normal text-white mb-2">Create your personal digital twin</h2>
              <p style={{ color: 'var(--color-text-secondary)' }}>
                Upload a photo to generate your real personal AI twin, or choose an abstract 3D orb.
              </p>
            </div>

            {/* Mode Switcher */}
            <div className="flex p-1 rounded-xl bg-[#201f1c] border border-[#35332d] max-w-md">
              <button
                type="button"
                onClick={() => setAvatarMode('personal')}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  avatarMode === 'personal'
                    ? 'bg-[#da7756] text-[#181816] font-semibold shadow'
                    : 'text-[#b5b1a8] hover:text-[#edebe8]'
                }`}
              >
                <Camera size={14} />
                Personal Photo Twin (Recommended)
              </button>
              <button
                type="button"
                onClick={() => setAvatarMode('preset')}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  avatarMode === 'preset'
                    ? 'bg-[#da7756] text-[#181816] font-semibold shadow'
                    : 'text-[#b5b1a8] hover:text-[#edebe8]'
                }`}
              >
                <Palette size={14} />
                3D Stylized Orb
              </button>
            </div>

            {avatarMode === 'personal' ? (
              <div className="space-y-5 bg-[#201f1c] border border-[#35332d] rounded-2xl p-5 sm:p-6">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  onChange={handlePhotoSelect}
                  className="hidden"
                  id="onboarding-avatar-file"
                />

                {!photoPreview ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault()
                      const file = e.dataTransfer.files?.[0]
                      if (file) {
                        const fakeEvent = { target: { files: [file] } } as any
                        handlePhotoSelect(fakeEvent)
                      }
                    }}
                    className="border-2 border-dashed border-[#45423b] hover:border-[#da7756] rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all bg-[#181816]/60 group"
                  >
                    <div className="w-14 h-14 rounded-2xl bg-[#da7756]/15 text-[#da7756] flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                      <Upload size={24} />
                    </div>
                    <div className="font-serif text-base text-[#edebe8] mb-1">
                      Drop your facial photo here or <span className="text-[#da7756] underline">browse</span>
                    </div>
                    <p className="text-xs text-[#7d7a73] max-w-sm mb-3">
                      Upload a clear, front-facing portrait of yourself. Supports PNG, JPG, or WebP up to 10 MB.
                    </p>
                    <div className="flex items-center gap-2 text-[11px] text-[#b5b1a8] font-mono bg-[#282622] px-3 py-1 rounded-full border border-[#35332d]">
                      <ShieldCheck size={13} className="text-[#da7756]" />
                      Uploaded to your private, isolated account storage
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 p-4 rounded-xl bg-[#181816] border border-[#35332d]">
                      <div className="w-32 h-32 sm:w-36 sm:h-36 rounded-2xl overflow-hidden border-2 border-[#da7756]/60 shadow-xl shrink-0 relative group">
                        <img
                          src={photoPreview}
                          alt="Twin Preview"
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="p-1.5 rounded-full bg-white text-[#181816] hover:scale-110 transition-transform"
                            title="Replace photo"
                          >
                            <RefreshCw size={14} />
                          </button>
                        </div>
                      </div>

                      <div className="flex-1 space-y-2 text-center sm:text-left">
                        <div className="flex items-center justify-center sm:justify-start gap-2">
                          <span className="font-semibold text-sm text-[#edebe8]">{photoFile?.name}</span>
                          <span className="text-[10px] font-mono text-[#7d7a73]">
                            ({((photoFile?.size || 0) / 1024).toFixed(0)} KB)
                          </span>
                        </div>
                        <p className="text-xs text-[#b5b1a8]">
                          High quality face portrait detected. This likeness will be used to generate your talking-head avatar.
                        </p>
                        <div className="pt-2 flex flex-wrap items-center justify-center sm:justify-start gap-2">
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="px-3 py-1.5 rounded-lg text-xs bg-[#282622] hover:bg-[#35332d] text-[#edebe8] border border-[#35332d] flex items-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <RefreshCw size={13} /> Replace Photo
                          </button>
                          <button
                            type="button"
                            onClick={handleRemovePhoto}
                            className="px-3 py-1.5 rounded-lg text-xs bg-red-950/30 hover:bg-red-900/40 text-red-400 border border-red-900/50 flex items-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <X size={13} /> Remove
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Likeness Consent Checkbox */}
                    <label className="flex items-start gap-3 p-3.5 rounded-xl bg-[#282622] border border-[#35332d] cursor-pointer hover:border-[#45423b] transition-colors">
                      <input
                        type="checkbox"
                        checked={consentGiven}
                        onChange={(e) => setConsentGiven(e.target.checked)}
                        className="mt-1 rounded accent-[#da7756] cursor-pointer"
                      />
                      <div className="text-xs leading-relaxed text-[#b5b1a8]">
                        <span className="font-semibold text-[#edebe8] block mb-0.5">
                          Likeness and Media Processing Consent
                        </span>
                        I explicitly consent to Another Me processing my facial photo to generate an animated personal AI twin avatar. I understand my image is stored privately in my account and will not be shared publicly.
                      </div>
                    </label>

                    {/* Upload / Save Action Button */}
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs text-[#7d7a73] font-mono">
                        {uploadSuccess ? '✓ Photo saved to private storage' : 'Save photo to proceed with likeness'}
                      </span>
                      <button
                        type="button"
                        onClick={handleUploadLikeness}
                        disabled={isUploadingPhoto || !consentGiven || uploadSuccess}
                        className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#da7756] hover:bg-[#e28a6c] disabled:opacity-40 text-[#181816] flex items-center gap-2 transition-all cursor-pointer shadow-md"
                      >
                        {isUploadingPhoto ? (
                          <>
                            <div className="w-3.5 h-3.5 border-2 border-[#181816] border-t-transparent rounded-full animate-spin" />
                            Uploading Photo...
                          </>
                        ) : uploadSuccess ? (
                          <>
                            <CheckCircle2 size={14} /> Photo Saved
                          </>
                        ) : (
                          <>
                            <Camera size={14} /> Save Likeness Photo
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col lg:flex-row gap-6">
                {/* Presets */}
                <div className="flex-1">
                  <p className="text-sm font-medium mb-3" style={{ color: 'var(--color-text-secondary)' }}>Select a preset:</p>
                  <div className="grid grid-cols-2 gap-3">
                    {AVATAR_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setSelectedPreset(preset)}
                        className="p-3 rounded-xl text-left transition-all cursor-pointer"
                        style={{
                          background: selectedPreset.id === preset.id ? 'rgba(124,58,237,0.1)' : 'var(--color-surface-2)',
                          border: `1px solid ${selectedPreset.id === preset.id ? preset.color + '60' : 'var(--color-border)'}`,
                          boxShadow: selectedPreset.id === preset.id ? `0 0 20px ${preset.color}20` : 'none',
                        }}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <div style={{ width: 20, height: 20, borderRadius: '50%', background: `radial-gradient(circle at 35% 35%, ${preset.color}ee, ${preset.color}88)`, boxShadow: `0 0 8px ${preset.color}60` }} />
                          <span className="text-sm font-medium">{preset.name}</span>
                          {selectedPreset.id === preset.id && <Check size={12} style={{ color: '#a78bfa', marginLeft: 'auto' }} />}
                        </div>
                        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{preset.description}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Preview */}
                <div className="flex flex-col items-center gap-3">
                  <div style={{ width: 180, height: 180 }}>
                    <AvatarStudioPreview state="idle" accentColor={selectedPreset.color} background="#141417" />
                  </div>
                  <div className="text-center">
                    <div className="font-semibold text-sm">{twinName}</div>
                    <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{selectedPreset.name} style</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 5: Permissions */}
        {step === 5 && (
          <div className="flex flex-col gap-6">
            <div>
              <Badge variant="violet" className="mb-3">Step 5</Badge>
              <h2 className="font-serif text-3xl font-normal text-white mb-2">Set your permissions</h2>
              <p style={{ color: 'var(--color-text-secondary)' }}>
                Control what capabilities your twin has access to. You can change these anytime in Privacy & Security.
              </p>
            </div>

            <div className="flex flex-col gap-4">
              <div className="p-4 rounded-xl" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
                <Toggle
                  id="perm-core"
                  checked={true}
                  onChange={() => {}}
                  disabled={true}
                  label="Core twin features"
                  description="Text conversations, memory retrieval, and personality configuration. Required and always on."
                />
              </div>

              <div className="p-4 rounded-xl" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
                <Toggle
                  id="perm-memory"
                  checked={autoMemory}
                  onChange={setAutoMemory}
                  label="Memory suggestions"
                  description="Allow your twin to suggest new memories based on conversations. You approve each one before it's saved."
                />
              </div>

              <div className="p-4 rounded-xl" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
                <Toggle
                  id="perm-voice"
                  checked={voiceEnabled}
                  onChange={setVoiceEnabled}
                  label="Voice processing"
                  description="Enable speech-to-text for voice input and text-to-speech for audio responses. Requires microphone access."
                />
              </div>

              <div className="p-4 rounded-xl" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
                <Toggle
                  id="perm-actions"
                  checked={true}
                  onChange={() => {}}
                  disabled={true}
                  label="Basic actions (always explicit)"
                  description="Your twin can create reminders and draft messages, but will always ask for your confirmation first."
                />
              </div>
            </div>

            <div className="rounded-xl p-4 text-sm" style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)' }}>
              <p style={{ color: 'var(--color-text-secondary)' }}>
                <strong className="text-blue-300">Important:</strong> Your twin will never access external services, send messages on your behalf, or take consequential actions without your explicit approval for each specific action.
              </p>
            </div>
          </div>
        )}

        {/* Step 6: Preview */}
        {step === 6 && (
          <div className="flex flex-col gap-6 items-center text-center">
            {!isReady ? (
              <>
                <div>
                  <Badge variant="violet" className="mb-3">Step 6</Badge>
                  <h2 className="font-serif text-3xl font-normal text-white mb-2">Your twin is ready!</h2>
                  <p style={{ color: 'var(--color-text-secondary)' }}>
                    Review your setup below, then launch your first conversation.
                  </p>
                </div>

                {/* Twin card */}
                <div
                  className="w-full rounded-2xl p-6 text-left"
                  style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}
                >
                  <div className="flex items-center gap-4 mb-4">
                    <div style={{ width: 64, height: 64 }} className="rounded-2xl overflow-hidden shrink-0 border border-[#35332d] shadow-md bg-[#181816]">
                      {photoPreview || avatar?.source_image_path ? (
                        <img
                          src={photoPreview || `/api/avatar/media?type=photo&userId=${encodeURIComponent(user?.id || 'user')}`}
                          alt="Twin Likeness"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <AvatarStudioPreview state="idle" accentColor={selectedPreset.color} background="#1a1a1f" />
                      )}
                    </div>
                    <div>
                      <div className="text-lg font-bold flex items-center gap-2">
                        {twinName}
                        {(photoPreview || avatar?.source_image_path) && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#da7756]/20 text-[#da7756] border border-[#da7756]/40 font-mono">
                            Personal AI Twin
                          </span>
                        )}
                      </div>
                      <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{twinTagline || 'Your personal digital twin'}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span style={{ color: 'var(--color-text-muted)' }}>Style: </span>
                      <span className="capitalize">{commStyle}</span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--color-text-muted)' }}>Formality: </span>
                      <span className="capitalize">{formalityLevel}</span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--color-text-muted)' }}>Language: </span>
                      <span>{language}</span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--color-text-muted)' }}>Interests: </span>
                      <span>{selectedInterests.length} selected</span>
                    </div>
                  </div>

                  {[memoryNotes, projectInfo, goals].filter(Boolean).length > 0 && (
                    <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
                      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        {[memoryNotes, projectInfo, goals].filter(Boolean).length} memory {[memoryNotes, projectInfo, goals].filter(Boolean).length === 1 ? 'entry' : 'entries'} will be saved
                      </span>
                    </div>
                  )}
                </div>

                {isCreating ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
                    <p style={{ color: 'var(--color-text-secondary)' }}>Creating your twin...</p>
                  </div>
                ) : (
                  <Button
                    variant="primary"
                    size="xl"
                    onClick={handleFinish}
                    rightIcon={<Sparkles size={18} />}
                    className="w-full"
                  >
                    Launch My Twin
                  </Button>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center gap-6 py-4">
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: '50%',
                    background: 'rgba(16,185,129,0.15)',
                    border: '2px solid rgba(16,185,129,0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  className="animate-fade-in-scale"
                >
                  <Check size={28} style={{ color: '#10b981' }} />
                </div>
                <div>
                  <h2 className="text-2xl font-bold mb-2">{twinName} is live! 🎉</h2>
                  <p style={{ color: 'var(--color-text-secondary)' }}>
                    Your digital twin is ready. Start your first conversation.
                  </p>
                </div>
                <Button
                  variant="primary"
                  size="xl"
                  rightIcon={<ArrowRight size={18} />}
                  onClick={() => navigate('/app/twin')}
                >
                  Start Talking with {twinName}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        {!isReady && (
          <div className="flex items-center justify-between mt-6 pt-6" style={{ borderTop: '1px solid var(--color-border)' }}>
            <Button
              variant="ghost"
              onClick={goBack}
              disabled={step === 1}
              leftIcon={<ArrowLeft size={16} />}
            >
              Back
            </Button>

            {step < 6 && (
              <Button
                variant="primary"
                onClick={goNext}
                rightIcon={<ArrowRight size={16} />}
                disabled={step === 2 && !twinName.trim()}
              >
                Continue
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
