import React, { useState } from 'react'
import {
  Smartphone, MessageSquare, Mail, Shield, Check,
  X, AlertTriangle, Play, Pause, RefreshCw, Send, Plus, Trash2,
  ExternalLink, Bell, Zap, Clock, ShieldCheck, ChevronRight,
  AtSign, Settings, Lock, Radio, CheckCircle2, XCircle
} from 'lucide-react'
import { Button, Badge, Modal, Input } from '@/components/ui'
import { useAutopilotStore } from '@/store/autopilotStore'
import { useTwinStore } from '@/store'
import type { AutopilotPlatform, AutopilotMode, InboundMessage } from '@/types/autopilot'
import toast from 'react-hot-toast'

function InstagramIcon({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  )
}

export default function AutopilotPage() {
  const {
    settings,
    connections,
    inboundMessages,
    activeDraft,
    draftsQueue,
    trustedContacts,
    auditLogs,
    setMode,
    stopAutopilot,
    resumeAutopilot,
    confirmActiveDraft,
    cancelActiveDraft,
    openNotificationAccessSettings,
    verifyPlatformConnection,
    updatePlatformConfig,
    simulateInboundNotification,
    handleVoiceCommand,
    addTrustedContact,
    deleteTrustedContact,
  } = useAutopilotStore()

  const { settings: twinSettings } = useTwinStore()

  const [activeTab, setActiveTab] = useState<'hub' | 'platforms' | 'contacts' | 'rules' | 'audit'>('hub')
  const [isContactModalOpen, setIsContactModalOpen] = useState(false)
  const [newContactName, setNewContactName] = useState('')
  const [newContactIdentifier, setNewContactIdentifier] = useState('')
  const [newContactPlatform, setNewContactPlatform] = useState<AutopilotPlatform | 'all'>('all')
  const [newContactInstructions, setNewContactInstructions] = useState('')
  const [testingCommand, setTestingCommand] = useState(false)
  const [selectedPlatformConfig, setSelectedPlatformConfig] = useState<AutopilotPlatform | null>(null)
  const [configForm, setConfigForm] = useState<Record<string, string>>({})

  // Example test commands from prompt
  const TEST_COMMANDS = [
    "Reply to Irfan on WhatsApp that I'll call him in ten minutes.",
    "Read my latest message and suggest a friendly reply.",
    "Reply to this Instagram DM in my usual style.",
    "Summarize my unread emails.",
    "Draft a professional reply to this email and read it aloud.",
    "Send the reply after I confirm.",
    "Stop autopilot.",
  ]

  const runTestVoiceCommand = async (cmd: string) => {
    setTestingCommand(true)
    toast(`Processing voice command: "${cmd}"`, { icon: '🎙️' })
    try {
      const res = await handleVoiceCommand(cmd)
      if (res.handled) {
        toast.success(res.replySpoken, { duration: 5000, icon: '🤖' })
      } else {
        toast('Command handled in general conversation', { icon: '💬' })
      }
    } catch (err: any) {
      toast.error(err.message || 'Error processing command')
    } finally {
      setTestingCommand(false)
    }
  }

  const handleSaveContact = () => {
    if (!newContactName.trim() || !newContactIdentifier.trim()) {
      toast.error('Please enter contact name and identifier')
      return
    }
    addTrustedContact({
      name: newContactName.trim(),
      identifier: newContactIdentifier.trim(),
      platform: newContactPlatform,
      allowAutoReply: true,
      allowedCategories: ['scheduling', 'acknowledgement'],
      customInstructions: newContactInstructions.trim() || undefined,
      dailyLimit: 10,
    })
    setNewContactName('')
    setNewContactIdentifier('')
    setNewContactInstructions('')
    setIsContactModalOpen(false)
    toast.success('Trusted contact added')
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[#181816] overflow-y-auto pb-24 sm:pb-8">
      {/* ======================================================== */}
      {/* HEADER & MASTER CONTROLS (Claude Editorial Theme)        */}
      {/* ======================================================== */}
      <div className="p-4 sm:p-6 border-b border-[#35332d] bg-[#201f1c]">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-mono tracking-wider text-[#da7756] mb-1 uppercase font-semibold">
              <Smartphone size={13} />
              <span>Mobile Android Autopilot</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-serif font-normal text-[#edebe8] tracking-tight flex items-center gap-3">
              Autopilot Messaging
              <span
                className={`text-[11px] px-2.5 py-0.5 rounded-full font-mono flex items-center gap-1.5 ${
                  settings.isPaused
                    ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                    : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${settings.isPaused ? 'bg-red-500' : 'bg-emerald-400 animate-pulse'}`} />
                {settings.isPaused ? 'PAUSED' : 'ACTIVE'}
              </span>
            </h1>
            <p className="text-xs text-[#b5b1a8] mt-1 font-serif italic">
              Voice-controlled messaging across WhatsApp, Instagram, and email aligned with your twin's personality ({twinSettings?.communication_style || 'friendly'} style).
            </p>
          </div>

          {/* Quick Master Actions */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Automation Mode Selector */}
            <div className="flex items-center bg-[#282622] p-1 rounded-full border border-[#35332d] overflow-x-auto max-w-full">
              {(['manual', 'trusted_contacts', 'voice_autopilot'] as AutopilotMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setMode(mode)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                    settings.mode === mode
                      ? 'bg-[#da7756] text-[#181816] font-semibold shadow-sm'
                      : 'text-[#b5b1a8] hover:text-[#edebe8]'
                  }`}
                >
                  {mode === 'manual'
                    ? 'Manual Approval'
                    : mode === 'trusted_contacts'
                    ? 'Trusted Contacts'
                    : 'Voice Autopilot'}
                </button>
              ))}
            </div>

            {/* Emergency Stop / Resume Button */}
            {settings.isPaused ? (
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Play size={14} />}
                onClick={() => resumeAutopilot()}
                className="bg-[#38a169] hover:bg-[#2f855a] text-white font-medium rounded-full"
              >
                Resume Autopilot
              </Button>
            ) : (
              <Button
                variant="danger"
                size="sm"
                leftIcon={<Pause size={14} />}
                onClick={() => stopAutopilot('Manual stop from dashboard')}
                className="font-medium shadow-md shadow-red-950/40 rounded-full"
              >
                Stop Autopilot
              </Button>
            )}
          </div>
        </div>

        {/* Quota Progress Bar */}
        <div className="max-w-6xl mx-auto mt-4 pt-3 border-t border-[#35332d] flex items-center justify-between text-xs text-[#7d7a73]">
          <div className="flex items-center gap-3">
            <span>Daily Outbound Quota:</span>
            <div className="w-32 bg-[#282622] h-2 rounded-full overflow-hidden border border-[#35332d]">
              <div
                className="bg-[#da7756] h-full rounded-full transition-all"
                style={{ width: `${Math.min(100, (settings.sentTodayCount / settings.dailyGlobalSendLimit) * 100)}%` }}
              />
            </div>
            <span className="font-mono text-[#edebe8] font-semibold">
              {settings.sentTodayCount} / {settings.dailyGlobalSendLimit} sent today
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>Anti-Prompt-Injection Guard Active</span>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* TABS NAVIGATION                                          */}
      {/* ======================================================== */}
      <div className="px-4 sm:px-6 border-b border-[#35332d] bg-[#201f1c]/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto flex items-center gap-4 sm:gap-6 overflow-x-auto no-scrollbar">
          {[
            { id: 'hub', label: 'Live Hub & Feed', icon: MessageSquare },
            { id: 'platforms', label: 'Platforms', icon: Smartphone },
            { id: 'contacts', label: 'Trusted Contacts', icon: ShieldCheck },
            { id: 'rules', label: 'Safety Rules', icon: Shield },
            { id: 'audit', label: 'Audit History', icon: Clock },
          ].map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-3 text-xs font-medium flex items-center gap-2 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'border-[#da7756] text-[#da7756] font-semibold'
                    : 'border-transparent text-[#b5b1a8] hover:text-[#edebe8]'
                }`}
              >
                <Icon size={14} className={isActive ? 'text-[#da7756]' : 'text-[#7d7a73]'} />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* ======================================================== */}
      {/* TAB CONTENT                                              */}
      {/* ======================================================== */}
      <div className="p-4 sm:p-6 max-w-6xl mx-auto w-full flex-1">
        {/* TAB 1: LIVE HUB & INBOUND FEED */}
        {activeTab === 'hub' && (
          <div className="space-y-6 animate-fade-in">
            {/* Active Draft Banner (if awaiting confirmation) */}
            {activeDraft && (
              <div className="p-4 sm:p-5 rounded-2xl border border-[#da7756]/50 bg-[#201f1c] backdrop-blur-md shadow-2xl relative">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#da7756] text-[#181816] uppercase">
                        Action Required
                      </span>
                      <span className="text-xs text-[#da7756] font-mono">
                        Voice Draft Awaiting Confirmation
                      </span>
                    </div>
                    <h3 className="text-lg font-serif font-normal text-[#edebe8] mt-1.5">
                      Reply to {activeDraft.recipientName} ({activeDraft.platform.replace('_', ' ')})
                    </h3>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      leftIcon={<Send size={14} />}
                      onClick={async () => {
                        const res = await confirmActiveDraft()
                        if (res?.success) toast.success('Reply successfully delivered!')
                      }}
                      className="bg-[#da7756] hover:bg-[#e28a6c] text-[#181816] font-semibold rounded-full"
                    >
                      Confirm & Send
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      leftIcon={<X size={14} />}
                      onClick={() => cancelActiveDraft()}
                      className="text-[#b5b1a8] hover:text-[#edebe8] rounded-full"
                    >
                      Discard
                    </Button>
                  </div>
                </div>

                {activeDraft.originalMessageSnippet && (
                  <div className="mt-3 p-3 rounded-xl bg-[#282622] border border-[#35332d] text-xs text-[#b5b1a8] font-serif italic">
                    <span className="font-sans font-semibold text-[#7d7a73] not-italic">Original message: </span>
                    "{activeDraft.originalMessageSnippet}"
                  </div>
                )}

                <div className="mt-3 p-4 rounded-xl bg-[#282622] border border-[#da7756]/30 text-sm text-[#edebe8]">
                  <span className="text-[10px] uppercase font-mono tracking-wider text-[#da7756] block mb-1">
                    Twin's Generated Reply ({activeDraft.toneUsed} tone):
                  </span>
                  <p className="font-serif italic text-sm leading-relaxed text-[#edebe8]">"{activeDraft.proposedReply}"</p>
                </div>

                <div className="mt-3 flex items-center justify-between text-xs text-[#7d7a73]">
                  <span className="flex items-center gap-1.5 text-emerald-400">
                    <CheckCircle2 size={13} /> {activeDraft.safetyAssessment.explanation}
                  </span>
                  <span className="font-mono text-[11px] text-[#7d7a73]">
                    Voice trigger: say "Send it" or "Cancel"
                  </span>
                </div>
              </div>
            )}

            {/* Quick Test Voice Commands Bar */}
            <div className="p-4 sm:p-5 rounded-2xl bg-[#201f1c] border border-[#35332d] shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-[#edebe8] flex items-center gap-1.5">
                  <Zap size={14} className="text-[#da7756]" />
                  Try Supported Voice Commands:
                </span>
                <span className="text-[11px] text-[#7d7a73] font-serif italic">
                  Tap to simulate spoken command
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {TEST_COMMANDS.map((cmd) => (
                  <button
                    key={cmd}
                    disabled={testingCommand}
                    onClick={() => runTestVoiceCommand(cmd)}
                    className="px-3 py-1.5 rounded-full text-xs bg-[#282622] hover:bg-[#da7756]/15 border border-[#35332d] hover:border-[#da7756]/40 text-[#edebe8] hover:text-[#da7756] transition-all cursor-pointer text-left font-serif italic shadow-sm"
                  >
                    "{cmd}"
                  </button>
                ))}
              </div>
            </div>

            {/* Inbound Live Feed */}
            <div className="p-4 sm:p-5 rounded-2xl bg-[#201f1c] border border-[#35332d] shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-base font-serif font-normal text-[#edebe8] flex items-center gap-2">
                    <MessageSquare size={16} className="text-[#da7756]" />
                    Inbound Messages & Notifications
                  </h2>
                  <p className="text-xs text-[#b5b1a8] font-serif italic">
                    Authorized messages intercepted from WhatsApp, Instagram, and Gmail
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    leftIcon={<Plus size={14} />}
                    onClick={() => simulateInboundNotification({ sender: 'Irfan', platform: 'whatsapp_notification', content: 'Hey! Are you free for a call in ten minutes?' })}
                    className="rounded-full bg-[#282622] border border-[#35332d] hover:bg-[#35332d] text-[#edebe8]"
                  >
                    Simulate WhatsApp Notif
                  </Button>
                </div>
              </div>

              {inboundMessages.length === 0 ? (
                <div className="text-center py-12 text-[#7d7a73] text-xs font-serif italic">
                  No incoming messages. Click "Simulate WhatsApp Notif" to test.
                </div>
              ) : (
                <div className="space-y-3">
                  {inboundMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className="p-4 rounded-xl bg-[#282622] border border-[#35332d] hover:border-[#da7756]/30 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                            msg.platform.startsWith('whatsapp')
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : msg.platform.startsWith('instagram')
                              ? 'bg-[#da7756]/15 text-[#da7756]'
                              : 'bg-red-500/15 text-red-400'
                          }`}
                        >
                          {msg.platform.startsWith('whatsapp') ? (
                            <MessageSquare size={16} />
                          ) : msg.platform.startsWith('instagram') ? (
                            <InstagramIcon size={16} />
                          ) : (
                            <Mail size={16} />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-serif font-normal text-[#edebe8] text-sm">{msg.senderName}</span>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#181816] text-[#b5b1a8] uppercase border border-[#35332d]">
                              {msg.platform.replace('_', ' ')}
                            </span>
                            {!msg.isRead && (
                              <span className="w-2 h-2 rounded-full bg-[#da7756]" />
                            )}
                          </div>
                          {msg.subject && (
                            <div className="text-xs font-serif italic text-[#da7756] mt-0.5">{msg.subject}</div>
                          )}
                          <p className="text-xs text-[#b5b1a8] mt-1 font-serif italic line-clamp-2">"{msg.content}"</p>
                          <span className="text-[10px] text-[#7d7a73] font-mono mt-1 block">
                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          variant="secondary"
                          size="sm"
                          leftIcon={<Zap size={13} className="text-[#da7756]" />}
                          onClick={() => runTestVoiceCommand(`Reply to ${msg.senderName} that I'll call him in ten minutes.`)}
                          className="rounded-full bg-[#201f1c] border border-[#35332d] hover:border-[#da7756]/40 text-[#edebe8]"
                        >
                          Draft Reply
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: PLATFORM CONNECTIONS */}
        {activeTab === 'platforms' && (
          <div className="space-y-6 animate-fade-in">
            <div className="p-4 rounded-xl bg-[#282622] border border-[#35332d] text-xs text-[#b5b1a8]">
              <span className="font-serif font-normal text-[#edebe8] text-sm block mb-1">Platform Architecture Notice:</span>
              WhatsApp supports two distinct paths: Android Notification Direct Reply (free, runs on device) and Official WhatsApp Business Cloud API. Instagram strictly requires an Instagram Professional/Creator account per Meta platform terms.
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {connections.map((conn) => (
                <div
                  key={conn.platform}
                  className="p-5 rounded-2xl bg-[#201f1c] border border-[#35332d] flex flex-col justify-between shadow-sm"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-[#282622] flex items-center justify-center text-[#da7756] border border-[#35332d]">
                          {conn.platform.startsWith('whatsapp') ? (
                            <MessageSquare size={16} />
                          ) : conn.platform.startsWith('instagram') ? (
                            <InstagramIcon size={16} />
                          ) : (
                            <Mail size={16} />
                          )}
                        </div>
                        <div>
                          <h3 className="font-serif font-normal text-[#edebe8] text-sm">{conn.displayName}</h3>
                          <span className="text-[10px] font-mono text-[#7d7a73] uppercase">
                            Auth: {conn.authType.replace('_', ' ')}
                          </span>
                        </div>
                      </div>

                      <span
                        className={`text-[10px] font-mono font-medium px-2 py-0.5 rounded-full ${
                          conn.isConnected
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : 'bg-[#282622] text-[#7d7a73] border border-[#35332d]'
                        }`}
                      >
                        {conn.isConnected ? 'Connected' : 'Not Configured'}
                      </span>
                    </div>

                    <p className="text-xs text-[#b5b1a8] mt-2 font-serif italic">
                      {conn.approvalNotes}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-[#35332d] flex items-center justify-between">
                    <span className="text-[11px] text-[#7d7a73] font-mono">
                      {conn.platform === 'whatsapp_notification'
                        ? 'Android RemoteInput'
                        : conn.requiresOfficialApproval
                        ? 'Requires Meta Dev Account'
                        : 'REST API'}
                    </span>

                    {conn.platform === 'whatsapp_notification' ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        leftIcon={<Bell size={13} className="text-[#da7756]" />}
                        onClick={async () => {
                          await openNotificationAccessSettings()
                          toast.success('Android Notification Access toggled')
                        }}
                        className="rounded-full bg-[#282622] border border-[#35332d] hover:bg-[#35332d] text-[#edebe8]"
                      >
                        {settings.notificationAccessGranted ? 'Access Granted' : 'Grant Access'}
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        leftIcon={<Settings size={13} />}
                        onClick={() => {
                          setSelectedPlatformConfig(conn.platform)
                          const stored = localStorage.getItem(`another-me-${conn.platform}-config`)
                          setConfigForm(stored ? JSON.parse(stored) : {})
                        }}
                        className="rounded-full bg-[#282622] border border-[#35332d] hover:bg-[#35332d] text-[#edebe8]"
                      >
                        Configure
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: TRUSTED CONTACTS */}
        {activeTab === 'contacts' && (
          <div className="space-y-6 animate-fade-in">
            <div className="p-4 sm:p-5 rounded-2xl bg-[#201f1c] border border-[#35332d] shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-base font-serif font-normal text-[#edebe8] flex items-center gap-2">
                    <ShieldCheck size={16} className="text-emerald-400" />
                    Trusted Contacts & Auto-Reply Rules
                  </h2>
                  <p className="text-xs text-[#b5b1a8] font-serif italic">
                    In "Trusted Contacts" mode, low-risk replies to these individuals are sent automatically without stopping for confirmation.
                  </p>
                </div>

                <Button
                  variant="primary"
                  size="sm"
                  leftIcon={<Plus size={14} />}
                  onClick={() => setIsContactModalOpen(true)}
                  className="bg-[#da7756] hover:bg-[#e28a6c] text-[#181816] font-medium rounded-full"
                >
                  Add Trusted Contact
                </Button>
              </div>

              {trustedContacts.length === 0 ? (
                <div className="text-center py-12 text-[#7d7a73] text-xs font-serif italic">
                  No trusted contacts configured. Outbound messages will require manual voice confirmation.
                </div>
              ) : (
                <div className="space-y-3">
                  {trustedContacts.map((contact) => (
                    <div
                      key={contact.id}
                      className="p-4 rounded-xl bg-[#282622] border border-[#35332d] flex items-center justify-between gap-4"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-serif font-normal text-[#edebe8] text-sm">{contact.name}</span>
                          <span className="text-xs font-mono text-[#7d7a73]">({contact.identifier})</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            Auto-Reply Allowed
                          </span>
                        </div>
                        <div className="text-xs text-[#b5b1a8] mt-1 font-serif italic">
                          Allowed: {contact.allowedCategories.join(', ')} • Limit: {contact.dailyLimit} msgs/day
                        </div>
                        {contact.customInstructions && (
                          <div className="text-xs text-[#da7756] mt-1 font-serif italic">
                            Custom persona: "{contact.customInstructions}"
                          </div>
                        )}
                      </div>

                      <button
                        onClick={() => deleteTrustedContact(contact.id)}
                        className="p-2 rounded-lg text-[#7d7a73] hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                        title="Delete contact"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: RULES & SAFETY */}
        {activeTab === 'rules' && (
          <div className="space-y-6 animate-fade-in">
            <div className="p-4 sm:p-5 rounded-2xl bg-[#201f1c] border border-[#35332d] space-y-5 shadow-sm">
              <div>
                <h2 className="text-base font-serif font-normal text-[#edebe8] flex items-center gap-2">
                  <Shield size={16} className="text-[#da7756]" />
                  Safety, Privacy & Confirmation Thresholds
                </h2>
                <p className="text-xs text-[#b5b1a8] font-serif italic">
                  Strict safeguards to protect against prompt injection, unauthorized outbound messages, and financial or credential loss.
                </p>
              </div>

              <div className="space-y-3 text-xs">
                <div className="p-4 rounded-xl bg-[#282622] border border-[#35332d] flex items-center justify-between">
                  <div>
                    <span className="font-serif font-normal text-[#edebe8] block text-sm">Anti-Prompt-Injection Quarantine</span>
                    <span className="text-[#b5b1a8] font-serif italic">
                      Incoming messages are treated as untrusted text to prevent hidden instructions from overriding your twin.
                    </span>
                  </div>
                  <span className="text-xs font-mono text-emerald-400 font-semibold">ALWAYS ON</span>
                </div>

                <div className="p-4 rounded-xl bg-[#282622] border border-[#35332d] flex items-center justify-between">
                  <div>
                    <span className="font-serif font-normal text-[#edebe8] block text-sm">Mandatory Confirmation for High-Impact Messages</span>
                    <span className="text-[#b5b1a8] font-serif italic">
                      Any message discussing money, passwords, legal contracts, or wire transfers unconditionally requires your voice approval.
                    </span>
                  </div>
                  <span className="text-xs font-mono text-emerald-400 font-semibold">ENFORCED</span>
                </div>

                <div className="p-4 rounded-xl bg-[#282622] border border-[#35332d] flex items-center justify-between">
                  <div>
                    <span className="font-serif font-normal text-[#edebe8] block text-sm">Verified Result Before Delivery Claim</span>
                    <span className="text-[#b5b1a8] font-serif italic">
                      The AI twin will never claim a message was sent until a verified HTTP 200 or RemoteInput success code is returned.
                    </span>
                  </div>
                  <span className="text-xs font-mono text-emerald-400 font-semibold">VERIFIED</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: AUDIT LOG */}
        {activeTab === 'audit' && (
          <div className="space-y-6 animate-fade-in">
            <div className="p-4 sm:p-5 rounded-2xl bg-[#201f1c] border border-[#35332d] shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-serif font-normal text-[#edebe8] flex items-center gap-2">
                    <Clock size={16} className="text-[#da7756]" />
                    Autopilot Activity & Audit History
                  </h2>
                  <p className="text-xs text-[#b5b1a8] font-serif italic">
                    Immutable event log of voice commands, drafted replies, approvals, and verified deliveries
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                {auditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3 rounded-xl bg-[#282622] border border-[#35332d] flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-mono text-[#7d7a73]">
                        {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                      <span className="font-serif text-[#edebe8]">{log.summary}</span>
                      {log.platform && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-[#181816] text-[#da7756] border border-[#35332d]">
                          {log.platform}
                        </span>
                      )}
                    </div>

                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                        log.verifiedStatus === 'Verified' || log.verifiedStatus === 'Delivered'
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : log.verifiedStatus === 'Failed'
                          ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                          : 'bg-[#181816] text-[#7d7a73] border border-[#35332d]'
                      }`}
                    >
                      {log.verifiedStatus || 'Logged'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODAL: ADD TRUSTED CONTACT */}
      <Modal
        isOpen={isContactModalOpen}
        onClose={() => setIsContactModalOpen(false)}
        title="Add Trusted Contact"
      >
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-[#edebe8] block mb-1">Contact Name</label>
            <Input
              placeholder="e.g. Irfan"
              value={newContactName}
              onChange={(e) => setNewContactName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-[#edebe8] block mb-1">Identifier (Phone, Email, or Handle)</label>
            <Input
              placeholder="e.g. +91 98765 43210 or irfan@example.com"
              value={newContactIdentifier}
              onChange={(e) => setNewContactIdentifier(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-[#edebe8] block mb-1">Platform</label>
            <select
              value={newContactPlatform}
              onChange={(e) => setNewContactPlatform(e.target.value as any)}
              className="w-full bg-[#282622] border border-[#35332d] rounded-xl px-3 py-2 text-xs text-[#edebe8]"
            >
              <option value="all">All Platforms (WhatsApp, Instagram, Email)</option>
              <option value="whatsapp_notification">WhatsApp Notification</option>
              <option value="whatsapp_business">WhatsApp Business API</option>
              <option value="instagram_business">Instagram</option>
              <option value="gmail">Gmail</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-[#edebe8] block mb-1">Custom Twin Instructions (Optional)</label>
            <Input
              placeholder="e.g. Always be friendly, casual, and warm"
              value={newContactInstructions}
              onChange={(e) => setNewContactInstructions(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-[#35332d]">
            <Button variant="ghost" size="sm" onClick={() => setIsContactModalOpen(false)} className="rounded-full">
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleSaveContact} className="bg-[#da7756] hover:bg-[#e28a6c] text-[#181816] font-medium rounded-full">
              Save Contact
            </Button>
          </div>
        </div>
      </Modal>

      {/* MODAL: PLATFORM CONFIGURATION */}
      <Modal
        isOpen={!!selectedPlatformConfig}
        onClose={() => setSelectedPlatformConfig(null)}
        title={`Configure ${selectedPlatformConfig ? selectedPlatformConfig.replace('_', ' ').toUpperCase() : ''}`}
      >
        <div className="space-y-4 text-xs">
          {selectedPlatformConfig === 'whatsapp_business' && (
            <>
              <div>
                <label className="text-zinc-300 font-semibold block mb-1">Phone Number ID</label>
                <Input
                  placeholder="e.g. 104839284910293"
                  value={configForm.phoneNumberId || ''}
                  onChange={(e) => setConfigForm({ ...configForm, phoneNumberId: e.target.value })}
                />
              </div>
              <div>
                <label className="text-zinc-300 font-semibold block mb-1">System User Access Token</label>
                <Input
                  type="password"
                  placeholder="EAAG..."
                  value={configForm.accessToken || ''}
                  onChange={(e) => setConfigForm({ ...configForm, accessToken: e.target.value })}
                />
              </div>
            </>
          )}

          {selectedPlatformConfig === 'instagram_business' && (
            <>
              <div>
                <label className="text-zinc-300 font-semibold block mb-1">Instagram Business Account ID</label>
                <Input
                  placeholder="e.g. 17841400000000000"
                  value={configForm.instagramAccountId || ''}
                  onChange={(e) => setConfigForm({ ...configForm, instagramAccountId: e.target.value })}
                />
              </div>
              <div>
                <label className="text-zinc-300 font-semibold block mb-1">Meta Page Access Token</label>
                <Input
                  type="password"
                  placeholder="EAAG..."
                  value={configForm.pageAccessToken || ''}
                  onChange={(e) => setConfigForm({ ...configForm, pageAccessToken: e.target.value })}
                />
              </div>
            </>
          )}

          {selectedPlatformConfig === 'gmail' && (
            <div>
              <p className="text-zinc-300 mb-2">
                Connect your Google Account to grant read & reply permissions for Gmail.
              </p>
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Mail size={14} />}
                onClick={() => {
                  localStorage.setItem('another-me-gmail-token', 'mock-google-token')
                  toast.success('Gmail connected successfully!')
                  setSelectedPlatformConfig(null)
                }}
              >
                Connect Google Account
              </Button>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-[var(--color-border)]">
            <Button variant="ghost" size="sm" onClick={() => setSelectedPlatformConfig(null)}>
              Close
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                if (selectedPlatformConfig) {
                  localStorage.setItem(
                    `another-me-${selectedPlatformConfig}-config`,
                    JSON.stringify(configForm)
                  )
                  updatePlatformConfig(selectedPlatformConfig, configForm)
                  toast.success('Configuration saved')
                  setSelectedPlatformConfig(null)
                }
              }}
            >
              Save Configuration
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
