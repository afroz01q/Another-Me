// ====================================================================
// ANOTHER ME — SECTION 4.1: HARDENED PREVIEW TOKEN MANAGER
// Issues short-lived, narrowly-scoped, revocable preview tokens
// bound strictly to authenticated userId and projectId.
// Tokens NEVER grant access to privileged APIs or cross-project data.
// Tokens are stripped and redacted from all logs, errors, and URLs.
// ====================================================================

import crypto from 'crypto'

export interface PreviewTokenPayload {
  userId: string
  projectId: string
  scope: 'preview:read'
  jti: string
  iat: number
  exp: number
}

export interface PreviewTokenVerification {
  valid: boolean
  userId?: string
  projectId?: string
  jti?: string
  error?: string
  statusCode?: number
}

export interface IssuedPreviewToken {
  previewToken: string
  expiresIn: number
  expiresAt: string
  projectId: string
  jti: string
  scope: string
}

class PreviewTokenManager {
  // Ephemeral secret generated per server lifecycle, or from env
  private secretKey: string
  // Store revoked token JTIs: jti -> revocation timestamp (ms)
  private revokedTokens: Map<string, number> = new Map()
  // Store project-level revocation timestamps: projectId -> min valid iat (seconds)
  private projectRevocations: Map<string, number> = new Map()
  // Default TTL: 15 minutes (900 seconds)
  private defaultTtlSeconds: number = 900
  // Max allowable TTL: 1 hour (3600 seconds)
  private maxTtlSeconds: number = 3600

  constructor() {
    this.secretKey =
      process.env.PREVIEW_TOKEN_SECRET ||
      crypto.randomBytes(32).toString('hex')

    // Periodic cleanup of expired entries in memory (every 10 minutes)
    setInterval(() => {
      this.cleanupRevocationStore()
    }, 10 * 60 * 1000).unref()
  }

  /**
   * Issues a short-lived, scoped preview token bound strictly to userId and projectId.
   */
  createPreviewToken(
    userId: string,
    projectId: string,
    ttlSeconds?: number
  ): IssuedPreviewToken {
    if (!userId || !projectId) {
      throw new Error('userId and projectId are required to create a preview token.')
    }

    const effectiveTtl = Math.min(
      Math.max(ttlSeconds !== undefined ? ttlSeconds : this.defaultTtlSeconds, 1),
      this.maxTtlSeconds
    )

    const now = Math.floor(Date.now() / 1000)
    const exp = now + effectiveTtl
    const jti = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex')

    const header = { alg: 'HS256', typ: 'JWT', pvw: true }
    const payload: PreviewTokenPayload = {
      userId,
      projectId,
      scope: 'preview:read',
      jti,
      iat: now,
      exp,
    }

    const b64Header = Buffer.from(JSON.stringify(header)).toString('base64url')
    const b64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url')
    const signature = crypto
      .createHmac('sha256', this.secretKey)
      .update(`${b64Header}.${b64Payload}`)
      .digest('base64url')

    const token = `${b64Header}.${b64Payload}.${signature}`

    return {
      previewToken: token,
      expiresIn: effectiveTtl,
      expiresAt: new Date(exp * 1000).toISOString(),
      projectId,
      jti,
      scope: 'preview:read',
    }
  }

  /**
   * Verifies a preview token against signature, expiry, revocation, and target projectId.
   * NEVER leaks the token or details in error returns.
   */
  verifyPreviewToken(
    token: string,
    expectedProjectId: string
  ): PreviewTokenVerification {
    if (!token || typeof token !== 'string') {
      return {
        valid: false,
        statusCode: 401,
        error: 'Missing preview token.',
      }
    }

    const parts = token.trim().split('.')
    if (parts.length !== 3) {
      return {
        valid: false,
        statusCode: 401,
        error: 'Invalid preview token format.',
      }
    }

    const [b64Header, b64Payload, signature] = parts

    // 1. Verify HMAC SHA-256 signature
    const expectedSignature = crypto
      .createHmac('sha256', this.secretKey)
      .update(`${b64Header}.${b64Payload}`)
      .digest('base64url')

    // Constant-time comparison to prevent timing attacks
    const sigBuffer = Buffer.from(signature)
    const expectedSigBuffer = Buffer.from(expectedSignature)
    if (
      sigBuffer.length !== expectedSigBuffer.length ||
      !crypto.timingSafeEqual(sigBuffer, expectedSigBuffer)
    ) {
      return {
        valid: false,
        statusCode: 401,
        error: 'Invalid preview token signature.',
      }
    }

    // 2. Decode and parse payload
    let payload: PreviewTokenPayload
    try {
      const payloadJson = Buffer.from(b64Payload, 'base64url').toString('utf-8')
      payload = JSON.parse(payloadJson)
    } catch {
      return {
        valid: false,
        statusCode: 401,
        error: 'Malformed preview token payload.',
      }
    }

    // 3. Verify scope
    if (payload.scope !== 'preview:read') {
      return {
        valid: false,
        statusCode: 403,
        error: 'Token scope does not permit preview access.',
      }
    }

    // 4. Verify expiration (RFC 7519: current time must be before exp claim)
    const now = Math.floor(Date.now() / 1000)
    if (!payload.exp || payload.exp <= now) {
      return {
        valid: false,
        statusCode: 401,
        error: 'Preview token has expired. A fresh preview token is required.',
      }
    }

    // 5. Verify individual token revocation
    if (payload.jti && this.revokedTokens.has(payload.jti)) {
      return {
        valid: false,
        statusCode: 401,
        error: 'Preview token has been revoked.',
      }
    }

    // 6. Verify project-level revocation
    const projectMinIat = this.projectRevocations.get(payload.projectId)
    if (projectMinIat && payload.iat <= projectMinIat) {
      return {
        valid: false,
        statusCode: 401,
        error: 'Preview tokens for this project have been invalidated.',
      }
    }

    // 7. Verify strict project binding (cross-project prevention)
    if (!payload.projectId || payload.projectId !== expectedProjectId) {
      return {
        valid: false,
        statusCode: 403,
        error: 'Preview token was not issued for this project.',
      }
    }

    // 8. Verify user binding presence
    if (!payload.userId || typeof payload.userId !== 'string') {
      return {
        valid: false,
        statusCode: 401,
        error: 'Preview token is missing valid user identity.',
      }
    }

    return {
      valid: true,
      userId: payload.userId,
      projectId: payload.projectId,
      jti: payload.jti,
    }
  }

  /**
   * Revokes a specific preview token by its JTI.
   */
  revokeToken(jti: string): boolean {
    if (!jti) return false
    this.revokedTokens.set(jti, Date.now())
    return true
  }

  /**
   * Invalidates all preview tokens issued for a specific project before the current time.
   */
  revokeProjectTokens(projectId: string): void {
    if (!projectId) return
    const now = Math.floor(Date.now() / 1000)
    this.projectRevocations.set(projectId, now)
  }

  /**
   * Redacts sensitive token strings from URLs, logs, or error text.
   */
  redactTokens(text: string): string {
    if (!text || typeof text !== 'string') return text
    return text
      .replace(/([?&])previewToken=[^&\s]+/gi, '$1previewToken=[REDACTED]')
      .replace(/([?&])token=[^&\s]+/gi, '$1token=[REDACTED]')
      .replace(/(Bearer\s+)[a-zA-Z0-9_.\-]+/gi, '$1[REDACTED]')
      .replace(/(apiKey[=:][\s]*["']?)[a-zA-Z0-9_\-]+(["']?)/gi, '$1[REDACTED]$2')
      .replace(/(sk-[a-zA-Z0-9_\-]{8,})/gi, 'sk-[REDACTED]')
      .replace(/(ANOTHER_ME_PREVIEW_TOKEN=)[^\s&]+/gi, '$1[REDACTED]')
      .replace(/(prv_[a-zA-Z0-9_\-]+)/gi, 'prv_[REDACTED]')
      .replace(/(:\/\/[^:]+:)([^@]+)(@)/g, '$1[REDACTED]$3')
  }

  /**
   * Clean up expired revocation entries to prevent unbounded memory growth.
   */
  private cleanupRevocationStore(): void {
    const cutoff = Date.now() - (this.maxTtlSeconds + 300) * 1000
    for (const [jti, timestamp] of this.revokedTokens.entries()) {
      if (timestamp < cutoff) {
        this.revokedTokens.delete(jti)
      }
    }
  }
}

export const previewTokenManager = new PreviewTokenManager()
