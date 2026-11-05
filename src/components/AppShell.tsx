import React from 'react'
import { Outlet, Navigate, useLocation, Link } from 'react-router-dom'
import { Mic, Smartphone, MessageSquare, Layers, Settings } from 'lucide-react'
import { Sidebar, TopBar, MobileSidebar } from './Layout'
import { useAuthStore, useTwinStore } from '@/store'
import { cn } from '@/lib/utils'

const PAGE_TITLES: Record<string, { title: string; subtitle?: string }> = {
  '/app/twin': { title: 'My Twin', subtitle: 'Your personal AI digital twin' },
  '/app/build': { title: 'Twin Build Mode', subtitle: 'Voice-directed website & web application creator' },
  '/app/autopilot': { title: 'Autopilot', subtitle: 'Voice-controlled messaging for WhatsApp, Instagram & Email' },
  '/app/conversations': { title: 'Conversations', subtitle: 'Your conversation history' },
  '/app/memories': { title: 'Memories', subtitle: 'What your twin remembers about you' },
  '/app/personality': { title: 'Personality', subtitle: 'Configure how your twin thinks and responds' },
  '/app/avatar': { title: 'Avatar Studio', subtitle: 'Customize your twin\'s appearance' },
  '/app/actions': { title: 'Actions', subtitle: 'Tasks your twin can perform on your behalf' },
  '/app/activity': { title: 'Activity History', subtitle: 'Audit log of all actions and changes' },
  '/app/privacy': { title: 'Privacy & Security', subtitle: 'Control your data and permissions' },
  '/app/settings': { title: 'Settings', subtitle: 'Account and platform preferences' },
}

const MOBILE_TABS = [
  { path: '/app/twin', label: 'Twin', icon: Mic },
  { path: '/app/autopilot', label: 'Autopilot', icon: Smartphone },
  { path: '/app/conversations', label: 'Chats', icon: MessageSquare },
  { path: '/app/memories', label: 'Memories', icon: Layers },
  { path: '/app/settings', label: 'Settings', icon: Settings },
]

export function AppShell() {
  const { isAuthenticated } = useAuthStore()
  const { isOnboarded } = useTwinStore()
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (!isOnboarded && location.pathname !== '/app/onboarding') {
    return <Navigate to="/onboarding" replace />
  }

  const pageInfo = PAGE_TITLES[location.pathname] || { title: 'Another Me' }
  const isTwinView = location.pathname === '/app/twin'

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-[var(--color-background)] text-[var(--color-text-primary)]">
      {/* Desktop sidebar */}
      <div className="hidden md:flex shrink-0">
        <Sidebar />
      </div>

      {/* Mobile sidebar overlay (for secondary links) */}
      <MobileSidebar />

      {/* Main content viewport */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative">
        {/* On mobile, twin page manages its own unified Claude header to maximize avatar viewport height */}
        <div className={cn(isTwinView ? 'hidden md:block' : 'block', 'shrink-0')}>
          <TopBar title={pageInfo.title} subtitle={pageInfo.subtitle} />
        </div>

        {/* Dynamic page outlet */}
        <main className="flex-1 min-h-0 overflow-y-auto overscroll-none relative">
          <Outlet />
        </main>

        {/* Claude Mobile Bottom Navigation Bar */}
        <nav
          className="md:hidden flex items-center justify-around px-2 pt-1.5 border-t border-[var(--color-border)] bg-[var(--color-surface)] shrink-0 z-30 shadow-[0_-4px_16px_rgba(0,0,0,0.35)]"
          style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}
          aria-label="Mobile Navigation"
        >
          {MOBILE_TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = location.pathname === tab.path || (tab.path !== '/app/twin' && location.pathname.startsWith(tab.path + '/'))
            return (
              <Link
                key={tab.path}
                to={tab.path}
                className={cn(
                  'flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all select-none',
                  isActive
                    ? 'text-[#da7756] font-semibold'
                    : 'text-[var(--color-text-secondary)] hover:text-white'
                )}
              >
                <div className="relative">
                  <Icon size={19} className={cn(isActive && 'stroke-[2.5px]')} />
                  {isActive && (
                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#da7756]" />
                  )}
                </div>
                <span className="text-[10px] tracking-tight mt-1 font-sans">{tab.label}</span>
              </Link>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
