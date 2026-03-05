import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CitationLink } from './CitationLink'
import type { ChatMessage as ChatMessageType, Citation } from '@/hooks/useChat'

interface ChatMessageProps {
  message: ChatMessageType | { role: 'assistant'; content: string; isStreaming: true; citations?: Citation[] }
  currentVideoId?: string
  onSeek?: (time: number) => void
}

// Replaces [N] citation markers with CitationLink components
function renderWithCitations(
  content: string,
  citations: Citation[] | undefined,
  currentVideoId?: string,
  onSeek?: (time: number) => void,
) {
  if (!citations || citations.length === 0) {
    return (
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    )
  }

  // Split content on citation patterns [N] and interleave CitationLink chips
  const parts = content.split(/(\[\d+\])/g)

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      {parts.map((part, i) => {
        const match = part.match(/^\[(\d+)\]$/)
        if (match) {
          const idx = parseInt(match[1], 10)
          const citation = citations.find((c) => c.index === idx)
          if (citation) {
            return <CitationLink key={i} citation={citation} currentVideoId={currentVideoId} onSeek={onSeek} />
          }
        }
        return part ? (
          <ReactMarkdown key={i} remarkPlugins={[remarkGfm]}>
            {part}
          </ReactMarkdown>
        ) : null
      })}
    </div>
  )
}

export function ChatMessage({ message, currentVideoId, onSeek }: ChatMessageProps) {
  const isUser = message.role === 'user'
  const isStreaming = 'isStreaming' in message && message.isStreaming

  if (isUser) {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-[75%] rounded-2xl rounded-tr-sm bg-blue-600 text-white px-4 py-2.5 text-sm">
          {'content' in message ? message.content : ''}
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-start mb-4">
      <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-slate-100 dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100">
        {isStreaming ? (
          <div>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
            <span className="inline-block w-2 h-4 bg-slate-400 dark:bg-slate-500 animate-pulse ml-0.5 rounded-sm" />
          </div>
        ) : (
          renderWithCitations(
            message.content,
            'citations' in message ? message.citations : undefined,
            currentVideoId,
            onSeek,
          )
        )}
      </div>
    </div>
  )
}
