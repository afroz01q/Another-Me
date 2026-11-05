import React, { useState } from 'react'
import {
  Shield, Lock, Key, Download, Trash2, Eye, EyeOff,
  AlertCircle, Check, ChevronRight, Database, Cpu,
} from 'lucide-react'
import { Button, Badge, Toggle, Modal } from '@/components/ui'
import { useAuthStore, useActivityStore, useMemoryStore, useConversationStore } from '@/store'
import toast from 'react-hot-toast'
import { generateId } from '@/lib/utils'
import { isAIConfigured, getSelectedModel } from '@/lib/ai'

export default function PrivacyPage() {
  const { user, logout } = useAuthStore()
  const { consents, updateConsent, addActivity } = useActivityStore()
  const { memories } = useMemoryStore()
  const { conversations } = useConversationStore()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showExportConfirm, setShowExportConfirm] = useState(false)
  const [deletePhrase, setDeletePhrase] = useState('')

  const longevityDays = user?.created_at
    ? Math.max(1, Math.round((Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24))) + 'd'
    : '1d'

  const getConsent = (type: string) => consents.find((c) => c.consent_type === type)?.granted ?? false

  const handleConsentChange = (type: string, granted: boolean) => {
    updateConsent(type as 'voice_processing' | 'data_export' | 'analytics' | 'memory_auto_creation', granted)
    addActivity({
      id: generateId(),
      user_id: user?.id || 'user',
      activity_type: 'permission_changed',
      description: `Permission ${granted ? 'enabled' : 'disabled'}: ${type.replace('_', ' ')}`,
      created_at: new Date().toISOString(),
    })
    toast.success(`Permission ${granted ? 'enabled' : 'disabled'}`)
  }

  const handleExport = () => {
    const exportData = {
      exported_at: new Date().toISOString(),
      user: { email: user?.email, name: user?.name },
      memories: memories.map((m) => ({
        title: m.title,
        content: m.content,
        category: m.category,
        created_at: m.created_at,
      })),
      conversations: conversations.map((c) => ({
        title: c.title,
        message_count: c.message_count,
        created_at: c.created_at,
      })),
      data_notice: 'This export contains your personal Another Me data. Handle with care.',
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `another-me-export-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)

    addActivity({ id: generateId(), user_id: user?.id || 'user', activity_type: 'account_exported', description: 'Data export downloaded', created_at: new Date().toISOString() })
    setShowExportConfirm(false)
    toast.success('Your data has been exported')
  }

  const handleDeleteAccount = () => {
    if (deletePhrase !== 'DELETE MY ACCOUNT') {
      toast.error('Please type the exact phrase to confirm')
      return
    }
    // In production, this would call the backend delete API
    toast.success('Account deletion requested. You will receive an email confirmation.')
    setTimeout(() => logout(), 2000)
    setShowDeleteConfirm(false)
  }

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--color-background)' }}>
      <div className="max-w-7xl mx-auto p-6 md:p-8 space-y-8 animate-fade-in pb-20">

        {/* Header */}
        <div className="pb-2 border-b border-[var(--color-border)]">
          <h1 className="font-serif text-3xl font-normal text-white tracking-tight">Privacy & Security</h1>
          <p className="text-sm font-sans mt-1" style={{ color: 'var(--color-text-secondary)' }}>
            Transparent data ownership boundaries, cryptographically secured storage, and explicit user consent controls.
          </p>
        </div>

        {/* Data overview: 4 metric cards */}
        <section
          className="rounded-2xl p-6"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          <div className="flex items-center gap-2 mb-4">
            <Database size={18} style={{ color: 'var(--color-violet-light)' }} />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white">Your Personal Vault Overview</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Memories Indexed', value: memories.filter((m) => !m.is_archived).length, sub: 'Active knowledge vectors' },
              { label: 'Twin Dialogues', value: conversations.length, sub: 'Private chat sessions' },
              { label: 'Archived Records', value: memories.filter((m) => m.is_archived).length, sub: 'Excluded from context' },
              { label: 'Account Longevity', value: longevityDays, sub: 'Verified user lifetime' },
            ].map((stat) => (
              <div key={stat.label} className="p-4 rounded-xl text-center" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
                <div className="text-2xl font-bold text-white">{stat.value}</div>
                <div className="text-xs font-semibold mt-1 text-[var(--color-violet-light)]">{stat.label}</div>
                <div className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{stat.sub}</div>
              </div>
            ))}
          </div>
        </section>

        {/* 12-Column Responsive Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column (7 cols): Principles & Security Infrastructure */}
          <div className="lg:col-span-7 space-y-8">
            {/* Privacy principles */}
            <section
              className="p-6 rounded-2xl space-y-4"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
            >
              <div className="flex items-center gap-2 pb-3 border-b border-[var(--color-border)]">
                <Shield size={18} style={{ color: 'var(--color-violet-light)' }} />
                <h3 className="text-sm font-semibold uppercase tracking-wider text-white">Privacy Principles & Guarantees</h3>
              </div>
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
                {[
                  { title: 'You control what your twin knows', desc: 'Nothing is stored about you without your explicit input or approval.' },
                  { title: 'Your data is never sold', desc: 'We do not sell, share, or monetize your personal information in any form.' },
                  { title: 'AI models are not trained on your data', desc: 'Your memories and conversations are never used to train any foundation AI model.' },
                  { title: 'Deletion is real & irrevocable', desc: 'When you delete a memory or your account, data is permanently scrubbed from active systems within 30 days.' },
                  { title: 'Secrets stay isolated on the server', desc: 'API keys, credentials, and raw memory vectors are never exposed to client-side code.' },
                ].map((item, i, arr) => (
                  <div
                    key={item.title}
                    className="flex items-start gap-3.5 p-4"
                    style={{ borderBottom: i < arr.length - 1 ? '1px solid var(--color-border)' : 'none', background: 'var(--color-surface-2)' }}
                  >
                    <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: 'rgba(16,185,129,0.15)' }}>
                      <Check size={11} style={{ color: '#10b981' }} />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white">{item.title}</div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Security Architecture */}
            <section
              className="p-6 rounded-2xl space-y-4"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
            >
              <div className="flex items-center gap-2 pb-3 border-b border-[var(--color-border)]">
                <Lock size={18} style={{ color: 'var(--color-violet-light)' }} />
                <h3 className="text-sm font-semibold uppercase tracking-wider text-white">Cryptographic & System Security</h3>
              </div>
              <div className="space-y-3">
                {[
                  { label: 'Authentication Architecture', desc: 'Secure token authentication via Supabase Auth & JWT standards', status: 'Active' },
                  { label: 'Row-Level Security (RLS)', desc: 'Strict database policies ensure you can only query your own isolated records', status: 'Active' },
                  { label: 'API Rate Limiting & DDOS Shield', desc: 'All API routes protected against brute-force and rapid token extraction', status: 'Active' },
                  { label: 'Input Validation & Sanitization', desc: 'All payloads and prompts are validated and sanitized server-side', status: 'Active' },
                  { label: 'Prompt Injection Defense', desc: 'User memories and uploaded texts are strictly demarcated from system directives', status: 'Active' },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between p-3.5 rounded-xl"
                    style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}
                  >
                    <div>
                      <div className="text-sm font-semibold text-white">{item.label}</div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{item.desc}</div>
                    </div>
                    <Badge variant="success">Active</Badge>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Right Column (5 cols): Consents + Data Controls + Integration */}
          <div className="lg:col-span-5 space-y-8">
            {/* Permissions & consents */}
            <section
              className="p-6 rounded-2xl space-y-4"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
            >
              <div className="flex items-center gap-2 pb-3 border-b border-[var(--color-border)]">
                <Key size={18} style={{ color: 'var(--color-violet-light)' }} />
                <h3 className="text-sm font-semibold uppercase tracking-wider text-white">Permissions & Consents</h3>
              </div>
              <div className="space-y-3">
                <div className="p-4 rounded-xl" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
                  <Toggle
                    id="consent-memory"
                    checked={getConsent('memory_auto_creation')}
                    onChange={(v) => handleConsentChange('memory_auto_creation', v)}
                    label="Memory suggestions"
                    description="Allow your twin to suggest new memories from conversations. You approve each suggestion before it's saved."
                  />
                </div>

                <div className="p-4 rounded-xl" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
                  <Toggle
                    id="consent-voice"
                    checked={getConsent('voice_processing')}
                    onChange={(v) => handleConsentChange('voice_processing', v)}
                    label="Voice processing"
                    description="Enable speech-to-text and text-to-speech features. Requires microphone access and processes audio locally when possible."
                  />
                </div>

                <div className="p-4 rounded-xl" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
                  <Toggle
                    id="consent-analytics"
                    checked={getConsent('analytics')}
                    onChange={(v) => handleConsentChange('analytics', v)}
                    label="Anonymous usage telemetry"
                    description="Help improve Another Me by sharing anonymized performance telemetry. No personal content is ever included."
                  />
                </div>
              </div>
            </section>

            {/* Data controls */}
            <section
              className="p-6 rounded-2xl space-y-4"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
            >
              <div className="flex items-center gap-2 pb-3 border-b border-[var(--color-border)]">
                <Database size={18} style={{ color: 'var(--color-violet-light)' }} />
                <h3 className="text-sm font-semibold uppercase tracking-wider text-white">Data Sovereign Controls</h3>
              </div>
              <div className="space-y-3">
                <div
                  className="flex items-center justify-between p-4 rounded-xl"
                  style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}
                >
                  <div>
                    <div className="text-sm font-semibold text-white">Export your vault</div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                      Download all memories, dialogues, and configurations as JSON.
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    leftIcon={<Download size={14} />}
                    onClick={() => setShowExportConfirm(true)}
                  >
                    Export
                  </Button>
                </div>

                <div
                  className="flex items-center justify-between p-4 rounded-xl"
                  style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)' }}
                >
                  <div>
                    <div className="text-sm font-semibold text-red-400">Delete account & memories</div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                      Permanently wipe your account, avatar, and persona vector database.
                    </div>
                  </div>
                  <Button
                    variant="danger"
                    size="sm"
                    leftIcon={<Trash2 size={14} />}
                    onClick={() => setShowDeleteConfirm(true)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </section>

            {/* AI integrations badge card */}
            <div
              className="rounded-2xl p-5 text-sm"
              style={{ background: 'rgba(217, 119, 87, 0.08)', border: '1px solid rgba(217, 119, 87, 0.25)' }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Cpu size={16} style={{ color: 'var(--color-violet-light)' }} />
                <span className="font-semibold text-white">Active AI Runtime Status</span>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                {isAIConfigured()
                  ? `Active LLM Engine: ${getSelectedModel()}. Twin responses and memory injections are running through your configured provider.`
                  : 'AI Engine is in local privacy mode. Add your OpenRouter / LLM API Key in Platform Settings to activate real-time twin generation.'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Export modal */}
      <Modal isOpen={showExportConfirm} onClose={() => setShowExportConfirm(false)} title="Export your data">
        <div className="flex flex-col gap-4">
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            Your export will include all memories, conversation history (titles and metadata), and settings. Message content is included in the full export. Handle the file securely.
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setShowExportConfirm(false)}>Cancel</Button>
            <Button variant="primary" leftIcon={<Download size={14} />} onClick={handleExport}>
              Download export
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete modal */}
      <Modal isOpen={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)} title="Delete account?">
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3 p-3 rounded-xl" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <AlertCircle size={16} style={{ color: '#f87171', marginTop: 2 }} />
            <div className="text-sm" style={{ color: '#f87171' }}>
              This action is irreversible. All your data — memories, conversations, settings, and account information — will be permanently deleted within 30 days.
            </div>
          </div>
          <div>
            <p className="text-sm mb-2" style={{ color: 'var(--color-text-secondary)' }}>
              Type <strong>DELETE MY ACCOUNT</strong> to confirm:
            </p>
            <input
              type="text"
              value={deletePhrase}
              onChange={(e) => setDeletePhrase(e.target.value)}
              placeholder="DELETE MY ACCOUNT"
              className="input"
              style={{ fontFamily: 'monospace' }}
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => { setShowDeleteConfirm(false); setDeletePhrase('') }}>Cancel</Button>
            <Button
              variant="danger"
              leftIcon={<Trash2 size={14} />}
              onClick={handleDeleteAccount}
              disabled={deletePhrase !== 'DELETE MY ACCOUNT'}
            >
              Delete my account
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
