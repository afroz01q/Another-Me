import React, { useState } from 'react'
import { ConversationList } from '@/components/Chat'

export default function ConversationsPage() {
  return (
    <div className="h-full" style={{ background: 'var(--color-background)' }}>
      <ConversationList />
    </div>
  )
}
