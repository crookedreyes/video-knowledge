import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import type { Citation } from '@/hooks/useChat'

interface CitationLinkProps {
  citation: Citation
  currentVideoId?: string
  onSeek?: (time: number) => void
}

export function CitationLink({ citation, currentVideoId, onSeek }: CitationLinkProps) {
  const navigate = useNavigate()

  function formatTimestamp(seconds: number) {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  function handleClick() {
    if (citation.videoId === currentVideoId && onSeek) {
      onSeek(citation.startTime)
    } else {
      navigate(`/video/${citation.videoId}?t=${citation.startTime}`)
    }
  }

  return (
    <Badge
      variant="secondary"
      className="cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors text-xs px-1.5 py-0 inline-flex items-center gap-1"
      title={`${citation.videoTitle} @ ${formatTimestamp(citation.startTime)}`}
      onClick={handleClick}
    >
      [{citation.index}]
    </Badge>
  )
}
