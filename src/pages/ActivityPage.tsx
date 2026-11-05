import React, { useState } from 'react'
import {
  MessageCircle, Brain, Edit3, Trash2, Zap, Check, X, Shield,
  Settings, LogIn, LogOut, Filter, Clock,
} from 'lucide-react'
import { useActivityStore } from '@/store'
import { Badge, EmptyState } from '@/components/ui'
import type { ActivityLog, ActivityType } from '@/types'
import { formatFullDate, formatDate } from '@/lib/utils'

const ACTIVITY_ICONS: Partial<Record<ActivityType, React.ReactNode>> = {
  conversation_started: <MessageCircle size={14} />,
  conversation_ended: <MessageCircle size={14} />,
  memory_created: <Brain size={14} />,
  memory_edited: <Edit3 size={14} />,
  memory_deleted: <Trash2 size={14} />,
  memory_archived: <Brain size={14} />,
  action_requested: <Zap size={14} />,
  action_confirmed: <Check size={14} />,
  action_completed: <Check size={14} />,
  action_failed: <X size={14} />,
  action_cancelled: <X size={14} />,
  permission_changed: <Shield size={14} />,
  settings_updated: <Settings size={14} />,
  avatar_updated: <Brain size={14} />,
  login: <LogIn size={14} />,
  logout: <LogOut size={14} />,
}

const ACTIVITY_COLORS: Partial<Record<ActivityType, string>> = {
  conversation_started: '#06b6d4',
  memory_created: '#7c3aed',
  memory_edited: '#4f46e5',
  memory_deleted: '#ef4444',
  action_completed: '#10b981',
  action_failed: '#ef4444',
  action_cancelled: '#6b7280',
  settings_updated: '#f59e0b',
}

const FILTER_TYPES = [
  { value: 'all', label: 'All activity' },
  { value: 'conversations', label: 'Conversations' },
  { value: 'memories', label: 'Memories' },
  { value: 'actions', label: 'Actions' },
  { value: 'settings', label: 'Settings' },
]

function matchesFilter(activity: ActivityLog, filter: string): boolean {
  if (filter === 'all') return true
  if (filter === 'conversations') return activity.activity_type.startsWith('conversation')
  if (filter === 'memories') return activity.activity_type.startsWith('memory')
  if (filter === 'actions') return activity.activity_type.startsWith('action')
  if (filter === 'settings') return activity.activity_type === 'settings_updated' || activity.activity_type === 'permission_changed' || activity.activity_type === 'avatar_updated'
  return true
}

// Group activities by day
function groupByDay(activities: ActivityLog[]): Record<string, ActivityLog[]> {
  const groups: Record<string, ActivityLog[]> = {}
  activities.forEach((a) => {
    const day = new Date(a.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    if (!groups[day]) groups[day] = []
    groups[day].push(a)
  })
  return groups
}

export default function ActivityPage() {
  const { activities, actions } = useActivityStore()
  const [filter, setFilter] = useState('all')

  const allItems = [
    ...activities,
    ...actions.map((a): ActivityLog => ({
      id: a.id,
      user_id: a.user_id,
      activity_type: `action_${a.status}` as ActivityType,
      description: `${a.title} — ${a.status}`,
      created_at: a.created_at,
    })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const filtered = allItems.filter((a) => matchesFilter(a, filter))
  const grouped = groupByDay(filtered)
  const days = Object.keys(grouped)

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--color-background)' }}>
      <div className="max-w-6xl mx-auto p-6 md:p-8 flex flex-col gap-8 pb-20">
        {/* Header */}
        <div className="pb-2 border-b border-[var(--color-border)]">
          <h1 className="font-serif text-3xl font-normal text-white tracking-tight">System Audit & Activity Log</h1>
          <p className="text-sm font-sans mt-1" style={{ color: 'var(--color-text-secondary)' }}>
            Chronological audit trail of digital twin memories, conversation milestones, permissions, and security events.
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5" style={{ color: 'var(--color-text-muted)' }}>
            <Filter size={14} />
            <span className="text-xs font-semibold uppercase tracking-wider">Filter Events</span>
          </div>
          {FILTER_TYPES.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className="px-3.5 py-1.5 rounded-full text-xs font-medium transition-all"
              style={{
                background: filter === f.value ? 'rgba(217, 119, 87, 0.18)' : 'var(--color-surface-2)',
                border: `1px solid ${filter === f.value ? 'rgba(217, 119, 87, 0.5)' : 'var(--color-border)'}`,
                color: filter === f.value ? 'var(--color-violet-light)' : 'var(--color-text-secondary)',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Activity list */}
        {days.length === 0 ? (
          <EmptyState
            icon={<Clock size={24} />}
            title="No activity yet"
            description="Your completed actions and important changes will appear here."
          />
        ) : (
          <div className="flex flex-col gap-8">
            {days.map((day) => (
              <div key={day}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="text-xs font-semibold" style={{ color: 'var(--color-text-muted)' }}>{day}</div>
                  <div className="flex-1 h-px" style={{ background: 'var(--color-border)' }} />
                  <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {grouped[day].length} events
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  {grouped[day].map((activity, i) => {
                    const icon = ACTIVITY_ICONS[activity.activity_type]
                    const color = ACTIVITY_COLORS[activity.activity_type] || 'var(--color-text-muted)'

                    return (
                      <div
                        key={activity.id}
                        className="flex items-start gap-3 p-3 rounded-xl transition-all"
                        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                        onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--color-border-2)'}
                        onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--color-border)'}
                      >
                        {/* Icon */}
                        <div
                          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                          style={{ background: color + '15', color }}
                        >
                          {icon || <Clock size={14} />}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm">{activity.description}</div>
                          <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                            {formatFullDate(activity.created_at)}
                          </div>
                        </div>

                        {/* Activity type badge */}
                        <div
                          className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium capitalize"
                          style={{ background: color + '12', color }}
                        >
                          {activity.activity_type.replace(/_/g, ' ')}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {filtered.length > 0 && (
          <div className="text-center py-4">
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Showing {filtered.length} events. Activity is retained for 90 days by default.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
