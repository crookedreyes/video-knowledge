import { Link } from 'react-router-dom'
import { Clock, AlertCircle, Loader2, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { retryIngestion } from '@/hooks/useIngestion'
import type { Video } from '@/hooks/useVideos'
import type { IngestionStatus } from '@/stores/ingestionStore'

const PROCESSING_STATUSES: IngestionStatus[] = [
  'pending', 'downloading', 'transcribing', 'embedding', 'summarizing', 'tagging',
]

const STATUS_LABELS: Record<IngestionStatus, string> = {
  pending: 'Pending',
  downloading: 'Downloading',
  transcribing: 'Transcribing',
  embedding: 'Embedding',
  summarizing: 'Summarizing',
  tagging: 'Tagging',
  ready: 'Ready',
  error: 'Error',
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return ''
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function getThumbnailUrl(video: Video): string {
  if (video.thumbnailPath) return video.thumbnailPath
  return `https://img.youtube.com/vi/${video.youtubeId}/mqdefault.jpg`
}

interface VideoCardProps {
  video: Video
  onTagClick?: (tag: string) => void
}

export function VideoCard({ video, onTagClick }: VideoCardProps) {
  const isProcessing = PROCESSING_STATUSES.includes(video.status)
  const isError = video.status === 'error'

  return (
    <Link
      to={`/video/${video.id}`}
      className="group block rounded-lg border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-950"
    >
      {/* Thumbnail / Status area */}
      <div className="relative aspect-video w-full overflow-hidden rounded-t-lg bg-slate-100 dark:bg-slate-900">
        {isProcessing ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-4">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
              {STATUS_LABELS[video.status]}...
            </span>
          </div>
        ) : isError ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-4">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <span className="text-sm font-medium text-red-600 dark:text-red-400">
              Processing failed
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                retryIngestion(video.id)
              }}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Retry
            </Button>
          </div>
        ) : (
          <>
            <img
              src={getThumbnailUrl(video)}
              alt={video.title}
              className="h-full w-full object-cover transition-transform group-hover:scale-105"
              loading="lazy"
            />
            {video.duration != null && (
              <span className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-xs font-medium text-white">
                {formatDuration(video.duration)}
              </span>
            )}
          </>
        )}
      </div>

      {/* Card body */}
      <div className="p-3">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900 dark:text-slate-100">
          {video.title}
        </h3>

        {video.channelName && (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {video.channelName}
          </p>
        )}

        {video.summary && video.status === 'ready' && (
          <p className="mt-1.5 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
            {video.summary}
          </p>
        )}

        {video.tags && video.tags.length > 0 && video.status === 'ready' && (
          <div className="mt-2 flex flex-wrap gap-1">
            {video.tags.slice(0, 4).map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onTagClick?.(tag)
                }}
                className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                {tag}
              </button>
            ))}
            {video.tags.length > 4 && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                +{video.tags.length - 4}
              </span>
            )}
          </div>
        )}

        <div className="mt-2 flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
          <Clock className="h-3 w-3" />
          <span>{new Date(video.createdAt).toLocaleDateString()}</span>
        </div>
      </div>
    </Link>
  )
}
