import React, { useRef, useEffect, useState, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Float, Sphere, MeshDistortMaterial, Ring } from '@react-three/drei'
import * as THREE from 'three'
import type { VoiceInteractionState } from '@/types'
import { LottieAvatar } from './LottieAvatar'
export { LottieAvatar }

type AvatarState = 'idle' | 'listening' | 'speaking' | 'thinking'

interface AvatarOrbProps {
  state: AvatarState | VoiceInteractionState
  accentColor?: string
  size?: number
}

// -------------------------------------------------------------
// VoiceAvatar3D: Main voice-first 3D digital twin presentation
// -------------------------------------------------------------
interface VoiceAvatar3DProps {
  state: VoiceInteractionState
  accentColor?: string
  twinName?: string
  audioLevel?: number
}

function HumanoidTwinEntity({
  state,
  accentColor,
  audioLevel = 0,
}: {
  state: VoiceInteractionState
  accentColor: string
  audioLevel?: number
}) {
  const headRef = useRef<THREE.Group>(null)
  const coreRef = useRef<THREE.Mesh>(null)
  const leftEyeRef = useRef<THREE.Mesh>(null)
  const rightEyeRef = useRef<THREE.Mesh>(null)
  const mouthRef = useRef<THREE.Mesh>(null)
  const haloRef = useRef<THREE.Mesh>(null)
  const halo2Ref = useRef<THREE.Mesh>(null)
  const particlesRef = useRef<THREE.Points>(null)

  // Color mappings for states
  const stateColorMap: Record<string, string> = {
    idle: accentColor || '#ea580c',
    requesting_permission: '#fbbf24',
    listening: '#06b6d4',
    processing: '#a855f7',
    thinking: '#f59e0b',
    generating_speech: '#8b5cf6',
    speaking: '#10b981',
    interrupted: '#f43f5e',
    error: '#ef4444',
  }

  const activeColorHex = stateColorMap[state] || stateColorMap.idle
  const targetColor = new THREE.Color(activeColorHex)
  const currentColor = useRef(targetColor.clone())

  // Blinking cycle state
  const nextBlinkTime = useRef(Date.now() + 2500)
  const isBlinking = useRef(false)
  const blinkProgress = useRef(0)

  // Particle positions
  const particleGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    const count = 40
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2
      const radius = 1.6 + Math.random() * 0.8
      positions[i * 3] = Math.cos(angle) * radius
      positions[i * 3 + 1] = (Math.random() - 0.5) * 1.5
      positions[i * 3 + 2] = Math.sin(angle) * radius
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return geo
  }, [])

  useFrame((clockState, delta) => {
    const time = clockState.clock.getElapsedTime()
    currentColor.current.lerp(targetColor, delta * 3.5)

    // 1. Natural subtle head float & micro-movement
    if (headRef.current) {
      if (state === 'speaking') {
        headRef.current.position.y = Math.sin(time * 3.5) * 0.04
        headRef.current.rotation.y = Math.sin(time * 1.2) * 0.05
        headRef.current.rotation.x = Math.sin(time * 2.0) * 0.02
      } else if (state === 'listening') {
        // Leans slightly forward toward listener
        headRef.current.position.y = Math.sin(time * 2) * 0.02
        headRef.current.rotation.x = -0.06 + Math.sin(time * 2.5) * 0.015
        headRef.current.rotation.y = Math.sin(time * 0.8) * 0.03
      } else if (state === 'thinking') {
        headRef.current.position.y = Math.sin(time * 3) * 0.03
        headRef.current.rotation.z = Math.sin(time * 1.5) * 0.03
        headRef.current.rotation.y += delta * 0.15
      } else {
        // Idle breathing
        headRef.current.position.y = Math.sin(time * 1.2) * 0.03
        headRef.current.rotation.y = Math.sin(time * 0.5) * 0.03
        headRef.current.rotation.x = Math.sin(time * 0.7) * 0.015
      }
    }

    // 2. Core mesh distortion & color update
    if (coreRef.current) {
      const mat = coreRef.current.material as THREE.MeshPhysicalMaterial
      if (mat && mat.color) {
        mat.color.copy(currentColor.current)
      }
    }

    // 3. Natural blinking logic
    const now = Date.now()
    if (!isBlinking.current && now > nextBlinkTime.current) {
      isBlinking.current = true
      blinkProgress.current = 0
      nextBlinkTime.current = now + 3000 + Math.random() * 3500
    }

    if (isBlinking.current) {
      blinkProgress.current += delta * 12
      const eyeScaleY = Math.max(0.08, Math.sin(blinkProgress.current * Math.PI))
      if (leftEyeRef.current) leftEyeRef.current.scale.y = eyeScaleY
      if (rightEyeRef.current) rightEyeRef.current.scale.y = eyeScaleY

      if (blinkProgress.current >= 1) {
        isBlinking.current = false
        if (leftEyeRef.current) leftEyeRef.current.scale.y = 1
        if (rightEyeRef.current) rightEyeRef.current.scale.y = 1
      }
    }

    // 4. Mouth synchronization with speech
    if (mouthRef.current) {
      if (state === 'speaking') {
        // Speech articulation modulation
        const speechMouthOpen = 0.3 + Math.abs(Math.sin(time * 14)) * 0.7 + (audioLevel * 0.5)
        mouthRef.current.scale.y = THREE.MathUtils.lerp(mouthRef.current.scale.y, speechMouthOpen, delta * 18)
        mouthRef.current.scale.x = THREE.MathUtils.lerp(mouthRef.current.scale.x, 1 + Math.sin(time * 9) * 0.25, delta * 10)
      } else if (state === 'listening') {
        // Slight alert responsive mouth shape
        mouthRef.current.scale.y = THREE.MathUtils.lerp(mouthRef.current.scale.y, 0.2 + audioLevel * 0.6, delta * 15)
        mouthRef.current.scale.x = THREE.MathUtils.lerp(mouthRef.current.scale.x, 1.1, delta * 6)
      } else {
        // Idle gentle smile
        mouthRef.current.scale.y = THREE.MathUtils.lerp(mouthRef.current.scale.y, 0.15, delta * 8)
        mouthRef.current.scale.x = THREE.MathUtils.lerp(mouthRef.current.scale.x, 1.0, delta * 6)
      }
    }

    // 5. Soundwave Halos
    if (haloRef.current) {
      haloRef.current.rotation.z += delta * (state === 'speaking' ? 1.5 : 0.4)
      const scaleBase = state === 'speaking' ? 1 + Math.sin(time * 8) * 0.12 : 1
      haloRef.current.scale.set(scaleBase, scaleBase, scaleBase)
    }
    if (halo2Ref.current) {
      halo2Ref.current.rotation.z -= delta * (state === 'thinking' ? 2.0 : 0.25)
    }

    // 6. Particle field rotation
    if (particlesRef.current) {
      particlesRef.current.rotation.y += delta * 0.1
    }
  })

  const distortSpeed = state === 'speaking' ? 2.8 : state === 'listening' ? 1.8 : state === 'thinking' ? 2.2 : 0.8
  const distortAmount = state === 'speaking' ? 0.45 : state === 'listening' ? 0.35 : 0.2

  return (
    <group ref={headRef}>
      {/* Outer ambient glow envelope */}
      <Sphere args={[1.7, 32, 32]}>
        <meshBasicMaterial
          color={targetColor}
          transparent
          opacity={state === 'speaking' ? 0.08 : 0.04}
          side={THREE.BackSide}
        />
      </Sphere>

      {/* Main Stylized Head Core */}
      <Float speed={1.2} rotationIntensity={0.15} floatIntensity={0.25}>
        <Sphere ref={coreRef} args={[1.05, 64, 64]}>
          <MeshDistortMaterial
            color={activeColorHex}
            distort={distortAmount}
            speed={distortSpeed}
            roughness={0.12}
            metalness={0.25}
            transparent
            opacity={0.88}
          />
        </Sphere>
      </Float>

      {/* Inner luminous heart */}
      <Sphere args={[0.42, 16, 16]}>
        <meshBasicMaterial color="#ffffff" transparent opacity={0.22} />
      </Sphere>

      {/* Expressive Twin Eyes */}
      <group position={[0, 0.15, 0.95]}>
        {/* Left eye */}
        <Sphere ref={leftEyeRef} args={[0.075, 16, 16]} position={[-0.26, 0, 0]}>
          <meshBasicMaterial color="#ffffff" />
        </Sphere>
        {/* Right eye */}
        <Sphere ref={rightEyeRef} args={[0.075, 16, 16]} position={[0.26, 0, 0]}>
          <meshBasicMaterial color="#ffffff" />
        </Sphere>

        {/* Eye glow highlights */}
        <Sphere args={[0.035, 8, 8]} position={[-0.26, 0.02, 0.06]}>
          <meshBasicMaterial color={activeColorHex} />
        </Sphere>
        <Sphere args={[0.035, 8, 8]} position={[0.26, 0.02, 0.06]}>
          <meshBasicMaterial color={activeColorHex} />
        </Sphere>
      </group>

      {/* Articulating Mouth for Lip-Sync Speech Expression */}
      <group position={[0, -0.25, 0.96]}>
        <mesh ref={mouthRef}>
          <cylinderGeometry args={[0.18, 0.18, 0.04, 16]} />
          <meshBasicMaterial color="#FAF6F0" transparent opacity={0.9} />
        </mesh>
      </group>

      {/* Soundwave Halo Rings */}
      <Ring ref={haloRef} args={[1.25, 1.32, 64]} rotation={[Math.PI / 2.3, 0.2, 0]}>
        <meshBasicMaterial color={targetColor} transparent opacity={0.35} />
      </Ring>
      <Ring ref={halo2Ref} args={[1.45, 1.48, 64]} rotation={[Math.PI / 1.8, -0.3, 0]}>
        <meshBasicMaterial color={targetColor} transparent opacity={0.2} />
      </Ring>

      {/* Floating Orbital Thinking / Speaking Particles */}
      <points ref={particlesRef} geometry={particleGeo}>
        <pointsMaterial size={0.06} color={targetColor} transparent opacity={0.65} />
      </points>
    </group>
  )
}

export function VoiceAvatar3D({
  state = 'idle',
  accentColor = '#ea580c',
  twinName = 'Your Twin',
  audioLevel = 0,
}: VoiceAvatar3DProps) {
  const [hasWebGL, setHasWebGL] = useState(true)

  useEffect(() => {
    try {
      const canvas = document.createElement('canvas')
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
      setHasWebGL(Boolean(gl))
    } catch {
      setHasWebGL(false)
    }
  }, [])

  if (!hasWebGL) {
    return <VoiceAvatarFallback state={state} accentColor={accentColor} twinName={twinName} />
  }

  return (
    <div className="w-full h-full relative flex items-center justify-center select-none overflow-hidden pointer-events-none">
      {/* 3D Canvas */}
      <Canvas
        camera={{ position: [0, 0, 3.8], fov: 42 }}
        dpr={[1, 2]}
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
        style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[4, 6, 5]} intensity={1.2} color="#ffffff" />
        <pointLight position={[-4, -3, 3]} intensity={1.0} color={accentColor} />
        <pointLight position={[0, 4, 2]} intensity={0.8} color="#06b6d4" />
        <HumanoidTwinEntity state={state} accentColor={accentColor} audioLevel={audioLevel} />
      </Canvas>
    </div>
  )
}

// -------------------------------------------------------------
// VoiceAvatarFallback: Elegant 2D canvas animated representation
// -------------------------------------------------------------
export function VoiceAvatarFallback({
  state = 'idle',
  accentColor = '#ea580c',
  twinName = 'Your Twin',
}: VoiceAvatar3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId: number
    let time = 0

    const render = () => {
      time += 0.02
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const cx = canvas.width / 2
      const cy = canvas.height / 2
      const baseR = Math.min(cx, cy) * 0.38

      // Pulsing outer aura
      const auraR = baseR * (1.3 + Math.sin(time * 2) * 0.08)
      const gradAura = ctx.createRadialGradient(cx, cy, baseR * 0.6, cx, cy, auraR)
      gradAura.addColorStop(0, accentColor + '30')
      gradAura.addColorStop(1, 'transparent')
      ctx.beginPath()
      ctx.arc(cx, cy, auraR, 0, Math.PI * 2)
      ctx.fillStyle = gradAura
      ctx.fill()

      // Core orb
      const orbR = baseR * (1 + (state === 'speaking' ? Math.sin(time * 8) * 0.06 : Math.sin(time) * 0.02))
      const gradOrb = ctx.createRadialGradient(cx - orbR * 0.3, cy - orbR * 0.3, 0, cx, cy, orbR)
      gradOrb.addColorStop(0, '#ffffff')
      gradOrb.addColorStop(0.3, accentColor)
      gradOrb.addColorStop(1, '#0e0e12')

      ctx.beginPath()
      ctx.arc(cx, cy, orbR, 0, Math.PI * 2)
      ctx.fillStyle = gradOrb
      ctx.shadowColor = accentColor
      ctx.shadowBlur = 35
      ctx.fill()
      ctx.shadowBlur = 0

      // Blinking Eyes
      const blink = Math.sin(time * 1.5) > 0.95 ? 0.1 : 1.0
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.ellipse(cx - orbR * 0.28, cy - orbR * 0.1, 7, 7 * blink, 0, 0, Math.PI * 2)
      ctx.ellipse(cx + orbR * 0.28, cy - orbR * 0.1, 7, 7 * blink, 0, 0, Math.PI * 2)
      ctx.fill()

      // Speaking Mouth
      const mouthHeight = state === 'speaking' ? 6 + Math.abs(Math.sin(time * 12)) * 12 : 3
      ctx.fillStyle = '#FAF6F0'
      ctx.beginPath()
      ctx.ellipse(cx, cy + orbR * 0.3, 14, mouthHeight, 0, 0, Math.PI * 2)
      ctx.fill()

      animId = requestAnimationFrame(render)
    }

    render()
    return () => cancelAnimationFrame(animId)
  }, [state, accentColor])

  return (
    <div className="w-full h-full flex items-center justify-center pointer-events-none">
      <canvas ref={canvasRef} width={450} height={450} style={{ width: '80%', height: '80%', objectFit: 'contain', pointerEvents: 'none' }} />
    </div>
  )
}

// -------------------------------------------------------------
// Legacy & Small Component Exports for Studio / Header
// -------------------------------------------------------------
export function AvatarOrb({ state = 'idle', accentColor = '#7c3aed', size = 280 }: AvatarOrbProps) {
  return (
    <div style={{ width: size, height: size }} className="relative">
      <VoiceAvatar3D state={state as VoiceInteractionState} accentColor={accentColor} />
    </div>
  )
}

export function AvatarOrbFallback({ state = 'idle', accentColor = '#7c3aed', size = 280 }: AvatarOrbProps) {
  return (
    <div style={{ width: size, height: size }}>
      <VoiceAvatarFallback state={state as VoiceInteractionState} accentColor={accentColor} />
    </div>
  )
}

export function TwinAvatarSmall({ state = 'idle', accentColor = '#7c3aed', size = 40 }: { state?: string; accentColor?: string; size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: `radial-gradient(circle at 35% 35%, ${accentColor}ee, ${accentColor}77)`,
        boxShadow: state === 'speaking'
          ? `0 0 16px ${accentColor}70, 0 0 32px ${accentColor}30`
          : `0 0 12px ${accentColor}40`,
        flexShrink: 0,
        transition: 'box-shadow 0.3s ease',
      }}
    />
  )
}

export function AvatarStudioPreview({
  state = 'idle',
  accentColor = '#7c3aed',
  background = '#0d0d0f',
  avatarType = 'animated_character',
}: {
  state?: AvatarState | string
  accentColor?: string
  background?: string
  avatarType?: 'animated_character' | '3d_orb'
}) {
  if (avatarType === 'animated_character') {
    return (
      <div
        style={{ width: '100%', height: '100%', background, borderRadius: 'var(--radius-xl)' }}
        className="flex items-center justify-center p-3"
      >
        <LottieAvatar
          voiceState={state as VoiceInteractionState}
          accentColor={accentColor}
          className="w-full h-full"
        />
      </div>
    )
  }

  return (
    <div style={{ width: '100%', height: '100%', background, borderRadius: 'var(--radius-xl)' }}>
      <VoiceAvatar3D state={(state as VoiceInteractionState) || 'idle'} accentColor={accentColor} />
    </div>
  )
}
