import React, { useState } from 'react'
import {
  Bell, FileText, MessageSquare, CheckSquare, Search, Zap,
  Check, X, Clock, AlertCircle, ChevronRight, Plus, Play, Shield,
} from 'lucide-react'
import { Button, Badge, Modal, Textarea, Input, EmptyState } from '@/components/ui'
import { useActivityStore, useAuthStore } from '@/store'
import type { ActionExecution, ActionType } from '@/types'
import { formatDate, generateId } from '@/lib/utils'
import toast from 'react-hot-toast'

const ACTION_TYPES: {
  type: ActionType
  icon: React.ReactNode
  label: string
  description: string
  requiresConfirmation: boolean
}[] = [
  { type: 'create_reminder', icon: <Bell size={16} />, label: 'Create Reminder', description: 'Set a reminder with a title, notes, and due time.', requiresConfirmation: true },
  { type: 'organize_note', icon: <FileText size={16} />, label: 'Organize Note', description: 'Structure and organize a piece of text or note content.', requiresConfirmation: false },
  { type: 'summarize_document', icon: <FileText size={16} />, label: 'Summarize Document', description: 'Upload and summarize a document or pasted text.', requiresConfirmation: false },
  { type: 'draft_message', icon: <MessageSquare size={16} />, label: 'Draft Message', description: 'Draft a message or email in your style.', requiresConfirmation: true },
  { type: 'create_task', icon: <CheckSquare size={16} />, label: 'Create Task', description: 'Create a task with a title, notes, and priority.', requiresConfirmation: true },
  { type: 'search_memory', icon: <Search size={16} />, label: 'Search Memory', description: 'Search your memory for specific information.', requiresConfirmation: false },
]

const STATUS_CONFIGS = {
  pending: { label: 'Pending', color: 'var(--color-text-muted)', bg: 'var(--color-surface-3)', icon: <Clock size={12} /> },
  awaiting_confirmation: { label: 'Awaiting approval', color: '#fbbf24', bg: 'rgba(245,158,11,0.1)', icon: <AlertCircle size={12} /> },
  confirmed: { label: 'Confirmed', color: '#60a5fa', bg: 'rgba(59,130,246,0.1)', icon: <Check size={12} /> },
  executing: { label: 'Executing', color: '#a78bfa', bg: 'rgba(124,58,237,0.1)', icon: <Zap size={12} /> },
  completed: { label: 'Completed', color: '#34d399', bg: 'rgba(16,185,129,0.1)', icon: <Check size={12} /> },
  failed: { label: 'Failed', color: '#f87171', bg: 'rgba(239,68,68,0.1)', icon: <X size={12} /> },
  cancelled: { label: 'Cancelled', color: 'var(--color-text-muted)', bg: 'var(--color-surface-3)', icon: <X size={12} /> },
}

// Create action modal
function CreateActionModal({
  isOpen,
  onClose,
  actionType,
}: {
  isOpen: boolean
  onClose: () => void
  actionType: typeof ACTION_TYPES[0] | null
}) {
  const { addAction, addActivity } = useActivityStore()
  const { user } = useAuthStore()
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!actionType) return null

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error('Please provide a title')
      return
    }

    setIsSubmitting(true)
    await new Promise((r) => setTimeout(r, 600))

    const action: ActionExecution = {
      id: generateId(),
      user_id: user?.id || 'user',
      action_type: actionType.type,
      title: title.trim(),
      input_data: { details: details.trim() },
      expected_outcome: `${actionType.label}: "${title}"`,
      status: actionType.requiresConfirmation ? 'awaiting_confirmation' : 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    addAction(action)
    addActivity({
      id: generateId(),
      user_id: user?.id || 'user',
      activity_type: 'action_requested',
      description: `Action requested: ${actionType.label} — "${title}"`,
      created_at: new Date().toISOString(),
    })

    setTitle('')
    setDetails('')
    setIsSubmitting(false)
    onClose()
    toast.success(actionType.requiresConfirmation ? 'Action created — approval required' : 'Action queued')
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={actionType.label}>
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3 p-3 rounded-xl" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
          <div style={{ color: 'var(--color-violet-light)', marginTop: 2 }}>{actionType.icon}</div>
          <div>
            <div className="text-sm font-medium">{actionType.description}</div>
            {actionType.requiresConfirmation && (
              <div className="flex items-center gap-1 mt-1 text-xs" style={{ color: '#fbbf24' }}>
                <Shield size={10} />
                <span>This action requires your confirmation before executing.</span>
              </div>
            )}
          </div>
        </div>

        <Input
          label="Title"
          id="action-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={`${actionType.label} title...`}
        />

        <Textarea
          label="Details (optional)"
          id="action-details"
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="Provide any additional context or instructions..."
          style={{ minHeight: 80 }}
        />

        <div className="flex gap-2 justify-end pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            isLoading={isSubmitting}
            onClick={handleSubmit}
          >
            {actionType.requiresConfirmation ? 'Submit for approval' : 'Execute action'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// Action card
function ActionCard({ action }: { action: ActionExecution }) {
  const { updateAction, addActivity } = useActivityStore()
  const { user } = useAuthStore()
  const config = STATUS_CONFIGS[action.status]

  const handleConfirm = async () => {
    updateAction(action.id, { status: 'executing', confirmed_at: new Date().toISOString() })
    addActivity({ id: generateId(), user_id: user?.id || 'user', activity_type: 'action_confirmed', description: `Action confirmed: ${action.title}`, created_at: new Date().toISOString() })

    // Simulate execution
    await new Promise((r) => setTimeout(r, 1500))
    const actionDef = ACTION_TYPES.find((a) => a.type === action.action_type)
    updateAction(action.id, {
      status: 'completed',
      result: { message: `${actionDef?.label || 'Action'} "${action.title}" completed successfully.` },
      executed_at: new Date().toISOString(),
    })
    addActivity({ id: generateId(), user_id: user?.id || 'user', activity_type: 'action_completed', description: `Action completed: ${action.title}`, created_at: new Date().toISOString() })
    toast.success(`Action completed: ${action.title}`)
  }

  const handleCancel = () => {
    updateAction(action.id, { status: 'cancelled' })
    addActivity({ id: generateId(), user_id: user?.id || 'user', activity_type: 'action_cancelled', description: `Action cancelled: ${action.title}`, created_at: new Date().toISOString() })
    toast('Action cancelled')
  }

  const actionDef = ACTION_TYPES.find((a) => a.type === action.action_type)

  return (
    <div
      className="card p-4 flex flex-col gap-3"
      style={{ borderColor: action.status === 'awaiting_confirmation' ? 'rgba(245,158,11,0.3)' : undefined }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span style={{ color: 'var(--color-violet-light)' }}>{actionDef?.icon}</span>
          <span className="text-sm font-semibold">{action.title}</span>
        </div>
        <div
          className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium shrink-0"
          style={{ background: config.bg, color: config.color }}
        >
          {config.icon}
          {config.label}
        </div>
      </div>

      <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        <span className="font-medium" style={{ color: 'var(--color-text-secondary)' }}>Type: </span>
        {actionDef?.label}
      </div>

      <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        <span className="font-medium" style={{ color: 'var(--color-text-secondary)' }}>Expected: </span>
        {action.expected_outcome}
      </div>

      {action.input_data.details && (
        <div className="text-xs p-2 rounded-lg" style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-secondary)' }}>
          {String(action.input_data.details)}
        </div>
      )}

      {action.result && (
        <div className="text-xs p-2 rounded-lg" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', color: '#34d399' }}>
          ✓ {String((action.result as { message?: string }).message || 'Completed successfully')}
        </div>
      )}

      {action.error_message && (
        <div className="text-xs p-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
          ✗ {action.error_message}
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {formatDate(action.created_at)}
        </span>

        {action.status === 'awaiting_confirmation' && (
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" leftIcon={<X size={12} />} onClick={handleCancel}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" leftIcon={<Check size={12} />} onClick={handleConfirm}>
              Confirm & execute
            </Button>
          </div>
        )}
        {action.status === 'executing' && (
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-violet-light)' }}>
            <div className="w-3 h-3 border border-violet-400 border-t-transparent rounded-full animate-spin" />
            Executing...
          </div>
        )}
      </div>
    </div>
  )
}

export default function ActionsPage() {
  const { actions } = useActivityStore()
  const [selectedActionType, setSelectedActionType] = useState<typeof ACTION_TYPES[0] | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [filterStatus, setFilterStatus] = useState<string>('all')

  const filteredActions = actions.filter((a) =>
    filterStatus === 'all' ? true : a.status === filterStatus
  )

  const pendingCount = actions.filter((a) => a.status === 'awaiting_confirmation').length

  return (
    <div className="flex h-full overflow-hidden" style={{ background: 'var(--color-background)' }}>
      {/* Available actions */}
      <div className="flex-1 overflow-y-auto p-6 md:p-8">
        <div className="max-w-7xl mx-auto flex flex-col gap-8 pb-20">
          {/* Header */}
          <div className="pb-2 border-b border-[var(--color-border)]">
            <h1 className="font-serif text-3xl font-normal text-white tracking-tight">Autonomous Actions & Tools</h1>
            <p className="text-sm font-sans mt-1" style={{ color: 'var(--color-text-secondary)' }}>
              Empower your twin to draft communications, organize knowledge, and set reminders on your behalf.
            </p>
          </div>

          {/* Available action types */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-white">Available Action Capabilities</h2>
              {pendingCount > 0 && (
                <Badge variant="warning">{pendingCount} awaiting approval</Badge>
              )}
            </div>

            <div className="p-4 rounded-xl mb-6 text-sm" style={{ background: 'rgba(217, 119, 87, 0.08)', border: '1px solid rgba(217, 119, 87, 0.25)', color: 'var(--color-text-secondary)' }}>
              <div className="flex items-center gap-2 mb-1">
                <Shield size={15} style={{ color: 'var(--color-violet-light)' }} />
                <span className="font-semibold text-white">Supervised Execution Guarantee</span>
              </div>
              Every action requires your oversight. Actions marked with a shield require explicit user confirmation before any state mutation or external request executes.
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {ACTION_TYPES.map((actionType) => (
                <button
                  key={actionType.type}
                  onClick={() => { setSelectedActionType(actionType); setIsModalOpen(true) }}
                  className="card p-5 text-left transition-all card-interactive flex flex-col justify-between"
                  style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                >
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(217,119,87,0.15)', color: 'var(--color-violet-light)' }}>
                        {actionType.icon}
                      </div>
                      {actionType.requiresConfirmation && (
                        <span className="ml-auto flex items-center gap-1 text-[11px] font-medium text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                          <Shield size={11} />
                          Approval Req
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-semibold text-white mb-1.5">{actionType.label}</div>
                    <div className="text-xs leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>{actionType.description}</div>
                  </div>
                  <div className="pt-4 mt-3 flex items-center justify-end text-xs font-medium text-[var(--color-violet-light)] border-t border-[var(--color-border)]">
                    Execute Action →
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* Execution history */}
          <section>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <h2 className="text-base font-semibold text-white">Execution History & Approvals</h2>
              <div className="flex flex-wrap gap-1.5">
                {['all', 'awaiting_confirmation', 'completed', 'failed', 'cancelled'].map((status) => (
                  <button
                    key={status}
                    onClick={() => setFilterStatus(status)}
                    className="px-3 py-1 rounded-full text-xs font-medium capitalize transition-all"
                    style={{
                      background: filterStatus === status ? 'rgba(217, 119, 87, 0.18)' : 'var(--color-surface-2)',
                      border: `1px solid ${filterStatus === status ? 'rgba(217, 119, 87, 0.5)' : 'var(--color-border)'}`,
                      color: filterStatus === status ? 'var(--color-violet-light)' : 'var(--color-text-secondary)',
                    }}
                  >
                    {status === 'all' ? 'All' : status.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            {filteredActions.length === 0 ? (
              <EmptyState
                icon={<Zap size={24} />}
                title="No actions yet"
                description="Use an action above to get started. All actions will appear here with their status."
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[...filteredActions].sort((a, b) =>
                  new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                ).map((action) => (
                  <ActionCard key={action.id} action={action} />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Create action modal */}
      <CreateActionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        actionType={selectedActionType}
      />
    </div>
  )
}
