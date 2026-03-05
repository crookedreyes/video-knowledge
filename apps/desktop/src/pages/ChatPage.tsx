import { useParams } from 'react-router-dom'
import { ChatPanel } from '@/components/chat/ChatPanel'

export function ChatPage() {
  const { sessionId } = useParams<{ sessionId?: string }>()

  return (
    <div className="h-full flex flex-col">
      <ChatPanel sessionId={sessionId} />
    </div>
  )
}
