import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CitationLink, type Citation } from './CitationLink'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations?: Citation[] | null
  isStreaming?: boolean
}

interface ChatMessageProps {
  message: Message
  currentVideoId?: string
  onSeek?: (time: number) => void
}

/**
 * Replaces [N] inline citation markers with CitationLink components.
 */
function renderContentWithCitations(
  content: string,
  citations: Citation[],
  currentVideoId: string | undefined,
  onSeek: ((time: number) => void) | undefined
): React.ReactNode[] {
  if (citations.length === 0) return [content]

  const parts = content.split(/(\[\d+\])/g)
  return parts.map((part, i) => {
    const match = part.match(/^\[(\d+)\]$/)
    if (match) {
      const idx = parseInt(match[1], 10)
      const citation = citations.find((c) => c.index === idx)
      if (citation) {
        return (
          <CitationLink
            key={i}
            citation={citation}
            currentVideoId={currentVideoId}
            onSeek={onSeek}
          />
        )
      }
    }
    return part
  })
}

export function ChatMessage({ message, currentVideoId, onSeek }: ChatMessageProps) {
  const isUser = message.role === 'user'
  const citations = message.citations ?? []

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      {isUser ? (
        <div className="max-w-[80%] px-3 py-2 rounded-2xl rounded-tr-sm bg-blue-500 text-white text-sm">
          {message.content}
        </div>
      ) : (
        <div className="max-w-[90%] text-sm text-slate-800 dark:text-slate-200">
          {message.isStreaming && message.content === '' ? (
            <div className="flex gap-1 py-2">
              <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce [animation-delay:0ms]" />
              <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce [animation-delay:150ms]" />
              <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce [animation-delay:300ms]" />
            </div>
          ) : citations.length > 0 ? (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              {renderContentWithCitations(message.content, citations, currentVideoId, onSeek)}
            </div>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
            </div>
          )}
          {message.isStreaming && message.content !== '' && (
            <span className="inline-block w-1 h-4 ml-0.5 bg-slate-400 animate-pulse align-text-bottom" />
          )}
        </div>
      )}
    </div>
  )
}
