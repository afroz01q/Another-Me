import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Cpu, ArrowRight, Eye, EyeOff, AlertCircle } from 'lucide-react'
import { Button, Input } from '@/components/ui'
import { useAuthStore, useTwinStore, useConversationStore, useMemoryStore, useActivityStore } from '@/store'

interface AuthFormProps {
  mode: 'login' | 'signup'
}

export default function AuthPage({ mode }: AuthFormProps) {
  const navigate = useNavigate()
  const { login } = useAuthStore()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [agreedToTerms, setAgreedToTerms] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!email || !password) {
      setError('Please fill in all required fields.')
      return
    }

    if (mode === 'signup' && !name) {
      setError('Please enter your name.')
      return
    }

    if (mode === 'signup' && !agreedToTerms) {
      setError('Please agree to the terms to continue.')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setIsLoading(true)
    try {
      await login(email, password, name)
      if (mode === 'signup') {
        navigate('/onboarding')
      } else {
        navigate('/app/twin')
      }
    } catch (err) {
      setError('Authentication failed. Please check your credentials.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'var(--color-background)' }}
    >
      {/* Background */}
      <div
        style={{
          position: 'fixed',
          top: '30%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 500,
          height: 500,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(124,58,237,0.1) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      <div className="w-full max-w-md relative z-10 animate-fade-in-scale">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <Link to="/" className="flex items-center gap-2 mb-6">
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: 'linear-gradient(135deg, #7c3aed, #06b6d4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Cpu size={20} color="white" />
            </div>
            <span className="font-bold text-lg">Another Me</span>
          </Link>

          <h1 className="text-2xl font-bold text-center">
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </h1>
          <p className="text-sm mt-2 text-center" style={{ color: 'var(--color-text-muted)' }}>
            {mode === 'login'
              ? 'Sign in to access your digital twin'
              : 'Start building your personal AI twin today'}
          </p>
        </div>

        {/* Form */}
        <div
          className="p-6 rounded-2xl"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {mode === 'signup' && (
              <Input
                label="Full name"
                type="text"
                id="auth-name"
                placeholder="Jane Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            )}

            <Input
              label="Email address"
              type="email"
              id="auth-email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />

            <div className="relative">
              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                id="auth-password"
                placeholder={mode === 'signup' ? 'Min. 8 characters' : '••••••••'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                rightElement={
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="btn-ghost"
                    style={{ padding: 0 }}
                  >
                    {showPassword ? <EyeOff size={16} style={{ color: 'var(--color-text-muted)' }} /> : <Eye size={16} style={{ color: 'var(--color-text-muted)' }} />}
                  </button>
                }
              />
            </div>

            {mode === 'signup' && (
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  className="mt-0.5"
                  style={{ accentColor: 'var(--color-violet-primary)' }}
                />
                <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  I agree to the{' '}
                  <a href="#" className="underline" style={{ color: 'var(--color-violet-light)' }}>Terms of Service</a>
                  {' '}and{' '}
                  <a href="#" className="underline" style={{ color: 'var(--color-violet-light)' }}>Privacy Policy</a>.
                  I understand that only information I explicitly share will be stored.
                </span>
              </label>
            )}

            {error && (
              <div
                className="flex items-center gap-2 p-3 rounded-lg text-sm"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}
              >
                <AlertCircle size={14} />
                {error}
              </div>
            )}

            {mode === 'login' && (
              <div className="flex justify-end">
                <a href="#" className="text-xs" style={{ color: 'var(--color-violet-light)' }}>Forgot password?</a>
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              className="w-full"
              isLoading={isLoading}
              rightIcon={<ArrowRight size={16} />}
            >
              {mode === 'login' ? 'Sign in' : 'Create account'}
            </Button>
          </form>
        </div>

        {/* Switch mode */}
        <p className="text-center text-sm mt-6" style={{ color: 'var(--color-text-secondary)' }}>
          {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
          {' '}
          <Link
            to={mode === 'login' ? '/signup' : '/login'}
            style={{ color: 'var(--color-violet-light)', fontWeight: 600 }}
          >
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </Link>
        </p>
      </div>
    </div>
  )
}
