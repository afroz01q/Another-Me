import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AppShell } from '@/components/AppShell'

// Pages
import LandingPage from '@/pages/LandingPage'
import AuthPage from '@/pages/AuthPage'
import OnboardingPage from '@/pages/OnboardingPage'
import TwinPage from '@/pages/TwinPage'
import TwinBuildPage from '@/pages/TwinBuildPage'
import ConversationsPage from '@/pages/ConversationsPage'
import MemoriesPage from '@/pages/MemoriesPage'
import PersonalityPage from '@/pages/PersonalityPage'
import AvatarStudioPage from '@/pages/AvatarStudioPage'
import ActionsPage from '@/pages/ActionsPage'
import ActivityPage from '@/pages/ActivityPage'
import PrivacyPage from '@/pages/PrivacyPage'
import SettingsPage from '@/pages/SettingsPage'
import AutopilotPage from '@/pages/AutopilotPage'

export default function App() {
  return (
    <BrowserRouter>
      {/* Toast notifications */}
      <Toaster
        position="bottom-right"
        toastOptions={{
          duration: 3500,
          style: {
            background: '#16161a',
            color: '#f4f4f5',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '12px',
            fontSize: '13px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          },
          success: {
            iconTheme: {
              primary: '#10b981',
              secondary: '#16161a',
            },
          },
          error: {
            iconTheme: {
              primary: '#ef4444',
              secondary: '#16161a',
            },
          },
        }}
      />

      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/signup" element={<AuthPage mode="signup" />} />
        <Route path="/onboarding" element={<OnboardingPage />} />

        {/* Authenticated Dashboard App Shell */}
        <Route path="/app" element={<AppShell />}>
          <Route index element={<Navigate to="/app/twin" replace />} />
          <Route path="twin" element={<TwinPage />} />
          <Route path="build" element={<TwinBuildPage />} />
          <Route path="autopilot" element={<AutopilotPage />} />
          <Route path="conversations" element={<ConversationsPage />} />
          <Route path="memories" element={<MemoriesPage />} />
          <Route path="personality" element={<PersonalityPage />} />
          <Route path="avatar" element={<AvatarStudioPage />} />
          <Route path="actions" element={<ActionsPage />} />
          <Route path="activity" element={<ActivityPage />} />
          <Route path="privacy" element={<PrivacyPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
