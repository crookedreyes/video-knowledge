import { useParams } from 'react-router-dom'

export function ChatPage() {
  const { sessionId } = useParams()

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-4">Chat</h1>
      {sessionId ? (
        <p className="text-slate-600 dark:text-slate-400">Chat session {sessionId} - coming soon</p>
      ) : (
        <p className="text-slate-600 dark:text-slate-400">Chat page - coming soon</p>
      )}
    </div>
  )
}
