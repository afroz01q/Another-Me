import React, { useState } from 'react'
import {
  Volume2, Play, Square, Check, Sliders, Sparkles, User, X,
} from 'lucide-react'
import { Modal, Button, Badge } from '@/components/ui'
import { CURATED_VOICES, playVoicePreview, stopSpeaking, isSpeaking } from '@/lib/voice'
import { useTwinStore, useActivityStore } from '@/store'
import type { VoiceOption, VoiceCategory } from '@/types'
import { generateId } from '@/lib/utils'
import toast from 'react-hot-toast'

interface VoiceStudioModalProps {
  isOpen: boolean
  onClose: () => void
}

export function VoiceStudioModal({ isOpen, onClose }: VoiceStudioModalProps) {
  const { settings, updateSettings } = useTwinStore()
  const { addActivity } = useActivityStore()

  const [activeCategory, setActiveCategory] = useState<VoiceCategory>('male')
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>(
    () => settings?.voice_id || (typeof window !== 'undefined' ? localStorage.getItem('another-me-twin-voice') : null) || 'atlas'
  )
  const [speechSpeed, setSpeechSpeed] = useState<number>(settings?.voice_speed || 1.0)
  const [volume, setVolume] = useState<number>(1.0)
  const [customTestPhrase, setCustomTestPhrase] = useState<string>('')
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const maleVoices = CURATED_VOICES.filter((v) => v.category === 'male')
  const femaleVoices = CURATED_VOICES.filter((v) => v.category === 'female')
  const currentCategoryVoices = activeCategory === 'male' ? maleVoices : femaleVoices

  const handlePlayPreview = async (voice: VoiceOption) => {
    if (previewingVoiceId === voice.id) {
      stopSpeaking()
      setPreviewingVoiceId(null)
      return
    }

    stopSpeaking()
    setPreviewingVoiceId(voice.id)

    try {
      await playVoicePreview(voice.id, customTestPhrase, {
        speedMultiplier: speechSpeed,
        volume,
        onEnd: () => {
          setPreviewingVoiceId(null)
        },
        onError: (err) => {
          setPreviewingVoiceId(null)
          toast.error(`Audio playback error: ${err.message}`)
        },
      })
    } catch {
      setPreviewingVoiceId(null)
    }
  }

  const handleSaveVoice = async () => {
    setIsSaving(true)
    stopSpeaking()

    if (typeof window !== 'undefined') {
      localStorage.setItem('another-me-twin-voice', selectedVoiceId)
      localStorage.setItem('another-me-twin-speed', String(speechSpeed))
    }

    updateSettings({
      voice_id: selectedVoiceId,
      voice_speed: speechSpeed,
    })

    const chosenVoice = CURATED_VOICES.find((v) => v.id === selectedVoiceId)

    addActivity({
      id: generateId(),
      user_id: settings?.user_id || 'user',
      activity_type: 'settings_updated',
      description: `Twin voice updated to ${chosenVoice?.displayName || selectedVoiceId} (${speechSpeed}x speed)`,
      created_at: new Date().toISOString(),
    })

    await new Promise((r) => setTimeout(r, 200))
    setIsSaving(false)
    toast.success(`Voice set to ${chosenVoice?.displayName || 'selected voice'}`)
    onClose()
  }

  const handleClose = () => {
    stopSpeaking()
    setPreviewingVoiceId(null)
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Voice Studio & Audio Settings" maxWidth="lg">
      <div className="space-y-6 pt-1 text-[var(--color-text-primary)]">
        {/* Intro */}
        <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
          Choose from 10 studio-grade Neural AI voices to power your personal AI digital twin. Each voice is powered by a distinct, hyper-realistic deep neural model with human inflections and emotion.
        </p>

        {/* Category switcher: Male / Female */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => { stopSpeaking(); setActiveCategory('male') }}
              data-testid="male-tab"
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer ${
                activeCategory === 'male'
                  ? 'bg-[var(--color-surface-3)] text-white border border-orange-500/30 shadow-sm'
                  : 'text-[var(--color-text-secondary)] hover:text-white hover:bg-[var(--color-surface-2)]'
              }`}
            >
              <span>Male Voices (5)</span>
            </button>
            <button
              onClick={() => { stopSpeaking(); setActiveCategory('female') }}
              data-testid="female-tab"
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer ${
                activeCategory === 'female'
                  ? 'bg-[var(--color-surface-3)] text-white border border-purple-500/30 shadow-sm'
                  : 'text-[var(--color-text-secondary)] hover:text-white hover:bg-[var(--color-surface-2)]'
              }`}
            >
              <span>Female Voices (5)</span>
            </button>
          </div>

          <Badge variant="muted" size="sm">
            {CURATED_VOICES.length} Curated Voices
          </Badge>
        </div>

        {/* Voice Selection Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 max-h-[340px] overflow-y-auto pr-1">
          {currentCategoryVoices.map((voice) => {
            const isSelected = selectedVoiceId === voice.id
            const isPlaying = previewingVoiceId === voice.id

            return (
              <div
                key={voice.id}
                data-testid="voice-card"
                data-voice-id={voice.id}
                onClick={() => setSelectedVoiceId(voice.id)}
                className={`p-4 rounded-xl border transition-all cursor-pointer relative flex flex-col justify-between gap-3 ${
                  isSelected
                    ? 'bg-orange-500/10 border-orange-500/50 shadow-md ring-1 ring-orange-500/30'
                    : 'bg-[var(--color-surface-2)] border-[var(--color-border)] hover:border-[var(--color-border-2)]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-white">{voice.displayName}</span>
                      {isSelected && (
                        <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
                      )}
                    </div>
                    <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{voice.description}</p>
                  </div>

                  {isSelected && (
                    <div className="w-5 h-5 rounded-full bg-orange-500 text-white flex items-center justify-center shrink-0">
                      <Check size={12} />
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-[var(--color-border)]/50">
                  <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1.5 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Neural AI • {voice.providerVoiceId.replace('Neural', '').replace('en-US-', '').replace('en-GB-', '')}
                  </span>

                  <button
                    type="button"
                    data-testid="preview-btn"
                    data-preview-voice-id={voice.id}
                    onClick={(e) => {
                      e.stopPropagation()
                      handlePlayPreview(voice)
                    }}
                    className={`btn btn-sm text-xs flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                      isPlaying
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                        : 'bg-[var(--color-surface-3)] text-white hover:bg-orange-500 hover:text-white'
                    }`}
                    title={isPlaying ? 'Stop preview' : 'Play preview'}
                  >
                    {isPlaying ? <Square size={11} /> : <Play size={11} />}
                    <span>{isPlaying ? 'Stop' : 'Preview'}</span>
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Fine-Tuning Controls: Speed & Custom Test Phrase */}
        <div className="p-4 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] space-y-3.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-white flex items-center gap-1.5">
              <Sliders size={13} style={{ color: 'var(--color-violet-light)' }} />
              Speech Cadence & Speed
            </label>
            <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-[var(--color-surface-3)] text-orange-400">
              {speechSpeed.toFixed(2)}x
            </span>
          </div>
          <input
            type="range"
            min="0.75"
            max="1.35"
            step="0.05"
            value={speechSpeed}
            onChange={(e) => setSpeechSpeed(parseFloat(e.target.value))}
            className="w-full cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-[var(--color-text-muted)]">
            <span>Thoughtful (0.75x)</span>
            <span>Balanced (1.00x)</span>
            <span>Rapid (1.35x)</span>
          </div>

          <div>
            <label className="text-xs text-[var(--color-text-secondary)] block mb-1">
              Custom Preview Phrase (optional)
            </label>
            <input
              type="text"
              value={customTestPhrase}
              onChange={(e) => setCustomTestPhrase(e.target.value)}
              placeholder="e.g. Good morning! Here is what we have scheduled today..."
              className="w-full rounded-lg px-3 py-1.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] text-white outline-none focus:border-orange-500"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-2 border-t border-[var(--color-border)]">
          <button
            type="button"
            onClick={handleClose}
            className="btn btn-ghost text-xs"
          >
            Cancel
          </button>

          <Button
            variant="primary"
            size="md"
            data-testid="save-voice-btn"
            isLoading={isSaving}
            onClick={handleSaveVoice}
            className="flex items-center gap-2"
          >
            <Check size={14} />
            Save Voice Configuration
          </Button>
        </div>
      </div>
    </Modal>
  )
}
