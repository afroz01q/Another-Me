import React from 'react'
import { VoiceTwinView } from '@/components/VoiceTwinView'

export default function TwinPage() {
  return (
    <div className="h-full overflow-hidden" style={{ background: 'var(--color-background)' }}>
      <VoiceTwinView />
    </div>
  )
}
