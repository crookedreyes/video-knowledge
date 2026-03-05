import { useState, useRef, useCallback, useEffect } from 'react'
import { apiPost } from '@/lib/api'
import type { ApiResponse } from '@/lib/api'
import { ChatMessage, type Message } from './ChatMessage'
import { ChatInput } from './ChatInput'
import type { Citation } from './CitationLink'

const API_BASE_URL = 'http://localhost:3456/api'

interface ChatSession {
  id: string
  title: string
  scope: 'global' | 'video'
  videoId: string | null
}

export interface VideoScope {
  videoId: string
  videoTitle: string
  onSeek?: (time: number) => void
}

interface ChatPanelProps {
  videoScope?: VideoScope
}

function generateTempId() {
  return `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/**
 * Parse a stream of SSE data, calling onEvent for each complete event.
 * Returns when the stream is done.
 */
async function consumeSSEStream(
  response: Response,
  onEvent: (event: string, data: string) => void,
  signal: AbortSignal
): Promise<void> {
  if (!response.body) return

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let currentEvent = ''

  try {
    while (true) {
      if (signal.aborted) break
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // Split buffer into lines
      let lineEnd: number
      while ((lineEnd = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, lineEnd).replace(/\r$/, '')
        buffer = buffer.slice(lineEnd + 1)

        if (line === '') {
          // Empty line = end of event (we handle data-only events)
          currentEvent = ''
        } else if (line.startsWith('event:')) {
          currentEvent = line.slice(6).trim()
        } else if (line.startsWith('data:')) {
          const data = line.slice(5).trim()
          if (currentEvent) {
            onEvent(currentEvent, data)
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

export function ChatPanel({ videoScope }: ChatPanelProps) {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const createSession = useCallback(async (): Promise<string> => {
    const title = videoScope ? videoScope.videoTitle : 'New Chat'
    const body: Record<string, unknown> = {
      title,
      scope: videoScope ? 'video' : 'global',
    }
    if (videoScope) {
      body['videoId'] = videoScope.videoId
    }

    const res = await apiPost<ApiResponse<ChatSession>>('/chat/sessions', body)
    if (!res.success || !res.data) throw new Error('Failed to create session')
    return res.data.id
  }, [videoScope])

  const sendMessage = useCallback(
    async (content: string) => {
      if (isLoading) return
      setIsLoading(true)

      const streamingMsgId = generateTempId()

      setMessages((prev) => [
        ...prev,
        { id: generateTempId(), role: 'user', content },
        { id: streamingMsgId, role: 'assistant', content: '', isStreaming: true },
      ])

      const abort = new AbortController()
      abortRef.current = abort

      try {
        let sid = sessionId
        if (!sid) {
          sid = await createSession()
          setSessionId(sid)
        }

        const response = await fetch(`${API_BASE_URL}/chat/sessions/${sid}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content }),
          signal: abort.signal,
        })

        if (!response.ok || !response.body) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const pendingCitations: Citation[] = []

        await consumeSSEStream(
          response,
          (event, data) => {
            try {
              const parsed = JSON.parse(data)
              if (event === 'chunk') {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === streamingMsgId
                      ? { ...m, content: m.content + (parsed.text as string) }
                      : m
                  )
                )
              } else if (event === 'citation') {
                pendingCitations.push(parsed as Citation)
              } else if (event === 'done') {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === streamingMsgId
                      ? { ...m, id: parsed.messageId as string, isStreaming: false, citations: pendingCitations }
                      : m
                  )
                )
              } else if (event === 'error') {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === streamingMsgId
                      ? { ...m, content: `Error: ${parsed.message}`, isStreaming: false }
                      : m
                  )
                )
              }
            } catch {
              // Ignore malformed SSE data
            }
          },
          abort.signal
        )
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        const errorMsg = err instanceof Error ? err.message : 'Unknown error'
        setMessages((prev) =>
          prev.map((m) =>
            m.id === streamingMsgId
              ? { ...m, content: `Failed to get response: ${errorMsg}`, isStreaming: false }
              : m
          )
        )
      } finally {
        setIsLoading(false)
        abortRef.current = null
      }
    },
    [isLoading, sessionId, createSession]
  )

  return (
    <div className="flex flex-col h-full">
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4"
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 select-none">
            <p className="text-sm text-center px-4">
              {videoScope
                ? `Ask anything about "${videoScope.videoTitle}"`
                : 'Ask anything about your videos'}
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {messages.map((msg) => (
              <ChatMessage
                key={msg.id}
                message={msg}
                currentVideoId={videoScope?.videoId}
                onSeek={videoScope?.onSeek}
              />
            ))}
          </div>
        )}
      </div>
      <ChatInput
        onSend={sendMessage}
        disabled={isLoading}
        placeholder={
          videoScope
            ? `Ask about "${videoScope.videoTitle}"...`
            : 'Ask about your videos...'
        }
      />
    </div>
  )
}
