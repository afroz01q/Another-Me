import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  Mic, MicOff, Volume2, VolumeX, MessageSquare, Sparkles,
  Settings, RotateCcw, Send, Check, X, Shield, ChevronRight,
  Sliders, Plus, AlertCircle, StopCircle, Radio, Brain,
  Square, Zap, Globe, ChevronDown, Smartphone, CheckCircle2, Camera, Code2,
} from 'lucide-react'
import { VoiceAvatar3D } from '@/components/Avatar3D'
import { PersonalTwinAvatarPlayer } from '@/components/PersonalTwinAvatarPlayer'
import { PersonalTwinUploadModal } from '@/components/PersonalTwinUploadModal'
import { VoiceStudioModal } from '@/components/VoiceStudioModal'
import { TwinBuildWorkspace } from '@/components/buildMode/TwinBuildWorkspace'
import {
  CURATED_VOICES, getVoiceById, speakText, stopSpeaking,
  isSpeaking, createSpeechRecognizer, type SpeechRecognizerInstance,
  SUPPORTED_SPEECH_LANGUAGES, getDefaultSpeechLanguage, combineTranscripts,
  isEchoOfSpeech, isExplicitInterruption, getCurrentSpeakingText, getLastSpokenText, getSpeechEndTime,
} from '@/lib/voice'
import { generateTwinResponse, isAIConfigured } from '@/lib/ai'
import {
  useTwinStore, useConversationStore, useMemoryStore,
  useAuthStore, useActivityStore, useAppStore, useAutopilotStore, useBuildStore,
} from '@/store'
import type { VoiceInteractionState, Message } from '@/types'
import { generateId, formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'

export function VoiceTwinView() {
  const { user } = useAuthStore()
  const { settings: twinSettings, avatar } = useTwinStore()
  const { memories } = useMemoryStore()
  const { addAction, addActivity } = useActivityStore()
  const { sidebarCollapsed, toggleSidebar } = useAppStore()
  const {
    activeDraft,
    confirmActiveDraft,
    cancelActiveDraft,
    settings: autopilotSettings,
  } = useAutopilotStore()
  const {
    conversations,
    activeConversationId,
    messages,
    newConversation,
    addMessage,
  } = useConversationStore()

  // Voice Interaction State
  const [voiceState, setVoiceState] = useState<VoiceInteractionState>('idle')
  const voiceStateRef = useRef<VoiceInteractionState>('idle')
  const [twinMode, setTwinMode] = useState<'talk' | 'build'>('talk')

  const updateVoiceState = useCallback((nextState: VoiceInteractionState) => {
    voiceStateRef.current = nextState
    setVoiceState(nextState)
  }, [])

  const [liveTranscript, setLiveTranscript] = useState<string>('')
  const [currentAssistantText, setCurrentAssistantText] = useState<string>('')
  const [isVoiceStudioOpen, setIsVoiceStudioOpen] = useState(false)
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [audioLevel, setAudioLevel] = useState(0)
  const [continuousMode, setContinuousMode] = useState<boolean>(true)
  const continuousModeRef = useRef<boolean>(true)

  // Speech Recognition Language / Accent State
  const [selectedSpeechLang, setSelectedSpeechLang] = useState<string>(() => getDefaultSpeechLanguage())
  const selectedSpeechLangRef = useRef<string>(getDefaultSpeechLanguage())
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false)

  useEffect(() => {
    selectedSpeechLangRef.current = selectedSpeechLang
    localStorage.setItem('another-me-speech-lang', selectedSpeechLang)
  }, [selectedSpeechLang])

  useEffect(() => {
    continuousModeRef.current = continuousMode
  }, [continuousMode])

  // Secondary text fallback input
  const [textInput, setTextInput] = useState('')
  const [isSendingText, setIsSendingText] = useState(false)

  const recognizerRef = useRef<SpeechRecognizerInstance | null>(null)
  const isSessionActiveRef = useRef<boolean>(false)
  const silenceTimerRef = useRef<any>(null)
  const autoListenTimerRef = useRef<any>(null)
  const recRestartTimerRef = useRef<any>(null)
  const errorRetryTimerRef = useRef<any>(null)
  const latestSpeechRef = useRef<string>('')
  const accumulatedSpeechRef = useRef<string>('')
  const currentSpeakingTextRef = useRef<string>('')
  const lastSpokenTextRef = useRef<string>('')
  const speechEndTimeRef = useRef<number>(0)
  const lastSubmittedTextRef = useRef<string>('')
  const lastSubmittedTimeRef = useRef<number>(0)
  const abortControllerRef = useRef<AbortController | null>(null)
  const isProcessingUtteranceRef = useRef<boolean>(false)
  const networkErrorCountRef = useRef<number>(0)
  const websiteEnquiryRef = useRef<{
    active: boolean
    step: 'awaiting_details'
    initialIntent: string
  } | null>(null)
  const transcriptEndRef = useRef<HTMLDivElement>(null)
  const startListeningRef = useRef<() => void>(() => {})
  const handleUserUtteranceRef = useRef<(text: string) => Promise<void>>(async () => {})
  const handleBargeInRef = useRef<(text?: string) => void>(() => {})

  const activeConversation = conversations.find((c) => c.id === activeConversationId)
  const currentMessages = (activeConversationId && messages[activeConversationId]) || []

  const selectedVoiceId =
    twinSettings?.voice_id ||
    (typeof window !== 'undefined' ? localStorage.getItem('another-me-twin-voice') : null) ||
    'atlas'
  const currentVoice = getVoiceById(selectedVoiceId)
  const accentColor = avatar?.accent_color || '#da7756'

  // Centralized cleanup of all scheduled voice/recognition timers
  const clearAllVoiceTimers = useCallback(() => {
    if (autoListenTimerRef.current) {
      clearTimeout(autoListenTimerRef.current)
      autoListenTimerRef.current = null
    }
    if (recRestartTimerRef.current) {
      clearTimeout(recRestartTimerRef.current)
      recRestartTimerRef.current = null
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
    if (errorRetryTimerRef.current) {
      clearTimeout(errorRetryTimerRef.current)
      errorRetryTimerRef.current = null
    }
  }, [])

  // Acoustic Self-Echo Detector: prevents the AI from falsely hearing itself from speaker audio bleed,
  // while allowing genuine user speech/questions/interruptions to barge in smoothly.
  const isSelfEcho = useCallback((recognizedText: string, currentAIText: string): boolean => {
    const activeText = currentAIText || lastSpokenTextRef.current || getLastSpokenText()
    return isEchoOfSpeech(recognizedText, activeText)
  }, [])

  // Real-Time Barge-In Interruption Handler
  // Like ChatGPT Voice Mode and human phone calls: when the user speaks while the AI is talking or thinking,
  // immediately cut off the AI's audio, abort pending AI generation, and switch seamlessly to listening.
  const handleBargeIn = useCallback((interruptedSpeech?: string) => {
    if (!isSessionActiveRef.current) return

    // 1. Immediately cut AI audio output (0ms latency)
    stopSpeaking()

    // 2. Abort pending AI network request if currently in thinking phase
    if (abortControllerRef.current) {
      try {
        abortControllerRef.current.abort()
      } catch {}
      abortControllerRef.current = null
    }

    // 3. Reset processing lock and AI speech buffer
    isProcessingUtteranceRef.current = false
    currentSpeakingTextRef.current = ''
    speechEndTimeRef.current = Date.now()
    setCurrentAssistantText('')
    setAudioLevel(0)

    // 4. Update voice state to listening immediately
    updateVoiceState('listening')

    // 5. If user spoke words as part of the interruption:
    if (interruptedSpeech && interruptedSpeech.trim()) {
      const text = interruptedSpeech.trim()

      // If user merely spoke a bare stop/pause command, do NOT submit it as a query to the LLM!
      // Simply quiet down, flush audio buffers, and remain in active listening mode!
      if (isExplicitInterruption(text)) {
        recognizerRef.current?.clear()
        latestSpeechRef.current = ''
        accumulatedSpeechRef.current = ''
        setLiveTranscript('')
        return
      }

      // If user barged in with a new prompt or instruction (e.g. "make it blue instead"):
      latestSpeechRef.current = text
      accumulatedSpeechRef.current = text
      setLiveTranscript(text)
      setAudioLevel(0.7)

      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = setTimeout(() => {
        if (isSessionActiveRef.current && latestSpeechRef.current.trim() && !isProcessingUtteranceRef.current) {
          const speech = latestSpeechRef.current.trim()
          latestSpeechRef.current = ''
          accumulatedSpeechRef.current = ''
          handleUserUtteranceRef.current(speech)
        }
      }, 2200)
    }
  }, [updateVoiceState])

  useEffect(() => {
    handleBargeInRef.current = handleBargeIn
  }, [handleBargeIn])

  // Scroll transcript drawer
  useEffect(() => {
    if (isTranscriptOpen) {
      transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [currentMessages, isTranscriptOpen])

  // Ensure an active conversation exists
  useEffect(() => {
    if (!activeConversationId && conversations.length === 0) {
      newConversation()
    }
  }, [activeConversationId, conversations.length, newConversation])

  // Load user's personal twin avatar record from server storage
  useEffect(() => {
    if (user?.id) {
      useTwinStore.getState().loadUserAvatar(user.id)
    }
  }, [user?.id])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isSessionActiveRef.current = false
      clearAllVoiceTimers()
      stopSpeaking()
      recognizerRef.current?.abort()
      abortControllerRef.current?.abort()
    }
  }, [clearAllVoiceTimers])

  // Process user speech through AI pipeline (Full-Duplex: microphone remains hot and listening throughout)
  const handleUserUtterance = useCallback(async (spokenText: string) => {
    // If the session was stopped by the user, ignore any pending utterances
    if (!isSessionActiveRef.current) {
      updateVoiceState('idle')
      return
    }

    const text = spokenText.trim()
    if (!text || isProcessingUtteranceRef.current) {
      return
    }

    // 0. ULTIMATE ECHO LOOP BLOCKER:
    // If this candidate utterance matches what the AI recently spoke (within last 15s),
    // it is speaker audio bleed that looped into the microphone. Discard it immediately!
    const recentAI = lastSpokenTextRef.current || getLastSpokenText()
    const timeSinceSpeech = Date.now() - Math.max(speechEndTimeRef.current, getSpeechEndTime())
    if (
      timeSinceSpeech < 15000 &&
      recentAI &&
      isEchoOfSpeech(text, recentAI)
    ) {
      console.warn('[EchoLoopBreaker] Successfully blocked AI self-echo utterance:', text)
      recognizerRef.current?.clear()
      setLiveTranscript('')
      latestSpeechRef.current = ''
      accumulatedSpeechRef.current = ''
      if (voiceStateRef.current !== 'listening') {
        updateVoiceState('listening')
      }
      return
    }

    // 1. Bare stop/pause commands should never be submitted as a conversation query
    if (isExplicitInterruption(text)) {
      recognizerRef.current?.clear()
      setLiveTranscript('')
      latestSpeechRef.current = ''
      accumulatedSpeechRef.current = ''
      updateVoiceState('listening')
      return
    }

    // 2. Deduplication lock: Reject rapid duplicate echo loops (e.g. "hello" repeated within 2.8s)
    const now = Date.now()
    const normText = text.toLowerCase().replace(/[^a-z0-9]/g, '')
    const normLast = lastSubmittedTextRef.current.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (normText && normText === normLast && now - lastSubmittedTimeRef.current < 2800) {
      console.warn('Blocked rapid echo loop utterance:', text)
      return
    }

    lastSubmittedTextRef.current = text
    lastSubmittedTimeRef.current = now

    isProcessingUtteranceRef.current = true
    clearAllVoiceTimers()

    // Immediately clear and reset speech recognition buffer so previous words cannot linger
    recognizerRef.current?.clear()

    // Notice: We keep recognizerRef.current running so the user can interrupt/barge in at any point!
    updateVoiceState('thinking')
    setLiveTranscript('')
    latestSpeechRef.current = ''
    accumulatedSpeechRef.current = ''

    // Ensure active conversation ID
    let convId = activeConversationId
    if (!convId) {
      const created = newConversation()
      convId = created.id
    }

    // 1. Record user message
    const userMsg: Message = {
      id: generateId(),
      conversation_id: convId,
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    }
    addMessage(convId, userMsg)

    // Check if user is currently replying to an interactive website enquiry
    if (websiteEnquiryRef.current?.active) {
      const enquiry = websiteEnquiryRef.current
      websiteEnquiryRef.current = null
      const enrichedPrompt = `${enquiry.initialIntent}: ${text}`.trim()
      const replyText = `Understood! I've recorded your website requirements: "${text}". I am now structuring your complete project across real code folders: .rules (quality checks), .skills (domain engineering standards), docs (architecture & specs), public (assets & manifest), src (modular components & styles), supabase (database migrations), and tasks (roadmap backlog). Entering Twin Build Mode now!`
      setCurrentAssistantText(replyText)
      const assistantMsg: Message = {
        id: generateId(),
        conversation_id: convId,
        role: 'assistant',
        content: replyText,
        created_at: new Date().toISOString(),
      }
      addMessage(convId, assistantMsg)
      currentSpeakingTextRef.current = replyText
      lastSpokenTextRef.current = replyText
      speechEndTimeRef.current = Date.now()
      speakText(replyText, selectedVoiceId).catch(() => {})
      useBuildStore.getState().startNewProject(enrichedPrompt, user?.id || 'user', twinSettings?.name)
      setTwinMode('build')
      return
    }

    // Check for Twin Build Mode voice command
    const lower = text.toLowerCase()
    const isBuildCommand =
      (lower.includes('build') && (lower.includes('website') || lower.includes('site') || lower.includes('app') || lower.includes('webpage') || lower.includes('frontend') || lower.includes('project'))) ||
      lower.includes('create a website') ||
      lower.includes('create an app') ||
      lower.includes('create a site') ||
      lower.includes('make a website') ||
      lower.includes('make an app') ||
      lower.includes('make a site') ||
      lower.includes('code a website') ||
      lower.includes('code an app') ||
      lower.includes('i want a website') ||
      lower.includes('i need a website') ||
      lower.includes('i want to build a website') ||
      lower.includes('can you build a website') ||
      lower.includes('help me build a website') ||
      lower.includes('build mode') ||
      lower.startsWith('build a ') ||
      lower.startsWith('build me a ') ||
      lower.startsWith('create a ')

    if (isBuildCommand) {
      const wordCount = text.trim().split(/\s+/).length
      const mentionsFeatures =
        lower.includes('hero') ||
        lower.includes('feature') ||
        lower.includes('modal') ||
        lower.includes('pricing') ||
        lower.includes('contact') ||
        lower.includes('catalog') ||
        lower.includes('database') ||
        lower.includes('supabase') ||
        lower.includes('theme') ||
        lower.includes('dark') ||
        lower.includes('light') ||
        lower.includes('color')
      const mentionsDomain =
        lower.includes('portfolio') ||
        lower.includes('ecommerce') ||
        lower.includes('store') ||
        lower.includes('restaurant') ||
        lower.includes('agency') ||
        lower.includes('dashboard') ||
        lower.includes('blog') ||
        lower.includes('saas')

      const hasSpecificDetails = wordCount >= 12 && mentionsDomain && mentionsFeatures

      // If user provided a brief / generic prompt, ENQUIRE first! Do NOT use fake demo words!
      if (!hasSpecificDetails) {
        const replyText =
          "I would love to architect and build that for you! To write clean, production-grade code across all necessary folders, I need to enquire about a few key details:\n\n1. What type or domain is this website? (e.g. Portfolio, E-Commerce, SaaS, Creative Agency, Restaurant, Blog)\n2. What core sections or interactive features do you need? (e.g. Hero showcase, product grid, modal dialog, contact form, Supabase database)\n3. What design style or color theme do you prefer? (e.g. Obsidian Dark, Clean Light, Neon Cyberpunk, or custom colors)\n\nTell me your requirements, and I'll generate the full multi-folder architecture (.rules, .skills, docs, public, src, supabase, tasks)!"
        setCurrentAssistantText(replyText)
        const assistantMsg: Message = {
          id: generateId(),
          conversation_id: convId,
          role: 'assistant',
          content: replyText,
          created_at: new Date().toISOString(),
        }
        addMessage(convId, assistantMsg)
        currentSpeakingTextRef.current = replyText
        lastSpokenTextRef.current = replyText
        speechEndTimeRef.current = Date.now()
        websiteEnquiryRef.current = {
          active: true,
          step: 'awaiting_details',
          initialIntent: text,
        }
        speakText(replyText, selectedVoiceId).catch(() => {})
        return
      }

      const replyText =
        "Entering Twin Build Mode! I am formulating your modular architecture and code folders (.rules, .skills, docs, public, src, supabase, tasks) for your review and approval."
      setCurrentAssistantText(replyText)
      const assistantMsg: Message = {
        id: generateId(),
        conversation_id: convId,
        role: 'assistant',
        content: replyText,
        created_at: new Date().toISOString(),
      }
      addMessage(convId, assistantMsg)
      currentSpeakingTextRef.current = replyText
      lastSpokenTextRef.current = replyText
      speechEndTimeRef.current = Date.now()
      speakText(replyText, selectedVoiceId).catch(() => {})
      useBuildStore.getState().startNewProject(text, user?.id || 'user', twinSettings?.name)
      setTwinMode('build')
      return
    }

    // Check for voice action commands (e.g., reminders)
    if (lower.startsWith('remind me to') || lower.startsWith('create a reminder')) {
      const reminderTitle = text.replace(/^(remind me to|create a reminder to|create a reminder for)\s+/i, '')
      addAction({
        id: generateId(),
        user_id: user?.id || 'user',
        action_type: 'create_reminder',
        title: reminderTitle || 'Reminder',
        input_data: { context: text },
        expected_outcome: `Voice reminder: "${reminderTitle}"`,
        status: 'awaiting_confirmation',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      addActivity({
        id: generateId(),
        user_id: user?.id || 'user',
        activity_type: 'action_requested',
        description: `Voice requested reminder: ${reminderTitle}`,
        created_at: new Date().toISOString(),
      })
    }

    // Check Autopilot Voice Messaging Engine (WhatsApp, Instagram, Email, Stop, Confirm)
    try {
      const autopilotResult = await useAutopilotStore.getState().handleVoiceCommand(text)
      if (autopilotResult.handled) {
        const replyText = autopilotResult.replySpoken
        setCurrentAssistantText(replyText)

        const assistantMsg: Message = {
          id: generateId(),
          conversation_id: convId,
          role: 'assistant',
          content: replyText,
          metadata: { model: 'another-me-autopilot' },
          created_at: new Date().toISOString(),
        }
        addMessage(convId, assistantMsg)

        if (!isMuted) {
          updateVoiceState('speaking')
          currentSpeakingTextRef.current = replyText
          lastSpokenTextRef.current = replyText
          await speakText(replyText, selectedVoiceId, {
            speedMultiplier: twinSettings?.voice_speed || 1.0,
            onStart: () => {
              if (!isSessionActiveRef.current) {
                stopSpeaking()
                updateVoiceState('idle')
                return
              }
              updateVoiceState('speaking')
              recognizerRef.current?.clear()
              latestSpeechRef.current = ''
              accumulatedSpeechRef.current = ''
              setLiveTranscript('')
            },
            onAudioLevel: (lvl) => {
              if (isSessionActiveRef.current && voiceStateRef.current === 'speaking') {
                setAudioLevel(lvl)
              }
            },
            onEnd: () => {
              lastSpokenTextRef.current = replyText
              speechEndTimeRef.current = Date.now()
              currentSpeakingTextRef.current = ''
              setCurrentAssistantText('')
              setAudioLevel(0)
              recognizerRef.current?.clear()
              latestSpeechRef.current = ''
              accumulatedSpeechRef.current = ''
              setLiveTranscript('')

              if (!isSessionActiveRef.current) {
                updateVoiceState('idle')
                return
              }
              // If user interrupted and voiceState has already switched to listening, do not reset!
              if (voiceStateRef.current === 'listening') return

              if (continuousModeRef.current && !isMuted) {
                updateVoiceState('listening')
              } else {
                updateVoiceState('idle')
              }
            },
            onError: () => {
              lastSpokenTextRef.current = replyText
              speechEndTimeRef.current = Date.now()
              currentSpeakingTextRef.current = ''
              setAudioLevel(0)
              recognizerRef.current?.clear()
              latestSpeechRef.current = ''
              accumulatedSpeechRef.current = ''
              setLiveTranscript('')
              if (voiceStateRef.current === 'listening') return
              if (isSessionActiveRef.current && continuousModeRef.current && !isMuted) {
                updateVoiceState('listening')
              } else {
                updateVoiceState('idle')
              }
            },
          })
        } else {
          updateVoiceState('idle')
        }
        return
      }
    } catch (e) {
      console.warn('Autopilot command handling error:', e)
    }

    try {
      const controller = new AbortController()
      abortControllerRef.current = controller

      // 2. Call configured AI service
      updateVoiceState('thinking')
      setCurrentAssistantText('Thinking...')
      const response = await generateTwinResponse({
        userMessage: text,
        twinSettings,
        memories,
        conversationHistory: currentMessages,
        signal: controller.signal,
      })

      // If user stopped or barged in while generating, abort cleanly
      if (!isSessionActiveRef.current || controller.signal.aborted) {
        if (!isSessionActiveRef.current) updateVoiceState('idle')
        return
      }

      const replyText = response.content || 'I am listening.'
      setCurrentAssistantText(replyText)

      // 3. Record assistant message
      const assistantMsg: Message = {
        id: generateId(),
        conversation_id: convId,
        role: 'assistant',
        content: replyText,
        metadata: { model: response.model },
        created_at: new Date().toISOString(),
      }
      addMessage(convId, assistantMsg)

      // 4. Speak response aloud with real-time barge-in capability
      if (!isMuted) {
        updateVoiceState('speaking')
        currentSpeakingTextRef.current = replyText
        lastSpokenTextRef.current = replyText
        await speakText(replyText, selectedVoiceId, {
          speedMultiplier: twinSettings?.voice_speed || 1.0,
          onStart: () => {
            if (!isSessionActiveRef.current) {
              stopSpeaking()
              updateVoiceState('idle')
              return
            }
            updateVoiceState('speaking')
            recognizerRef.current?.clear()
            latestSpeechRef.current = ''
            accumulatedSpeechRef.current = ''
            setLiveTranscript('')
          },
          onAudioLevel: (lvl) => {
            if (isSessionActiveRef.current && voiceStateRef.current === 'speaking') {
              setAudioLevel(lvl)
            }
          },
          onEnd: () => {
            lastSpokenTextRef.current = replyText
            speechEndTimeRef.current = Date.now()
            currentSpeakingTextRef.current = ''
            setCurrentAssistantText('')
            setAudioLevel(0)
            recognizerRef.current?.clear()
            latestSpeechRef.current = ''
            accumulatedSpeechRef.current = ''
            setLiveTranscript('')

            if (!isSessionActiveRef.current) {
              updateVoiceState('idle')
              return
            }
            // If user barged in during speech, stay in listening mode!
            if (voiceStateRef.current === 'listening') return

            if (continuousModeRef.current && !isMuted) {
              updateVoiceState('listening')
            } else {
              updateVoiceState('idle')
            }
          },
          onError: () => {
            lastSpokenTextRef.current = replyText
            speechEndTimeRef.current = Date.now()
            currentSpeakingTextRef.current = ''
            setAudioLevel(0)
            recognizerRef.current?.clear()
            latestSpeechRef.current = ''
            accumulatedSpeechRef.current = ''
            setLiveTranscript('')

            if (!isSessionActiveRef.current) {
              updateVoiceState('idle')
              return
            }
            if (voiceStateRef.current === 'listening') return
            if (continuousModeRef.current && !isMuted) {
              updateVoiceState('listening')
            } else {
              updateVoiceState('idle')
            }
          },
        })
      } else {
        if (isSessionActiveRef.current && continuousModeRef.current) {
          updateVoiceState('listening')
        } else {
          updateVoiceState('idle')
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError' && isSessionActiveRef.current) {
        toast.error('Voice generation encountered an error')
        updateVoiceState('error')
        clearAllVoiceTimers()
        errorRetryTimerRef.current = setTimeout(() => {
          if (isSessionActiveRef.current && continuousModeRef.current) {
            updateVoiceState('listening')
            try {
              recognizerRef.current?.start()
            } catch {}
          } else {
            updateVoiceState('idle')
          }
        }, 2000)
      } else {
        // If aborted due to user barge-in, stay in listening mode!
        if (voiceStateRef.current !== 'listening') {
          updateVoiceState('idle')
        }
      }
    } finally {
      abortControllerRef.current = null
      isProcessingUtteranceRef.current = false
      currentSpeakingTextRef.current = ''
    }
  }, [
    activeConversationId,
    newConversation,
    addMessage,
    currentMessages,
    twinSettings,
    memories,
    isMuted,
    selectedVoiceId,
    addAction,
    addActivity,
    user?.id,
    updateVoiceState,
    clearAllVoiceTimers,
  ])

  useEffect(() => {
    handleUserUtteranceRef.current = handleUserUtterance
  }, [handleUserUtterance])

  // Immediate complete cancellation/stop (Hang Up Call)
  const handleHardStop = useCallback(() => {
    isSessionActiveRef.current = false
    isProcessingUtteranceRef.current = false
    currentSpeakingTextRef.current = ''
    clearAllVoiceTimers()
    stopSpeaking()

    if (recognizerRef.current) {
      try {
        recognizerRef.current.abort()
      } catch {}
      recognizerRef.current = null
    }
    if (abortControllerRef.current) {
      try {
        abortControllerRef.current.abort()
      } catch {}
      abortControllerRef.current = null
    }
    latestSpeechRef.current = ''
    accumulatedSpeechRef.current = ''
    updateVoiceState('idle')
    setLiveTranscript('')
    setCurrentAssistantText('')
    setAudioLevel(0)
    toast('Voice call ended', { icon: '⏹️' })
  }, [clearAllVoiceTimers, updateVoiceState])

  // Initialize or Toggle Microphone / Conversation
  const handleToggleMic = () => {
    // If AI is currently speaking or thinking, tapping mic interrupts immediately and listens to user!
    if (voiceStateRef.current === 'speaking' || voiceStateRef.current === 'thinking') {
      handleBargeIn()
      toast('Listening to you...', { icon: '🎙️' })
      return
    }

    // If currently listening:
    if (voiceStateRef.current === 'listening') {
      if (latestSpeechRef.current.trim()) {
        const speech = latestSpeechRef.current.trim()
        latestSpeechRef.current = ''
        accumulatedSpeechRef.current = ''
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current)
          silenceTimerRef.current = null
        }
        handleUserUtterance(speech)
        return
      }
      handleHardStop()
      return
    }

    // Otherwise start fresh voice call
    isSessionActiveRef.current = true
    startListening()
  }

  // Start continuous full-duplex speech recognition
  const startListening = useCallback(() => {
    isSessionActiveRef.current = true
    stopSpeaking()

    // Clean up any lingering previous recognizer instance completely
    if (recognizerRef.current) {
      try {
        recognizerRef.current.abort()
      } catch {}
      recognizerRef.current = null
    }

    clearAllVoiceTimers()

    latestSpeechRef.current = ''
    accumulatedSpeechRef.current = ''
    setLiveTranscript('')
    updateVoiceState('listening')

    const recognizer = createSpeechRecognizer(
      {
        onStart: () => {
          if (!isSessionActiveRef.current) {
            try {
              recognizer.abort()
            } catch {}
            updateVoiceState('idle')
            return
          }
          if (voiceStateRef.current !== 'speaking' && voiceStateRef.current !== 'thinking') {
            updateVoiceState('listening')
          }
          setAudioLevel(0.4)
        },
        onTranscriptChunk: (chunk) => {
          networkErrorCountRef.current = 0
          if (!isSessionActiveRef.current) return
          const text = chunk.trim()
          if (!text) return

          const isAIActive =
            voiceStateRef.current === 'speaking' ||
            voiceStateRef.current === 'generating_speech' ||
            isSpeaking()

          const timeSinceSpeech = Date.now() - Math.max(speechEndTimeRef.current, getSpeechEndTime())
          const isWithinCooldown = timeSinceSpeech < 1500
          const activeSpeech = currentSpeakingTextRef.current || lastSpokenTextRef.current || getLastSpokenText()

          if (isAIActive) {
            // While AI is actively speaking:
            // 1. Explicit bare interruption commands barge in immediately
            if (isExplicitInterruption(text)) {
              handleBargeInRef.current(text)
              return
            }
            // 2. Suppress acoustic speaker audio bleed of AI's words
            if (activeSpeech && isEchoOfSpeech(text, activeSpeech)) {
              return
            }
            // 3. User spoke a distinct new instruction: barge in!
            handleBargeInRef.current(text)
            return
          }

          if (isWithinCooldown && (lastSpokenTextRef.current || getLastSpokenText())) {
            const refText = lastSpokenTextRef.current || getLastSpokenText()
            if (isEchoOfSpeech(text, refText)) {
              return // drop delayed residual speaker bleed
            }
          }

          // Stitch speech seamlessly across Chrome recognition session breaks
          const fullText = combineTranscripts(accumulatedSpeechRef.current, text)

          // Prevent intermediate partial chunks from shrinking or truncating an already longer captured sentence
          if (
            !latestSpeechRef.current ||
            fullText.length >= latestSpeechRef.current.length ||
            !latestSpeechRef.current.toLowerCase().startsWith(fullText.toLowerCase())
          ) {
            latestSpeechRef.current = fullText
            setLiveTranscript(fullText)
          }
          setAudioLevel(0.8)

          // Conversational silence pause timer (2200ms):
          // Allows user to speak complete, multi-clause thoughts and sentences without being cut off mid-speech
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
          silenceTimerRef.current = setTimeout(() => {
            if (isSessionActiveRef.current && latestSpeechRef.current.trim() && !isProcessingUtteranceRef.current) {
              const speech = latestSpeechRef.current.trim()
              latestSpeechRef.current = ''
              accumulatedSpeechRef.current = ''
              handleUserUtteranceRef.current(speech)
            }
          }, 2200)
        },
        onFinalTranscript: (finalText) => {
          networkErrorCountRef.current = 0
          if (!isSessionActiveRef.current) return
          const text = finalText.trim()
          if (!text) return

          const isAIActive =
            voiceStateRef.current === 'speaking' ||
            voiceStateRef.current === 'generating_speech' ||
            isSpeaking()

          const timeSinceSpeech = Date.now() - Math.max(speechEndTimeRef.current, getSpeechEndTime())
          const isWithinCooldown = timeSinceSpeech < 1500
          const activeSpeech = currentSpeakingTextRef.current || lastSpokenTextRef.current || getLastSpokenText()

          if (isAIActive) {
            if (isExplicitInterruption(text)) {
              handleBargeInRef.current(text)
              return
            }
            if (activeSpeech && isEchoOfSpeech(text, activeSpeech)) return
            handleBargeInRef.current(text)
            return
          }

          if (isWithinCooldown && (lastSpokenTextRef.current || getLastSpokenText())) {
            const refText = lastSpokenTextRef.current || getLastSpokenText()
            if (isEchoOfSpeech(text, refText)) return
          }

          const fullText = combineTranscripts(accumulatedSpeechRef.current, text)

          if (
            !latestSpeechRef.current ||
            fullText.length >= latestSpeechRef.current.length ||
            !latestSpeechRef.current.toLowerCase().startsWith(fullText.toLowerCase())
          ) {
            latestSpeechRef.current = fullText
            setLiveTranscript(fullText)
          }

          // Maintain the same 2200ms conversational turn-taking pause window
          // so user isn't cut off between clauses or while thinking
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
          silenceTimerRef.current = setTimeout(() => {
            if (isSessionActiveRef.current && latestSpeechRef.current.trim() && !isProcessingUtteranceRef.current) {
              const speech = latestSpeechRef.current.trim()
              latestSpeechRef.current = ''
              accumulatedSpeechRef.current = ''
              handleUserUtteranceRef.current(speech)
            }
          }, 2200)
        },
        onError: (err) => {
          if (err.includes('network')) {
            console.info('[VoiceTwin] Speech recognizer network disconnect:', err)
          } else {
            console.warn('Speech recognizer error:', err)
          }
          if (!isSessionActiveRef.current) {
            updateVoiceState('idle')
            return
          }
          if (err.includes('not-allowed') || err.includes('permission')) {
            toast.error('Microphone permission denied. Please allow microphone access in your browser.')
            handleHardStop()
            return
          }
          if (err.includes('network')) {
            networkErrorCountRef.current += 1
            if (networkErrorCountRef.current >= 3) {
              toast.error('Voice service unreachable (network error). Speech input paused; you can type in chat or click the microphone to retry.')
              handleHardStop()
              return
            }
          }
          if (continuousModeRef.current) {
            if (recRestartTimerRef.current) clearTimeout(recRestartTimerRef.current)
            const retryDelay = err.includes('network') ? 3000 : 600
            recRestartTimerRef.current = setTimeout(() => {
              if (isSessionActiveRef.current && continuousModeRef.current && recognizerRef.current) {
                try {
                  recognizerRef.current.start()
                } catch {}
              }
            }, retryDelay)
          }
        },
        onEnd: () => {
          setAudioLevel(0)
          if (!isSessionActiveRef.current) {
            updateVoiceState('idle')
            return
          }

          // If Chrome paused, preserve what was spoken so far so subsequent words attach seamlessly
          if (latestSpeechRef.current.trim()) {
            const currentCandidate = latestSpeechRef.current.trim()
            const recentAI = lastSpokenTextRef.current || getLastSpokenText()
            const timeSinceSpeech = Date.now() - Math.max(speechEndTimeRef.current, getSpeechEndTime())
            if (timeSinceSpeech < 15000 && recentAI && isEchoOfSpeech(currentCandidate, recentAI)) {
              latestSpeechRef.current = ''
              accumulatedSpeechRef.current = ''
              setLiveTranscript('')
            } else {
              accumulatedSpeechRef.current = currentCandidate
              // Reset / extend silence timer to 2200ms from the pause event so user is never cut off
              if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
              silenceTimerRef.current = setTimeout(() => {
                if (isSessionActiveRef.current && latestSpeechRef.current.trim() && !isProcessingUtteranceRef.current) {
                  const speech = latestSpeechRef.current.trim()
                  latestSpeechRef.current = ''
                  accumulatedSpeechRef.current = ''
                  handleUserUtteranceRef.current(speech)
                }
              }, 2200)
            }
          }

          // In active call, keep recognition alive continuously!
          if (isSessionActiveRef.current && continuousModeRef.current) {
            if (recRestartTimerRef.current) clearTimeout(recRestartTimerRef.current)
            recRestartTimerRef.current = setTimeout(() => {
              if (isSessionActiveRef.current && continuousModeRef.current && recognizerRef.current) {
                try {
                  recognizerRef.current.start()
                } catch {}
              }
            }, 50)
          } else if (!isProcessingUtteranceRef.current && voiceStateRef.current === 'listening') {
            updateVoiceState('idle')
          }
        },
      },
      selectedSpeechLangRef.current
    )

    recognizerRef.current = recognizer
    recognizer.start()
  }, [clearAllVoiceTimers, handleHardStop, isSelfEcho, updateVoiceState])

  useEffect(() => {
    startListeningRef.current = startListening
  }, [startListening])

  // Handle fallback text submission
  const handleSendText = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!textInput.trim() || isSendingText) return

    const message = textInput.trim()
    setTextInput('')
    setIsSendingText(true)
    isSessionActiveRef.current = true
    await handleUserUtterance(message)
    setIsSendingText(false)
  }

  // State badge information
  // Claude State badge information
  const stateBadgeMap: Record<VoiceInteractionState, { label: string; color: string; bg: string }> = {
    idle: { label: 'Ready', color: '#da7756', bg: 'rgba(218,119,86,0.12)' },
    requesting_permission: { label: 'Requesting Mic...', color: '#d97706', bg: 'rgba(217,119,6,0.12)' },
    listening: { label: 'Listening...', color: '#d97706', bg: 'rgba(217,119,6,0.16)' },
    processing: { label: 'Processing...', color: '#c2785c', bg: 'rgba(194,120,92,0.16)' },
    thinking: { label: 'Thinking...', color: '#e08364', bg: 'rgba(224,131,100,0.16)' },
    generating_speech: { label: 'Speaking...', color: '#da7756', bg: 'rgba(218,119,86,0.16)' },
    speaking: { label: 'Speaking', color: '#38a169', bg: 'rgba(56,161,105,0.16)' },
    interrupted: { label: 'Interrupted', color: '#e53e3e', bg: 'rgba(229,62,62,0.16)' },
    error: { label: 'Offline / Error', color: '#e53e3e', bg: 'rgba(229,62,62,0.16)' },
  }

  const currentBadge = stateBadgeMap[voiceState] || stateBadgeMap.idle

  if (twinMode === 'build') {
    return <TwinBuildWorkspace onBackToTwin={() => setTwinMode('talk')} />
  }

  return (
    <div className="relative w-full h-full flex overflow-hidden bg-[var(--color-background)]">
      {/* ======================================================== */}
      {/* PRIMARY VOICE WORKSPACE: Claude Editorial Aesthetic      */}
      {/* ======================================================== */}
      <div className="flex-1 flex flex-col h-full relative z-10 overflow-hidden">
        {/* Top Control Strip (Mobile Responsive & Claude Typography) */}
        <div className="px-3.5 py-2.5 sm:px-6 sm:py-3.5 flex items-center justify-between z-20 shrink-0 border-b border-[var(--color-border)]/60 bg-[var(--color-surface)]/80 backdrop-blur-md">
          {/* Twin Profile info with Claude Editorial Serif */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="font-serif text-lg sm:text-2xl font-normal text-[var(--color-text-primary)] tracking-tight truncate">
                  {twinSettings?.name || 'Your Twin'}
                </h1>
                <div
                  data-testid="voice-state-badge"
                  className="px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-medium flex items-center gap-1.5 transition-all border shrink-0"
                  style={{ background: currentBadge.bg, color: currentBadge.color, borderColor: `${currentBadge.color}40` }}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: currentBadge.color }} />
                  {currentBadge.label}
                </div>
              </div>
              <p className="text-[11px] text-[var(--color-text-secondary)] truncate font-sans hidden sm:block">
                {twinSettings?.tagline || 'Personal AI Digital Twin'}
              </p>
            </div>
          </div>

          {/* Quick Audio & Session Controls (Claude Styled Warm Pills) */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Twin Build Mode Trigger */}
            <button
              onClick={() => {
                setTwinMode('build')
              }}
              data-testid="twin-build-mode-btn"
              className="px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-medium flex items-center gap-1.5 border border-[#da7756]/40 bg-[#da7756]/15 text-[#da7756] hover:bg-[#da7756]/25 transition-all shadow-sm cursor-pointer"
              title="Open Twin Build Mode: Instruct your AI Twin to build full websites"
            >
              <Code2 size={13} className="text-[#da7756]" />
              <span className="hidden sm:inline font-semibold">Build Mode</span>
            </button>

            {/* Autopilot Mobile Messaging HUD */}
            <Link
              to="/app/autopilot"
              data-testid="autopilot-hud-btn"
              className={`px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-medium flex items-center gap-1.5 border transition-all cursor-pointer ${
                autopilotSettings.isPaused
                  ? 'bg-red-500/10 border-red-500/30 text-red-300'
                  : 'bg-[#da7756]/15 border-[#da7756]/40 text-[#da7756] shadow-sm'
              }`}
              title="Open Autopilot Messaging Dashboard (WhatsApp, Instagram, Email)"
            >
              <Smartphone size={13} className={autopilotSettings.isPaused ? 'text-red-400' : 'text-[#da7756]'} />
              <span className="hidden sm:inline">Autopilot</span>
              <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-black/40">
                {autopilotSettings.isPaused ? 'OFF' : 'ON'}
              </span>
            </Link>

            {/* Continuous Hands-Free Toggle */}
            <button
              onClick={() => {
                const next = !continuousMode
                setContinuousMode(next)
                toast(next ? 'Continuous Hands-Free Enabled' : 'Hands-Free Disabled', {
                  icon: next ? '⚡' : '⏸️',
                })
              }}
              data-testid="hands-free-btn"
              aria-label="Toggle Hands-Free Continuous Mode"
              className={`px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-medium flex items-center gap-1.5 border transition-all cursor-pointer ${
                continuousMode
                  ? 'bg-[#da7756]/15 border-[#da7756]/40 text-[#da7756] shadow-sm'
                  : 'bg-[var(--color-surface-2)] border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-white'
              }`}
              title="Continuous Hands-Free: AI automatically listens after answering so you don't need to click buttons"
            >
              <Zap size={13} className={continuousMode ? 'text-[#da7756] fill-[#da7756]' : 'text-zinc-400'} />
              <span className="hidden sm:inline font-sans">Hands-Free</span>
            </button>

            {/* Speech Recognition Accent / Dialect Selector */}
            <div className="relative">
              <button
                onClick={() => setIsLangMenuOpen(!isLangMenuOpen)}
                data-testid="speech-lang-btn"
                aria-label="Select Speech Recognition Accent/Language"
                className="px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-medium flex items-center gap-1 bg-[var(--color-surface-2)] border border-[var(--color-border)] hover:border-[#da7756]/40 text-[var(--color-text-primary)] transition-all shadow-sm cursor-pointer"
                title="Change speech recognition accent/dialect for highest accuracy"
              >
                <Globe size={13} className="text-[#da7756]" />
                <span className="hidden sm:inline font-sans text-[11px]">
                  {SUPPORTED_SPEECH_LANGUAGES.find((l) => l.code === selectedSpeechLang)?.label || selectedSpeechLang}
                </span>
                <span className="sm:hidden font-mono text-[10px] uppercase">
                  {selectedSpeechLang.split('-')[1] || selectedSpeechLang}
                </span>
                <ChevronDown size={11} className="text-[var(--color-text-muted)]" />
              </button>

              {isLangMenuOpen && (
                <div className="absolute right-0 top-10 w-52 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-2xl shadow-2xl p-1 z-50 animate-fade-in-scale">
                  <div className="px-2.5 py-1 text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider font-mono">
                    Mic Accent & Dialect
                  </div>
                  {SUPPORTED_SPEECH_LANGUAGES.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => {
                        setSelectedSpeechLang(lang.code)
                        setIsLangMenuOpen(false)
                        toast.success(`Speech recognition set to ${lang.label}`, { icon: '🎙️' })
                        if (voiceStateRef.current === 'listening') {
                          startListeningRef.current()
                        }
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs transition-colors cursor-pointer text-left ${
                        selectedSpeechLang === lang.code
                          ? 'bg-[#da7756]/15 text-[#da7756] font-semibold'
                          : 'text-[var(--color-text-primary)] hover:bg-[var(--color-surface-3)]'
                      }`}
                    >
                      <div className="flex flex-col">
                        <span>{lang.label}</span>
                        <span className="text-[10px] text-[var(--color-text-muted)]">{lang.accent}</span>
                      </div>
                      {selectedSpeechLang === lang.code && <Check size={14} className="text-[#da7756] shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Personal Twin button */}
            <button
              onClick={() => setIsUploadModalOpen(true)}
              data-testid="personal-twin-modal-btn"
              aria-label="Create or Manage Personal Twin"
              className="px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-medium flex items-center gap-1.5 bg-[#da7756]/15 border border-[#da7756]/40 hover:bg-[#da7756]/25 text-[#da7756] transition-all shadow-sm cursor-pointer"
              title="Upload photo to generate or manage your personal AI digital twin"
            >
              <Camera size={13} />
              <span className="hidden sm:inline">
                {avatar?.generated_video_path ? 'Personal Twin' : 'Create Twin'}
              </span>
            </button>

            {/* Voice Studio button */}
            <button
              onClick={() => setIsVoiceStudioOpen(true)}
              data-testid="voice-studio-btn"
              aria-label="Open Voice Studio"
              className="px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-medium flex items-center gap-1.5 bg-[var(--color-surface-2)] border border-[var(--color-border)] hover:border-[#da7756]/40 text-[var(--color-text-primary)] transition-all shadow-sm cursor-pointer"
              title="Open Voice Studio to change twin voice"
            >
              <Volume2 size={13} className="text-[#da7756]" />
              <span className="hidden sm:inline font-mono">{currentVoice.displayName}</span>
            </button>

            {/* Mute / Unmute */}
            <button
              onClick={() => {
                if (!isMuted && voiceState === 'speaking') stopSpeaking()
                setIsMuted(!isMuted)
              }}
              className={`p-1.5 sm:p-2 rounded-full border transition-all cursor-pointer ${
                isMuted
                  ? 'bg-red-500/10 border-red-500/30 text-red-400'
                  : 'bg-[var(--color-surface-2)] border-[var(--color-border)] text-[var(--color-text-primary)] hover:text-[#da7756]'
              }`}
              title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
            >
              {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </button>

            {/* Transcript Drawer Toggle */}
            <button
              onClick={() => setIsTranscriptOpen(!isTranscriptOpen)}
              data-testid="transcript-toggle-btn"
              aria-label="Toggle Conversation Transcript"
              className={`px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-medium flex items-center gap-1.5 border transition-all cursor-pointer ${
                isTranscriptOpen
                  ? 'bg-[#da7756]/15 border-[#da7756]/40 text-[#da7756]'
                  : 'bg-[var(--color-surface-2)] border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-white'
              }`}
              title="Open conversation transcript drawer"
            >
              <MessageSquare size={13} />
              <span className="hidden sm:inline">Transcript</span>
              {currentMessages.length > 0 && (
                <span className="w-4 h-4 rounded-full bg-[var(--color-surface-3)] text-[10px] font-mono flex items-center justify-center text-white">
                  {currentMessages.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* -------------------------------------------------------- */}
        {/* CENTER AVATAR PRESENTATION (Personal AI Digital Twin)   */}
        {/* -------------------------------------------------------- */}
        <div className="flex-1 flex flex-col items-center justify-center relative min-h-[160px] px-3 sm:px-4 pointer-events-none overflow-hidden">
          <div
            onClick={() => {
              if (voiceState === 'speaking' || voiceState === 'thinking') {
                handleBargeIn()
                toast('Listening to you...', { icon: '🎙️' })
              }
            }}
            className={`w-full max-w-2xl lg:max-w-3xl h-[44vh] sm:h-[52vh] md:h-[58vh] max-h-[580px] relative flex items-center justify-center pointer-events-auto transition-all ${
              voiceState === 'speaking' || voiceState === 'thinking'
                ? 'cursor-pointer hover:scale-[1.01] active:scale-[0.99]'
                : ''
            }`}
            title={
              voiceState === 'speaking'
                ? 'Speaking — Tap anywhere or speak to interrupt'
                : voiceState === 'thinking'
                ? 'Thinking — Tap to cancel'
                : undefined
            }
          >
            <PersonalTwinAvatarPlayer
              voiceState={voiceState}
              accentColor={accentColor}
              twinName={avatar?.name || twinSettings?.name || 'Your Twin'}
              audioLevel={audioLevel}
              onOpenUploadModal={() => setIsUploadModalOpen(true)}
            />

            {/* Radial background ambient atmosphere */}
            <div
              className="absolute inset-0 pointer-events-none rounded-full"
              style={{
                background: `radial-gradient(circle at 50% 50%, ${
                  voiceState === 'speaking' ? '#da775620' : voiceState === 'listening' ? '#06b6d418' : '#da775610'
                } 0%, transparent 70%)`,
                filter: 'blur(40px)',
                zIndex: -1,
              }}
            />

            {/* Floating Autopilot Confirmation HUD (Claude Editorial Theme) */}
            {activeDraft && (
              <div
                data-testid="autopilot-draft-card"
                className="absolute z-30 bottom-2 left-3 right-3 sm:left-auto sm:right-auto sm:w-[440px] p-4 rounded-2xl bg-[#201f1c]/95 backdrop-blur-xl border border-[#da7756]/50 shadow-2xl animate-fade-in pointer-events-auto"
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#da7756] animate-pulse" />
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#da7756] bg-[#da7756]/15 px-2 py-0.5 rounded-full border border-[#da7756]/30">
                      Autopilot Draft • {activeDraft.platform.replace('_', ' ')}
                    </span>
                  </div>
                  <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                    <CheckCircle2 size={11} /> {activeDraft.safetyAssessment.riskLevel.toUpperCase()} RISK
                  </span>
                </div>

                <div className="text-xs font-medium text-[#edebe8] mb-1">
                  Recipient: <span className="text-[#da7756] font-semibold">{activeDraft.recipientName}</span>
                </div>

                {activeDraft.originalMessageSnippet && (
                  <div className="p-2 rounded-lg bg-[#282622] border border-[#35332d] text-[11px] text-[#b5b1a8] mb-2 font-serif italic line-clamp-2">
                    "{activeDraft.originalMessageSnippet}"
                  </div>
                )}

                <div className="p-3 rounded-xl bg-[#282622] border border-[#da7756]/30 text-xs text-[#edebe8] mb-3">
                  <span className="text-[9px] uppercase font-mono tracking-wider text-[#da7756] block mb-0.5">
                    Twin's Proposed Reply ({activeDraft.toneUsed} tone):
                  </span>
                  <p className="font-serif italic leading-relaxed text-[#edebe8]">"{activeDraft.proposedReply}"</p>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#35332d]">
                  <span className="text-[10px] text-[#7d7a73] font-mono">
                    Say "Send it" or tap:
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => cancelActiveDraft()}
                      className="px-3 py-1.5 rounded-full text-xs font-medium text-[#b5b1a8] hover:text-white hover:bg-[#282622] border border-[#35332d] transition-colors cursor-pointer"
                    >
                      Discard
                    </button>
                    <button
                      onClick={async () => {
                        const res = await confirmActiveDraft()
                        if (res?.success) toast.success('Reply delivered!')
                      }}
                      className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-[#da7756] hover:bg-[#e28a6c] text-[#181816] flex items-center gap-1.5 transition-all shadow-md cursor-pointer font-sans"
                    >
                      <Send size={12} />
                      Send Now
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Floating Live Speech Feedback / Claude Subtitle Pill */}
          <div className="min-h-12 flex items-center justify-center w-full max-w-lg px-3 mt-1 mb-1 pointer-events-none">
            {liveTranscript && (
              <div className="animate-fade-in bg-[#201f1c]/95 backdrop-blur-md px-3.5 py-2 rounded-2xl border border-[#da7756]/40 text-[#eceae6] text-xs sm:text-sm font-sans flex items-center gap-2.5 shadow-xl max-w-lg">
                <span className="w-2 h-2 rounded-full bg-[#da7756] animate-pulse shrink-0" />
                <span className="font-medium text-[var(--color-text-primary)] break-words">"{liveTranscript}"</span>
                <span className="text-[9px] font-mono text-[#da7756]/90 px-1.5 py-0.5 rounded bg-[#da7756]/15 ml-auto shrink-0 uppercase tracking-wider">
                  Listening ({selectedSpeechLang.split('-')[1] || selectedSpeechLang})
                </span>
              </div>
            )}

            {!liveTranscript && voiceState === 'speaking' && currentAssistantText && (
              <div className="animate-fade-in bg-[#201f1c]/95 backdrop-blur-md px-4 py-2 rounded-2xl border border-[#38a169]/40 text-[#eceae6] text-xs sm:text-sm flex items-center gap-2.5 shadow-xl max-w-lg">
                <Volume2 size={15} className="text-[#38a169] shrink-0" />
                <span className="font-serif italic text-[var(--color-text-primary)] truncate text-xs sm:text-sm">"{currentAssistantText}"</span>
              </div>
            )}

            {!liveTranscript && voiceState === 'thinking' && (
              <div className="animate-fade-in bg-[#201f1c]/95 backdrop-blur-md px-3.5 py-2 rounded-2xl border border-[#e08364]/40 text-[#eceae6] text-xs font-sans flex items-center gap-2 shadow-xl">
                <div className="w-3.5 h-3.5 border-2 border-[#e08364] border-t-transparent rounded-full animate-spin shrink-0" />
                <span className="font-serif italic text-xs text-[var(--color-text-secondary)]">Formulating response...</span>
              </div>
            )}

            {!liveTranscript && voiceState === 'idle' && (
              <p className="text-[11px] sm:text-xs text-[var(--color-text-muted)] tracking-wide animate-fade-in text-center font-serif italic">
                {continuousMode
                  ? 'Speak naturally at any time — your digital twin is listening'
                  : 'Tap the microphone to start a voice call'}
              </p>
            )}
          </div>

          {/* ------------------------------------------------------ */}
          {/* CLAUDE TERRACOTTA CENTRAL MICROPHONE CONTROLS          */}
          {/* ------------------------------------------------------ */}
          <div className="pb-3 sm:pb-6 pt-1 flex flex-col items-center gap-2 z-30 relative pointer-events-auto shrink-0">
            <div className="relative flex items-center justify-center gap-3">
              {/* Pulsing ring for listening or speaking */}
              {(voiceState === 'listening' || voiceState === 'speaking') && (
                <div
                  className="absolute w-20 h-20 sm:w-24 sm:h-24 rounded-full pointer-events-none animate-ping opacity-25"
                  style={{
                    background: voiceState === 'speaking' ? '#38a169' : '#da7756',
                  }}
                />
              )}

              {/* Main Glowing Microphone Button */}
              <button
                onClick={handleToggleMic}
                data-testid="mic-button"
                aria-label={
                  voiceState === 'speaking'
                    ? 'Interrupt AI speech'
                    : voiceState === 'thinking'
                    ? 'Cancel AI generation'
                    : voiceState === 'listening'
                    ? 'Finish speaking now'
                    : 'Start call'
                }
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center transition-all transform active:scale-95 shadow-xl relative z-10 cursor-pointer"
                style={{
                  background:
                    voiceState === 'listening'
                      ? 'linear-gradient(135deg, #e08364, #da7756)'
                      : voiceState === 'speaking'
                      ? 'linear-gradient(135deg, #38a169, #2f855a)'
                      : voiceState === 'thinking'
                      ? 'linear-gradient(135deg, #c15f3e, #9c4528)'
                      : 'linear-gradient(135deg, #da7756, #c15f3e)',
                  boxShadow:
                    voiceState === 'listening'
                      ? '0 0 35px rgba(218, 119, 86, 0.55)'
                      : voiceState === 'speaking'
                      ? '0 0 35px rgba(56, 161, 105, 0.5)'
                      : '0 6px 28px rgba(218, 119, 86, 0.4)',
                }}
                title={
                  voiceState === 'speaking'
                    ? 'Speaking — Click or speak to interrupt'
                    : voiceState === 'thinking'
                    ? 'Thinking — Click to cancel'
                    : voiceState === 'listening'
                    ? 'Listening — Click when done speaking'
                    : 'Click to start voice call'
                }
              >
                {voiceState === 'speaking' ? (
                  <Mic size={26} color="white" className="animate-pulse" />
                ) : voiceState === 'thinking' ? (
                  <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Mic size={26} color="white" />
                )}
              </button>

              {/* Explicit Instant Stop Button */}
              {voiceState !== 'idle' && (
                <button
                  onClick={handleHardStop}
                  data-testid="stop-session-btn"
                  aria-label="End call / stop session"
                  className="w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center bg-red-600/90 hover:bg-red-500 text-white transition-all shadow-md hover:scale-105 active:scale-95 cursor-pointer z-10 animate-fade-in"
                  title="End voice call and return to idle"
                >
                  <Square size={14} fill="currentColor" />
                </button>
              )}
            </div>

            {/* Interaction State Descriptor in Claude Serif */}
            <div className="flex flex-col items-center gap-0.5">
              <span className="font-serif italic text-xs text-[var(--color-text-secondary)]">
                {voiceState === 'speaking'
                  ? 'Speaking • speak or tap anywhere to interrupt'
                  : voiceState === 'listening'
                  ? 'Listening • speak freely'
                  : voiceState === 'thinking'
                  ? 'Thinking...'
                  : 'Tap microphone to start call'}
              </span>
              {continuousMode && (
                <span className="text-[10px] text-[#da7756] flex items-center gap-1 font-mono">
                  <Zap size={9} className="fill-[#da7756]" /> Real-time Duplex Call (ChatGPT Style)
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* SECONDARY COLLAPSIBLE TRANSCRIPT DRAWER                  */}
      {/* ======================================================== */}
      <div
        className={`fixed md:relative right-0 top-0 bottom-0 h-full bg-[var(--color-surface)] border-l border-[var(--color-border)] z-30 transition-all duration-300 ease-in-out flex flex-col ${
          isTranscriptOpen ? 'w-full sm:w-96 translate-x-0' : 'w-0 translate-x-full md:w-0 overflow-hidden border-none'
        }`}
      >
        {isTranscriptOpen && (
          <>
            {/* Transcript Drawer Header */}
            <div className="p-4 border-b border-[#35332d] flex items-center justify-between shrink-0 bg-[#201f1c]">
              <div className="flex items-center gap-2">
                <MessageSquare size={16} className="text-[#da7756]" />
                <h3 className="font-serif text-sm font-normal text-[#edebe8]">Conversation Transcript</h3>
              </div>
              <button
                onClick={() => setIsTranscriptOpen(false)}
                className="p-1 rounded-lg text-[#b5b1a8] hover:text-white transition-colors cursor-pointer"
                title="Close transcript"
              >
                <X size={16} />
              </button>
            </div>

            {/* Messages List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs leading-relaxed bg-[#181816]">
              {currentMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-[#7d7a73]">
                  <Mic size={24} className="mb-2 opacity-40 text-[#da7756]" />
                  <p className="font-serif italic text-[#edebe8] mb-1">No dialogue yet</p>
                  <p className="text-[11px]">Spoken conversations and live messages will be recorded here.</p>
                </div>
              ) : (
                currentMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    <div className="text-[10px] text-[#7d7a73] mb-1 px-1 font-mono">
                      {msg.role === 'user' ? (user?.name || 'You') : (twinSettings?.name || 'Twin')}
                    </div>
                    <div
                      className={`p-3 rounded-2xl max-w-[88%] ${
                        msg.role === 'user'
                          ? 'bg-[#da7756] text-[#181816] font-medium rounded-tr-sm shadow-sm'
                          : 'bg-[#201f1c] text-[#edebe8] border border-[#35332d] font-serif rounded-tl-sm shadow-sm'
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))
              )}
              <div ref={transcriptEndRef} />
            </div>

            {/* Compact Fallback Text Input */}
            <div className="p-3 border-t border-[#35332d] bg-[#201f1c] shrink-0">
              <form onSubmit={handleSendText} className="flex items-center gap-2">
                <input
                  type="text"
                  data-testid="transcript-input"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder={`Message ${twinSettings?.name || 'twin'} with text...`}
                  className="flex-1 rounded-xl px-3 py-2 text-xs bg-[#282622] border border-[#35332d] text-[#edebe8] placeholder-[#7d7a73] outline-none focus:border-[#da7756]"
                />
                <button
                  type="submit"
                  disabled={!textInput.trim() || isSendingText}
                  className="p-2 rounded-xl bg-[#da7756] hover:bg-[#e28a6c] text-[#181816] disabled:opacity-40 transition-all shrink-0 cursor-pointer shadow-sm"
                  title="Send text message"
                >
                  <Send size={14} />
                </button>
              </form>
            </div>
          </>
        )}
      </div>

      {/* Voice Studio Modal */}
      <VoiceStudioModal
        isOpen={isVoiceStudioOpen}
        onClose={() => setIsVoiceStudioOpen(false)}
      />

      {/* Personal Twin Upload & Generator Modal */}
      <PersonalTwinUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
      />
    </div>
  )
}
