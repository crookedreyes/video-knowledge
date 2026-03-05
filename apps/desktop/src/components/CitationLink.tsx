import { useNavigate } from 'react-router-dom'

export interface Citation {
  index: number
  videoId: string
  videoTitle: string
  youtubeId: string
  startTime: number
  endTime: number
  text: string
}

interface CitationLinkProps {
  citation: Citation
  currentVideoId?: string
  onSeek?: (time: number) => void
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function CitationLink({ citation, currentVideoId, onSeek }: CitationLinkProps) {
  const navigate = useNavigate()

  const handleClick = () => {
    if (citation.videoId === currentVideoId && onSeek) {
      onSeek(citation.startTime)
    } else {
      navigate(`/video/${citation.videoId}?t=${Math.floor(citation.startTime)}`)
    }
  }

  return (
    <button
      onClick={handleClick}
      title={`${citation.videoTitle} — ${formatTime(citation.startTime)}\n"${citation.text}"`}
      className="inline-flex items-center gap-0.5 mx-0.5 px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-300 dark:hover:bg-blue-800 transition-colors cursor-pointer border border-blue-200 dark:border-blue-700"
    >
      [{citation.index}] {formatTime(citation.startTime)}
    </button>
  )
}
