import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2, MessageSquare, Globe, Video } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select } from '@/components/ui/select'
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { ChatMessage } from './ChatMessage'
import { ChatInput } from './ChatInput'
import {
  useChatSessions,
  useChatSession,
  useCreateSession,
  useDeleteSession,
  useSendMessage,
  type ChatSession,
} from '@/hooks/useChat'
import { useVideos } from '@/hooks/useVideos'
import { cn } from '@/lib/utils'

interface ChatPanelProps {
  sessionId?: string
}

export function ChatPanel({ sessionId }: ChatPanelProps) {
  const navigate = useNavigate()
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Session state
  const { data: sessions = [], isLoading: sessionsLoading } = useChatSessions()
  const { data: currentSession } = useChatSession(sessionId)
  const createSession = useCreateSession()
  const deleteSession = useDeleteSession()

  // Scope selector
  const [scope, setScope] = useState<'global' | 'video'>('global')
  const [scopeVideoId, setScopeVideoId] = useState<string>('')
  const { videos } = useVideos()

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<ChatSession | null>(null)

  // Streaming
  const { sendMessage, streamingContent, isStreaming } = useSendMessage(sessionId)

  // Auto-scroll on new messages or streaming
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [currentSession?.messages, streamingContent])

  async function handleNewChat() {
    try {
      const session = await createSession.mutateAsync({
        title: 'New Chat',
        scope,
        videoId: scope === 'video' ? scopeVideoId : undefined,
      })
      navigate(`/chat/${session.id}`)
    } catch {
      toast.error('Failed to create session')
    }
  }

  async function handleSend(content: string) {
    if (!sessionId) {
      // Create a session first, then send
      try {
        const session = await createSession.mutateAsync({
          title: content.slice(0, 50),
          scope,
          videoId: scope === 'video' ? scopeVideoId : undefined,
        })
        navigate(`/chat/${session.id}`)
        // sendMessage will be called via the new sessionId
        return
      } catch {
        toast.error('Failed to create session')
        return
      }
    }
    await sendMessage(content)
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return
    try {
      await deleteSession.mutateAsync(deleteTarget.id)
      toast.success('Session deleted')
      if (sessionId === deleteTarget.id) {
        navigate('/chat')
      }
    } catch {
      toast.error('Failed to delete session')
    } finally {
      setDeleteTarget(null)
    }
  }

  function formatDate(iso: string) {
    const d = new Date(iso)
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }

  const messages = currentSession?.messages ?? []

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 shrink-0 flex flex-col border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        {/* New Chat + scope selector */}
        <div className="p-3 space-y-2 border-b border-slate-200 dark:border-slate-700">
          <Button
            className="w-full justify-start gap-2"
            variant="default"
            onClick={handleNewChat}
            disabled={createSession.isPending}
          >
            <Plus className="w-4 h-4" />
            New Chat
          </Button>

          <Select
            value={scope}
            onChange={(e) => setScope(e.target.value as 'global' | 'video')}
            className="h-8 text-xs"
          >
            <option value="global">All Videos</option>
            <option value="video">Specific Video</option>
          </Select>

          {scope === 'video' && (
            <Select
              value={scopeVideoId}
              onChange={(e) => setScopeVideoId(e.target.value)}
              className="h-8 text-xs"
            >
              <option value="">Select video…</option>
              {videos.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.title}
                </option>
              ))}
            </Select>
          )}
        </div>

        {/* Session list */}
        <ScrollArea className="flex-1 overflow-y-auto">
          {sessionsLoading ? (
            <div className="p-4 text-sm text-slate-400">Loading…</div>
          ) : sessions.length === 0 ? (
            <div className="p-4 text-sm text-slate-400 text-center">
              No sessions yet
            </div>
          ) : (
            <div className="p-2 space-y-0.5">
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className={cn(
                    'group flex items-center gap-2 rounded-md px-2 py-2 cursor-pointer text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors',
                    sessionId === s.id &&
                      'bg-slate-100 dark:bg-slate-800 font-medium'
                  )}
                  onClick={() => navigate(`/chat/${s.id}`)}
                >
                  {s.scope === 'global' ? (
                    <Globe className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                  ) : (
                    <Video className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="truncate">{s.title}</p>
                    <p className="text-xs text-slate-400">{formatDate(s.updatedAt)}</p>
                  </div>
                  <button
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:text-red-500 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation()
                      setDeleteTarget(s)
                    }}
                    aria-label="Delete session"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!sessionId ? (
          <div className="flex-1 flex items-center justify-center text-slate-400">
            <div className="text-center space-y-3">
              <MessageSquare className="w-12 h-12 mx-auto opacity-30" />
              <p className="text-lg font-medium">Start a conversation</p>
              <p className="text-sm">
                Select a session or ask a question below
              </p>
            </div>
          </div>
        ) : (
          <ScrollArea className="flex-1 overflow-y-auto px-4 py-6">
            {messages.length === 0 && !isStreaming && (
              <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                Send a message to get started
              </div>
            )}

            {messages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))}

            {isStreaming && streamingContent && (
              <ChatMessage
                message={{
                  role: 'assistant',
                  content: streamingContent,
                  isStreaming: true,
                }}
              />
            )}

            {isStreaming && !streamingContent && (
              <div className="flex justify-start mb-4">
                <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl rounded-tl-sm px-4 py-3">
                  <div className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-500 animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </ScrollArea>
        )}

        <ChatInput
          onSend={handleSend}
          disabled={isStreaming || createSession.isPending}
          placeholder={
            sessionId ? 'Ask a question… (Enter to send, Shift+Enter for newline)' : 'Ask a question…'
          }
        />
      </div>

      {/* Delete confirmation dialog */}
      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
      >
        <DialogHeader>
          <DialogTitle>Delete session?</DialogTitle>
          <DialogDescription>
            "{deleteTarget?.title}" will be permanently deleted.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDeleteConfirm}
            disabled={deleteSession.isPending}
          >
            {deleteSession.isPending ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  )
}
