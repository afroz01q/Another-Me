import React, { useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  ArrowRight, Sparkles, Brain, Shield, Zap, MessageCircle,
  Layers, User, ChevronRight, Star, Lock, Globe, Play, Check,
  Cpu, Volume2, RefreshCw, Clock,
} from 'lucide-react'
import { useAuthStore, useTwinStore, useConversationStore, useMemoryStore } from '@/store'
import { Button, Badge } from '@/components/ui'
import { AvatarStudioPreview } from '@/components/Avatar3D'

// Animated counter
function Counter({ target, suffix = '' }: { target: number; suffix?: string }) {
  const [count, setCount] = React.useState(0)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        let start = 0
        const step = target / 60
        const timer = setInterval(() => {
          start += step
          if (start >= target) {
            setCount(target)
            clearInterval(timer)
          } else {
            setCount(Math.floor(start))
          }
        }, 16)
        observer.disconnect()
      }
    })
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [target])

  return <span ref={ref}>{count.toLocaleString()}{suffix}</span>
}

const FEATURES = [
  {
    icon: Brain,
    title: 'Persistent Memory',
    description: 'Your twin builds an editable memory from what you share. Every fact, preference, and goal is searchable, inspectable, and under your control.',
    color: '#7c3aed',
  },
  {
    icon: MessageCircle,
    title: 'Your Communication Style',
    description: 'Configure tone, formality, and vocabulary. Your twin learns to respond the way you think — direct, thoughtful, or creative.',
    color: '#06b6d4',
  },
  {
    icon: Volume2,
    title: 'Voice Conversations',
    description: 'Speak naturally and hear your twin respond. Optional speech-to-text and text-to-speech let you interact hands-free.',
    color: '#10b981',
  },
  {
    icon: Zap,
    title: 'Authorized Actions',
    description: 'Your twin can create reminders, draft messages, and organize notes — with explicit permission required for every action.',
    color: '#f59e0b',
  },
  {
    icon: Shield,
    title: 'Privacy First',
    description: 'You choose what to share. Nothing is inferred without your knowledge. Delete any memory instantly. Export or delete your account anytime.',
    color: '#3b82f6',
  },
  {
    icon: Layers,
    title: 'Avatar Studio',
    description: 'Choose and customize your twin\'s visual identity — style, colors, and personality that reflect how you see yourself.',
    color: '#ec4899',
  },
]

const PRICING_PLANS = [
  {
    name: 'Starter',
    price: 0,
    period: 'forever',
    description: 'Try Another Me and create your first twin.',
    features: [
      '1 digital twin',
      '100 conversations/month',
      '50 memories',
      'Basic avatar customization',
      'Text interactions',
    ],
    cta: 'Get started free',
    highlighted: false,
  },
  {
    name: 'Personal',
    price: 12,
    period: 'month',
    description: 'The full Another Me experience.',
    features: [
      '1 digital twin',
      'Unlimited conversations',
      'Unlimited memories',
      'Advanced avatar studio',
      'Voice input & output',
      'Action execution',
      'Priority support',
    ],
    cta: 'Start free trial',
    highlighted: true,
  },
  {
    name: 'Team',
    price: 49,
    period: 'month',
    description: 'For teams that want shared AI twin capabilities.',
    features: [
      'Up to 5 team twins',
      'Shared memory spaces',
      'Team action workflows',
      'Admin dashboard',
      'SSO & security controls',
      'Dedicated support',
    ],
    cta: 'Contact sales',
    highlighted: false,
  },
]

const FAQS = [
  {
    q: 'How is Another Me different from ChatGPT or Claude?',
    a: 'Another Me is built specifically around you. It learns from what you explicitly share, maintains a persistent and editable memory, and responds in your communication style. It\'s a personal twin, not a general assistant.',
  },
  {
    q: 'What data does Another Me collect?',
    a: 'Only what you explicitly provide. There\'s no passive data collection, no behavioral tracking, and no inference beyond what you\'ve shared. You can inspect, edit, or delete everything at any time.',
  },
  {
    q: 'Can I delete my twin and all my data?',
    a: 'Yes. You can export your data in a structured format or delete your account entirely at any time. Deletion removes your data from active systems within 30 days per our retention policy.',
  },
  {
    q: 'Can my twin take actions on my behalf without asking?',
    a: 'No. Every action requires explicit authorization. Consequential actions require a confirmation step. Your twin will never send a message, create a file, or access a service without your approval.',
  },
  {
    q: 'What AI model powers Another Me?',
    a: 'Another Me uses state-of-the-art language models through secure API connections. You can configure your preferred AI provider in settings. Your personal data is never used to train any model.',
  },
]

// Live conversation preview
function ConversationPreview() {
  const messages = [
    { role: 'user', content: 'Help me prepare for my product launch next week.' },
    { role: 'assistant', content: 'Based on your goal to launch your SaaS tool this month and your preference for focused morning blocks, here\'s a structured launch plan...' },
    { role: 'user', content: 'Remember to check in with my beta users first.' },
    { role: 'assistant', content: 'Got it — I\'ve noted this preference. I\'ll prioritize beta feedback in any launch planning recommendations.' },
  ]

  const [visibleCount, setVisibleCount] = React.useState(0)

  useEffect(() => {
    if (visibleCount < messages.length) {
      const timer = setTimeout(() => setVisibleCount((n) => n + 1), 1200)
      return () => clearTimeout(timer)
    }
  }, [visibleCount])

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        maxWidth: 480,
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} />
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} />
        <span className="text-xs ml-2" style={{ color: 'var(--color-text-muted)' }}>Interactive Twin Preview</span>
      </div>
      <div className="p-4 flex flex-col gap-3" style={{ minHeight: 200 }}>
        {messages.slice(0, visibleCount).map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
            <div
              className="max-w-[85%] px-3 py-2 rounded-2xl text-sm"
              style={{
                background: msg.role === 'user' ? 'var(--color-violet-primary)' : 'var(--color-surface-2)',
                color: 'var(--color-text-primary)',
                borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
              }}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {visibleCount < messages.length && (
          <div className="flex gap-1 px-2">
            <div className="typing-dot" />
            <div className="typing-dot" />
            <div className="typing-dot" />
          </div>
        )}
      </div>
    </div>
  )
}

// Memory visualization
function MemoryVisualization() {
  const memories = [
    { label: 'Prefers direct communication', cat: 'Communication', color: '#8b5cf6' },
    { label: 'Working on SaaS product launch', cat: 'Projects', color: '#f59e0b' },
    { label: 'Goal: Read 20 books this year', cat: 'Goals', color: '#10b981' },
    { label: 'Morning productivity hours', cat: 'Preferences', color: '#06b6d4' },
  ]

  return (
    <div className="flex flex-col gap-2" style={{ maxWidth: 360 }}>
      {memories.map((m, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 animate-fade-in"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            animationDelay: `${i * 0.15}s`,
          }}
        >
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: m.color, flexShrink: 0 }} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{m.label}</div>
            <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{m.cat}</div>
          </div>
          <Badge variant="muted" className="shrink-0">{m.cat}</Badge>
        </div>
      ))}
    </div>
  )
}

export default function LandingPage() {
  const { isAuthenticated } = useAuthStore()
  const { isOnboarded } = useTwinStore()
  const navigate = useNavigate()
  const [activeFaq, setActiveFaq] = React.useState<number | null>(null)
  const [avatarState] = React.useState<'idle'>('idle')

  return (
    <div style={{ background: 'var(--color-background)', color: 'var(--color-text-primary)', minHeight: '100vh' }}>
      {/* Noise overlay */}
      <div className="noise-overlay" />

      {/* Nav */}
      <nav
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 h-16"
        style={{
          background: 'rgba(13,13,15,0.85)',
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <div className="flex items-center gap-2.5">
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, #D97757, #EAA86E)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(217, 119, 87, 0.3)',
            }}
          >
            <Cpu size={16} color="white" />
          </div>
          <span className="font-serif font-normal text-base text-[#FAF6F0]">Another Me</span>
        </div>

        <div className="hidden md:flex items-center gap-6 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          <a href="#features" className="hover:text-white transition-colors">Features</a>
          <a href="#how-it-works" className="hover:text-white transition-colors">How it works</a>
          <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
          <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
        </div>

        <div className="flex items-center gap-2">
          {isAuthenticated ? (
            <Button variant="primary" size="sm" onClick={() => navigate(isOnboarded ? '/app/twin' : '/onboarding')}>
              Open App
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => navigate('/login')}>Sign in</Button>
              <Button variant="primary" size="sm" onClick={() => navigate('/signup')}>Get started</Button>
            </>
          )}
        </div>
      </nav>

      {/* Hero */}
      <section className="relative flex flex-col items-center justify-center text-center px-4 pt-32 pb-24 min-h-screen">
        {/* Background orb */}
        <div
          style={{
            position: 'absolute',
            top: '20%',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 600,
            height: 600,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(217,119,87,0.12) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />

        <Badge variant="violet" className="mb-8 text-xs font-sans">
          <Sparkles size={11} className="text-[#D97757]" /> Claude-Inspired Personal AI • Private by design
        </Badge>

        <h1 className="hero-text mb-6 font-serif" style={{ maxWidth: 740 }}>
          Meet the{' '}
          <span className="editorial-italic text-[#D97757]">AI version</span>
          {' '}of you.
        </h1>

        <p className="font-sans text-lg mb-10 max-w-xl leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
          A personal digital twin that learns from your memories, speaks in your style, and helps you get things done.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 mb-16">
          <Button
            variant="primary"
            size="xl"
            rightIcon={<ArrowRight size={18} />}
            onClick={() => navigate('/signup')}
          >
            Create Your Twin
          </Button>
          <Button
            variant="secondary"
            size="xl"
            onClick={() => navigate('/login')}
          >
            Sign In
          </Button>
        </div>

        {/* Highlights */}
        <div className="flex items-center gap-8 mb-16 flex-wrap justify-center">
          {[
            { value: '100%', label: 'Private & User Controlled' },
            { value: '0', label: 'Unapproved Actions' },
            { value: 'Local-First', label: 'Storage & Encryption' },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-2xl font-bold text-gradient-violet">
                {stat.value}
              </div>
              <div className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Hero visual */}
        <div className="flex flex-col lg:flex-row items-center justify-center gap-8 w-full max-w-5xl">
          {/* Avatar */}
          <div className="flex-1 flex justify-center" style={{ minWidth: 260 }}>
            <div style={{ width: 260, height: 260 }} className="animate-float">
              <AvatarStudioPreview state="idle" accentColor="#7c3aed" background="#0d0d0f" />
            </div>
          </div>

          {/* Chat preview */}
          <div className="flex-1 flex justify-center">
            <ConversationPreview />
          </div>

          {/* Memory visualization */}
          <div className="flex-1 flex flex-col gap-3">
            <div className="text-xs font-semibold mb-1" style={{ color: 'var(--color-text-muted)' }}>
              MEMORY SYSTEM
            </div>
            <MemoryVisualization />
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="px-4 py-24 max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <Badge variant="violet" className="mb-4">Features</Badge>
          <h2 className="section-title mb-4 font-serif">Everything you need in a personal twin</h2>
          <p className="text-lg max-w-2xl mx-auto" style={{ color: 'var(--color-text-secondary)' }}>
            Built with privacy, personalization, and genuine utility at the core.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((feature) => {
            const Icon = feature.icon
            return (
              <div
                key={feature.title}
                className="card p-6 transition-all duration-200"
                style={{ cursor: 'default' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = feature.color + '40'
                  e.currentTarget.style.transform = 'translateY(-2px)'
                  e.currentTarget.style.boxShadow = `0 8px 32px ${feature.color}20`
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-border)'
                  e.currentTarget.style.transform = ''
                  e.currentTarget.style.boxShadow = ''
                }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: feature.color + '15', color: feature.color }}
                >
                  <Icon size={20} />
                </div>
                <h3 className="text-base font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                  {feature.description}
                </p>
              </div>
            )
          })}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="px-4 py-24" style={{ background: 'var(--color-surface)' }}>
        <div className="max-w-4xl mx-auto text-center mb-16">
          <Badge variant="violet" className="mb-4">How it works</Badge>
          <h2 className="section-title mb-4 font-serif">From zero to twin in minutes</h2>
          <p className="text-lg" style={{ color: 'var(--color-text-secondary)' }}>
            A guided setup that respects your time and your privacy.
          </p>
        </div>

        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            { step: 1, title: 'Share what matters', desc: 'Tell your twin about your interests, goals, and communication style. Only what you choose to share.', icon: User },
            { step: 2, title: 'Build your memory', desc: 'Add notes, preferences, and important context. Your twin references these to give personalized responses.', icon: Brain },
            { step: 3, title: 'Customize your avatar', desc: 'Choose a visual identity for your twin — style, colors, and personality.', icon: Palette },
            { step: 4, title: 'Start conversing', desc: 'Chat with your twin using text or voice. It responds in your configured style with your memories in context.', icon: MessageCircle },
            { step: 5, title: 'Approve actions', desc: 'Ask your twin to create reminders, draft messages, or organize notes. Review and confirm each step.', icon: Zap },
            { step: 6, title: 'Stay in control', desc: 'Inspect every memory, review all actions, and manage your data through the privacy dashboard.', icon: Shield },
          ].map(({ step, title, desc, icon: Icon }) => (
            <div key={step} className="flex flex-col gap-3 p-5 rounded-2xl" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold"
                  style={{ background: 'rgba(124,58,237,0.15)', color: '#a78bfa' }}
                >
                  {step}
                </div>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--color-surface-3)', color: 'var(--color-text-muted)' }}>
                  <Icon size={16} />
                </div>
              </div>
              <h3 className="text-sm font-semibold">{title}</h3>
              <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Privacy section */}
      <section className="px-4 py-24 max-w-4xl mx-auto">
        <div className="rounded-3xl p-8 md:p-12" style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.08), rgba(6,182,212,0.05))', border: '1px solid rgba(124,58,237,0.2)' }}>
          <div className="flex items-start gap-4 mb-8">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'rgba(124,58,237,0.15)', color: '#a78bfa' }}>
              <Lock size={24} />
            </div>
            <div>
              <h2 className="font-serif text-2xl md:text-3xl font-normal mb-2 text-white">Privacy is not a feature. It's the foundation.</h2>
              <p style={{ color: 'var(--color-text-secondary)' }}>
                Another Me was designed privacy-first. Your data is never sold, never used to train models, and never shared without your explicit consent.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              'You control what your twin knows',
              'Inspect and edit every memory',
              'Delete any data instantly',
              'Export your entire data anytime',
              'No passive behavioral tracking',
              'No training on your data',
              'Explicit consent for all features',
              'Row-level security on all data',
            ].map((item) => (
              <div key={item} className="flex items-center gap-2.5 text-sm">
                <Check size={14} style={{ color: '#10b981', flexShrink: 0 }} />
                <span style={{ color: 'var(--color-text-secondary)' }}>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="px-4 py-24" style={{ background: 'var(--color-surface)' }}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <Badge variant="violet" className="mb-4">Pricing</Badge>
            <h2 className="section-title mb-4 font-serif">Start free. Upgrade when ready.</h2>
            <p className="text-lg" style={{ color: 'var(--color-text-secondary)' }}>
              No credit card required to get started.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {PRICING_PLANS.map((plan) => (
              <div
                key={plan.name}
                className="rounded-2xl p-6 flex flex-col"
                style={{
                  background: plan.highlighted ? 'rgba(124,58,237,0.08)' : 'var(--color-surface-2)',
                  border: `1px solid ${plan.highlighted ? 'rgba(124,58,237,0.4)' : 'var(--color-border)'}`,
                  boxShadow: plan.highlighted ? '0 0 40px rgba(124,58,237,0.12)' : 'none',
                }}
              >
                {plan.highlighted && (
                  <Badge variant="violet" className="self-start mb-3">Most popular</Badge>
                )}
                <h3 className="text-lg font-bold mb-1">{plan.name}</h3>
                <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>{plan.description}</p>
                <div className="mb-6">
                  <span className="text-3xl font-extrabold">${plan.price}</span>
                  <span className="text-sm ml-1" style={{ color: 'var(--color-text-muted)' }}>/{plan.period}</span>
                </div>
                <ul className="flex flex-col gap-2.5 mb-8 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                      <Check size={14} style={{ color: '#10b981', flexShrink: 0 }} />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button
                  variant={plan.highlighted ? 'primary' : 'secondary'}
                  className="w-full"
                  onClick={() => navigate('/signup')}
                >
                  {plan.cta}
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="px-4 py-24 max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <Badge variant="violet" className="mb-4">FAQ</Badge>
          <h2 className="section-title font-serif">Common questions</h2>
        </div>
        <div className="flex flex-col gap-3">
          {FAQS.map((faq, i) => (
            <div
              key={i}
              className="rounded-xl overflow-hidden"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
            >
              <button
                className="w-full flex items-center justify-between p-5 text-left"
                onClick={() => setActiveFaq(activeFaq === i ? null : i)}
              >
                <span className="text-sm font-semibold">{faq.q}</span>
                <ChevronRight
                  size={16}
                  style={{
                    color: 'var(--color-text-muted)',
                    transform: activeFaq === i ? 'rotate(90deg)' : 'none',
                    transition: 'transform 0.2s',
                    flexShrink: 0,
                  }}
                />
              </button>
              {activeFaq === i && (
                <div className="px-5 pb-5 animate-fade-in">
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                    {faq.a}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 py-24 text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="section-title mb-6">
            Your personality. Your memories.{' '}
            <span className="text-gradient-violet">Your digital twin.</span>
          </h2>
          <p className="text-lg mb-10" style={{ color: 'var(--color-text-secondary)' }}>
            Join thousands of people building their personal AI twin today.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button variant="primary" size="xl" onClick={() => navigate('/signup')}>
              Create Your Twin — Free
            </Button>
            <Button variant="secondary" size="xl" onClick={() => navigate('/login')}>
              Sign In to Your Account
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer
        className="px-6 py-12"
        style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
      >
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row items-start gap-12 mb-12">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-3">
                <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg, #7c3aed, #06b6d4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Cpu size={14} color="white" />
                </div>
                <span className="font-bold">Another Me</span>
              </div>
              <p className="text-sm" style={{ color: 'var(--color-text-muted)', maxWidth: 280 }}>
                Your Personality. Your Memories. Your Digital Twin.
              </p>
            </div>
            {[
              { title: 'Product', links: ['Features', 'Pricing', 'Changelog', 'Roadmap'] },
              { title: 'Company', links: ['About', 'Blog', 'Careers', 'Contact'] },
              { title: 'Legal', links: ['Privacy Policy', 'Terms of Service', 'Security', 'Cookie Policy'] },
            ].map((col) => (
              <div key={col.title}>
                <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--color-text-muted)' }}>
                  {col.title}
                </div>
                <ul className="flex flex-col gap-2">
                  {col.links.map((link) => (
                    <li key={link}>
                      <a href="#" className="text-sm transition-colors hover:text-white" style={{ color: 'var(--color-text-secondary)' }}>
                        {link}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="flex flex-col md:flex-row items-center justify-between pt-6" style={{ borderTop: '1px solid var(--color-border)' }}>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              © 2026 Another Me. All rights reserved.
            </p>
            <p className="text-xs mt-2 md:mt-0" style={{ color: 'var(--color-text-muted)' }}>
              Built with privacy, care, and a lot of coffee ☕
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}

// Palette icon (since we used it inline)
function Palette({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/>
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>
    </svg>
  )
}
