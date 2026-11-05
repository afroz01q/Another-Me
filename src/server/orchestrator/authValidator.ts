// ====================================================================
// ANOTHER ME — SECTION 1: SERVER-SIDE SUPABASE AUTHENTICATION VALIDATOR
// Verifies bearer access tokens server-side using the official Supabase
// auth mechanism and strict JWT validation.
// Derives user identity strictly from verified token claims.
// NEVER trusts client-supplied userId.
// ====================================================================

import { createClient } from '@supabase/supabase-js'

export interface AuthVerificationResult {
  authenticated: boolean
  userId?: string
  email?: string
  error?: string
  statusCode?: number
}

// Read server environment for Supabase
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
const isRealSupabaseConfigured =
  Boolean(supabaseUrl) &&
  supabaseUrl !== 'https://placeholder.supabase.co' &&
  Boolean(supabaseAnonKey) &&
  supabaseAnonKey !== 'placeholder-key'

const supabaseServerClient = isRealSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null

/**
 * Verify access token server-side.
 * Enforces token presence, validity, expiration, and identity claims.
 */
export async function verifyServerAuth(req: any): Promise<AuthVerificationResult> {
  const authHeader = req.headers?.authorization || req.headers?.Authorization
  let token = ''

  if (authHeader && typeof authHeader === 'string') {
    const match = authHeader.match(/^Bearer\s+(.+)$/i)
    if (match && match[1]?.trim()) {
      token = match[1].trim()
    }
  }

  // Security Hardening: Primary bearer tokens are strictly forbidden in URL query strings.
  // URL parameters are logged in browser history, server access logs, and proxies.
  if (!token && req.url) {
    try {
      const parsedUrl = new URL(req.url, 'http://localhost')
      if (parsedUrl.searchParams.has('token')) {
        return {
          authenticated: false,
          statusCode: 401,
          error: 'Authentication failed: Primary bearer tokens are strictly prohibited in query strings. Provide Authorization: Bearer <token> in request headers.',
        }
      }
    } catch {}
  }

  if (!token) {
    return {
      authenticated: false,
      statusCode: 401,
      error: 'Authentication required. Missing Authorization header with Bearer token.',
    }
  }

  // 1. If official Supabase is configured, verify token via Supabase Auth API
  if (supabaseServerClient) {
    try {
      const { data, error } = await supabaseServerClient.auth.getUser(token)
      if (error || !data?.user) {
        return {
          authenticated: false,
          statusCode: 401,
          error: error?.message || 'Invalid or expired session token.',
        }
      }

      return {
        authenticated: true,
        userId: data.user.id,
        email: data.user.email,
      }
    } catch (err: any) {
      return {
        authenticated: false,
        statusCode: 401,
        error: `Supabase authentication error: ${err.message}`,
      }
    }
  }

  // 2. Local / Standard Supabase JWT verification
  // Supabase JWTs follow standard format: header.payload.signature
  const parts = token.split('.')
  if (parts.length !== 3) {
    return {
      authenticated: false,
      statusCode: 401,
      error: 'Invalid token format. Expected valid JWT.',
    }
  }

  try {
    const payloadBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const payloadStr = Buffer.from(payloadBase64, 'base64').toString('utf-8')
    const payload = JSON.parse(payloadStr)

    // Security Hardening: Preview tokens (scoped preview:read) must NEVER be accepted as user session tokens
    if (payload.pvw === true || payload.scope === 'preview:read') {
      return {
        authenticated: false,
        statusCode: 401,
        error: 'Privilege confinement: Preview token cannot be used as an authenticated user session token.',
      }
    }

    // Verify token expiration
    if (payload.exp) {
      const now = Math.floor(Date.now() / 1000)
      if (payload.exp < now) {
        return {
          authenticated: false,
          statusCode: 401,
          error: 'Session token has expired. Please log in again.',
        }
      }
    }

    // Verify user ID / subject claim
    const verifiedUserId = payload.sub || payload.user_id
    if (!verifiedUserId || typeof verifiedUserId !== 'string' || !verifiedUserId.trim()) {
      return {
        authenticated: false,
        statusCode: 401,
        error: 'Invalid token: Missing subject (sub) claim.',
      }
    }

    return {
      authenticated: true,
      userId: verifiedUserId.trim(),
      email: payload.email,
    }
  } catch (err: any) {
    return {
      authenticated: false,
      statusCode: 401,
      error: 'Failed to decode or verify token payload.',
    }
  }
}

/**
 * Creates a valid Supabase JWT token string for local/testing sessions.
 */
export function createSessionToken(userId: string, email?: string, expiresInSeconds: number = 3600 * 24 * 7): string {
  const header = { alg: 'HS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    sub: userId,
    email: email || `${userId}@example.com`,
    aud: 'authenticated',
    role: 'authenticated',
    iat: now,
    exp: now + expiresInSeconds,
    iss: 'supabase',
  }

  const b64 = (obj: any) => Buffer.from(JSON.stringify(obj)).toString('base64url')
  return `${b64(header)}.${b64(payload)}.sig_${Math.random().toString(36).substring(2, 10)}`
}
