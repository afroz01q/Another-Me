import type { Plugin } from 'vite'
import fs from 'fs'
import path from 'path'
import { URL } from 'url'
export interface Avatar {
  id: string
  user_id: string
  name: string
  preset_id?: string | null
  visual_style?: string | null
  background_id?: string | null
  accent_color?: string | null
  lighting?: string | null
  source_image_path?: string | null
  generated_video_path?: string | null
  thumbnail_path?: string | null
  provider?: string | null
  provider_job_id?: string | null
  status?: string | null
  error_message?: string | null
  consent_given?: boolean | null
  consent_timestamp?: string | null
  created_at: string
  updated_at: string
}

export interface AvatarProviderConfig {
  d_id_api_key?: string
  replicate_api_token?: string
  heygen_api_key?: string
  active_provider?: string
  d_id_configured?: boolean
  replicate_configured?: boolean
  heygen_configured?: boolean
  activeProvider?: string
  didApiKey?: string
  replicateApiToken?: string
  heygenApiKey?: string
  hasDidKey?: boolean
  hasReplicateToken?: boolean
  hasHeygenKey?: boolean
}

const ROOT_STORAGE_DIR = path.resolve(process.cwd(), 'storage')
const USERS_STORAGE_DIR = path.join(ROOT_STORAGE_DIR, 'users')
const CONFIG_FILE = path.join(ROOT_STORAGE_DIR, 'avatar_provider_config.json')

// Ensure storage directories exist
function ensureDirs(userId?: string) {
  if (!fs.existsSync(ROOT_STORAGE_DIR)) {
    fs.mkdirSync(ROOT_STORAGE_DIR, { recursive: true })
  }
  if (!fs.existsSync(USERS_STORAGE_DIR)) {
    fs.mkdirSync(USERS_STORAGE_DIR, { recursive: true })
  }
  if (userId) {
    const userDir = path.join(USERS_STORAGE_DIR, userId)
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true })
    }
    return userDir
  }
  return USERS_STORAGE_DIR
}

function formatDIdAuth(key: string): string {
  const trimmed = key.trim()
  if (trimmed.startsWith('Basic ') || trimmed.startsWith('Bearer ')) return trimmed
  if (trimmed.includes(':')) {
    return `Basic ${Buffer.from(trimmed).toString('base64')}`
  }
  try {
    const decoded = Buffer.from(trimmed, 'base64').toString('utf8')
    if (decoded.includes(':') && /^[\x20-\x7E]+$/.test(decoded)) {
      return `Basic ${trimmed}`
    }
  } catch {}
  return `Basic ${Buffer.from(trimmed + ':').toString('base64')}`
}

function getProviderConfig(): AvatarProviderConfig {
  ensureDirs()
  let config: AvatarProviderConfig = {
    active_provider: 'd-id',
  }
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'))
      config = { ...config, ...data }
    } catch (e) {
      console.error('Error reading avatar provider config:', e)
    }
  }
  // Check process.env fallback
  if (process.env.D_ID_API_KEY && !config.d_id_api_key) {
    config.d_id_api_key = process.env.D_ID_API_KEY
  }
  if (process.env.REPLICATE_API_TOKEN && !config.replicate_api_token) {
    config.replicate_api_token = process.env.REPLICATE_API_TOKEN
  }
  if (process.env.HEYGEN_API_KEY && !config.heygen_api_key) {
    config.heygen_api_key = process.env.HEYGEN_API_KEY
  }
  return config
}

function saveProviderConfig(newConfig: Partial<AvatarProviderConfig>) {
  ensureDirs()
  const existing = getProviderConfig()
  const updated: AvatarProviderConfig = {
    ...existing,
    ...newConfig,
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2), 'utf-8')
  return updated
}

function getUserAvatarRecord(userId: string): Avatar | null {
  const userDir = ensureDirs(userId)
  const avatarFile = path.join(userDir, 'avatar.json')
  if (fs.existsSync(avatarFile)) {
    try {
      return JSON.parse(fs.readFileSync(avatarFile, 'utf-8'))
    } catch (e) {
      console.error(`Error reading avatar for user ${userId}:`, e)
    }
  }
  return null
}

function saveUserAvatarRecord(userId: string, avatar: Avatar): void {
  const userDir = ensureDirs(userId)
  const avatarFile = path.join(userDir, 'avatar.json')
  fs.writeFileSync(avatarFile, JSON.stringify(avatar, null, 2), 'utf-8')
}

// Read raw body helper
async function readBody(req: any): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks).toString('utf-8')
}

// Download remote video stream to local storage file
async function downloadFile(url: string, destPath: string): Promise<void> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to download media file: ${res.statusText}`)
  }
  const arrayBuffer = await res.arrayBuffer()
  fs.writeFileSync(destPath, Buffer.from(arrayBuffer))
}

export function avatarApiPlugin(): Plugin {
  const handleApiRequest = async (req: any, res: any, next: any) => {
    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`)
    const pathname = url.pathname

    if (!pathname.startsWith('/api/avatar')) {
      return next()
    }

    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }

    try {
      // -------------------------------------------------------------
      // 1. GET /api/avatar/twin?userId=...
      // -------------------------------------------------------------
      if (pathname === '/api/avatar/twin' && req.method === 'GET') {
        const userId = url.searchParams.get('userId')
        if (!userId) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'userId parameter is required' }))
          return
        }

        const avatar = getUserAvatarRecord(userId)
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ avatar }))
        return
      }

      // -------------------------------------------------------------
      // 2. POST /api/avatar/upload (Upload photo with validation & consent)
      // -------------------------------------------------------------
      if (pathname === '/api/avatar/upload' && req.method === 'POST') {
        const rawBody = await readBody(req)
        let body: any = {}
        try {
          body = JSON.parse(rawBody)
        } catch {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Invalid JSON request body' }))
          return
        }

        const { userId, fileName, fileType, imageBase64, consent, twinName } = body

        if (!userId) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'userId is required' }))
          return
        }

        // Validate user consent
        if (!consent) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({
            error: 'CONSENT_REQUIRED',
            message: 'Explicit user consent is legally required before processing a photograph to generate an AI digital twin likeness.'
          }))
          return
        }

        if (!imageBase64) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'imageBase64 photo content is required' }))
          return
        }

        // Validate MIME type
        const cleanBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '')
        let extension = 'jpg'
        if (fileType?.includes('png') || fileName?.endsWith('.png')) {
          extension = 'png'
        } else if (fileType?.includes('webp') || fileName?.endsWith('.webp')) {
          extension = 'webp'
        } else if (fileType?.includes('jpeg') || fileType?.includes('jpg') || fileName?.endsWith('.jpg') || fileName?.endsWith('.jpeg')) {
          extension = 'jpg'
        } else {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({
            error: 'INVALID_FILE_TYPE',
            message: 'Unsupported image format. Please upload a PNG, JPG, or WebP photograph.'
          }))
          return
        }

        const imageBuffer = Buffer.from(cleanBase64, 'base64')

        // Validate file size (10 MB max)
        const MAX_SIZE = 10 * 1024 * 1024
        if (imageBuffer.length > MAX_SIZE) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({
            error: 'FILE_TOO_LARGE',
            message: `Photograph exceeds the 10 MB size limit (Size: ${(imageBuffer.length / (1024 * 1024)).toFixed(1)} MB). Please select a smaller photo.`
          }))
          return
        }

        // Save photo to private user storage
        const userDir = ensureDirs(userId)
        const photoPath = path.join(userDir, `photo.${extension}`)
        fs.writeFileSync(photoPath, imageBuffer)

        // Existing or new avatar record
        const existingAvatar = getUserAvatarRecord(userId)
        const now = new Date().toISOString()
        const avatar: Avatar = {
          id: existingAvatar?.id || `avatar_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          user_id: userId,
          name: twinName || existingAvatar?.name || 'My Twin',
          preset_id: 'preset-personal-photo',
          visual_style: 'realistic',
          background_id: 'bg-editorial',
          accent_color: '#da7756',
          lighting: 'soft',
          source_image_path: `/api/avatar/media?userId=${userId}&type=photo&v=${Date.now()}`,
          generated_video_path: existingAvatar?.generated_video_path || null,
          thumbnail_path: `/api/avatar/media?userId=${userId}&type=photo&v=${Date.now()}`,
          provider: existingAvatar?.provider || 'd-id',
          provider_job_id: null,
          status: 'not_started',
          error_message: null,
          consent_given: true,
          consent_timestamp: now,
          created_at: existingAvatar?.created_at || now,
          updated_at: now,
        }

        saveUserAvatarRecord(userId, avatar)

        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({
          success: true,
          sourceImagePath: avatar.source_image_path,
          avatar,
          message: 'Personal photograph successfully uploaded and validated.'
        }))
        return
      }

      // -------------------------------------------------------------
      // 3. POST /api/avatar/generate (Call real AI video avatar provider)
      // -------------------------------------------------------------
      if (pathname === '/api/avatar/generate' && req.method === 'POST') {
        const rawBody = await readBody(req)
        let body: any = {}
        try {
          body = JSON.parse(rawBody)
        } catch {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Invalid JSON request body' }))
          return
        }

        const { userId, provider = 'd-id', apiKey: clientApiKey, scriptText, voiceId } = body

        if (!userId) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'userId is required' }))
          return
        }

        const avatar = getUserAvatarRecord(userId)
        if (!avatar || !avatar.source_image_path) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({
            error: 'NO_PHOTO_FOUND',
            message: 'No photo has been uploaded for this user. Please upload a clear face photograph first.'
          }))
          return
        }

        const userDir = ensureDirs(userId)
        // Find saved photo file
        const files = fs.readdirSync(userDir)
        const photoFile = files.find(f => f.startsWith('photo.'))
        if (!photoFile) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({
            error: 'NO_PHOTO_FILE',
            message: 'Photograph file missing on server storage. Please upload again.'
          }))
          return
        }

        const photoBuffer = fs.readFileSync(path.join(userDir, photoFile))
        const photoMime = photoFile.endsWith('.png') ? 'image/png' : photoFile.endsWith('.webp') ? 'image/webp' : 'image/jpeg'
        const photoDataUrl = `data:${photoMime};base64,${photoBuffer.toString('base64')}`

        // Provider API Key Resolution
        const providerConfig = getProviderConfig()
        let resolvedApiKey = clientApiKey

        if (provider === 'd-id') {
          resolvedApiKey = resolvedApiKey || providerConfig.d_id_api_key || process.env.D_ID_API_KEY
          if (!resolvedApiKey) {
            avatar.status = 'failed'
            avatar.error_message = 'D-ID API key is required. Please configure your key in settings or generation modal.'
            saveUserAvatarRecord(userId, avatar)

            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({
              success: false,
              error: 'PROVIDER_CREDENTIALS_REQUIRED',
              provider: 'd-id',
              message: 'D-ID Creative Reality API credentials are required to generate your real personal talking-head digital twin. Please enter your API key to proceed.',
              setupHelpUrl: 'https://studio.d-id.com/account-settings',
              avatar,
            }))
            return
          }

          // D-ID Real Talks API Call
          try {
            const authHeader = formatDIdAuth(resolvedApiKey)

            // Step 1: Upload local photo to D-ID temporary storage (/images)
            const form = new FormData()
            form.append('image', new Blob([photoBuffer], { type: photoMime }), photoFile)

            const uploadRes = await fetch('https://api.d-id.com/images', {
              method: 'POST',
              headers: {
                'Authorization': authHeader,
                'accept': 'application/json',
              },
              body: form,
            })

            const uploadData: any = await uploadRes.json()

            if (!uploadRes.ok) {
              const errMsg = uploadData?.description || uploadData?.message || uploadData?.error || `Failed to upload image to D-ID (${uploadRes.status})`
              avatar.status = 'failed'
              avatar.error_message = errMsg
              saveUserAvatarRecord(userId, avatar)

              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({
                success: false,
                error: 'PROVIDER_API_ERROR',
                provider: 'd-id',
                message: errMsg,
                avatar,
              }))
              return
            }

            const s3ImageUrl = uploadData.url

            // Step 2: Create animated talking-head video (/talks)
            const prompt = scriptText || `Hello! I am ${avatar.name || 'your personal AI digital twin'}. I am created from your photograph, learn from your memories, and speak on your behalf.`

            const dIdResponse = await fetch('https://api.d-id.com/talks', {
              method: 'POST',
              headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json',
                'accept': 'application/json',
              },
              body: JSON.stringify({
                source_url: s3ImageUrl,
                script: {
                  type: 'text',
                  input: prompt,
                  provider: {
                    type: 'microsoft',
                    voice_id: voiceId || 'en-US-JennyNeural',
                  },
                },
                config: {
                  fluent: true,
                  pad_audio: 0,
                  stitch: true,
                },
              }),
            })

            const dIdData: any = await dIdResponse.json()

            if (!dIdResponse.ok) {
              const errMsg = dIdData?.description || dIdData?.message || `D-ID API error (${dIdResponse.status})`
              avatar.status = 'failed'
              avatar.error_message = errMsg
              saveUserAvatarRecord(userId, avatar)

              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({
                success: false,
                error: 'PROVIDER_API_ERROR',
                provider: 'd-id',
                message: errMsg,
                avatar,
              }))
              return
            }

            // Successfully queued at D-ID!
            const jobId = dIdData.id
            avatar.status = 'processing'
            avatar.provider = 'd-id'
            avatar.provider_job_id = jobId
            avatar.error_message = null
            avatar.updated_at = new Date().toISOString()
            saveUserAvatarRecord(userId, avatar)

            // Save key to server config if client provided it
            if (clientApiKey) {
              saveProviderConfig({ d_id_api_key: clientApiKey, active_provider: 'd-id' })
            }

            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({
              success: true,
              jobId,
              status: 'processing',
              provider: 'd-id',
              avatar,
              message: 'Avatar animation job successfully initiated with D-ID.',
            }))
            return
          } catch (err: any) {
            console.error('D-ID API dispatch error:', err)
            avatar.status = 'failed'
            avatar.error_message = err.message || 'Failed to dispatch generation job to D-ID.'
            saveUserAvatarRecord(userId, avatar)

            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({
              success: false,
              error: 'NETWORK_ERROR',
              message: err.message,
              avatar,
            }))
            return
          }
        }

        if (provider === 'replicate') {
          resolvedApiKey = resolvedApiKey || providerConfig.replicate_api_token || process.env.REPLICATE_API_TOKEN
          if (!resolvedApiKey) {
            avatar.status = 'failed'
            avatar.error_message = 'Replicate API Token is required.'
            saveUserAvatarRecord(userId, avatar)

            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({
              success: false,
              error: 'PROVIDER_CREDENTIALS_REQUIRED',
              provider: 'replicate',
              message: 'Replicate API token is required to generate the animated talking-head video. Please enter your Replicate API token.',
              setupHelpUrl: 'https://replicate.com/account/api-tokens',
              avatar,
            }))
            return
          }

          try {
            const replResponse = await fetch('https://api.replicate.com/v1/predictions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${resolvedApiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                version: 'lucataco/sadtalker',
                input: {
                  source_image: photoDataUrl,
                  driven_audio: 'https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3',
                },
              }),
            })

            const replData: any = await replResponse.json()
            if (!replResponse.ok) {
              const errMsg = replData?.detail || `Replicate API error (${replResponse.status})`
              avatar.status = 'failed'
              avatar.error_message = errMsg
              saveUserAvatarRecord(userId, avatar)

              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: false, error: 'PROVIDER_API_ERROR', message: errMsg, avatar }))
              return
            }

            const jobId = replData.id
            avatar.status = 'processing'
            avatar.provider = 'replicate'
            avatar.provider_job_id = jobId
            avatar.error_message = null
            saveUserAvatarRecord(userId, avatar)

            if (clientApiKey) {
              saveProviderConfig({ replicate_api_token: clientApiKey, active_provider: 'replicate' })
            }

            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({
              success: true,
              jobId,
              status: 'processing',
              provider: 'replicate',
              avatar,
            }))
            return
          } catch (err: any) {
            avatar.status = 'failed'
            avatar.error_message = err.message
            saveUserAvatarRecord(userId, avatar)

            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: false, error: 'NETWORK_ERROR', message: err.message, avatar }))
            return
          }
        }

        // Unknown provider
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: `Unsupported provider: ${provider}` }))
        return
      }

      // -------------------------------------------------------------
      // 4. GET /api/avatar/status?userId=...&jobId=...
      // -------------------------------------------------------------
      if (pathname === '/api/avatar/status' && req.method === 'GET') {
        const userId = url.searchParams.get('userId')
        const jobId = url.searchParams.get('jobId')

        if (!userId) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'userId is required' }))
          return
        }

        const avatar = getUserAvatarRecord(userId)
        if (!avatar) {
          res.statusCode = 404
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Avatar record not found for user' }))
          return
        }

        const targetJobId = jobId || avatar.provider_job_id
        if (!targetJobId) {
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ avatar, status: avatar.status }))
          return
        }

        // Poll D-ID
        if (avatar.provider === 'd-id') {
          const providerConfig = getProviderConfig()
          const apiKey = providerConfig.d_id_api_key || process.env.D_ID_API_KEY
          if (!apiKey) {
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ avatar, status: avatar.status }))
            return
          }

          const authHeader = formatDIdAuth(apiKey)

          try {
            const checkRes = await fetch(`https://api.d-id.com/talks/${targetJobId}`, {
              headers: {
                'Authorization': authHeader,
                'accept': 'application/json',
              },
            })

            const checkData: any = await checkRes.json()

            if (checkRes.ok) {
              if (checkData.status === 'done' && checkData.result_url) {
                // Download generated video to private user storage
                const userDir = ensureDirs(userId)
                const videoDest = path.join(userDir, 'twin_video.mp4')
                try {
                  await downloadFile(checkData.result_url, videoDest)
                  avatar.status = 'completed'
                  avatar.generated_video_path = `/api/avatar/media?userId=${userId}&type=video&v=${Date.now()}`
                  avatar.error_message = null
                  avatar.updated_at = new Date().toISOString()
                  saveUserAvatarRecord(userId, avatar)
                } catch (downloadErr: any) {
                  console.error('Error downloading generated D-ID video:', downloadErr)
                  // Even if local download fails, fallback to remote result_url
                  avatar.status = 'completed'
                  avatar.generated_video_path = checkData.result_url
                  saveUserAvatarRecord(userId, avatar)
                }
              } else if (checkData.status === 'error' || checkData.status === 'rejected') {
                avatar.status = 'failed'
                avatar.error_message = checkData.error?.description || checkData.error?.message || 'Video generation failed at provider'
                avatar.updated_at = new Date().toISOString()
                saveUserAvatarRecord(userId, avatar)
              } else {
                avatar.status = 'processing'
                saveUserAvatarRecord(userId, avatar)
              }
            }
          } catch (e: any) {
            console.error('Error checking D-ID job status:', e)
          }
        }

        // Poll Replicate
        if (avatar.provider === 'replicate') {
          const providerConfig = getProviderConfig()
          const apiKey = providerConfig.replicate_api_token || process.env.REPLICATE_API_TOKEN
          if (apiKey) {
            try {
              const checkRes = await fetch(`https://api.replicate.com/v1/predictions/${targetJobId}`, {
                headers: { 'Authorization': `Bearer ${apiKey}` },
              })
              const checkData: any = await checkRes.json()
              if (checkRes.ok) {
                if (checkData.status === 'succeeded' && checkData.output) {
                  const videoUrl = typeof checkData.output === 'string' ? checkData.output : checkData.output[0]
                  const userDir = ensureDirs(userId)
                  const videoDest = path.join(userDir, 'twin_video.mp4')
                  try {
                    await downloadFile(videoUrl, videoDest)
                    avatar.status = 'completed'
                    avatar.generated_video_path = `/api/avatar/media?userId=${userId}&type=video&v=${Date.now()}`
                  } catch {
                    avatar.status = 'completed'
                    avatar.generated_video_path = videoUrl
                  }
                  avatar.error_message = null
                  avatar.updated_at = new Date().toISOString()
                  saveUserAvatarRecord(userId, avatar)
                } else if (checkData.status === 'failed') {
                  avatar.status = 'failed'
                  avatar.error_message = checkData.error || 'Replicate video generation failed'
                  saveUserAvatarRecord(userId, avatar)
                }
              }
            } catch (e) {
              console.error('Error polling Replicate:', e)
            }
          }
        }

        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ avatar, status: avatar.status }))
        return
      }

      // -------------------------------------------------------------
      // 5. GET /api/avatar/media?userId=...&type=photo|video
      // -------------------------------------------------------------
      if (pathname === '/api/avatar/media' && req.method === 'GET') {
        const userId = url.searchParams.get('userId')
        const type = url.searchParams.get('type') || 'photo'

        if (!userId) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'userId is required' }))
          return
        }

        const userDir = path.join(USERS_STORAGE_DIR, userId)
        if (!fs.existsSync(userDir)) {
          res.statusCode = 404
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'No media directory for this user' }))
          return
        }

        if (type === 'photo') {
          const files = fs.readdirSync(userDir)
          const photoFile = files.find(f => f.startsWith('photo.'))
          if (!photoFile) {
            res.statusCode = 404
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Photo not found for this user' }))
            return
          }

          const photoPath = path.join(userDir, photoFile)
          const mime = photoFile.endsWith('.png') ? 'image/png' : photoFile.endsWith('.webp') ? 'image/webp' : 'image/jpeg'
          const fileBuffer = fs.readFileSync(photoPath)

          res.statusCode = 200
          res.setHeader('Content-Type', mime)
          res.setHeader('Cache-Control', 'private, max-age=3600')
          res.end(fileBuffer)
          return
        }

        if (type === 'video') {
          const videoPath = path.join(userDir, 'twin_video.mp4')
          if (!fs.existsSync(videoPath)) {
            res.statusCode = 404
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Video not found for this user' }))
            return
          }

          const stat = fs.statSync(videoPath)
          const fileSize = stat.size
          const range = req.headers.range

          // Support HTTP range requests for smooth video playback and seeking
          if (range) {
            const parts = range.replace(/bytes=/, '').split('-')
            const start = parseInt(parts[0], 10)
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
            const chunksize = end - start + 1
            const file = fs.createReadStream(videoPath, { start, end })

            res.writeHead(206, {
              'Content-Range': `bytes ${start}-${end}/${fileSize}`,
              'Accept-Ranges': 'bytes',
              'Content-Length': chunksize,
              'Content-Type': 'video/mp4',
            })
            file.pipe(res)
          } else {
            res.writeHead(200, {
              'Content-Length': fileSize,
              'Content-Type': 'video/mp4',
              'Accept-Ranges': 'bytes',
              'Cache-Control': 'private, max-age=3600',
            })
            fs.createReadStream(videoPath).pipe(res)
          }
          return
        }

        res.statusCode = 400
        res.end('Invalid media type')
        return
      }

      // -------------------------------------------------------------
      // 6. GET /api/avatar/config & POST /api/avatar/config
      // -------------------------------------------------------------
      if (pathname === '/api/avatar/config') {
        if (req.method === 'GET') {
          const config = getProviderConfig()
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({
            active_provider: config.active_provider,
            d_id_configured: !!config.d_id_api_key,
            replicate_configured: !!config.replicate_api_token,
            heygen_configured: !!config.heygen_api_key,
            // Masked preview
            d_id_key_preview: config.d_id_api_key ? `${config.d_id_api_key.substring(0, 4)}••••` : null,
          }))
          return
        }

        if (req.method === 'POST') {
          const rawBody = await readBody(req)
          let body: any = {}
          try {
            body = JSON.parse(rawBody)
          } catch {
            res.statusCode = 400
            res.end('Invalid JSON')
            return
          }

          const saved = saveProviderConfig(body)
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({
            success: true,
            active_provider: saved.active_provider,
            d_id_configured: !!saved.d_id_api_key,
            replicate_configured: !!saved.replicate_api_token,
            message: 'Provider configuration saved securely on server.',
          }))
          return
        }
      }

      // -------------------------------------------------------------
      // 7. DELETE /api/avatar/twin?userId=...
      // -------------------------------------------------------------
      if (pathname === '/api/avatar/twin' && req.method === 'DELETE') {
        const userId = url.searchParams.get('userId')
        if (!userId) {
          res.statusCode = 400
          res.end('userId required')
          return
        }

        const userDir = path.join(USERS_STORAGE_DIR, userId)
        if (fs.existsSync(userDir)) {
          fs.rmSync(userDir, { recursive: true, force: true })
        }

        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ success: true, message: 'Avatar and media successfully deleted' }))
        return
      }

      next()
    } catch (err: any) {
      console.error('Avatar API unhandled error:', err)
      if (!res.headersSent) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: err.message || 'Internal server error' }))
      }
    }
  }

  return {
    name: 'avatar-api-endpoint',
    configureServer(server) {
      server.middlewares.use(handleApiRequest)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handleApiRequest)
    },
  }
}
