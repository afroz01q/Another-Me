import type { Avatar, AvatarProvider, AvatarUploadResponse, AvatarGenerateResponse, AvatarProviderConfig } from '@/types'

// Convert File to Base64
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = (error) => reject(error)
  })
}

export const avatarService = {
  // 1. Fetch user's saved personal twin
  async getTwin(userId: string): Promise<Avatar | null> {
    try {
      const res = await fetch(`/api/avatar/twin?userId=${encodeURIComponent(userId)}`)
      if (!res.ok) return null
      const data = await res.json()
      return data.avatar || null
    } catch (e) {
      console.warn('Could not reach avatar backend, checking user local cache:', e)
      const cached = localStorage.getItem(`another-me-avatar-${userId}`)
      return cached ? JSON.parse(cached) : null
    }
  },

  // 2. Upload photo with explicit user consent
  async uploadPhoto(userId: string, file: File, consent: boolean, twinName?: string): Promise<AvatarUploadResponse> {
    if (!consent) {
      throw new Error('Explicit consent is required to process photograph for an AI digital twin likeness.')
    }

    // Client-side validations
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type.toLowerCase())) {
      throw new Error('Invalid file type. Please upload a PNG, JPG, or WebP photo.')
    }

    const MAX_SIZE = 10 * 1024 * 1024
    if (file.size > MAX_SIZE) {
      throw new Error(`File is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Maximum allowed size is 10 MB.`)
    }

    const imageBase64 = await fileToBase64(file)

    const res = await fetch('/api/avatar/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        fileName: file.name,
        fileType: file.type,
        imageBase64,
        consent,
        twinName,
      }),
    })

    const data = await res.json()
    if (!res.ok) {
      throw new Error(data.message || data.error || 'Failed to upload photo')
    }

    // Cache locally scoped to this user
    localStorage.setItem(`another-me-avatar-${userId}`, JSON.stringify(data.avatar))
    return data
  },

  // 3. Initiate AI Avatar Video Generation
  async generateAvatar(options: {
    userId: string
    provider?: AvatarProvider
    apiKey?: string
    scriptText?: string
    voiceId?: string
  }): Promise<AvatarGenerateResponse> {
    const res = await fetch('/api/avatar/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    })

    const data = await res.json()
    if (!res.ok) {
      const err: any = new Error(data.message || data.error || 'Failed to start avatar generation')
      err.code = data.error
      err.provider = data.provider
      err.setupHelpUrl = data.setupHelpUrl
      err.avatar = data.avatar
      throw err
    }

    if (data.avatar) {
      localStorage.setItem(`another-me-avatar-${options.userId}`, JSON.stringify(data.avatar))
    }

    return data
  },

  // 4. Poll status for asynchronous jobs
  async getStatus(userId: string, jobId?: string): Promise<{ avatar: Avatar; status: string }> {
    const url = `/api/avatar/status?userId=${encodeURIComponent(userId)}${jobId ? `&jobId=${encodeURIComponent(jobId)}` : ''}`
    const res = await fetch(url)
    const data = await res.json()
    if (!res.ok) {
      throw new Error(data.error || 'Failed to check avatar status')
    }

    if (data.avatar) {
      localStorage.setItem(`another-me-avatar-${userId}`, JSON.stringify(data.avatar))
    }

    return data
  },

  // 5. Get and save provider config
  async getProviderConfig(): Promise<AvatarProviderConfig> {
    const res = await fetch('/api/avatar/config')
    return res.json()
  },

  async saveProviderConfig(config: Partial<AvatarProviderConfig>): Promise<AvatarProviderConfig> {
    const res = await fetch('/api/avatar/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    })
    return res.json()
  },

  // 6. Delete personal twin
  async deleteTwin(userId: string): Promise<void> {
    await fetch(`/api/avatar/twin?userId=${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    })
    localStorage.removeItem(`another-me-avatar-${userId}`)
  },
}
