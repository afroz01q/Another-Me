import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  Mic, MicOff, Volume2, VolumeX, Sparkles, X, Minimize2,
  Maximize2, StopCircle, RefreshCw, Radio
} from 'lucide-react'
import { LottieAvatar } from '@/components/LottieAvatar'
import { useTwinStore, useBuildStore } from '@/store'
import {
  isSpeaking, stopSpeaking, createSpeechRecognizer,
  type SpeechRecognizerInstance, combineTranscripts, isEchoOfSpeech,
} from '@/lib/voice'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'

interface TwinPiPWidgetProps {
  onInstructionSubmit: (text: string) => void
}

export function TwinPiPWidget({ onInstructionSubmit }: TwinPiPWidgetProps) {
  const { settings: twinSettings, avatar } = useTwinStore()
  const { isTwinPiPOpen, setTwinPiPOpen, isBuilding, isEditing, currentProject } = useBuildStore()

  const [isMinimized, setIsMinimized] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [liveTranscript, setLiveTranscript] = useState('')
  const [speakingStatus, setSpeakingStatus] = useState(false)
  const [audioLevel, setAudioLevel] = useState(0)

  const recognizerRef = useRef<SpeechRecognizerInstance | null>(null)
  const silenceTimerRef = useRef<any>(null)
  const restartTimerRef = useRef<any>(null)
  const isListeningRef = useRef(false)
  const latestSpeechRef = useRef('')
  const accumulatedSpeechRef = useRef('')

  const accentColor = avatar?.accent_color || '#da7756'
  const twinName = twinSettings?.name || 'Your Twin'

  // Sync speaking state
  useEffect(() => {
    const interval = setInterval(() => {
      const active = isSpeaking()
      setSpeakingStatus(active)
      if (active) {
        setAudioLevel(0.4 + Math.random() * 0.4)
      } else {
        setAudioLevel(0)
      }
    }, 120)
    return () => clearInterval(interval)
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isListeningRef.current = false
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current)
      if (recognizerRef.current) {
        try { recognizerRef.current.abort() } catch {}
      }
    }
  }, [])

  // Speech Recognition handler for PiP Voice Controls
  const toggleListening = useCallback(() => {
    if (isListeningRef.current) {
      isListeningRef.current = false
      setIsListening(false)
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current)

      const speech = latestSpeechRef.current.trim()
      latestSpeechRef.current = ''
      accumulatedSpeechRef.current = ''
      setLiveTranscript('')

      if (recognizerRef.current) {
        recognizerRef.current.abort()
        recognizerRef.current = null
      }

      if (speech && !isEchoOfSpeech(speech)) {
        onInstructionSubmit(speech)
      }
      return
    }

    // Stop TTS if speaking so user can talk
    stopSpeaking()

    isListeningRef.current = true
    setIsListening(true)
    latestSpeechRef.current = ''
    accumulatedSpeechRef.current = ''
    setLiveTranscript('')

    try {
      const rec = createSpeechRecognizer({
        onStart: () => {
          if (!isListeningRef.current) {
            try { rec.abort() } catch {}
            return
          }
          setIsListening(true)
          toast('Listening to your instructions...', { icon: '🎙️' })
        },
        onTranscriptChunk: (chunk) => {
          if (!isListeningRef.current) return
          const trimmed = chunk.trim()
          if (!trimmed || isEchoOfSpeech(trimmed)) return

          const fullText = combineTranscripts(accumulatedSpeechRef.current, trimmed)
          if (
            !latestSpeechRef.current ||
            fullText.length >= latestSpeechRef.current.length ||
            !latestSpeechRef.current.toLowerCase().startsWith(fullText.toLowerCase())
          ) {
            latestSpeechRef.current = fullText
            setLiveTranscript(fullText)
          }

          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
          silenceTimerRef.current = setTimeout(() => {
            if (isListeningRef.current && latestSpeechRef.current.trim()) {
              const text = latestSpeechRef.current.trim()
              isListeningRef.current = false
              latestSpeechRef.current = ''
              accumulatedSpeechRef.current = ''
              setLiveTranscript('')
              setIsListening(false)
              if (recognizerRef.current) {
                recognizerRef.current.abort()
                recognizerRef.current = null
              }
              if (!isEchoOfSpeech(text)) {
                onInstructionSubmit(text)
              }
            }
          }, 2200)
        },
        onError: (err) => {
          console.warn('PiP recognition error:', err)
          if (!err.includes('no-speech') && !err.includes('aborted')) {
            if (restartTimerRef.current) clearTimeout(restartTimerRef.current)
            restartTimerRef.current = setTimeout(() => {
              if (isListeningRef.current && recognizerRef.current) {
                try { recognizerRef.current.start() } catch {}
              }
            }, 500)
          }
        },
        onEnd: () => {
          if (!isListeningRef.current) {
            setIsListening(false)
            return
          }

          if (latestSpeechRef.current.trim()) {
            accumulatedSpeechRef.current = latestSpeechRef.current.trim()
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
            silenceTimerRef.current = setTimeout(() => {
              if (isListeningRef.current && latestSpeechRef.current.trim()) {
                const text = latestSpeechRef.current.trim()
                isListeningRef.current = false
                latestSpeechRef.current = ''
                accumulatedSpeechRef.current = ''
                setLiveTranscript('')
                setIsListening(false)
                if (recognizerRef.current) {
                  recognizerRef.current.abort()
                  recognizerRef.current = null
                }
                onInstructionSubmit(text)
              }
            }, 2200)
          }

          // Keep recognition alive continuously across browser pauses
          if (restartTimerRef.current) clearTimeout(restartTimerRef.current)
          restartTimerRef.current = setTimeout(() => {
            if (isListeningRef.current && recognizerRef.current) {
              try { recognizerRef.current.start() } catch {}
            }
          }, 50)
        },
      })

      recognizerRef.current = rec
      rec.start()
    } catch (e) {
      console.error('Failed to start speech recognition:', e)
      isListeningRef.current = false
      setIsListening(false)
    }
  }, [onInstructionSubmit])

  if (!isTwinPiPOpen) {
    return (
      <button
        onClick={() => setTwinPiPOpen(true)}
        className="fixed bottom-6 right-6 z-50 p-3 rounded-full bg-gradient-to-br from-[#da7756] to-[#c15f3e] text-white shadow-2xl hover:scale-105 transition-all flex items-center gap-2 border border-white/20"
        title="Open Twin Assistant"
      >
        <Sparkles size={18} />
        <span className="text-xs font-semibold pr-1">Twin AI Developer</span>
      </button>
    )
  }

  return (
    <div
      className={cn(
        'fixed bottom-6 right-6 z-50 transition-all duration-300 ease-out select-none',
        isMinimized ? 'w-64' : 'w-80'
      )}
    >
      <div className="glass-panel border border-[#da7756]/30 shadow-2xl rounded-2xl overflow-hidden bg-[#16161a]/95 backdrop-blur-xl">
        {/* Header Bar */}
        <div className="px-3.5 py-2.5 bg-zinc-900/80 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className={cn('animate-ping absolute inline-flex h-full w-full rounded-full opacity-75', isListening ? 'bg-red-400' : speakingStatus ? 'bg-[#da7756]' : 'bg-emerald-400')}></span>
              <span className={cn('relative inline-flex rounded-full h-2 w-2', isListening ? 'bg-red-500' : speakingStatus ? 'bg-[#da7756]' : 'bg-emerald-500')}></span>
            </span>
            <span className="text-xs font-bold text-white tracking-tight">{twinName}</span>
            <span className="text-[10px] text-zinc-400 bg-zinc-800/80 px-1.5 py-0.5 rounded">AI Dev</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsMinimized(!isMinimized)}
              className="p-1 text-zinc-400 hover:text-white rounded hover:bg-zinc-800 transition-colors"
              title={isMinimized ? 'Expand' : 'Minimize'}
            >
              {isMinimized ? <Maximize2 size={13} /> : <Minimize2 size={13} />}
            </button>
            <button
              onClick={() => setTwinPiPOpen(false)}
              className="p-1 text-zinc-400 hover:text-white rounded hover:bg-zinc-800 transition-colors"
              title="Close Panel"
            >
              <X size={13} />
            </button>
          </div>
        </div>

        {/* Minimized Quick Status */}
        {isMinimized ? (
          <div className="p-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-full overflow-hidden bg-zinc-900 border border-zinc-700 shrink-0">
                <LottieAvatar voiceState={speakingStatus ? 'speaking' : isListening ? 'listening' : 'idle'} audioLevel={audioLevel} size={32} />
              </div>
              <span className="text-xs text-zinc-300 truncate">
                {isListening ? 'Listening...' : speakingStatus ? 'Speaking...' : isBuilding ? 'Coding website...' : 'Standing by'}
              </span>
            </div>
            <button
              onClick={toggleListening}
              className={cn(
                'p-2 rounded-xl text-white transition-all',
                isListening ? 'bg-red-600 animate-pulse' : 'bg-[#da7756] hover:bg-[#c15f3e]'
              )}
            >
              {isListening ? <MicOff size={14} /> : <Mic size={14} />}
            </button>
          </div>
        ) : (
          /* Expanded Avatar & Voice HUD */
          <div className="p-4 space-y-3">
            <div className="relative aspect-square max-h-44 w-full rounded-xl overflow-hidden bg-gradient-to-b from-zinc-900/60 to-black/80 border border-zinc-800/80 flex items-center justify-center">
              <LottieAvatar voiceState={speakingStatus ? 'speaking' : isListening ? 'listening' : 'idle'} audioLevel={audioLevel} size={150} />

              {/* Status Overlay */}
              <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-[10px] font-semibold text-zinc-300 border border-white/10 flex items-center gap-1.5">
                <Radio size={10} className={cn(speakingStatus ? 'text-[#da7756] animate-pulse' : 'text-zinc-500')} />
                <span>{isListening ? 'Listening to voice...' : speakingStatus ? 'Speaking...' : isBuilding ? 'Generating Code...' : 'Ready'}</span>
              </div>

              {/* Instant Mute / Stop Button */}
              {speakingStatus && (
                <button
                  onClick={() => stopSpeaking()}
                  className="absolute bottom-2 right-2 px-2.5 py-1 rounded-lg bg-red-600/90 text-white text-[11px] font-semibold flex items-center gap-1 shadow-lg hover:bg-red-500 transition-colors"
                >
                  <StopCircle size={12} />
                  <span>Interrupt</span>
                </button>
              )}
            </div>

            {/* Live Transcript / Feedback display */}
            {liveTranscript && (
              <div className="p-2.5 rounded-xl bg-zinc-900/90 border border-[#da7756]/40 text-xs text-zinc-200 animate-fade-in flex items-start gap-2">
                <Mic size={14} className="text-[#da7756] shrink-0 mt-0.5" />
                <span className="italic">"{liveTranscript}"</span>
              </div>
            )}

            {/* Controls */}
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={toggleListening}
                className={cn(
                  'flex-1 py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-md',
                  isListening
                    ? 'bg-red-600 text-white animate-pulse'
                    : 'bg-gradient-to-r from-[#da7756] to-[#c15f3e] text-white hover:opacity-95'
                )}
              >
                {isListening ? <MicOff size={14} /> : <Mic size={14} />}
                <span>{isListening ? 'Send Voice Prompt' : 'Talk to Twin'}</span>
              </button>

              {speakingStatus && (
                <button
                  onClick={() => stopSpeaking()}
                  className="p-2.5 rounded-xl bg-zinc-900 text-zinc-300 hover:text-white border border-zinc-800 hover:border-zinc-700 transition-colors"
                  title="Mute Twin"
                >
                  <VolumeX size={15} />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
