import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { spawn } from 'child_process'

function neuralTtsPlugin(): Plugin {
  const audioCache = new Map<string, Buffer>()

  const ttsHandler = async (req: any, res: any) => {
    try {
      const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`)

      let text = url.searchParams.get('text') || ''
      let voice = url.searchParams.get('voice') || 'en-US-GuyNeural'
      let rate = url.searchParams.get('rate') || '1.0'

      if (req.method === 'POST') {
        const bodyBuffer: Buffer[] = []
        for await (const chunk of req) {
          bodyBuffer.push(chunk)
        }
        const bodyStr = Buffer.concat(bodyBuffer).toString('utf-8')
        try {
          const json = JSON.parse(bodyStr)
          if (json.text) text = json.text
          if (json.voice) voice = json.voice
          if (json.rate) rate = String(json.rate)
        } catch {
          if (bodyStr) text = bodyStr
        }
      }

      if (!text.trim()) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: 'Text parameter required' }))
        return
      }

      const rateNum = parseFloat(rate) || 1.0
      const ratePercent = Math.round((rateNum - 1.0) * 100)
      const rateStr = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`
      const cacheKey = `${voice}__${rateStr}__${text.trim()}`

      if (audioCache.has(cacheKey)) {
        const cached = audioCache.get(cacheKey)!
        res.statusCode = 200
        res.setHeader('Content-Type', 'audio/mpeg')
        res.setHeader('Content-Length', String(cached.length))
        res.setHeader('Cache-Control', 'public, max-age=86400')
        res.end(cached)
        return
      }

      const args = ['-m', 'edge_tts', '--voice', voice, '--text', text.trim(), '--no-progress']
      if (rateStr && rateStr !== '+0%' && rateStr !== '0%') {
        args.push('--rate', rateStr)
      }

      const child = spawn('python', args)
      const chunks: Buffer[] = []
      let stderr = ''

      child.stdout.on('data', (chunk: Buffer) => {
        chunks.push(chunk)
      })

      child.stderr.on('data', (d: Buffer) => {
        stderr += d.toString()
      })

      child.on('close', (code: number) => {
        if (code === 0 && chunks.length > 0) {
          const audioBuffer = Buffer.concat(chunks)
          audioCache.set(cacheKey, audioBuffer)

          res.statusCode = 200
          res.setHeader('Content-Type', 'audio/mpeg')
          res.setHeader('Content-Length', String(audioBuffer.length))
          res.setHeader('Cache-Control', 'public, max-age=86400')
          res.end(audioBuffer)
        } else {
          console.error('Edge TTS generation failed, code:', code, 'stderr:', stderr)
          if (!res.headersSent) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: stderr || `edge-tts failed with code ${code}` }))
          }
        }
      })

      child.on('error', (err: any) => {
        console.error('Failed to spawn python edge_tts:', err)
        if (!res.headersSent) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: err.message }))
        }
      })
    } catch (err: any) {
      console.error('TTS endpoint error:', err)
      if (!res.headersSent) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: err.message }))
      }
    }
  }

  return {
    name: 'neural-tts-endpoint',
    configureServer(server) {
      server.middlewares.use('/api/tts', ttsHandler)
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/tts', ttsHandler)
    },
  }
}

import { avatarApiPlugin } from './src/server/avatarApi'
import { buildAgentApiPlugin } from './src/server/buildAgentApi'
import { orchestratorApiPlugin } from './src/server/orchestrator/orchestratorApi'
import { agentRuntimeApiPlugin } from './src/server/agentRuntime/runtimeApi'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  Object.assign(process.env, env)

  return {
    server: {
      watch: {
        ignored: ['**/storage/**'],
      },
    },
    plugins: [
      react(),
      tailwindcss(),
      neuralTtsPlugin(),
      avatarApiPlugin(),
      buildAgentApiPlugin(),
      orchestratorApiPlugin(),
      agentRuntimeApiPlugin(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
  }
})
