import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  User,
  TwinSettings,
  Conversation,
  Message,
  Memory,
  Avatar,
  ActionExecution,
  ActivityLog,
  UserConsent,
} from '@/types'
import { generateId } from '@/lib/utils'

import { avatarService } from '@/lib/avatarService'
import type { AvatarProvider, AvatarUploadResponse, AvatarGenerateResponse } from '@/types'
import { useBuildStore } from './buildStore'

// Auth store
interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, _password: string, name?: string) => Promise<void>
  logout: () => void
  setUser: (user: User | null) => void
  updateUser: (updates: Partial<User>) => void
  clearWorkspaceData: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,

      login: async (email: string, _password: string, name?: string) => {
        set({ isLoading: true })
        await new Promise((r) => setTimeout(r, 400))
        const normalizedEmail = email.toLowerCase().trim()
        const displayName = name || normalizedEmail.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

        // Persistent user registry to guarantee stable, isolated user IDs across logouts and logins
        const REGISTRY_KEY = 'another-me-user-registry'
        let registry: Record<string, User> = {}
        try {
          registry = JSON.parse(localStorage.getItem(REGISTRY_KEY) || '{}')
        } catch {
          registry = {}
        }

        let userRecord = registry[normalizedEmail]
        if (!userRecord) {
          // Generate deterministic, collision-free user id for this email
          const safeId = 'user_' + btoa(encodeURIComponent(normalizedEmail)).replace(/[^a-zA-Z0-9]/g, '').slice(0, 16)
          userRecord = {
            id: safeId,
            email: normalizedEmail,
            name: displayName,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }
          registry[normalizedEmail] = userRecord
          localStorage.setItem(REGISTRY_KEY, JSON.stringify(registry))
        } else if (name && userRecord.name !== name) {
          userRecord.name = name
          registry[normalizedEmail] = userRecord
          localStorage.setItem(REGISTRY_KEY, JSON.stringify(registry))
        }

        set({ user: userRecord, isAuthenticated: true, isLoading: false })

        // Immediately check and load this specific user's saved personal twin
        try {
          const userAvatar = await useTwinStore.getState().loadUserAvatar(userRecord.id)
          if (userAvatar && (userAvatar.source_image_path || userAvatar.generated_video_path)) {
            useTwinStore.getState().setIsOnboarded(true)
          } else {
            useTwinStore.getState().setIsOnboarded(false)
          }
        } catch (e) {
          console.warn('Error loading user twin on login:', e)
        }
      },

      logout: () => {
        useTwinStore.getState().resetTwin()
        try {
          useBuildStore.getState().resetProject()
          localStorage.removeItem('another-me-active-project-id')
        } catch {}
        set({ user: null, isAuthenticated: false })
      },

      setUser: (user) => {
        set({ user, isAuthenticated: !!user })
      },

      updateUser: (updates) => {
        set((s) => ({
          user: s.user ? { ...s.user, ...updates, updated_at: new Date().toISOString() } : null,
        }))
      },

      clearWorkspaceData: () => {
        useTwinStore.getState().resetTwin()
        useConversationStore.getState().clearConversations()
        useMemoryStore.getState().clearMemories()
        useActivityStore.getState().clearActivity()
        try {
          useBuildStore.getState().resetProject()
          localStorage.removeItem('another-me-active-project-id')
        } catch {}
      },
    }),
    {
      name: 'another-me-auth',
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
    }
  )
)

// App store
interface AppState {
  sidebarCollapsed: boolean
  currentPage: string
  isMobileMenuOpen: boolean
  soundEffects: boolean
  reducedMotion: boolean
  toggleSidebar: () => void
  setCurrentPage: (page: string) => void
  toggleMobileMenu: () => void
  toggleSoundEffects: () => void
  toggleReducedMotion: () => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      currentPage: 'twin',
      isMobileMenuOpen: false,
      soundEffects: true,
      reducedMotion: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setCurrentPage: (page) => set({ currentPage: page }),
      toggleMobileMenu: () => set((s) => ({ isMobileMenuOpen: !s.isMobileMenuOpen })),
      toggleSoundEffects: () => set((s) => ({ soundEffects: !s.soundEffects })),
      toggleReducedMotion: () => set((s) => ({ reducedMotion: !s.reducedMotion })),
    }),
    {
      name: 'another-me-app',
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        soundEffects: state.soundEffects,
        reducedMotion: state.reducedMotion,
      }),
    }
  )
)

// Twin store with Personal AI Digital Twin support
interface TwinState {
  settings: TwinSettings | null
  avatar: Avatar | null
  isOnboarded: boolean
  onboardingStep: number
  isUploadingPhoto: boolean
  isGeneratingAvatar: boolean
  avatarError: string | null
  setSettings: (settings: TwinSettings) => void
  updateSettings: (updates: Partial<TwinSettings>) => void
  setAvatar: (avatar: Avatar | null) => void
  setIsOnboarded: (v: boolean) => void
  setOnboardingStep: (step: number) => void
  resetTwin: () => void
  loadUserAvatar: (userId: string) => Promise<Avatar | null>
  uploadPersonalPhoto: (file: File, consent: boolean, twinName?: string) => Promise<AvatarUploadResponse>
  generateAvatarVideo: (options?: {
    provider?: AvatarProvider
    apiKey?: string
    scriptText?: string
    voiceId?: string
  }) => Promise<AvatarGenerateResponse>
  pollAvatarStatus: () => Promise<Avatar | null>
  deletePersonalTwin: () => Promise<void>
}

export const useTwinStore = create<TwinState>()(
  persist(
    (set, get) => ({
      settings: null,
      avatar: null,
      isOnboarded: false,
      onboardingStep: 1,
      isUploadingPhoto: false,
      isGeneratingAvatar: false,
      avatarError: null,

      setSettings: (settings) => set({ settings }),
      updateSettings: (updates) =>
        set((s) => {
          const current: TwinSettings = s.settings || {
            id: generateId(),
            user_id: useAuthStore.getState().user?.id || 'user',
            name: 'Your Twin',
            tagline: 'Personal AI digital twin',
            voice_id: (typeof window !== 'undefined' ? localStorage.getItem('another-me-twin-voice') : null) || 'atlas',
            voice_speed: 1.0,
            communication_style: 'friendly',
            formality_level: 'neutral',
            response_length: 'balanced',
            vocabulary_style: 'standard',
            preferred_language: 'English',
            interests: [],
            goals: [],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }
          return {
            settings: { ...current, ...updates, updated_at: new Date().toISOString() },
          }
        }),

      setAvatar: (avatar) => {
        set({ avatar, avatarError: null })
        if (avatar?.user_id) {
          localStorage.setItem(`another-me-avatar-${avatar.user_id}`, JSON.stringify(avatar))
        }
      },

      setIsOnboarded: (v) => set({ isOnboarded: v }),
      setOnboardingStep: (step) => set({ onboardingStep: step }),

      resetTwin: () =>
        set({
          settings: null,
          avatar: null,
          isOnboarded: false,
          onboardingStep: 1,
          isUploadingPhoto: false,
          isGeneratingAvatar: false,
          avatarError: null,
        }),

      // Load avatar strictly isolated to the authenticated user ID
      loadUserAvatar: async (userId: string) => {
        try {
          const avatar = await avatarService.getTwin(userId)
          if (avatar && avatar.user_id === userId) {
            set({ avatar, avatarError: null })
            return avatar
          }
          set({ avatar: null })
          return null
        } catch (e) {
          console.warn('Error loading user avatar:', e)
          set({ avatar: null })
          return null
        }
      },

      // Upload personal face photograph with consent
      uploadPersonalPhoto: async (file: File, consent: boolean, twinName?: string) => {
        const user = useAuthStore.getState().user
        if (!user) {
          throw new Error('Must be signed in to upload photograph')
        }

        set({ isUploadingPhoto: true, avatarError: null })
        try {
          const res = await avatarService.uploadPhoto(user.id, file, consent, twinName)
          set({ avatar: res.avatar, isUploadingPhoto: false })
          return res
        } catch (err: any) {
          set({ isUploadingPhoto: false, avatarError: err.message || 'Upload failed' })
          throw err
        }
      },

      // Call real video avatar generation provider
      generateAvatarVideo: async (options) => {
        const user = useAuthStore.getState().user
        const currentAvatar = get().avatar

        if (!user) throw new Error('Authentication required')
        if (!currentAvatar || !currentAvatar.source_image_path) {
          throw new Error('Please upload a photograph first')
        }

        set({ isGeneratingAvatar: true, avatarError: null })
        try {
          const res = await avatarService.generateAvatar({
            userId: user.id,
            provider: options?.provider || currentAvatar.provider || 'd-id',
            apiKey: options?.apiKey,
            scriptText: options?.scriptText,
            voiceId: options?.voiceId,
          })

          set({
            avatar: res.avatar,
            isGeneratingAvatar: res.status === 'processing' || res.status === 'queued',
            avatarError: null,
          })
          return res
        } catch (err: any) {
          const updatedAvatar = err.avatar || (currentAvatar ? { ...currentAvatar, status: 'failed', error_message: err.message } : null)
          set({
            isGeneratingAvatar: false,
            avatar: updatedAvatar,
            avatarError: err.message || 'Generation failed',
          })
          throw err
        }
      },

      // Poll status for asynchronous generation jobs
      pollAvatarStatus: async () => {
        const user = useAuthStore.getState().user
        const avatar = get().avatar

        if (!user || !avatar || !avatar.provider_job_id) {
          return avatar
        }

        try {
          const { avatar: updatedAvatar } = await avatarService.getStatus(user.id, avatar.provider_job_id)
          set({
            avatar: updatedAvatar,
            isGeneratingAvatar: updatedAvatar.status === 'processing' || updatedAvatar.status === 'queued',
            avatarError: updatedAvatar.error_message || null,
          })
          return updatedAvatar
        } catch (err: any) {
          console.error('Error polling avatar status:', err)
          return avatar
        }
      },

      // Delete personal twin
      deletePersonalTwin: async () => {
        const user = useAuthStore.getState().user
        if (user) {
          await avatarService.deleteTwin(user.id)
        }
        set({ avatar: null, avatarError: null, isGeneratingAvatar: false })
      },
    }),
    {
      name: 'another-me-twin',
      partialize: (state) => ({
        settings: state.settings,
        isOnboarded: state.isOnboarded,
        onboardingStep: state.onboardingStep,
      }),
    }
  )
)

// Conversation store
interface ConversationState {
  conversations: Conversation[]
  activeConversationId: string | null
  messages: Record<string, Message[]>
  isGenerating: boolean
  streamingContent: string
  setActiveConversation: (id: string | null) => void
  addConversation: (conv: Conversation) => void
  addMessage: (convId: string, msg: Message) => void
  updateConversation: (id: string, updates: Partial<Conversation>) => void
  setIsGenerating: (v: boolean) => void
  setStreamingContent: (content: string) => void
  appendStreamChunk: (chunk: string) => void
  newConversation: () => Conversation
  clearConversations: () => void
}

export const useConversationStore = create<ConversationState>()(
  persist(
    (set, get) => ({
      conversations: [],
      activeConversationId: null,
      messages: {},
      isGenerating: false,
      streamingContent: '',

      setActiveConversation: (id) => set({ activeConversationId: id }),

      addConversation: (conv) =>
        set((s) => ({
          conversations: [conv, ...s.conversations],
          activeConversationId: conv.id,
        })),

      addMessage: (convId, msg) =>
        set((s) => ({
          messages: {
            ...s.messages,
            [convId]: [...(s.messages[convId] || []), msg],
          },
        })),

      updateConversation: (id, updates) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === id ? { ...c, ...updates, updated_at: new Date().toISOString() } : c
          ),
        })),

      setIsGenerating: (v) => set({ isGenerating: v }),
      setStreamingContent: (content) => set({ streamingContent: content }),
      appendStreamChunk: (chunk) =>
        set((s) => ({ streamingContent: s.streamingContent + chunk })),

      newConversation: () => {
        const id = generateId()
        const user = useAuthStore.getState().user
        const newConv: Conversation = {
          id,
          user_id: user?.id || 'user',
          title: 'New conversation',
          message_count: 0,
          last_message_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          is_archived: false,
        }
        set((s) => ({
          conversations: [newConv, ...s.conversations],
          activeConversationId: id,
          messages: { ...s.messages, [id]: [] },
        }))
        return newConv
      },

      clearConversations: () => set({ conversations: [], activeConversationId: null, messages: {}, isGenerating: false, streamingContent: '' }),
    }),
    {
      name: 'another-me-conversations',
      partialize: (s) => ({
        conversations: s.conversations,
        messages: s.messages,
        activeConversationId: s.activeConversationId,
      }),
    }
  )
)

// Memory store
interface MemoryState {
  memories: Memory[]
  searchQuery: string
  selectedCategory: string | null
  setSearchQuery: (q: string) => void
  setSelectedCategory: (cat: string | null) => void
  addMemory: (memory: Memory) => void
  updateMemory: (id: string, updates: Partial<Memory>) => void
  deleteMemory: (id: string) => void
  archiveMemory: (id: string) => void
  clearMemories: () => void
  getFilteredMemories: () => Memory[]
}

export const useMemoryStore = create<MemoryState>()(
  persist(
    (set, get) => ({
      memories: [],
      searchQuery: '',
      selectedCategory: null,

      setSearchQuery: (q) => set({ searchQuery: q }),
      setSelectedCategory: (cat) => set({ selectedCategory: cat }),

      addMemory: (memory) => set((s) => ({ memories: [memory, ...s.memories] })),

      updateMemory: (id, updates) =>
        set((s) => ({
          memories: s.memories.map((m) =>
            m.id === id ? { ...m, ...updates, updated_at: new Date().toISOString() } : m
          ),
        })),

      deleteMemory: (id) =>
        set((s) => ({ memories: s.memories.filter((m) => m.id !== id) })),

      archiveMemory: (id) =>
        set((s) => ({
          memories: s.memories.map((m) =>
            m.id === id ? { ...m, is_archived: true, updated_at: new Date().toISOString() } : m
          ),
        })),

      clearMemories: () => set({ memories: [], searchQuery: '', selectedCategory: null }),

      getFilteredMemories: () => {
        const { memories, searchQuery, selectedCategory } = get()
        return memories
          .filter((m) => !m.is_archived)
          .filter((m) =>
            selectedCategory ? m.category === selectedCategory : true
          )
          .filter((m) =>
            searchQuery
              ? m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                m.content.toLowerCase().includes(searchQuery.toLowerCase())
              : true
          )
      },
    }),
    { name: 'another-me-memories', partialize: (s) => ({ memories: s.memories }) }
  )
)

// Activity store
interface ActivityState {
  activities: ActivityLog[]
  actions: ActionExecution[]
  consents: UserConsent[]
  addActivity: (activity: ActivityLog) => void
  addLog: (log: { type: string; title: string; description: string }) => void
  addAction: (action: ActionExecution) => void
  updateAction: (id: string, updates: Partial<ActionExecution>) => void
  updateConsent: (type: UserConsent['consent_type'], granted: boolean) => void
  clearActivity: () => void
}

export const useActivityStore = create<ActivityState>()(
  persist(
    (set) => ({
      activities: [],
      actions: [],
      consents: [],

      addActivity: (activity) =>
        set((s) => ({ activities: [activity, ...s.activities] })),

      addLog: (log) => {
        const currentUser = useAuthStore.getState().user
        set((s) => ({
          activities: [
            {
              id: generateId(),
              user_id: currentUser?.id || 'user',
              activity_type: log.type as any,
              description: `${log.title}: ${log.description}`,
              created_at: new Date().toISOString(),
            },
            ...s.activities,
          ],
        }))
      },

      addAction: (action) =>
        set((s) => ({ actions: [action, ...s.actions] })),

      updateAction: (id, updates) =>
        set((s) => ({
          actions: s.actions.map((a) =>
            a.id === id ? { ...a, ...updates, updated_at: new Date().toISOString() } : a
          ),
        })),

      updateConsent: (type, granted) =>
        set((s) => ({
          consents: s.consents.map((c) =>
            c.consent_type === type
              ? {
                  ...c,
                  granted,
                  granted_at: granted ? new Date().toISOString() : undefined,
                  revoked_at: !granted ? new Date().toISOString() : undefined,
                  updated_at: new Date().toISOString(),
                }
              : c
          ),
        })),

      clearActivity: () => set({ activities: [], actions: [], consents: [] }),
    }),
    { name: 'another-me-activity' }
  )
)

export * from './autopilotStore'
export * from './buildStore'

