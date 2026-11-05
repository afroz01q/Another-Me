// Voice Registry and Real Neural Voice-to-Voice Audio Engine for Another Me
import type { VoiceOption, VoiceInteractionState } from '@/types'
import {
  isCapacitorAndroid,
  speakNativeAndroidTTS,
  stopNativeAndroidTTS,
} from '@/lib/autopilot/nativeBridge'

// EXACT 10 CURATED REAL NEURAL AI VOICES
// Each voice is mapped to an authentic, state-of-the-art Neural Voice ID
export const CURATED_VOICES: VoiceOption[] = [
  // 5 Male Neural AI Voices
  {
    id: 'atlas',
    displayName: 'Atlas',
    category: 'male',
    gender: 'male',
    description: 'Deep and Confident',
    provider: 'neural_ai',
    providerVoiceId: 'en-US-GuyNeural',
    pitch: 0.85,
    rate: 1.0,
    previewPhrase: 'Hello, I am Atlas. Confident, direct, and focused on helping you achieve your goals with clarity and precision.',
  },
  {
    id: 'ethan',
    displayName: 'Ethan',
    category: 'male',
    gender: 'male',
    description: 'Natural and Friendly',
    provider: 'neural_ai',
    providerVoiceId: 'en-US-ChristopherNeural',
    pitch: 1.0,
    rate: 1.0,
    previewPhrase: 'Hey there, I am Ethan. Friendly and conversational, ready to talk through whatever is on your mind today.',
  },
  {
    id: 'oliver',
    displayName: 'Oliver',
    category: 'male',
    gender: 'male',
    description: 'Warm and Conversational',
    provider: 'neural_ai',
    providerVoiceId: 'en-GB-RyanNeural',
    pitch: 0.95,
    rate: 1.0,
    previewPhrase: 'Good to speak with you. I am Oliver, warm, thoughtful, and tuned to your personal rhythm and style.',
  },
  {
    id: 'noah',
    displayName: 'Noah',
    category: 'male',
    gender: 'male',
    description: 'Calm and Professional',
    provider: 'neural_ai',
    providerVoiceId: 'en-US-EricNeural',
    pitch: 0.90,
    rate: 1.0,
    previewPhrase: 'Greetings. I am Noah. Structured, calm, and dedicated to delivering clear, thoughtful communication.',
  },
  {
    id: 'adrian',
    displayName: 'Adrian',
    category: 'male',
    gender: 'male',
    description: 'Rich and Expressive',
    provider: 'neural_ai',
    providerVoiceId: 'en-US-AndrewMultilingualNeural',
    pitch: 0.95,
    rate: 1.0,
    previewPhrase: 'Hello! I am Adrian. Rich, expressive, and energized to help you brainstorm and create new ideas.',
  },

  // 5 Female Neural AI Voices
  {
    id: 'sophia',
    displayName: 'Sophia',
    category: 'female',
    gender: 'female',
    description: 'Warm and Natural',
    provider: 'neural_ai',
    providerVoiceId: 'en-US-JennyNeural',
    pitch: 1.0,
    rate: 1.0,
    previewPhrase: 'Hi there, I am Sophia. Warm, natural, and always ready to listen and reflect your personal twin perspective.',
  },
  {
    id: 'olivia',
    displayName: 'Olivia',
    category: 'female',
    gender: 'female',
    description: 'Clear and Friendly',
    provider: 'neural_ai',
    providerVoiceId: 'en-US-AriaNeural',
    pitch: 1.0,
    rate: 1.0,
    previewPhrase: 'Hello! I am Olivia. Clear, friendly, and focused on keeping you organized and moving forward.',
  },
  {
    id: 'ava',
    displayName: 'Ava',
    category: 'female',
    gender: 'female',
    description: 'Soft and Calm',
    provider: 'neural_ai',
    providerVoiceId: 'en-US-AvaNeural',
    pitch: 1.0,
    rate: 0.95,
    previewPhrase: 'Hello. I am Ava. Soft, calm, and mindful, here to provide steady, thoughtful support whenever you need it.',
  },
  {
    id: 'isabella',
    displayName: 'Isabella',
    category: 'female',
    gender: 'female',
    description: 'Confident and Professional',
    provider: 'neural_ai',
    providerVoiceId: 'en-GB-SoniaNeural',
    pitch: 1.0,
    rate: 1.0,
    previewPhrase: 'Good day. I am Isabella. Confident, articulate, and dedicated to representing your highest standards.',
  },
  {
    id: 'mia',
    displayName: 'Mia',
    category: 'female',
    gender: 'female',
    description: 'Bright and Expressive',
    provider: 'neural_ai',
    providerVoiceId: 'en-US-EmmaNeural',
    pitch: 1.05,
    rate: 1.05,
    previewPhrase: 'Hey! I am Mia. Bright, vibrant, and enthusiastic about bringing your digital twin to life!',
  },
]

export function getVoiceById(id?: string): VoiceOption {
  if (!id) return CURATED_VOICES[0]
  return CURATED_VOICES.find((v) => v.id === id) || CURATED_VOICES[0]
}

export interface SpeakOptions {
  speedMultiplier?: number
  volume?: number
  onStart?: () => void
  onEnd?: () => void
  onError?: (err: Error) => void
  onBoundary?: (charIndex: number, charLength: number) => void
  onAudioLevel?: (level: number) => void
}

// Active playback handles
let activeAudioElement: HTMLAudioElement | null = null
let activeAudioUrl: string | null = null
let activeUtterance: SpeechSynthesisUtterance | null = null
let audioContext: AudioContext | null = null
let audioAnalyserAnimation: number | null = null
let activeSpeakResolver: (() => void) | null = null
let activeTTSAbortController: AbortController | null = null

// Acoustic Echo Tracking & Suppression State
let currentSpeakingText: string = ''
let lastSpokenText: string = ''
let speechEndTime: number = 0

/**
 * Returns text currently being spoken aloud by the AI
 */
export function getCurrentSpeakingText(): string {
  return currentSpeakingText
}

/**
 * Returns text of the most recent utterance spoken by the AI
 */
export function getLastSpokenText(): string {
  return lastSpokenText
}

/**
 * Returns timestamp when the AI last stopped speaking
 */
export function getSpeechEndTime(): number {
  return speechEndTime
}

/**
 * Acoustic Self-Echo Detector:
 * Determines if recognized text from the microphone is speaker audio bleed of the AI's words.
 * Prevents the AI from listening to its own voice in an infinite loop while allowing genuine
 * user questions, instructions, and interruptions through smoothly.
 */
export function isEchoOfSpeech(candidateText: string, referenceText?: string): boolean {
  const ref = referenceText !== undefined ? referenceText : (currentSpeakingText || lastSpokenText)
  if (!candidateText || !ref) return false

  const cleanCand = candidateText.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
  const cleanRef = ref.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!cleanCand || !cleanRef) return false

  // 1. Exact or substring match (e.g. Chrome transcribed phrase from inside AI sentence)
  if (cleanRef.includes(cleanCand)) {
    return true
  }

  // 2. Candidate phrase contains the entire reference sentence
  if (cleanCand.includes(cleanRef)) {
    return true
  }

  // 3. Word-level overlap analysis
  const candWords = cleanCand.split(' ').filter((w) => w.length > 1)
  if (candWords.length === 0) {
    return true // 0-1 letter noise chunks
  }

  const refWords = new Set(cleanRef.split(' ').filter((w) => w.length > 1))
  let matchCount = 0
  let significantNewWords = 0

  for (const word of candWords) {
    if (refWords.has(word) || cleanRef.includes(word)) {
      matchCount++
    } else if (word.length >= 3) {
      significantNewWords++
    }
  }

  const matchRatio = matchCount / candWords.length

  // If candidate has informative new words (length >= 3) not present anywhere in the AI's speech,
  // and match ratio is not overwhelming, this was spoken by the USER!
  if (significantNewWords >= 1 && matchRatio < 0.7) {
    return false
  }

  // If 60% or more of words are verbatim from the AI's sentence, it's acoustic speaker bleed
  if (matchRatio >= 0.6) {
    return true
  }

  return false
}

/**
 * Checks if recognized text is an explicit user command to interrupt/stop the AI
 */
export function isExplicitInterruption(text: string): boolean {
  const clean = (text || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
  const bareStopCommands = [
    'stop',
    'shut up',
    'pause',
    'quiet',
    'be quiet',
    'hold on',
    'wait',
    'cancel',
    'halt',
    'silence',
    'no wait',
  ]
  return bareStopCommands.some(
    (cmd) => clean === cmd || clean === `please ${cmd}`
  )
}

/**
 * Stop any current speech playback immediately (Real-time Interruption)
 */
export function stopSpeaking(): void {
  currentSpeakingText = ''
  speechEndTime = Date.now()

  if (activeTTSAbortController) {
    try {
      activeTTSAbortController.abort()
    } catch {}
    activeTTSAbortController = null
  }
  try {
    stopNativeAndroidTTS()
  } catch {}
  if (audioAnalyserAnimation) {
    cancelAnimationFrame(audioAnalyserAnimation)
    audioAnalyserAnimation = null
  }
  if (activeAudioElement) {
    try {
      activeAudioElement.onended = null
      activeAudioElement.onerror = null
      activeAudioElement.onplay = null
      activeAudioElement.pause()
      activeAudioElement.currentTime = 0
      activeAudioElement.removeAttribute('src')
      activeAudioElement.load()
    } catch {
      // Ignore
    }
    activeAudioElement = null
  }
  if (activeAudioUrl) {
    try {
      URL.revokeObjectURL(activeAudioUrl)
    } catch {
      // Ignore
    }
    activeAudioUrl = null
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel()
    } catch {
      // Ignore
    }
  }
  activeUtterance = null

  if (activeSpeakResolver) {
    const resolve = activeSpeakResolver
    activeSpeakResolver = null
    try {
      resolve()
    } catch {
      // Ignore
    }
  }
}

/**
 * Checks if speech is currently playing
 */
export function isSpeaking(): boolean {
  if (typeof window === 'undefined') return false
  if (activeAudioElement && !activeAudioElement.paused) return true
  return 'speechSynthesis' in window && window.speechSynthesis.speaking
}

/**
 * Setup Web Audio frequency analyser for real-time lip-sync mouth modulation
 */
function attachAudioAnalyser(audio: HTMLAudioElement, onAudioLevel?: (level: number) => void): void {
  if (!onAudioLevel || typeof window === 'undefined') return

  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioCtx) return

    if (!audioContext) {
      audioContext = new AudioCtx()
    }
    if (audioContext.state === 'suspended') {
      audioContext.resume()
    }

    const analyser = audioContext.createAnalyser()
    analyser.fftSize = 64
    const source = audioContext.createMediaElementSource(audio)
    source.connect(analyser)
    analyser.connect(audioContext.destination)

    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)

    const tick = () => {
      if (!activeAudioElement || activeAudioElement.paused || activeAudioElement.ended) {
        onAudioLevel(0)
        return
      }

      analyser.getByteFrequencyData(dataArray)
      let sum = 0
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i]
      }
      const average = sum / bufferLength
      // Normalized between 0 and 1, amplified for reactive visual mouth movement
      const normalized = Math.min(1.0, (average / 110) * 1.4)
      onAudioLevel(normalized)

      audioAnalyserAnimation = requestAnimationFrame(tick)
    }

    audioAnalyserAnimation = requestAnimationFrame(tick)
  } catch (err) {
    // If Web Audio media element source cross-origin restriction triggers, use synthetic pulse
    simulateAudioPulse(onAudioLevel)
  }
}

/**
 * Synthetic pulse fallback for lip-sync when AudioContext is restricted
 */
function simulateAudioPulse(onAudioLevel: (level: number) => void): void {
  let step = 0
  const tick = () => {
    if (!activeAudioElement || activeAudioElement.paused || activeAudioElement.ended) {
      onAudioLevel(0)
      return
    }
    step += 0.25
    const level = 0.35 + Math.sin(step) * 0.25 + Math.random() * 0.25
    onAudioLevel(Math.min(1.0, Math.max(0.1, level)))
    audioAnalyserAnimation = requestAnimationFrame(tick)
  }
  audioAnalyserAnimation = requestAnimationFrame(tick)
}

/**
 * Strips raw AI markdown, code, list prefixes, and formatting to produce clean, natural spoken words
 */
export function cleanTextForSpeech(raw: string): string {
  if (!raw) return ''
  return raw
    // Remove markdown code blocks
    .replace(/```[\s\S]*?```/g, '')
    // Remove inline code
    .replace(/`([^`]+)`/g, '$1')
    // Remove markdown bold/italics
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    // Remove headers
    .replace(/^#+\s+/gm, '')
    // Remove blockquotes
    .replace(/^>\s+/gm, '')
    // Remove links [text](url) -> text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove bullet characters and list numbers
    .replace(/^[\s]*[-•*+]\s+/gm, '')
    .replace(/^[\s]*\d+\.\s+/gm, '')
    // Remove emojis or symbols that confuse speech synthesizers
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
    // Replace multiple newlines with period and space
    .replace(/\n+/g, '. ')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Speaks text using multi-tier resilient voice synthesis:
 * Tier 1: Native Android TextToSpeech engine on Android APK (Zero network latency, offline, high fidelity)
 * Tier 2: Neural AI Edge TTS (/api/tts) for Vite dev server & cloud
 * Tier 3: Browser Web Speech API (window.speechSynthesis)
 */
export async function speakText(
  text: string,
  voiceId?: string,
  options: SpeakOptions = {}
): Promise<void> {
  stopSpeaking()

  const spokenText = cleanTextForSpeech(text)
  if (!spokenText) {
    currentSpeakingText = ''
    options.onEnd?.()
    return
  }

  currentSpeakingText = spokenText
  lastSpokenText = spokenText

  const effectiveVoiceId =
    voiceId ||
    (typeof window !== 'undefined' ? localStorage.getItem('another-me-twin-voice') : null) ||
    'atlas'
  const voiceOption = getVoiceById(effectiveVoiceId)
  const speed = options.speedMultiplier || 1.0

  // Tier 1: Native Android TextToSpeech on Capacitor APK
  if (isCapacitorAndroid()) {
    let pulseInterval: any = null
    const startPulse = () => {
      options.onStart?.()
      if (options.onAudioLevel) {
        pulseInterval = setInterval(() => {
          const lvl = 0.35 + Math.sin(Date.now() / 140) * 0.25 + Math.random() * 0.2
          options.onAudioLevel?.(Math.min(1.0, Math.max(0.1, lvl)))
        }, 70)
      }
    }
    const stopPulse = () => {
      if (pulseInterval) {
        clearInterval(pulseInterval)
        pulseInterval = null
      }
      options.onAudioLevel?.(0)
    }

    try {
      const nativeDone = await new Promise<boolean>((resolve) => {
        let isDone = false
        activeSpeakResolver = () => {
          if (isDone) return
          isDone = true
          stopPulse()
          stopSpeaking()
          resolve(true)
        }

        speakNativeAndroidTTS(
          spokenText,
          speed * (voiceOption.rate || 1.0),
          voiceOption.pitch || 1.0,
          () => {
            startPulse()
          },
          () => {
            if (isDone) return
            isDone = true
            activeSpeakResolver = null
            stopPulse()
            options.onEnd?.()
            resolve(true)
          },
          (err) => {
            if (isDone) return
            isDone = true
            activeSpeakResolver = null
            stopPulse()
            console.warn('Native Android TTS error event, falling back:', err)
            resolve(false)
          }
        ).then((started) => {
          if (!started) {
            if (!isDone) {
              isDone = true
              stopPulse()
              resolve(false)
            }
          }
        }).catch(() => {
          if (!isDone) {
            isDone = true
            stopPulse()
            resolve(false)
          }
        })
      })

      if (nativeDone) {
        return
      }
    } catch (e) {
      console.warn('Native Android TTS exception, attempting fallback:', e)
    }
  }

  // Tier 2: Try /api/tts endpoint (works in local Vite dev server)
  try {
    const ratePercent = Math.round((speed - 1.0) * 100)
    const rateStr = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`

    const controller = new AbortController()
    activeTTSAbortController = controller
    const timeoutId = setTimeout(() => controller.abort(), 25000)

    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: spokenText,
        voice: voiceOption.providerVoiceId,
        rate: rateStr,
      }),
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    if (activeTTSAbortController === controller) {
      activeTTSAbortController = null
    }

    if (response.ok) {
      const audioBlob = await response.blob()
      if (audioBlob && audioBlob.size > 0) {
        const audioUrl = URL.createObjectURL(audioBlob)
        activeAudioUrl = audioUrl

        const audio = new Audio(audioUrl)
        activeAudioElement = audio
        audio.volume = options.volume !== undefined ? Math.max(0, Math.min(1, options.volume)) : 1.0

        return new Promise((resolve) => {
          let isDone = false

          activeSpeakResolver = () => {
            if (isDone) return
            isDone = true
            if (audio) {
              audio.onended = null
              audio.onerror = null
              audio.onplay = null
              audio.pause()
            }
            resolve()
          }

          const finish = () => {
            if (isDone) return
            isDone = true
            activeSpeakResolver = null
            if (audio) {
              audio.onended = null
              audio.onerror = null
              audio.onplay = null
            }
            stopSpeaking()
            options.onEnd?.()
            resolve()
          }

          audio.onplay = () => {
            options.onStart?.()
            attachAudioAnalyser(audio, options.onAudioLevel)
          }

          audio.onended = () => finish()
          audio.onerror = () => finish()
          audio.play().catch((playErr) => {
            console.warn('Audio play error, falling back to speech synthesis:', playErr)
            finish()
          })
        })
      }
    } else {
      console.warn('TTS API returned non-200 status:', response.status)
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      // Intentionally aborted / interrupted speech — do not fall back or play anything
      return
    }
    // /api/tts endpoint not present or timed out — seamlessly move to Tier 3
    console.warn('Neural TTS endpoint fallback, using system voice synthesizer:', err)
  }

  // Tier 3: Browser SpeechSynthesis (Web Speech API)
  try {
    return await speakBrowserSpeech(spokenText, voiceOption, options)
  } catch (err) {
    console.error('All TTS engines failed:', err)
    stopSpeaking()
    options.onError?.(err as Error)
    options.onEnd?.()
  }
}

/**
 * Robust Web Speech API fallback with Android WebView resume handling
 */
function speakBrowserSpeech(
  text: string,
  voiceOption: VoiceOption,
  options: SpeakOptions
): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      const err = new Error('Speech synthesis not supported in this environment')
      options.onError?.(err)
      options.onEnd?.()
      resolve()
      return
    }

    try {
      window.speechSynthesis.cancel()
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume()
      }
    } catch {}

    const utterance = new SpeechSynthesisUtterance(text)
    activeUtterance = utterance

    // Set voice properties with precise voice persona matching
    const setBestVoice = () => {
      try {
        const voices = window.speechSynthesis.getVoices()
        if (voices && voices.length > 0) {
          // 1. Try matching the exact neural voice name (e.g. "Guy", "Jenny", "Christopher", "Aria")
          const targetName = (voiceOption.providerVoiceId || voiceOption.displayName || '').toLowerCase()
          const nameKeywords = [
            voiceOption.displayName.toLowerCase(),
            targetName.replace('en-us-', '').replace('en-gb-', '').replace('neural', ''),
          ].filter(Boolean)

          let match = voices.find((v) => {
            const vName = v.name.toLowerCase()
            return nameKeywords.some((kw) => kw.length > 2 && vName.includes(kw))
          })

          // 2. Try gender & accent matching
          if (!match) {
            const isMale = voiceOption.gender === 'male'
            const isGB = voiceOption.providerVoiceId?.includes('GB')
            match = voices.find((v) => {
              const vName = v.name.toLowerCase()
              const matchesLang = isGB ? (v.lang.startsWith('en-GB') || vName.includes('uk') || vName.includes('british')) : v.lang.startsWith('en')
              const matchesGender = isMale
                ? /david|mark|guy|male|james|daniel|george|richard/i.test(vName)
                : /zira|jenny|female|aria|samantha|victoria|susan|hazel/i.test(vName)
              return matchesLang && matchesGender
            })
          }

          if (match) utterance.voice = match
        }
      } catch {}
    }

    setBestVoice()
    if (typeof window.speechSynthesis.onvoiceschanged !== 'undefined') {
      window.speechSynthesis.onvoiceschanged = setBestVoice
    }

    utterance.rate = Math.max(0.7, Math.min(1.5, (voiceOption.rate || 1.0) * (options.speedMultiplier || 1.0)))
    utterance.pitch = voiceOption.pitch || 1.0
    utterance.volume = options.volume !== undefined ? options.volume : 1.0

    let pulseInterval: any = null
    let isDone = false

    const cleanup = () => {
      currentSpeakingText = ''
      speechEndTime = Date.now()
      if (pulseInterval) {
        clearInterval(pulseInterval)
        pulseInterval = null
      }
      options.onAudioLevel?.(0)
      activeUtterance = null
    }

    activeSpeakResolver = () => {
      if (isDone) return
      isDone = true
      cleanup()
      try {
        window.speechSynthesis.cancel()
      } catch {}
      resolve()
    }

    utterance.onstart = () => {
      options.onStart?.()
      if (options.onAudioLevel) {
        pulseInterval = setInterval(() => {
          const lvl = 0.35 + Math.sin(Date.now() / 140) * 0.25 + Math.random() * 0.2
          options.onAudioLevel?.(Math.min(1.0, Math.max(0.1, lvl)))
        }, 75)
      }
    }

    utterance.onend = () => {
      if (isDone) return
      isDone = true
      activeSpeakResolver = null
      cleanup()
      options.onEnd?.()
      resolve()
    }

    utterance.onerror = (e) => {
      if (isDone) return
      isDone = true
      activeSpeakResolver = null
      cleanup()
      if (e.error !== 'canceled' && e.error !== 'interrupted') {
        console.warn(`Browser speech synthesis error: ${e.error}`)
      }
      options.onEnd?.()
      resolve()
    }

    // Safety watchdog timer in case browser drops onend
    const wordCount = text.trim().split(/\s+/).length
    const timeoutMs = Math.max(3000, (wordCount / 2.0) * 1000 + 2000)
    setTimeout(() => {
      if (!isDone) {
        isDone = true
        activeSpeakResolver = null
        cleanup()
        options.onEnd?.()
        resolve()
      }
    }, timeoutMs)

    try {
      window.speechSynthesis.speak(utterance)
      // Resume immediately in case browser has auto-paused
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume()
      }
    } catch (e) {
      cleanup()
      options.onEnd?.()
      resolve()
    }
  })
}

/**
 * Play a voice preview sample for Voice Studio
 */
export function playVoicePreview(
  voiceId: string,
  customPhrase?: string,
  options: SpeakOptions = {}
): Promise<void> {
  const voiceOption = getVoiceById(voiceId)
  const phrase = customPhrase && customPhrase.trim() ? customPhrase : voiceOption.previewPhrase
  return speakText(phrase, voiceId, options)
}

/**
 * Speech Recognition Listener Interface
 */
export interface SpeechRecognizerHandlers {
  onStart?: () => void
  onTranscriptChunk?: (interimTranscript: string) => void
  onFinalTranscript?: (transcript: string) => void
  onError?: (errorText: string) => void
  onEnd?: () => void
}

export interface SpeechRecognizerInstance {
  start: () => void
  stop: () => void
  abort: () => void
  clear: () => void
}

export interface SpeechLanguageOption {
  code: string
  label: string
  accent: string
}

export const SUPPORTED_SPEECH_LANGUAGES: SpeechLanguageOption[] = [
  { code: 'en-IN', label: 'English (India)', accent: 'Indian English' },
  { code: 'en-US', label: 'English (US)', accent: 'American English' },
  { code: 'en-GB', label: 'English (UK)', accent: 'British English' },
  { code: 'en-AU', label: 'English (Australia)', accent: 'Australian English' },
  { code: 'hi-IN', label: 'Hindi (India)', accent: 'Devanagari / Hinglish' },
]

export function getDefaultSpeechLanguage(): string {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('another-me-speech-lang')
    if (saved) return saved
    const navLang = navigator.language
    if (navLang) {
      const match = SUPPORTED_SPEECH_LANGUAGES.find(
        (l) => l.code.toLowerCase() === navLang.toLowerCase()
      )
      if (match) return match.code
    }
  }
  return 'en-IN'
}

/**
 * Factory for browser speech recognition with language/accent tuning
 */
export function createSpeechRecognizer(
  handlers: SpeechRecognizerHandlers,
  lang?: string
): SpeechRecognizerInstance {
  if (typeof window === 'undefined') {
    return { start: () => {}, stop: () => {}, abort: () => {}, clear: () => {} }
  }

  const SpeechRecognition =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

  if (!SpeechRecognition) {
    handlers.onError?.('Speech recognition is not supported in this browser. Please use Google Chrome, Microsoft Edge, or Safari.')
    return { start: () => {}, stop: () => {}, abort: () => {}, clear: () => {} }
  }

  const recognition = new SpeechRecognition()
  recognition.continuous = true
  recognition.interimResults = true
  recognition.maxAlternatives = 1
  recognition.lang = lang || getDefaultSpeechLanguage()

  let startIndex = 0
  let currentResultsCount = 0

  recognition.onstart = () => {
    handlers.onStart?.()
  }

  recognition.onresult = (event: any) => {
    currentResultsCount = event.results.length
    if (startIndex > event.results.length) {
      startIndex = 0
    }

    let finalTranscript = ''
    let interimTranscript = ''

    for (let i = startIndex; i < event.results.length; ++i) {
      const result = event.results[i]
      if (result.isFinal) {
        finalTranscript += result[0].transcript + ' '
      } else {
        interimTranscript += result[0].transcript
      }
    }

    const currentCombined = (finalTranscript + interimTranscript).trim()
    if (currentCombined) {
      handlers.onTranscriptChunk?.(currentCombined)
      if (finalTranscript.trim()) {
        handlers.onFinalTranscript?.(currentCombined)
      }
    }
  }

  recognition.onerror = (event: any) => {
    if (event.error === 'no-speech') return
    if (event.error === 'aborted') return
    handlers.onError?.(`Microphone error: ${event.error}`)
  }

  recognition.onend = () => {
    startIndex = 0
    currentResultsCount = 0
    handlers.onEnd?.()
  }

  return {
    start: () => {
      try {
        recognition.start()
      } catch (err: any) {
        // If already active, it is already listening smoothly - do not abort!
        if (
          err?.name === 'InvalidStateError' ||
          (typeof err?.message === 'string' && (err.message.includes('already started') || err.message.includes('recognition has already started')))
        ) {
          return
        }
        try {
          recognition.abort()
          setTimeout(() => {
            try {
              recognition.start()
            } catch (retryErr) {
              // Ignore
            }
          }, 150)
        } catch {
          // Ignore
        }
      }
    },
    stop: () => {
      try {
        recognition.stop()
      } catch (err) {
        // Ignore
      }
    },
    abort: () => {
      try {
        recognition.abort()
      } catch (err) {
        // Ignore
      }
    },
    clear: () => {
      startIndex = currentResultsCount
    },
  }
}

/**
 * Stitches speech transcripts seamlessly across recognition session breaks without
 * duplicating words or truncating multi-clause sentences.
 */
export function combineTranscripts(accumulated: string, current: string): string {
  const acc = (accumulated || '').trim()
  const cur = (current || '').trim()
  if (!acc) return cur
  if (!cur) return acc

  const accLower = acc.toLowerCase()
  const curLower = cur.toLowerCase()

  // If current already contains accumulated from the beginning, current is already the complete transcript
  if (curLower.startsWith(accLower)) {
    return cur
  }

  // If accumulated already contains current at the end, keep accumulated
  if (accLower.endsWith(curLower)) {
    return acc
  }

  // Check for word overlap between end of accumulated and start of current
  const accWords = acc.split(/\s+/)
  const curWords = cur.split(/\s+/)

  const maxOverlap = Math.min(accWords.length, curWords.length, 6)
  for (let len = maxOverlap; len > 0; len--) {
    const accEnd = accWords
      .slice(accWords.length - len)
      .map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, ''))
      .join(' ')
    const curStart = curWords
      .slice(0, len)
      .map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, ''))
      .join(' ')
    if (accEnd && curStart && accEnd === curStart) {
      const remainder = curWords.slice(len).join(' ')
      return remainder ? `${acc} ${remainder}` : acc
    }
  }

  return `${acc} ${cur}`
}

