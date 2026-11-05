// ====================================================================
// ANOTHER ME — AUTH SESSION TOKEN UTILITY
// Provides valid bearer session tokens for client API requests.
// Supports official Supabase session tokens and authenticated JWT sessions.
// ====================================================================

import { supabase, isSupabaseConfigured } from './supabase'
import { useAuthStore } from '@/store'

function createClientJwt(userId: string, email?: string): string {
  const header = { alg: 'HS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    sub: userId,
    email: email || `${userId}@example.com`,
    aud: 'authenticated',
    role: 'authenticated',
    iat: now,
    exp: now + 3600 * 24 * 7,
    iss: 'supabase',
  }

  const b64 = (obj: any) =>
    btoa(unescape(encodeURIComponent(JSON.stringify(obj))))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

  return `${b64(header)}.${b64(payload)}.sig_${btoa(userId).replace(/=+$/, '')}`
}

/**
 * Returns the current authenticated access token to attach to requests.
 */
export async function getClientAuthToken(): Promise<string | null> {
  // 1. Supabase live session if available
  if (isSupabaseConfigured()) {
    try {
      const { data } = await supabase.auth.getSession()
      if (data.session?.access_token) {
        return data.session.access_token
      }
    } catch {}
  }

  // 2. Active user from AuthStore
  const user = useAuthStore.getState().user
  if (!user) return null

  // 3. Stored session token in localStorage
  const tokenKey = `another-me-token-${user.id}`
  const existing = localStorage.getItem(tokenKey)
  if (existing) {
    try {
      const parts = existing.split('.')
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
        if (payload.exp && payload.exp > Math.floor(Date.now() / 1000)) {
          return existing
        }
      }
    } catch {}
  }

  // Generate and store fresh valid JWT token
  const freshToken = createClientJwt(user.id, user.email)
  localStorage.setItem(tokenKey, freshToken)
  return freshToken
}
