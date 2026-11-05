import React, { useState } from 'react'
import {
  Plus, Search, Filter, Edit3, Archive, Trash2, RotateCcw,
  Layers, Brain, Target, FolderOpen, Star, MessageSquare, User, X,
} from 'lucide-react'
import { useMemoryStore, useAuthStore, useActivityStore } from '@/store'
import { Button, Badge, Input, Textarea, Select, EmptyState, Modal, Card } from '@/components/ui'
import type { Memory, MemoryCategory } from '@/types'
import {
  formatDate, generateId, MEMORY_CATEGORY_LABELS, MEMORY_CATEGORY_COLORS,
} from '@/lib/utils'
import toast from 'react-hot-toast'

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  personal_preferences: <User size={14} />,
  interests: <Star size={14} />,
  goals: <Target size={14} />,
  projects: <FolderOpen size={14} />,
  important_facts: <Brain size={14} />,
  communication_preferences: <MessageSquare size={14} />,
  experiences: <Layers size={14} />,
}

const CATEGORIES: MemoryCategory[] = [
  'personal_preferences', 'interests', 'goals', 'projects',
  'important_facts', 'communication_preferences', 'experiences',
]

interface EditMemoryModalProps {
  memory: Memory | null
  onClose: () => void
  onSave: (updates: Partial<Memory>) => void
}

function EditMemoryModal({ memory, onClose, onSave }: EditMemoryModalProps) {
  const [title, setTitle] = useState(memory?.title || '')
  const [content, setContent] = useState(memory?.content || '')
  const [category, setCategory] = useState<MemoryCategory>(memory?.category || 'personal_preferences')

  if (!memory) return null

  const handleSave = () => {
    if (!title.trim() || !content.trim()) {
      toast.error('Title and content are required')
      return
    }
    onSave({ title: title.trim(), content: content.trim(), category })
    onClose()
    toast.success('Memory updated')
  }

  return (
    <Modal isOpen={!!memory} onClose={onClose} title="Edit memory">
      <div className="flex flex-col gap-4">
        <Input
          label="Title"
          id="edit-memory-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Memory title"
        />
        <Textarea
          label="Content"
          id="edit-memory-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="What should your twin remember?"
          style={{ minHeight: 100 }}
        />
        <Select
          label="Category"
          id="edit-memory-category"
          value={category}
          onChange={(e) => setCategory(e.target.value as MemoryCategory)}
          options={CATEGORIES.map((c) => ({ value: c, label: MEMORY_CATEGORY_LABELS[c] }))}
        />
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Source: {memory.source_reference || 'Manual entry'} · Added {formatDate(memory.created_at)}
        </p>
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSave}>Save changes</Button>
        </div>
      </div>
    </Modal>
  )
}

interface AddMemoryModalProps {
  isOpen: boolean
  onClose: () => void
  onAdd: (memory: Omit<Memory, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => void
}

function AddMemoryModal({ isOpen, onClose, onAdd }: AddMemoryModalProps) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [category, setCategory] = useState<MemoryCategory>('personal_preferences')

  const handleAdd = () => {
    if (!title.trim() || !content.trim()) {
      toast.error('Title and content are required')
      return
    }
    onAdd({
      title: title.trim(),
      content: content.trim(),
      category,
      source_reference: 'Manual entry',
      is_user_editable: true,
      is_archived: false,
      confidence: 1.0,
    })
    setTitle('')
    setContent('')
    setCategory('personal_preferences')
    onClose()
    toast.success('Memory added')
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add memory">
      <div className="flex flex-col gap-4">
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Add information your twin should remember. Only facts you explicitly add are stored — nothing is inferred.
        </p>
        <Input
          label="Title"
          id="add-memory-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="E.g. Prefers concise answers"
        />
        <Textarea
          label="Content"
          id="add-memory-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Describe what your twin should remember..."
          style={{ minHeight: 100 }}
        />
        <Select
          label="Category"
          id="add-memory-category"
          value={category}
          onChange={(e) => setCategory(e.target.value as MemoryCategory)}
          options={CATEGORIES.map((c) => ({ value: c, label: MEMORY_CATEGORY_LABELS[c] }))}
        />
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleAdd}>Add memory</Button>
        </div>
      </div>
    </Modal>
  )
}

export default function MemoriesPage() {
  const { user } = useAuthStore()
  const {
    memories, searchQuery, selectedCategory,
    setSearchQuery, setSelectedCategory,
    addMemory, updateMemory, deleteMemory, archiveMemory,
    getFilteredMemories,
  } = useMemoryStore()
  const { addActivity } = useActivityStore()

  const [editingMemory, setEditingMemory] = useState<Memory | null>(null)
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const filteredMemories = getFilteredMemories()
  const archivedMemories = memories.filter((m) => m.is_archived)

  const displayedMemories = showArchived ? archivedMemories : filteredMemories

  const handleAdd = (data: Omit<Memory, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => {
    const memory: Memory = {
      ...data,
      id: generateId(),
      user_id: user?.id || 'user',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    addMemory(memory)
    addActivity({
      id: generateId(),
      user_id: user?.id || 'user',
      activity_type: 'memory_created',
      description: `Memory added: ${data.title}`,
      created_at: new Date().toISOString(),
    })
  }

  const handleDelete = (id: string) => {
    const mem = memories.find((m) => m.id === id)
    deleteMemory(id)
    setConfirmDelete(null)
    toast.success('Memory deleted and removed from retrieval')
    if (mem) {
      addActivity({
        id: generateId(),
        user_id: user?.id || 'user',
        activity_type: 'memory_deleted',
        description: `Memory deleted: ${mem.title}`,
        created_at: new Date().toISOString(),
      })
    }
  }

  const handleArchive = (id: string) => {
    const mem = memories.find((m) => m.id === id)
    archiveMemory(id)
    toast.success('Memory archived')
    if (mem) {
      addActivity({
        id: generateId(),
        user_id: user?.id || 'user',
        activity_type: 'memory_archived',
        description: `Memory archived: ${mem.title}`,
        created_at: new Date().toISOString(),
      })
    }
  }

  const handleEdit = (updates: Partial<Memory>) => {
    if (!editingMemory) return
    updateMemory(editingMemory.id, updates)
    addActivity({
      id: generateId(),
      user_id: user?.id || 'user',
      activity_type: 'memory_edited',
      description: `Memory edited: ${editingMemory.title}`,
      created_at: new Date().toISOString(),
    })
  }

  const handleUnarchive = (id: string) => {
    updateMemory(id, { is_archived: false })
    toast.success('Memory restored')
  }

  const categoryCounts = CATEGORIES.reduce((acc, cat) => {
    acc[cat] = memories.filter((m) => m.category === cat && !m.is_archived).length
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="flex h-full overflow-hidden" style={{ background: 'var(--color-background)' }}>
      {/* Sidebar: categories */}
      <div
        className="hidden lg:flex flex-col w-56 shrink-0 p-4 gap-1"
        style={{ borderRight: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
      >
        <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--color-text-muted)' }}>
          Categories
        </div>
        <button
          onClick={() => { setSelectedCategory(null); setShowArchived(false) }}
          className={`sidebar-item ${!selectedCategory && !showArchived ? 'active' : ''}`}
        >
          <Layers size={14} />
          <span>All memories</span>
          <span className="ml-auto text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {memories.filter((m) => !m.is_archived).length}
          </span>
        </button>

        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => { setSelectedCategory(cat === selectedCategory ? null : cat); setShowArchived(false) }}
            className={`sidebar-item ${selectedCategory === cat && !showArchived ? 'active' : ''}`}
          >
            <span style={{ color: MEMORY_CATEGORY_COLORS[cat] }}>
              {CATEGORY_ICONS[cat]}
            </span>
            <span>{MEMORY_CATEGORY_LABELS[cat]}</span>
            {categoryCounts[cat] > 0 && (
              <span className="ml-auto text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {categoryCounts[cat]}
              </span>
            )}
          </button>
        ))}

        <div className="divider" />

        <button
          onClick={() => { setShowArchived(true); setSelectedCategory(null) }}
          className={`sidebar-item ${showArchived ? 'active' : ''}`}
        >
          <Archive size={14} />
          <span>Archived</span>
          {archivedMemories.length > 0 && (
            <span className="ml-auto text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {archivedMemories.length}
            </span>
          )}
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div
          className="flex items-center gap-3 p-4 shrink-0"
          style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
        >
          <div className="flex-1 flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
            <Search size={14} style={{ color: 'var(--color-text-muted)' }} />
            <input
              type="search"
              placeholder="Search memories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent text-sm outline-none flex-1 placeholder:text-[var(--color-text-muted)]"
              style={{ color: 'var(--color-text-primary)' }}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} style={{ color: 'var(--color-text-muted)' }}>
                <X size={14} />
              </button>
            )}
          </div>

          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus size={14} />}
            onClick={() => setIsAddOpen(true)}
          >
            Add memory
          </Button>
        </div>

        {/* Memories grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {showArchived && (
            <div className="mb-4 p-3 rounded-xl flex items-center gap-2 text-sm" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', color: '#fbbf24' }}>
              <Archive size={14} />
              <span>Archived memories are excluded from your twin's retrieval system.</span>
            </div>
          )}

          {displayedMemories.length === 0 ? (
            <EmptyState
              icon={<Brain size={24} />}
              title={showArchived ? 'No archived memories' : searchQuery ? 'No memories match your search' : 'No memories saved yet'}
              description={
                showArchived
                  ? 'Archived memories appear here.'
                  : searchQuery
                  ? 'Try a different search term.'
                  : 'Your twin can remember information you explicitly choose to save.'
              }
              action={!showArchived && !searchQuery ? { label: 'Add your first memory', onClick: () => setIsAddOpen(true) } : undefined}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {displayedMemories.map((memory) => (
                <div
                  key={memory.id}
                  className="memory-card group relative"
                >
                  {/* Category indicator */}
                  <div className="flex items-center gap-2 mb-3">
                    <span style={{ color: MEMORY_CATEGORY_COLORS[memory.category] }}>
                      {CATEGORY_ICONS[memory.category]}
                    </span>
                    <span className="text-xs font-medium" style={{ color: MEMORY_CATEGORY_COLORS[memory.category] }}>
                      {MEMORY_CATEGORY_LABELS[memory.category]}
                    </span>
                    {memory.confidence !== undefined && memory.confidence < 0.9 && (
                      <Badge variant="warning" className="ml-auto text-[9px]">Uncertain</Badge>
                    )}
                  </div>

                  {/* Content */}
                  <h3 className="text-sm font-semibold mb-2 leading-tight">{memory.title}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                    {memory.content}
                  </p>

                  {/* Meta */}
                  <div className="flex items-center justify-between mt-4 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
                    <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      {memory.source_reference && <div>{memory.source_reference}</div>}
                      <div>{formatDate(memory.updated_at)}</div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {memory.is_user_editable && (
                        <button
                          onClick={() => setEditingMemory(memory)}
                          className="btn btn-ghost btn-icon-sm"
                          title="Edit memory"
                        >
                          <Edit3 size={12} />
                        </button>
                      )}
                      {!showArchived ? (
                        <button
                          onClick={() => handleArchive(memory.id)}
                          className="btn btn-ghost btn-icon-sm"
                          title="Archive memory"
                        >
                          <Archive size={12} />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleUnarchive(memory.id)}
                          className="btn btn-ghost btn-icon-sm"
                          title="Restore memory"
                        >
                          <RotateCcw size={12} />
                        </button>
                      )}
                      <button
                        onClick={() => setConfirmDelete(memory.id)}
                        className="btn btn-ghost btn-icon-sm hover:text-red-400"
                        title="Delete memory"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <EditMemoryModal
        memory={editingMemory}
        onClose={() => setEditingMemory(null)}
        onSave={handleEdit}
      />

      <AddMemoryModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onAdd={handleAdd}
      />

      {/* Delete confirmation */}
      <Modal isOpen={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Delete memory?">
        <div className="flex flex-col gap-4">
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            This memory will be permanently removed from your twin's retrieval system. This action cannot be undone.
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => confirmDelete && handleDelete(confirmDelete)}>Delete permanently</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
