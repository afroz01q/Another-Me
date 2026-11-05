import React, { useRef, useEffect, useState } from 'react'
import {
  Camera, AlertTriangle, RefreshCw, Sparkles, Shield
} from 'lucide-react'
import type { VoiceInteractionState, Avatar } from '@/types'
import { useTwinStore, useAuthStore } from '@/store'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'
import { LottieAvatar } from '@/components/LottieAvatar'

interface PersonalTwinAvatarPlayerProps {
  voiceState: VoiceInteractionState
  accentColor?: string
  twinName?: string
  audioLevel?: number
  onOpenUploadModal: () => void
}

export function PersonalTwinAvatarPlayer({
  voiceState,
  accentColor = '#da7756',
  twinName = 'Your Twin',
  audioLevel = 0,
  onOpenUploadModal,
}: PersonalTwinAvatarPlayerProps) {
  const { user } = useAuthStore()
  const {
    avatar,
    isGeneratingAvatar,
    pollAvatarStatus,
    generateAvatarVideo,
    loadUserAvatar,
  } = useTwinStore()

  useEffect(() => {
    if (user?.id && !avatar) {
      loadUserAvatar(user.id)
    }
  }, [user?.id, avatar, loadUserAvatar])

  const videoRef = useRef<HTMLVideoElement>(null)

  const [videoLoaded, setVideoLoaded] = useState(false)
  const [videoError, setVideoError] = useState(false)
  const [isPolling, setIsPolling] = useState(false)

  const sourceImagePath = avatar?.source_image_path || '/avatars/user_avatar.png'
  const hasPhoto = !!avatar?.source_image_path || true
  const hasVideo = !!avatar?.generated_video_path && avatar?.status === 'completed' && !videoError
  const isProcessing = avatar?.status === 'processing' || avatar?.status === 'queued'
  const isFailed = avatar?.status === 'failed' && !hasPhoto

  // Poll generation status automatically if job is in progress
  useEffect(() => {
    let interval: any = null
    if (isProcessing && avatar?.provider_job_id) {
      setIsPolling(true)
      interval = setInterval(async () => {
        const updated = await pollAvatarStatus()
        if (updated?.status === 'completed') {
          setIsPolling(false)
          toast.success('Your personal AI digital twin video is ready!', { icon: '✨' })
        } else if (updated?.status === 'failed') {
          setIsPolling(false)
        }
      }, 4000)
    }
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [isProcessing, avatar?.provider_job_id])

  // Synchronize avatar video playback strictly with AI voice state:
  // When AI speaks, play the video. As soon as AI speech stops, pause and return to resting pose.
  useEffect(() => {
    const video = videoRef.current
    if (!video || !hasVideo) return

    if (voiceState === 'speaking') {
      video.muted = true
      const playPromise = video.play()
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn('Avatar video play error:', err)
        })
      }
    } else {
      // Pause immediately and reset to resting face pose when AI stops speaking
      video.pause()
      video.currentTime = 0
    }
  }, [voiceState, hasVideo])

  // If the video clip ends while the AI is still speaking, seamlessly loop back to start;
  // If AI is not speaking, stay paused at frame 0.
  const handleVideoEnded = () => {
    const video = videoRef.current
    if (!video) return
    if (voiceState === 'speaking') {
      video.currentTime = 0
      video.play().catch(() => {})
    } else {
      video.pause()
      video.currentTime = 0
    }
  }

  // Handle when video finishes loading initial metadata/data
  const handleLoadedData = () => {
    setVideoLoaded(true)
    setVideoError(false)
    const video = videoRef.current
    if (!video) return
    if (voiceState === 'speaking') {
      video.muted = true
      video.play().catch(() => {})
    } else {
      video.pause()
      video.currentTime = 0
    }
  }

  const handleRetryGeneration = async () => {
    try {
      toast.loading('Retrying video generation...', { id: 'retry-toast' })
      await generateAvatarVideo()
      toast.success('Generation queued!', { id: 'retry-toast' })
    } catch (err: any) {
      toast.dismiss('retry-toast')
      onOpenUploadModal()
    }
  }

  // -----------------------------------------------------------------
  // 1. EMPTY STATE: No photo uploaded yet
  // -----------------------------------------------------------------
  if (!hasPhoto && !hasVideo) {
    return (
      <div className="w-full max-w-lg h-full flex flex-col items-center justify-center p-6 text-center select-none pointer-events-auto">
        <div className="relative group mb-4">
          <div
            className="w-28 h-28 sm:w-32 sm:h-32 rounded-3xl flex items-center justify-center transition-all transform group-hover:scale-105"
            style={{
              background: 'radial-gradient(circle at 35% 35%, #282622 0%, #1c1b18 100%)',
              border: '2px dashed rgba(218, 119, 86, 0.45)',
              boxShadow: '0 8px 32px rgba(218, 119, 86, 0.15)',
            }}
          >
            <Camera size={38} className="text-[#da7756] opacity-80 group-hover:opacity-100 transition-opacity" />
          </div>
          <span className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-[#da7756] text-[#181816] flex items-center justify-center shadow-lg font-bold text-base">
            +
          </span>
        </div>

        <h3 className="font-serif text-xl sm:text-2xl font-normal text-[#edebe8] tracking-tight mb-2">
          Create Your Personal Digital Twin
        </h3>
        <p className="text-xs sm:text-sm text-[#b5b1a8] max-w-sm font-serif italic mb-5 leading-relaxed">
          Upload a clear photograph of your own face to generate your personal talking-head AI avatar with realistic facial expressions and lip synchronization.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-3">
          <button
            onClick={onOpenUploadModal}
            data-testid="create-personal-twin-btn"
            className="px-5 py-2.5 rounded-full bg-[#da7756] hover:bg-[#e28a6c] text-[#181816] text-xs sm:text-sm font-semibold flex items-center gap-2 transition-all shadow-lg shadow-[#da7756]/25 cursor-pointer transform active:scale-95"
          >
            <Sparkles size={16} />
            Upload Photo & Create My Twin
          </button>
        </div>

        <div className="mt-6 flex items-center gap-4 text-[11px] text-[#7d7a73] font-mono">
          <span className="flex items-center gap-1">
            <Shield size={12} className="text-emerald-400" /> Private to your account
          </span>
          <span>•</span>
          <span>PNG, JPG, WebP</span>
        </div>
      </div>
    )
  }

  // -----------------------------------------------------------------
  // 2. PROCESSING STATE: Generation in progress
  // -----------------------------------------------------------------
  if (isProcessing) {
    return (
      <div className="w-full max-w-md h-full flex flex-col items-center justify-center p-6 text-center select-none pointer-events-auto">
        <div className="relative w-36 h-36 sm:w-44 sm:h-44 rounded-3xl overflow-hidden border-2 border-[#da7756] shadow-2xl mb-4 bg-[#201f1c]">
          {avatar?.source_image_path && (
            <img
              src={avatar.source_image_path}
              alt="Source likeness"
              className="w-full h-full object-cover filter brightness-90 animate-pulse"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent flex flex-col items-center justify-end pb-3">
            <div className="flex items-center gap-1.5 bg-[#da7756] text-[#181816] text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
              <RefreshCw size={11} className="animate-spin" /> Synthesizing
            </div>
          </div>
        </div>

        <h3 className="font-serif text-lg sm:text-xl font-normal text-[#edebe8] mb-1">
          Generating {avatar?.name || 'Your Twin'}
        </h3>
        <p className="text-xs text-[#b5b1a8] max-w-xs font-serif italic mb-4 leading-relaxed">
          The AI video engine is animating your facial expressions, natural eye movements, and lip synchronization.
        </p>

        <div className="p-3 rounded-xl bg-[#201f1c] border border-[#35332d] w-full max-w-xs text-left text-[11px] font-mono space-y-1 mb-3">
          <div className="flex justify-between text-[#7d7a73]">
            <span>Provider:</span>
            <span className="text-[#edebe8] uppercase">{avatar?.provider || 'D-ID'}</span>
          </div>
          <div className="flex justify-between text-[#7d7a73]">
            <span>Job ID:</span>
            <span className="text-[#da7756] truncate max-w-[160px]">{avatar?.provider_job_id || 'Queued...'}</span>
          </div>
          <div className="flex justify-between text-[#7d7a73]">
            <span>Status:</span>
            <span className="text-emerald-400 capitalize">{avatar?.status}</span>
          </div>
        </div>

        <button
          onClick={async () => {
            toast.loading('Checking provider status...', { id: 'poll-toast' })
            const res = await pollAvatarStatus()
            toast.success(`Status: ${res?.status || 'Processing'}`, { id: 'poll-toast' })
          }}
          className="text-xs text-[#da7756] hover:underline flex items-center gap-1 font-mono"
        >
          <RefreshCw size={12} /> Refresh Status
        </button>
      </div>
    )
  }

  // -----------------------------------------------------------------
  // 3. FAILED STATE: Generation error
  // -----------------------------------------------------------------
  if (isFailed && !hasVideo) {
    return (
      <div className="w-full max-w-md h-full flex flex-col items-center justify-center p-6 text-center select-none pointer-events-auto">
        <div className="relative w-32 h-32 rounded-3xl overflow-hidden border-2 border-red-500/50 shadow-xl mb-4 bg-[#201f1c]">
          {avatar?.source_image_path && (
            <img
              src={avatar.source_image_path}
              alt="Source likeness"
              className="w-full h-full object-cover filter grayscale contrast-125"
            />
          )}
          <div className="absolute inset-0 bg-red-950/60 flex items-center justify-center">
            <AlertTriangle size={32} className="text-red-400" />
          </div>
        </div>

        <h3 className="font-serif text-lg font-normal text-[#edebe8] mb-1">
          Avatar Generation Unsuccessful
        </h3>
        <p className="text-xs text-red-300 max-w-xs font-serif italic mb-4 leading-relaxed bg-red-950/40 p-2.5 rounded-xl border border-red-500/30">
          {avatar?.error_message || 'The AI video provider encountered an error generating the talking head.'}
        </p>

        <div className="flex items-center gap-2">
          <button
            onClick={onOpenUploadModal}
            className="px-4 py-2 rounded-full bg-[#da7756] hover:bg-[#e28a6c] text-[#181816] text-xs font-semibold transition-colors"
          >
            Configure Provider & Retry
          </button>
          <button
            onClick={handleRetryGeneration}
            className="px-4 py-2 rounded-full bg-[#201f1c] hover:bg-[#282622] text-[#edebe8] border border-[#35332d] text-xs font-medium transition-colors"
          >
            Instant Retry
          </button>
        </div>
      </div>
    )
  }

  // -----------------------------------------------------------------
  // 4. PERSONAL TWIN AVATAR: Clean, frameless workspace presentation
  // -----------------------------------------------------------------
  return (
    <div className="relative w-full max-w-2xl h-full flex flex-col items-center justify-center pointer-events-none select-none">
      {/* Avatar Container - Frameless, Noticeably Enlarged (35-50% larger), Clean Presentation */}
      <div
        className={cn(
          "relative flex items-center justify-center transition-all duration-300 select-none pointer-events-none",
          hasVideo
            ? "w-full max-w-[280px] sm:max-w-[360px] md:max-w-[420px] aspect-square overflow-hidden rounded-2xl"
            : "w-full max-w-[320px] sm:max-w-[420px] md:max-w-[500px] lg:max-w-[540px] aspect-[386/278]"
        )}
      >
        {hasVideo && avatar?.generated_video_path ? (
          <video
            ref={videoRef}
            src={avatar.generated_video_path}
            poster={avatar?.thumbnail_path || sourceImagePath}
            playsInline
            muted
            autoPlay={false}
            loop={false}
            controls={false}
            disablePictureInPicture
            disableRemotePlayback
            preload="auto"
            onEnded={handleVideoEnded}
            onLoadedData={handleLoadedData}
            onError={() => setVideoError(true)}
            onContextMenu={(e) => e.preventDefault()}
            className="w-full h-full object-cover object-center select-none pointer-events-none"
          />
        ) : (
          <LottieAvatar
            voiceState={voiceState}
            audioLevel={audioLevel}
            accentColor={accentColor}
            className="w-full h-full"
            showAura={true}
          />
        )}
      </div>

      {/* Identification Below Avatar */}
      <div className="mt-3 text-center pointer-events-none select-none">
        <span className="font-serif italic text-sm text-[#edebe8] block tracking-wide">
          {avatar?.name || twinName}
        </span>
        <span className="text-[10px] font-mono text-[#7d7a73] tracking-widest uppercase block mt-0.5">
          {hasVideo ? 'Personal Video Twin' : 'Animated Digital Twin'}
        </span>
      </div>
    </div>
  )
}

