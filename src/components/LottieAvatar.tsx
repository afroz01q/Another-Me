import React, { useEffect, useRef, useState } from 'react'
import lottie from 'lottie-web/build/player/lottie_light'
import type { AnimationItem } from 'lottie-web'
import type { VoiceInteractionState, AvatarState } from '@/types'
import talkingAnimationData from '@/assets/animations/talking-avatar.json'
import { cn } from '@/lib/utils'

interface LottieAvatarProps {
  voiceState?: VoiceInteractionState | AvatarState
  audioLevel?: number
  accentColor?: string
  className?: string
  style?: React.CSSProperties
  size?: number | string
  interactive?: boolean
  showAura?: boolean
}

export function LottieAvatar({
  voiceState = 'idle',
  audioLevel = 0,
  accentColor = '#da7756',
  className,
  style,
  size,
  interactive = false,
  showAura = true,
}: LottieAvatarProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const animRef = useRef<AnimationItem | null>(null)
  const [isReady, setIsReady] = useState(false)

  // Initialize Lottie player
  useEffect(() => {
    if (!containerRef.current) return

    // Clean up previous instance if any
    if (animRef.current) {
      animRef.current.destroy()
      animRef.current = null
    }

    try {
      const anim = lottie.loadAnimation({
        container: containerRef.current,
        renderer: 'svg',
        loop: true,
        autoplay: false,
        animationData: talkingAnimationData,
        rendererSettings: {
          preserveAspectRatio: 'xMidYMid meet',
          progressiveLoad: true,
          hideOnTransparent: true,
        },
      })

      anim.addEventListener('DOMLoaded', () => {
        setIsReady(true)
        // Default to frame 0 (resting pose, mouth closed, glasses and eyes open)
        anim.goToAndStop(0, true)
      })

      animRef.current = anim

      return () => {
        anim.destroy()
        animRef.current = null
      }
    } catch (err) {
      console.warn('LottieAvatar initialization warning:', err)
    }
  }, [])

  // Control playback based on voice interaction state
  useEffect(() => {
    const anim = animRef.current
    if (!anim || !isReady) return

    if (voiceState === 'speaking') {
      // Modulate speech animation speed subtly with audio level
      const dynamicSpeed = 1.0 + Math.min(0.35, (audioLevel || 0) * 0.5)
      anim.setSpeed(dynamicSpeed)
      anim.play()
    } else {
      // Pause speech immediately and return cleanly to resting friendly face (frame 0)
      anim.pause()
      anim.goToAndStop(0, true)
    }
  }, [voiceState, audioLevel, isReady])

  // Aura and glow styling based on voice state
  const isSpeaking = voiceState === 'speaking'
  const isListening = voiceState === 'listening'
  const isThinking = voiceState === 'thinking' || voiceState === 'processing'

  return (
    <div
      className={cn(
        "relative flex items-center justify-center select-none transition-all duration-300",
        interactive ? "cursor-pointer" : "pointer-events-none",
        className
      )}
      style={{
        width: size || '100%',
        height: size || '100%',
        maxWidth: typeof size === 'number' ? `${size}px` : undefined,
        maxHeight: typeof size === 'number' ? `${size}px` : undefined,
        ...style,
      }}
    >
      {/* Background Soft Aura Glow */}
      {showAura && (
        <div
          className="absolute inset-0 -z-10 rounded-full transition-all duration-500 pointer-events-none"
          style={{
            background: isSpeaking
              ? `radial-gradient(circle, ${accentColor}30 0%, transparent 68%)`
              : isListening
              ? 'radial-gradient(circle, rgba(6, 182, 212, 0.22) 0%, transparent 68%)'
              : isThinking
              ? 'radial-gradient(circle, rgba(245, 158, 11, 0.18) 0%, transparent 68%)'
              : `radial-gradient(circle, ${accentColor}12 0%, transparent 65%)`,
            filter: 'blur(36px)',
            transform: isSpeaking
              ? `scale(${1.12 + (audioLevel || 0.1) * 0.1})`
              : 'scale(1)',
          }}
        />
      )}

      {/* Lottie Vector SVG Animation Container */}
      <div
        ref={containerRef}
        className="w-full h-full flex items-center justify-center [&_svg]:w-full [&_svg]:h-full [&_svg]:max-h-full [&_svg]:object-contain"
        style={{
          filter: isSpeaking
            ? 'brightness(1.04) contrast(1.02)'
            : 'brightness(1) contrast(1)',
          transition: 'filter 200ms ease',
        }}
      />
    </div>
  )
}
