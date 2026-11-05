import { useState } from 'react'
import {
  User, MessageCircle, BarChart, Globe, Type, Tag, Target,
  Save, RotateCcw, Eye, ChevronRight, Volume2,
} from 'lucide-react'
import { Button, Input, Textarea, Select, Badge, Toggle, Progress, Card } from '@/components/ui'
import { useTwinStore, useAuthStore } from '@/store'
import type { TwinSettings } from '@/types'
import { getVoiceById } from '@/lib/voice'
import { VoiceStudioModal } from '@/components/VoiceStudioModal'
import toast from 'react-hot-toast'

const INTEREST_OPTIONS = [
  'Technology', 'Design', 'Science', 'Business', 'Music', 'Reading', 'Travel',
  'Health', 'Finance', 'Art', 'Writing', 'Gaming', 'Cooking', 'Sports',
  'Philosophy', 'Psychology', 'History', 'Environment', 'Education',
]

// Response preview based on settings
function ResponsePreview({ settings }: { settings: Partial<TwinSettings> }) {
  const style = settings.communication_style || 'friendly'
  const length = settings.response_length || 'balanced'

  const previews: Record<string, string> = {
    friendly_brief: "Great question! Short answer: yes, absolutely. Let me know if you want more detail.",
    friendly_balanced: "That's a great question! I think the key thing to understand here is that it really depends on your goals. If you're aiming for speed, go with option A. If quality matters more, option B is the better choice. Happy to dig deeper if you'd like.",
    friendly_detailed: "Oh, I'm so glad you asked! This is something I find genuinely fascinating. Let me walk you through it from the beginning...\n\nThe core principle here is that [detailed explanation follows]. There are several important factors to consider...",
    professional_brief: "The optimal approach depends on your constraints. Recommend: option A for speed, B for quality.",
    professional_balanced: "Based on the available options, I'd recommend considering the trade-offs carefully. Option A offers speed and simplicity, while option B prioritizes quality and maintainability. The choice depends on your specific requirements and timeline.",
    professional_detailed: "To address your question comprehensively, I'll provide a structured analysis of the available options, including trade-offs, implementation considerations, and recommendations based on best practices...",
    casual_brief: "yeah totally! just go with option A, it's way simpler",
    casual_balanced: "honestly i'd go with option A — it's simpler and gets the job done. option B is cool too if you really care about that extra quality, but tbh for most cases A is the move",
    casual_detailed: "ok so here's the thing, i've thought about this a bunch and there's actually a few ways to look at it...",
    concise_brief: "Option A: faster. Option B: higher quality.",
    concise_balanced: "Two options: A (fast, simple) or B (quality, complex). Recommend A for most use cases unless quality is critical.",
    concise_detailed: "Analysis:\n• Option A: Fast, simple, low overhead\n• Option B: Higher quality, more complexity\n• Recommendation: A (default) or B (if quality-critical)\n• Next step: Define your constraints first.",
  }

  const key = `${style}_${length}`
  const text = previews[key] || previews['friendly_balanced']

  return (
    <div
      className="p-4 sm:p-5 rounded-xl text-sm leading-relaxed"
      style={{
        background: 'var(--color-surface-2)',
        border: '1px solid var(--color-border)',
        color: 'var(--color-text-secondary)',
        fontStyle: 'italic',
        minHeight: 100,
        lineHeight: 1.65,
      }}
    >
      "{text}"
    </div>
  )
}

export default function PersonalityPage() {
  const { settings, setSettings } = useTwinStore()
  const { user } = useAuthStore()
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showPreview, setShowPreview] = useState(true)
  const [isVoiceStudioOpen, setIsVoiceStudioOpen] = useState(false)
  const currentVoice = getVoiceById(settings?.voice_id || 'atlas')

  const [form, setForm] = useState<Partial<TwinSettings>>({
    name: settings?.name || 'My Twin',
    tagline: settings?.tagline || '',
    communication_style: settings?.communication_style || 'friendly',
    formality_level: settings?.formality_level || 'neutral',
    response_length: settings?.response_length || 'balanced',
    vocabulary_style: settings?.vocabulary_style || 'standard',
    preferred_language: settings?.preferred_language || 'English',
    interests: settings?.interests || [],
    goals: settings?.goals || [],
    writing_samples: settings?.writing_samples || [],
  })

  const [goalsText, setGoalsText] = useState((settings?.goals || []).join('\n'))
  const [writingSample, setWritingSample] = useState((settings?.writing_samples || [])[0] || '')

  const update = (key: keyof typeof form, value: unknown) => {
    setForm((f) => ({ ...f, [key]: value }))
    setIsDirty(true)
  }

  const toggleInterest = (interest: string) => {
    const interests = form.interests || []
    update('interests', interests.includes(interest)
      ? interests.filter((i) => i !== interest)
      : [...interests, interest]
    )
  }

  const handleSave = async () => {
    if (!form.name?.trim()) {
      toast.error('Twin name is required')
      return
    }
    setIsSaving(true)
    await new Promise((r) => setTimeout(r, 800))

    const updatedSettings: TwinSettings = {
      id: settings?.id || '',
      user_id: user?.id || 'user',
      ...form,
      name: form.name || 'My Twin',
      communication_style: form.communication_style || 'friendly',
      formality_level: form.formality_level || 'neutral',
      response_length: form.response_length || 'balanced',
      vocabulary_style: form.vocabulary_style || 'standard',
      preferred_language: form.preferred_language || 'English',
      interests: form.interests || [],
      goals: goalsText.split('\n').filter(Boolean),
      writing_samples: writingSample ? [writingSample] : [],
      created_at: settings?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    setSettings(updatedSettings)
    setIsDirty(false)
    setIsSaving(false)
    toast.success('Personality settings saved')
  }

  const handleReset = () => {
    if (settings) {
      setForm({
        name: settings.name,
        tagline: settings.tagline,
        communication_style: settings.communication_style,
        formality_level: settings.formality_level,
        response_length: settings.response_length,
        vocabulary_style: settings.vocabulary_style,
        preferred_language: settings.preferred_language,
        interests: settings.interests,
        goals: settings.goals,
        writing_samples: settings.writing_samples,
      })
      setGoalsText(settings.goals.join('\n'))
      setWritingSample(settings.writing_samples[0] || '')
      setIsDirty(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--color-background)' }}>
      <div className="max-w-7xl mx-auto p-6 md:p-8 space-y-8 animate-fade-in pb-24">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-[var(--color-border)]">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">Personality Configuration</h1>
            <p className="text-sm mt-1.5 leading-normal" style={{ color: 'var(--color-text-secondary)' }}>
              These settings shape how your twin thinks, structures responses, and communicates.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {isDirty && (
              <Button variant="ghost" size="md" leftIcon={<RotateCcw size={15} />} onClick={handleReset}>
                Reset
              </Button>
            )}
            <Button
              variant="primary"
              size="md"
              leftIcon={<Save size={15} />}
              isLoading={isSaving}
              onClick={handleSave}
              disabled={!isDirty}
            >
              Save Changes
            </Button>
          </div>
        </div>

        {/* Responsive Workspace: 70% Form + 30% Preview */}
        <div className="flex flex-col lg:flex-row gap-8 items-start">
          {/* Main Form Workspace (~70%) */}
          <div className="flex-1 min-w-0 w-full space-y-8">
            {/* Identity Card */}
            <Card className="p-6 sm:p-7 space-y-6">
              <div className="flex items-center gap-3.5 pb-5 border-b border-[var(--color-border)]">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(124, 58, 237, 0.15)', color: '#a78bfa' }}
                >
                  <User size={20} />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-semibold text-white">Identity</h2>
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                    Define the core name and persona tagline of your AI twin
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="text-xs sm:text-sm font-medium block mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                    Twin Name
                  </label>
                  <Input
                    id="personality-twin-name"
                    value={form.name || ''}
                    onChange={(e) => update('name', e.target.value)}
                    placeholder="e.g. My AI Twin"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs sm:text-sm font-medium block mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                    Tagline
                  </label>
                  <Input
                    id="personality-tagline"
                    value={form.tagline || ''}
                    onChange={(e) => update('tagline', e.target.value)}
                    placeholder="Curious mind, builder of ideas"
                  />
                </div>
              </div>
            </Card>

            {/* Communication Style Card */}
            <Card className="p-6 sm:p-7 space-y-6">
              <div className="flex items-center gap-3.5 pb-5 border-b border-[var(--color-border)]">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(124, 58, 237, 0.15)', color: '#a78bfa' }}
                >
                  <MessageCircle size={20} />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-semibold text-white">Communication Style</h2>
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                    Tune tone, formality, length, vocabulary, and preferred language
                  </p>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="text-xs sm:text-sm font-medium block mb-2.5" style={{ color: 'var(--color-text-secondary)' }}>
                    Conversational Tone
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { value: 'friendly', label: 'Friendly', desc: 'Warm & personable' },
                      { value: 'professional', label: 'Professional', desc: 'Formal & structured' },
                      { value: 'casual', label: 'Casual', desc: 'Relaxed & natural' },
                      { value: 'concise', label: 'Concise', desc: 'Brief & direct' },
                    ].map((s) => {
                      const isSelected = form.communication_style === s.value
                      return (
                        <button
                          type="button"
                          key={s.value}
                          onClick={() => update('communication_style', s.value)}
                          className="p-4 rounded-xl text-left transition-all cursor-pointer"
                          style={{
                            background: isSelected ? 'rgba(124, 58, 237, 0.14)' : 'var(--color-surface-2)',
                            border: `1px solid ${isSelected ? 'rgba(124, 58, 237, 0.5)' : 'var(--color-border)'}`,
                          }}
                        >
                          <div className={`text-sm font-semibold ${isSelected ? 'text-[#c4b5fd]' : 'text-white'}`}>{s.label}</div>
                          <div className="text-xs mt-1 text-[var(--color-text-muted)] leading-tight">{s.desc}</div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 pt-1">
                  <div>
                    <label className="text-xs sm:text-sm font-medium block mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                      Formality
                    </label>
                    <Select
                      id="personality-formality"
                      value={form.formality_level || 'neutral'}
                      onChange={(e) => update('formality_level', e.target.value)}
                      options={[
                        { value: 'informal', label: 'Informal' },
                        { value: 'neutral', label: 'Neutral' },
                        { value: 'formal', label: 'Formal' },
                      ]}
                    />
                  </div>
                  <div>
                    <label className="text-xs sm:text-sm font-medium block mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                      Response Length
                    </label>
                    <Select
                      id="personality-length"
                      value={form.response_length || 'balanced'}
                      onChange={(e) => update('response_length', e.target.value)}
                      options={[
                        { value: 'brief', label: 'Brief' },
                        { value: 'balanced', label: 'Balanced' },
                        { value: 'detailed', label: 'Detailed' },
                      ]}
                    />
                  </div>
                  <div>
                    <label className="text-xs sm:text-sm font-medium block mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                      Vocabulary
                    </label>
                    <Select
                      id="personality-vocab"
                      value={form.vocabulary_style || 'standard'}
                      onChange={(e) => update('vocabulary_style', e.target.value)}
                      options={[
                        { value: 'simple', label: 'Simple' },
                        { value: 'standard', label: 'Standard' },
                        { value: 'advanced', label: 'Advanced' },
                      ]}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs sm:text-sm font-medium block mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                    Preferred Language
                  </label>
                  <Select
                    id="personality-language"
                    value={form.preferred_language || 'English'}
                    onChange={(e) => update('preferred_language', e.target.value)}
                    options={[
                      { value: 'English', label: 'English' },
                      { value: 'Spanish', label: 'Spanish' },
                      { value: 'French', label: 'French' },
                      { value: 'German', label: 'German' },
                      { value: 'Portuguese', label: 'Portuguese' },
                      { value: 'Arabic', label: 'Arabic' },
                      { value: 'Hindi', label: 'Hindi' },
                      { value: 'Japanese', label: 'Japanese' },
                    ]}
                  />
                </div>
              </div>
            </Card>

            {/* Interests & Goals Card */}
            <Card className="p-6 sm:p-7 space-y-6">
              <div className="flex items-center gap-3.5 pb-5 border-b border-[var(--color-border)]">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(124, 58, 237, 0.15)', color: '#a78bfa' }}
                >
                  <Target size={20} />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-semibold text-white">Interests & Goals</h2>
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                    Teach your twin what topics and objectives matter most to you
                  </p>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="text-xs sm:text-sm font-medium block mb-3" style={{ color: 'var(--color-text-secondary)' }}>
                    Interests & Knowledge Domains
                  </label>
                  <div className="flex flex-wrap gap-2.5">
                    {INTEREST_OPTIONS.map((interest) => {
                      const isSelected = (form.interests || []).includes(interest)
                      return (
                        <button
                          type="button"
                          key={interest}
                          onClick={() => toggleInterest(interest)}
                          className="px-3.5 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer select-none"
                          style={{
                            background: isSelected ? 'rgba(124, 58, 237, 0.16)' : 'var(--color-surface-2)',
                            border: `1px solid ${isSelected ? 'rgba(124, 58, 237, 0.5)' : 'var(--color-border)'}`,
                            color: isSelected ? '#c4b5fd' : 'var(--color-text-secondary)',
                          }}
                        >
                          {interest}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div>
                  <label className="text-xs sm:text-sm font-medium block mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                    Active Goals (one per line)
                  </label>
                  <Textarea
                    id="personality-goals"
                    value={goalsText}
                    onChange={(e) => { setGoalsText(e.target.value); setIsDirty(true) }}
                    placeholder="Read 20 books this year&#10;Launch my side project&#10;Learn Spanish"
                    style={{ minHeight: 110 }}
                    hint="Your twin will reference these goals during planning and advice conversations."
                  />
                </div>
              </div>
            </Card>

            {/* Writing Sample Card */}
            <Card className="p-6 sm:p-7 space-y-6">
              <div className="flex items-center gap-3.5 pb-5 border-b border-[var(--color-border)]">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(124, 58, 237, 0.15)', color: '#a78bfa' }}
                >
                  <Type size={20} />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-semibold text-white">Writing Sample</h2>
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                    Provide sample writing to help your twin mirror your natural expression
                  </p>
                </div>
              </div>

              <div>
                <label className="text-xs sm:text-sm font-medium block mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                  Paste a sample of your writing (optional)
                </label>
                <Textarea
                  id="personality-writing"
                  value={writingSample}
                  onChange={(e) => { setWritingSample(e.target.value); setIsDirty(true) }}
                  placeholder="A paragraph from an email, blog post, or message in your natural voice..."
                  style={{ minHeight: 130 }}
                  hint="This helps your twin understand your writing style. It is stored as a private memory and never used to train global AI models."
                />
              </div>
            </Card>
          </div>

          {/* Response Preview Panel: 30% Width (280-360px) */}
          <div className="w-full lg:w-[320px] xl:w-[360px] shrink-0 lg:sticky lg:top-6 space-y-6">
            <Card className="p-6 sm:p-7 space-y-5">
              <div className="flex items-center gap-2.5 pb-4 border-b border-[var(--color-border)]">
                <Eye size={17} style={{ color: '#a78bfa' }} />
                <div>
                  <h3 className="text-sm font-semibold text-white">Response Preview</h3>
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                    How your twin responds to "What should I do?"
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <ResponsePreview settings={form} />
              </div>

              <div className="pt-4 space-y-3.5 text-xs border-t border-[var(--color-border)]">
                <div className="flex items-center justify-between">
                  <span style={{ color: 'var(--color-text-muted)' }}>Style</span>
                  <Badge variant="violet" className="capitalize">{form.communication_style}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span style={{ color: 'var(--color-text-muted)' }}>Length</span>
                  <Badge variant="muted" className="capitalize">{form.response_length}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span style={{ color: 'var(--color-text-muted)' }}>Formality</span>
                  <Badge variant="muted" className="capitalize">{form.formality_level}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span style={{ color: 'var(--color-text-muted)' }}>Language</span>
                  <Badge variant="muted">{form.preferred_language}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span style={{ color: 'var(--color-text-muted)' }}>Interests</span>
                  <span className="font-mono text-[#c4b5fd] font-semibold">{(form.interests || []).length} selected</span>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="flex items-center gap-1.5" style={{ color: 'var(--color-text-muted)' }}>
                    <Volume2 size={13} style={{ color: 'var(--color-primary)' }} />
                    Voice
                  </span>
                  <div className="flex items-center gap-2">
                    <Badge variant="violet">{currentVoice.displayName}</Badge>
                    <button
                      type="button"
                      onClick={() => setIsVoiceStudioOpen(true)}
                      className="text-[11px] text-[var(--color-primary)] hover:underline font-medium"
                    >
                      Change
                    </button>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>

      <VoiceStudioModal
        isOpen={isVoiceStudioOpen}
        onClose={() => setIsVoiceStudioOpen(false)}
      />
    </div>
  )
}
