import React, { useState, useRef, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  Brain, MessageCircle, Layers, User, Palette, Zap, Clock,
  Shield, Settings, ChevronLeft, ChevronRight, Search, Bell,
  LogOut, Menu, X, Plus, Cpu, HelpCircle, ChevronDown, Smartphone, Code2,
} from 'lucide-react'
import { useAuthStore, useAppStore, useTwinStore, useConversationStore } from '@/store'
import { UserAvatar, Badge } from './ui'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { id: 'twin', label: 'My Twin', icon: Brain, path: '/app/twin', description: 'Chat with your digital twin' },
  { id: 'build', label: 'Twin Build Mode', icon: Code2, path: '/app/build', description: 'Voice website & app creator' },
  { id: 'autopilot', label: 'Autopilot', icon: Smartphone, path: '/app/autopilot', description: 'Voice-controlled messaging' },
  { id: 'conversations', label: 'Conversations', icon: MessageCircle, path: '/app/conversations', description: 'Your conversation history' },
  { id: 'memories', label: 'Memories', icon: Layers, path: '/app/memories', description: 'Personal memory system' },
  { id: 'personality', label: 'Personality', icon: User, path: '/app/personality', description: 'Configure your twin' },
  { id: 'avatar', label: 'Avatar Studio', icon: Palette, path: '/app/avatar', description: 'Customize your avatar' },
  { id: 'actions', label: 'Actions', icon: Zap, path: '/app/actions', description: 'Authorized tasks' },
  { id: 'activity', label: 'Activity', icon: Clock, path: '/app/activity', description: 'Audit history' },
  { id: 'privacy', label: 'Privacy & Security', icon: Shield, path: '/app/privacy', description: 'Data and permissions' },
  { id: 'settings', label: 'Settings', icon: Settings, path: '/app/settings', description: 'Account settings' },
]

export function Sidebar() {
  const location = useLocation()
  const { sidebarCollapsed, toggleSidebar } = useAppStore()
  const { user, logout } = useAuthStore()
  const { settings: twinSettings, avatar } = useTwinStore()
  const navigate = useNavigate()

  const currentPath = location.pathname

  return (
    <aside
      className="flex flex-col h-full transition-all duration-300 ease-in-out"
      style={{
        width: sidebarCollapsed ? 64 : 240,
        background: 'var(--color-surface)',
        borderRight: '1px solid var(--color-border)',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-16 shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 'var(--radius-md)',
            background: 'linear-gradient(135deg, #da7756, #c15f3e)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: '0 2px 10px rgba(218, 119, 86, 0.35)',
          }}
        >
          <Cpu size={16} color="white" />
        </div>
        {!sidebarCollapsed && (
          <div className="animate-fade-in">
            <div className="font-serif text-base font-normal tracking-tight text-[var(--color-text-primary)]">Another Me</div>
            <div className="text-[10px] tracking-wide text-[#da7756] font-medium font-sans">Digital Twin • Voice AI</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-2 flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const isActive = currentPath === item.path || currentPath.startsWith(item.path + '/')
          return (
            <Link
              key={item.id}
              to={item.path}
              className={cn('sidebar-item', isActive && 'active')}
              style={{ justifyContent: sidebarCollapsed ? 'center' : undefined }}
              title={sidebarCollapsed ? item.label : undefined}
            >
              <Icon size={16} className="icon shrink-0" />
              {!sidebarCollapsed && (
                <span className="truncate animate-fade-in">{item.label}</span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* User profile */}
      <div className="p-2 shrink-0" style={{ borderTop: '1px solid var(--color-border)' }}>
        {!sidebarCollapsed ? (
          <div className="flex items-center gap-3 p-2 rounded-xl cursor-pointer transition-colors hover:bg-[var(--color-surface-2)] group">
            <UserAvatar
              name={user?.name || 'User'}
              src={avatar?.source_image_path || '/avatars/user_avatar.png'}
              size="sm"
              online
            />
            <div className="flex-1 min-w-0 animate-fade-in">
              <div className="text-sm font-medium truncate">{user?.name}</div>
              <div className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>
                {twinSettings?.name || 'No twin yet'}
              </div>
            </div>
            <button
              onClick={() => { logout(); navigate('/') }}
              className="btn-ghost btn-icon-sm opacity-0 group-hover:opacity-100 transition-opacity"
              title="Sign out"
            >
              <LogOut size={14} />
            </button>
          </div>
        ) : (
          <div className="flex justify-center">
            <UserAvatar
              name={user?.name || 'U'}
              src={avatar?.source_image_path || '/avatars/user_avatar.png'}
              size="sm"
              online
            />
          </div>
        )}

        {/* Collapse toggle */}
        <button
          onClick={toggleSidebar}
          className="btn btn-ghost w-full mt-1 justify-center"
          style={{ padding: '6px' }}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
    </aside>
  )
}

import { isAIConfigured } from '@/lib/ai'

interface TopBarProps {
  title: string
  subtitle?: string
}

export function TopBar({ title, subtitle }: TopBarProps) {
  const { isMobileMenuOpen, toggleMobileMenu } = useAppStore()
  const { user, logout } = useAuthStore()
  const { conversations } = useConversationStore()
  const { isOnboarded, avatar } = useTwinStore()
  const navigate = useNavigate()
  const [showProfile, setShowProfile] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [notifOpen, setNotifOpen] = useState(false)

  const unread = conversations.filter(c => !c.is_archived).length
  const aiReady = isAIConfigured()

  return (
    <header
      className="flex items-center gap-4 px-4 md:px-6 h-16 shrink-0"
      style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
    >
      {/* Mobile menu */}
      <button className="mobile-nav-toggle btn btn-ghost btn-icon" onClick={toggleMobileMenu} aria-label="Toggle navigation">
        {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Title */}
      <div className="flex-1 min-w-0">
        <h1 className="font-serif text-lg md:text-xl font-normal tracking-tight text-[var(--color-text-primary)] leading-tight truncate">{title}</h1>
        {subtitle && <p className="text-xs truncate font-sans mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{subtitle}</p>}
      </div>

      {/* Search */}
      <div className="hidden md:flex items-center gap-2 rounded-lg px-3 py-2 w-56 transition-all" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
        <Search size={14} style={{ color: 'var(--color-text-muted)' }} />
        <input
          type="search"
          placeholder="Search..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-transparent text-sm outline-none flex-1 placeholder:text-[var(--color-text-muted)]"
          style={{ color: 'var(--color-text-primary)' }}
        />
      </div>

      {/* Twin status */}
      <div
        className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full cursor-pointer"
        style={{
          background: aiReady ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
          border: aiReady ? '1px solid rgba(16,185,129,0.2)' : '1px solid rgba(245,158,11,0.2)',
        }}
        onClick={() => navigate('/app/settings')}
        title={aiReady ? 'AI Engine Active' : 'API Key not configured - click to set up'}
      >
        <div className={`status-dot ${aiReady ? 'status-dot-online' : 'status-dot-idle'}`} />
        <span className="text-xs font-medium" style={{ color: aiReady ? '#34d399' : '#fbbf24' }}>
          {aiReady ? 'AI Connected' : 'Setup Required'}
        </span>
      </div>

      {/* Notifications */}
      <div className="relative">
        <button className="btn btn-ghost btn-icon relative" onClick={() => setNotifOpen(!notifOpen)}>
          <Bell size={18} />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 text-[9px] font-bold flex items-center justify-center rounded-full" style={{ background: '#da7756', color: '#181816' }}>
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>

        {notifOpen && (
          <div className="absolute right-0 top-12 w-72 glass-strong rounded-xl shadow-lg z-30 p-3 animate-fade-in-scale">
            <div className="text-sm font-semibold mb-2">Notifications</div>
            <p className="text-xs py-4 text-center" style={{ color: 'var(--color-text-muted)' }}>No new notifications</p>
          </div>
        )}
      </div>

      {/* Profile */}
      <div className="relative">
        <button
          className="flex items-center gap-2 rounded-lg px-2 py-1 transition-colors hover:bg-[var(--color-surface-2)]"
          onClick={() => setShowProfile(!showProfile)}
        >
          <UserAvatar
            name={user?.name || 'U'}
            src={avatar?.source_image_path || '/avatars/user_avatar.png'}
            size="sm"
            online
          />
          <ChevronDown size={14} style={{ color: 'var(--color-text-muted)' }} />
        </button>

        {showProfile && (
          <div className="absolute right-0 top-12 w-52 glass-strong rounded-xl shadow-lg z-30 overflow-hidden animate-fade-in-scale">
            <div className="p-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
              <div className="text-sm font-semibold">{user?.name}</div>
              <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{user?.email}</div>
            </div>
            <div className="p-1">
              <button onClick={() => { navigate('/app/settings'); setShowProfile(false) }} className="sidebar-item w-full">
                <Settings size={14} /> Settings
              </button>
              <button onClick={() => { navigate('/app/privacy'); setShowProfile(false) }} className="sidebar-item w-full">
                <Shield size={14} /> Privacy
              </button>
              <button onClick={() => { navigate('/help'); setShowProfile(false) }} className="sidebar-item w-full">
                <HelpCircle size={14} /> Help
              </button>
              <div className="divider my-1" />
              <button onClick={() => { logout(); navigate('/') }} className="sidebar-item w-full text-red-400 hover:bg-red-500/10">
                <LogOut size={14} /> Sign out
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}

// Mobile sidebar overlay
export function MobileSidebar() {
  const { isMobileMenuOpen, toggleMobileMenu } = useAppStore()
  const location = useLocation()

  useEffect(() => {
    toggleMobileMenu()
  }, [location.pathname])

  if (!isMobileMenuOpen) return null

  return (
    <div className="fixed inset-0 z-40 md:hidden">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={toggleMobileMenu} />
      <div className="absolute left-0 top-0 bottom-0 w-64" style={{ zIndex: 41 }}>
        <Sidebar />
      </div>
    </div>
  )
}
