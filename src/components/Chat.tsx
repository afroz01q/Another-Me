import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Send, Mic, MicOff, Volume2, VolumeX, Plus, Copy, RotateCcw,
  Square, ChevronRight, Brain, Sparkles, RefreshCw, MessageSquare,
  ArrowDown, ArrowUp, Bookmark, HelpCircle, Edit3,
} from 'lucide-react'
import { useConversationStore, useAuthStore, useTwinStore, useMemoryStore, useActivityStore } from '@/store'
import { AvatarStudioPreview } from './Avatar3D'
import { Button, Badge, EmptyState, TypingIndicator, UserAvatar } from './ui'
import type { Message, AvatarState } from '@/types'
import { formatDate, generateId, truncate } from '@/lib/utils'
import toast from 'react-hot-toast'
import { generateTwinResponse, isAIConfigured, getSelectedModel } from '@/lib/ai'
import { Link } from 'react-router-dom'
import { speakText, stopSpeaking } from '@/lib/voice'

// Message component
interface MessageBubbleProps {
  message: Message
  twinName: string
  userName: string
  accentColor: string
  onRemember?: () => void
  onCopy?: () => void
  onRegenerate?: () => void
}

function MessageBubble({ message, twinName, userName, accentColor, onRemember, onCopy, onRegenerate }: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const [showActions, setShowActions] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const { settings: twinSettings } = useTwinStore()

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content)
    toast.success('Copied to clipboard')
    onCopy?.()
  }

  const handleSpeak = async () => {
    if (isSpeaking) {
      stopSpeaking()
      setIsSpeaking(false)
      return
    }

    setIsSpeaking(true)
    const voiceId =
      twinSettings?.voice_id ||
      (typeof window !== 'undefined' ? localStorage.getItem('another-me-twin-voice') : null) ||
      'atlas'

    try {
      await speakText(message.content, voiceId, {
        speedMultiplier: twinSettings?.voice_speed || 1.0,
        onEnd: () => setIsSpeaking(false),
        onError: () => setIsSpeaking(false),
      })
    } catch {
      setIsSpeaking(false)
    }
  }

  return (
    <div
      className={`flex gap-3 group w-full ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Avatar */}
      <div className="shrink-0 mt-1">
        {isUser ? (
          <UserAvatar name={userName} size="sm" />
        ) : (
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: `radial-gradient(circle at 35% 35%, #D97757ee, #B3583B)`,
              boxShadow: `0 0 12px rgba(217, 119, 87, 0.35)`,
              flexShrink: 0,
            }}
          />
        )}
      </div>

      {/* Content */}
      <div className={`flex flex-col ${isUser ? 'max-w-[80%] items-end' : 'max-w-[88%] items-start'}`}>
        <div className="flex items-center gap-2 mb-1.5 px-1">
          <span className="text-xs font-medium tracking-tight" style={{ color: 'var(--color-text-secondary)' }}>
            {isUser ? userName : twinName}
          </span>
          <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            {formatDate(message.created_at)}
          </span>
        </div>

        <div className={isUser ? 'chat-bubble-user' : 'chat-bubble-assistant'}>
          <div className="prose-chat text-[15px] leading-relaxed" style={{ color: 'var(--color-text-primary)' }}>
            {message.content.split('\n').map((line, i) => {
              if (line.startsWith('### ')) {
                return <h4 key={i} className="font-serif text-base font-normal mt-3 mb-1 text-white">{line.slice(4)}</h4>
              }
              if (line.startsWith('## ')) {
                return <h3 key={i} className="font-serif text-lg font-normal mt-4 mb-1.5 text-white">{line.slice(3)}</h3>
              }
              if (line.startsWith('# ')) {
                return <h2 key={i} className="font-serif text-xl font-normal mt-4 mb-2 text-white">{line.slice(2)}</h2>
              }
              const formatted = line
                .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-white">$1</strong>')
                .replace(/\*(.*?)\*/g, '<em class="editorial-italic">$1</em>')
                .replace(/`(.*?)`/g, '<code class="font-mono text-xs px-1.5 py-0.5 rounded bg-[var(--color-surface-3)] text-[#EAA86E]">$1</code>')
              return line === '' ? (
                <div key={i} className="h-2" />
              ) : line.startsWith('• ') ? (
                <div key={i} className="pl-4 py-0.5 flex items-start gap-2">
                  <span className="text-[#D97757]">•</span>
                  <span>{line.slice(2)}</span>
                </div>
              ) : (
                <p key={i} className="mb-2 last:mb-0" dangerouslySetInnerHTML={{ __html: formatted }} />
              )
            })}
          </div>
        </div>

        {/* Actions */}
        {!isUser && (
          <div className={`flex items-center gap-1 mt-1.5 px-1 transition-opacity duration-200 ${showActions ? 'opacity-100' : 'opacity-0'}`}>
            <button onClick={handleCopy} className="btn btn-ghost btn-icon-sm" title="Copy response">
              <Copy size={13} />
            </button>
            <button onClick={handleSpeak} className="btn btn-ghost btn-icon-sm" title={isSpeaking ? 'Stop audio' : 'Read aloud'}>
              {isSpeaking ? <VolumeX size={13} className="text-[#D97757]" /> : <Volume2 size={13} />}
            </button>
            <button onClick={onRegenerate} className="btn btn-ghost btn-icon-sm" title="Regenerate">
              <RefreshCw size={13} />
            </button>
            <button onClick={onRemember} className="btn btn-ghost btn-icon-sm text-[#D97757]" title="Preserve in twin memory">
              <Bookmark size={13} />
            </button>
          </div>
        )}

        {/* Memory refs */}
        {message.metadata?.memory_ids && message.metadata.memory_ids.length > 0 && (
          <div className="flex items-center gap-1 mt-1 px-1">
            <Sparkles size={11} className="text-[#D97757]" />
            <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
              Informed by {message.metadata.memory_ids.length} personal memory references
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// Streaming message
function StreamingBubble({ content, twinName, accentColor }: { content: string; twinName: string; accentColor: string }) {
  return (
    <div className="flex gap-3">
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          background: `radial-gradient(circle at 35% 35%, ${accentColor}ee, ${accentColor}77)`,
          boxShadow: `0 0 12px ${accentColor}60`,
          flexShrink: 0,
          marginTop: 4,
          animation: 'orb-pulse 1s ease-in-out infinite',
        }}
      />
      <div className="flex flex-col items-start max-w-[80%]">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>{twinName}</span>
          <Badge variant="violet" className="text-[9px] py-0">streaming</Badge>
        </div>
        <div className="chat-bubble-assistant">
          <div className="prose-chat" style={{ fontSize: 14, lineHeight: 1.7 }}>
            {content || <TypingIndicator />}
            {content && <span className="inline-block w-0.5 h-4 ml-0.5 bg-violet-400 animate-blink" />}
          </div>
        </div>
      </div>
    </div>
  )
}

// Main chat interface
export function ChatInterface() {
  const { user } = useAuthStore()
  const { settings: twinSettings, avatar } = useTwinStore()
  const {
    conversations, activeConversationId, messages,
    isGenerating, streamingContent,
    setActiveConversation, addMessage, updateConversation,
    setIsGenerating, setStreamingContent, appendStreamChunk,
    newConversation, addConversation,
  } = useConversationStore()
  const { memories } = useMemoryStore()
  const { addActivity } = useActivityStore()

  const [input, setInput] = useState('')
  const [avatarState, setAvatarState] = useState<AvatarState>('idle')
  const [showAvatarPanel, setShowAvatarPanel] = useState(true)
  const [showMemoryPanel, setShowMemoryPanel] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [abortController, setAbortController] = useState<AbortController | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const speechRef = useRef<any>(null)

  const handleVoiceToggle = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      toast.error('Speech recognition is not supported in this browser. Please use Chrome or Edge.')
      return
    }

    if (isListening) {
      speechRef.current?.stop()
      setIsListening(false)
      toast('Voice input stopped')
      return
    }

    try {
      const recognition = new SpeechRecognition()
      recognition.continuous = false
      recognition.interimResults = true
      recognition.lang = twinSettings?.preferred_language === 'Spanish' ? 'es-ES' : 'en-US'

      recognition.onstart = () => {
        setIsListening(true)
        toast('Listening to microphone...', { icon: '🎙️' })
      }

      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0].transcript)
          .join('')
        setInput(transcript)
      }

      recognition.onerror = (e: any) => {
        setIsListening(false)
        toast.error(`Microphone error: ${e.error || 'Access denied'}`)
      }

      recognition.onend = () => {
        setIsListening(false)
      }

      speechRef.current = recognition
      recognition.start()
    } catch (err: any) {
      setIsListening(false)
      toast.error(`Microphone error: ${err.message}`)
    }
  }

  const activeConversation = conversations.find((c) => c.id === activeConversationId)
  const currentMessages = activeConversationId ? (messages[activeConversationId] || []) : []

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [currentMessages.length, streamingContent])

  const handleSend = useCallback(async () => {
    if (!input.trim() || isGenerating) return

    let convId = activeConversationId
    if (!convId) {
      const conv = newConversation()
      convId = conv.id
      addActivity({
        id: generateId(),
        user_id: user?.id || 'user',
        activity_type: 'conversation_started',
        description: `Started conversation: ${input.slice(0, 40)}`,
        created_at: new Date().toISOString(),
      })
    }

    const userMsg: Message = {
      id: generateId(),
      conversation_id: convId,
      role: 'user',
      content: input.trim(),
      created_at: new Date().toISOString(),
    }

    addMessage(convId, userMsg)
    const msgContent = input.trim()
    setInput('')
    setIsGenerating(true)
    setStreamingContent('')
    setAvatarState('thinking')

    inputRef.current?.focus()

    // Update conversation title
    if (currentMessages.length === 0) {
      updateConversation(convId, {
        title: msgContent.slice(0, 50) + (msgContent.length > 50 ? '...' : ''),
        last_message_at: new Date().toISOString(),
        message_count: 1,
      })
    }

    const controller = new AbortController()
    setAbortController(controller)

    try {
      let accumulated = ''
      const result = await generateTwinResponse({
        userMessage: msgContent,
        twinSettings,
        memories,
        conversationHistory: currentMessages,
        signal: controller.signal,
        onChunk: (chunk) => {
          accumulated += chunk
          setAvatarState('speaking')
          appendStreamChunk(chunk)
        },
      })

      if (!controller.signal.aborted) {
        const assistantMsg: Message = {
          id: generateId(),
          conversation_id: convId,
          role: 'assistant',
          content: accumulated || result.content,
          metadata: { model: result.model },
          created_at: new Date().toISOString(),
        }
        addMessage(convId, assistantMsg)
        updateConversation(convId, {
          last_message_at: new Date().toISOString(),
          message_count: currentMessages.length + 2,
        })
      }
    } catch (err: any) {
      if (!controller.signal.aborted) {
        toast.error('Failed to generate response')
      }
    } finally {
      setIsGenerating(false)
      setStreamingContent('')
      setAvatarState('idle')
      setAbortController(null)
    }
  }, [input, isGenerating, activeConversationId, currentMessages, user, twinSettings, memories])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleStop = () => {
    abortController?.abort()
    setIsGenerating(false)
    setStreamingContent('')
    setAvatarState('idle')
    setAbortController(null)
  }

  const handleRegenerate = () => {
    if (currentMessages.length < 2) return
    const lastUserMsg = [...currentMessages].reverse().find((m) => m.role === 'user')
    if (lastUserMsg) {
      setInput(lastUserMsg.content)
      setTimeout(() => handleSend(), 50)
    }
  }

  const handleNewConversation = () => {
    const conv = newConversation()
    setAvatarState('idle')
  }

  const accentColor = avatar?.accent_color || '#7c3aed'

  return (
    <div className="flex h-full overflow-hidden">
      {/* Avatar panel */}
      {showAvatarPanel && (
        <div
          className="hidden lg:flex flex-col items-center justify-center gap-4 p-6 shrink-0"
          style={{
            width: 280,
            borderRight: '1px solid var(--color-border)',
            background: 'var(--color-surface)',
          }}
        >
          <div style={{ width: 220, height: 220 }}>
            <AvatarStudioPreview
              state={avatarState}
              accentColor={accentColor}
              background="var(--color-background)"
            />
          </div>

          <div className="text-center">
            <div className="text-base font-semibold">{twinSettings?.name || 'Your Twin'}</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              {twinSettings?.tagline || 'Your digital twin'}
            </div>
          </div>

          {/* Quick memories */}
          <div className="w-full">
            <div className="text-xs font-semibold mb-2" style={{ color: 'var(--color-text-muted)' }}>
              RECENT MEMORIES
            </div>
            <div className="flex flex-col gap-1.5">
              {memories.slice(0, 3).map((m) => (
                <div
                  key={m.id}
                  className="px-3 py-2 rounded-lg text-xs"
                  style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}
                >
                  <div className="font-medium truncate">{m.title}</div>
                  <div className="mt-0.5 truncate" style={{ color: 'var(--color-text-muted)' }}>{m.content}</div>
                </div>
              ))}
              {memories.length === 0 && (
                <p className="text-xs text-center py-3" style={{ color: 'var(--color-text-muted)' }}>
                  No memories yet
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Chat toolbar */}
        <div
          className="flex items-center gap-3 px-4 py-2.5 shrink-0"
          style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
        >
          <button
            onClick={handleNewConversation}
            className="btn btn-secondary btn-sm"
          >
            <Plus size={14} /> New Chat
          </button>

          {activeConversation && (
            <span className="text-sm truncate" style={{ color: 'var(--color-text-secondary)' }}>
              {activeConversation.title}
            </span>
          )}

          <div className="flex-1" />

          <button
            onClick={() => setShowAvatarPanel(!showAvatarPanel)}
            className="btn btn-ghost btn-icon hidden lg:flex"
            title="Toggle avatar panel"
          >
            <Brain size={16} />
          </button>
        </div>

        {/* Messages */}
        <div
          ref={chatContainerRef}
          className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col gap-6"
          style={{ background: 'var(--color-background)' }}
        >
          {currentMessages.length === 0 && !isGenerating && (
            <div className="flex flex-col items-center justify-center my-auto py-12 px-4 gap-6 text-center animate-fade-in max-w-2xl mx-auto">
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: '50%',
                  background: 'radial-gradient(circle at 35% 35%, #D97757, #B3583B)',
                  boxShadow: '0 0 28px rgba(217, 119, 87, 0.35)',
                }}
                className="animate-float"
              />
              <div>
                <h1 className="claude-greeting mb-2.5">
                  {new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening'}, {user?.name?.split(' ')[0] || 'there'}
                </h1>
                <p className="font-sans text-[15px] max-w-md mx-auto" style={{ color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                  Your personal twin understands your communication style and memories. What would you like to think through or draft today?
                </p>
              </div>

              {/* Claude prompt pills */}
              <div className="flex flex-wrap items-center justify-center gap-2.5 max-w-xl mt-1">
                {[
                  { text: 'Draft a message in my voice', icon: MessageSquare },
                  { text: 'Review my weekly goals & milestones', icon: Sparkles },
                  { text: 'What do you remember about me?', icon: Brain },
                  { text: 'Help me plan product launch strategy', icon: Send },
                ].map((item) => (
                  <button
                    key={item.text}
                    onClick={() => { setInput(item.text); inputRef.current?.focus() }}
                    className="claude-pill"
                  >
                    <item.icon size={13} style={{ color: 'var(--color-violet-primary)' }} />
                    <span>{item.text}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {currentMessages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              twinName={twinSettings?.name || 'Twin'}
              userName={user?.name || 'You'}
              accentColor={accentColor}
              onCopy={() => {}}
              onRegenerate={handleRegenerate}
              onRemember={() => {
                useMemoryStore.getState().addMemory({
                  id: generateId(),
                  user_id: user?.id || generateId(),
                  title: truncate(msg.content, 35),
                  content: msg.content,
                  category: 'important_facts',
                  source_reference: `Conversation: ${activeConversation?.title || 'Chat'}`,
                  is_user_editable: true,
                  is_archived: false,
                  confidence: 1.0,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                })
                toast.success('Preserved in your twin\'s memory bank', { icon: '🧠' })
              }}
            />
          ))}

          {isGenerating && (
            <StreamingBubble
              content={streamingContent}
              twinName={twinSettings?.name || 'Twin'}
              accentColor={accentColor}
            />
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Claude Input area */}
        <div
          className="p-4 md:p-6 shrink-0"
          style={{
            borderTop: '1px solid var(--color-border)',
            background: 'var(--color-background)',
          }}
        >
          <div className="claude-input-card p-3.5 mx-auto max-w-3xl w-full">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Message ${twinSettings?.name || 'your twin'}...`}
              rows={2}
              className="w-full bg-transparent text-[15px] outline-none resize-none placeholder:text-[var(--color-text-muted)] leading-relaxed"
              style={{
                color: 'var(--color-text-primary)',
                maxHeight: 180,
                fontFamily: 'var(--font-sans)',
              }}
              onInput={(e) => {
                const el = e.currentTarget
                el.style.height = 'auto'
                el.style.height = Math.min(el.scrollHeight, 180) + 'px'
              }}
              disabled={isGenerating}
            />

            {/* Bottom toolbar */}
            <div className="flex items-center justify-between pt-2 mt-1 border-t border-[var(--color-border)]/40">
              <div className="flex items-center gap-2">
                {/* Model badge */}
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] border border-[var(--color-border)]">
                  <span className={`w-2 h-2 rounded-full ${isAIConfigured() ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]' : 'bg-amber-400'}`} />
                  {isAIConfigured() ? (
                    <span className="font-mono text-[11px]">{getSelectedModel().split('/').pop()}</span>
                  ) : (
                    <Link to="/app/settings" className="hover:underline text-amber-300 flex items-center gap-1">
                      <span>API Key Needed</span>
                    </Link>
                  )}
                </div>

                {/* Memory badge */}
                <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs text-[var(--color-text-muted)] bg-[var(--color-surface-2)] border border-[var(--color-border)]">
                  <Brain size={11} />
                  <span>{memories.length} memories</span>
                </div>

                {/* Voice mic toggle */}
                <button
                  onClick={handleVoiceToggle}
                  className={`p-1.5 rounded-full transition-colors ${
                    isListening ? 'bg-[#ea580c]/20 text-[#f97316] animate-pulse' : 'text-[var(--color-text-muted)] hover:text-white'
                  }`}
                  title={isListening ? 'Stop listening' : 'Voice input (Speech to Text)'}
                >
                  {isListening ? <MicOff size={15} /> : <Mic size={15} />}
                </button>
              </div>

              <div className="flex items-center gap-2">
                {isGenerating ? (
                  <button
                    onClick={handleStop}
                    className="w-8 h-8 rounded-full flex items-center justify-center bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all"
                    title="Stop generating"
                  >
                    <Square size={14} />
                  </button>
                ) : (
                  <button
                    onClick={handleSend}
                    disabled={!input.trim()}
                    style={{
                      background: input.trim() ? 'var(--color-violet-primary)' : 'var(--color-surface-3)',
                      color: input.trim() ? '#FAF6F0' : 'var(--color-text-muted)',
                    }}
                    className="w-8 h-8 rounded-full flex items-center justify-center transition-all disabled:opacity-35 disabled:cursor-not-allowed hover:opacity-90"
                    title="Send"
                  >
                    <ArrowUp size={16} />
                  </button>
                )}
              </div>
            </div>
          </div>

          <p className="text-center text-[11px] mt-2 font-sans" style={{ color: 'var(--color-text-muted)' }}>
            Another Me personal digital twin — learning strictly from approved memories and preferences.
          </p>
        </div>
      </div>
    </div>
  )
}

// Conversation list component
export function ConversationList() {
  const { conversations, activeConversationId, setActiveConversation, newConversation } = useConversationStore()
  const navigate = useNavigate()

  const sorted = [...conversations].sort((a, b) =>
    new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
  )

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 flex items-center justify-between shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <h2 className="text-base font-semibold">Conversations</h2>
        <Button
          variant="primary"
          size="sm"
          leftIcon={<Plus size={14} />}
          onClick={() => { newConversation(); navigate('/app/twin') }}
        >
          New
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {sorted.length === 0 ? (
          <EmptyState
            icon={<MessageSquare size={24} />}
            title="No conversations yet"
            description="Start a conversation with your twin"
            action={{ label: 'Start chat', onClick: () => { newConversation(); navigate('/app/twin') } }}
          />
        ) : (
          <div className="flex flex-col gap-1">
            {sorted.map((conv) => (
              <button
                key={conv.id}
                onClick={() => { setActiveConversation(conv.id); navigate('/app/twin') }}
                className={`text-left p-3 rounded-xl transition-all w-full ${conv.id === activeConversationId ? 'active' : ''}`}
                style={{
                  background: conv.id === activeConversationId ? 'rgba(124,58,237,0.1)' : 'transparent',
                  border: `1px solid ${conv.id === activeConversationId ? 'rgba(124,58,237,0.2)' : 'transparent'}`,
                  color: conv.id === activeConversationId ? '#a78bfa' : 'var(--color-text-secondary)',
                }}
                onMouseEnter={(e) => {
                  if (conv.id !== activeConversationId) {
                    e.currentTarget.style.background = 'var(--color-surface-2)'
                    e.currentTarget.style.color = 'var(--color-text-primary)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (conv.id !== activeConversationId) {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.color = 'var(--color-text-secondary)'
                  }
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <MessageSquare size={13} />
                  <span className="text-xs font-medium truncate flex-1">{conv.title}</span>
                </div>
                <div className="flex items-center justify-between text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                  <span>{conv.message_count} messages</span>
                  <span>{formatDate(conv.last_message_at)}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
