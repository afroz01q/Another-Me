import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function formatFullDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen) + '...'
}

export function generateId(): string {
  return crypto.randomUUID()
}

export function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export const MEMORY_CATEGORY_LABELS: Record<string, string> = {
  personal_preferences: 'Personal Preferences',
  interests: 'Interests',
  goals: 'Goals',
  projects: 'Projects',
  important_facts: 'Important Facts',
  communication_preferences: 'Communication',
  experiences: 'Experiences',
}

export const MEMORY_CATEGORY_COLORS: Record<string, string> = {
  personal_preferences: '#7c3aed',
  interests: '#06b6d4',
  goals: '#10b981',
  projects: '#f59e0b',
  important_facts: '#3b82f6',
  communication_preferences: '#8b5cf6',
  experiences: '#ec4899',
}
