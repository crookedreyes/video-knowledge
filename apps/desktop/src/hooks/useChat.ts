import { useState, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiDelete, type ApiResponse } from '@/lib/api'

const API_BASE_URL = 'http://localhost:3456/api'

export interface ChatSession {
  id: string
  title: string
  scope: 'global' | 'video'
  videoId?: string
  createdAt: string
  updatedAt: string
}

export interface Citation {
  videoId: string
  videoTitle: string
  timestamp: number
  index: number
}

export interface ChatMessage {
  id: string
  sessionId: string
  role: 'user' | 'assistant'
  content: string
  citations?: Citation[]
  createdAt: string
}

interface SessionWithMessages extends ChatSession {
  messages: ChatMessage[]
}

// Streaming message (id is temporary until server responds)
export interface StreamingMessage {
  role: 'assistant'
  content: string
  isStreaming: boolean
}

export function useChatSessions() {
  return useQuery({
    queryKey: ['chat', 'sessions'],
    queryFn: () =>
      apiGet<ApiResponse<ChatSession[]>>('/chat/sessions').then(
        (r) => r.data ?? []
      ),
  })
}

export function useChatSession(sessionId: string | undefined) {
  return useQuery({
    queryKey: ['chat', 'sessions', sessionId],
    queryFn: () =>
      apiGet<ApiResponse<SessionWithMessages>>(
        `/chat/sessions/${sessionId}`
      ).then((r) => r.data!),
    enabled: !!sessionId,
  })
}

export function useCreateSession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (params: { title: string; scope: 'global' | 'video'; videoId?: string }) =>
      apiPost<ApiResponse<ChatSession>>('/chat/sessions', params).then((r) => r.data!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'sessions'] })
    },
  })
}

export function useDeleteSession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (sessionId: string) =>
      apiDelete<ApiResponse<void>>(`/chat/sessions/${sessionId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'sessions'] })
    },
  })
}

export function useSendMessage(sessionId: string | undefined) {
  const queryClient = useQueryClient()
  const [streamingContent, setStreamingContent] = useState<string>('')
  const [isStreaming, setIsStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const sendMessage = useCallback(
    async (content: string) => {
      if (!sessionId || isStreaming) return

      // Abort any previous stream
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setIsStreaming(true)
      setStreamingContent('')

      try {
        const response = await fetch(
          `${API_BASE_URL}/chat/sessions/${sessionId}/messages`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content }),
            signal: controller.signal,
          }
        )

        if (!response.ok) {
          throw new Error(`API error: ${response.statusText}`)
        }

        const reader = response.body?.getReader()
        if (!reader) throw new Error('No response body')

        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })

          // Parse SSE lines
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim()
              if (data === '[DONE]') break
              try {
                const parsed = JSON.parse(data)
                if (parsed.token) {
                  setStreamingContent((prev) => prev + parsed.token)
                }
              } catch {
                // Ignore parse errors for partial chunks
              }
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('Streaming error:', err)
        }
      } finally {
        setIsStreaming(false)
        setStreamingContent('')
        // Refresh session messages
        queryClient.invalidateQueries({
          queryKey: ['chat', 'sessions', sessionId],
        })
        queryClient.invalidateQueries({ queryKey: ['chat', 'sessions'] })
      }
    },
    [sessionId, isStreaming, queryClient]
  )

  const abort = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  return { sendMessage, streamingContent, isStreaming, abort }
}
