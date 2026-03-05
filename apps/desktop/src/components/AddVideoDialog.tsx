import * as React from 'react'
import { toast } from 'sonner'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { apiPost } from '@/lib/api'
import { useIngestionStore } from '@/stores/ingestionStore'
import { useIngestion } from '@/hooks/useIngestion'

// YouTube URL regex (basic client-side validation)
const YOUTUBE_REGEX =
  /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/

function isYouTubeUrl(url: string): boolean {
  return YOUTUBE_REGEX.test(url)
}

interface IngestResponse {
  success: boolean
  videoId?: string
  error?: string
}

interface AddVideoDialogProps {
  open: boolean
  onClose: () => void
}

/**
 * Inner component that starts polling once we have a videoId.
 */
function IngestionPoller({ videoId }: { videoId: string }) {
  useIngestion(videoId)
  return null
}

export function AddVideoDialog({ open, onClose }: AddVideoDialogProps) {
  const [url, setUrl] = React.useState('')
  const [validationError, setValidationError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)
  const [newVideoId, setNewVideoId] = React.useState<string | null>(null)

  const { addIngestion } = useIngestionStore()
  const inputRef = React.useRef<HTMLInputElement>(null)

  // Focus input on open
  React.useEffect(() => {
    if (open) {
      setUrl('')
      setValidationError(null)
      setNewVideoId(null)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Close on Escape
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  const validateUrl = (value: string) => {
    if (!value) {
      setValidationError('Please enter a URL')
      return false
    }
    if (!isYouTubeUrl(value)) {
      setValidationError('Please enter a valid YouTube URL')
      return false
    }
    setValidationError(null)
    return true
  }

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUrl(e.target.value)
    if (validationError) validateUrl(e.target.value)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateUrl(url)) return

    setSubmitting(true)

    try {
      const res = await apiPost<IngestResponse>('/ingest', { url })

      if (res.success && res.videoId) {
        addIngestion({
          id: res.videoId,
          title: 'Processing…',
          youtubeId: '',
          status: 'pending',
          currentStep: null,
          steps: [],
          errorMessage: null,
          logs: [],
        })
        setNewVideoId(res.videoId)
        toast.success('Video added — ingestion started')
        onClose()
      } else {
        setValidationError(res.error || 'Failed to add video')
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setValidationError(message || 'Failed to add video')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <>
      {/* Render poller outside dialog so it survives dialog close */}
      {newVideoId && <IngestionPoller videoId={newVideoId} />}

      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-video-dialog-title"
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div
          className={cn(
            'relative w-full max-w-md rounded-lg bg-slate-900 text-slate-50',
            'shadow-xl border border-slate-700 p-6',
            'focus:outline-none'
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h2
              id="add-video-dialog-title"
              className="text-lg font-semibold"
            >
              Add Video
            </h2>
            <button
              aria-label="Close dialog"
              onClick={onClose}
              className="p-1 rounded hover:bg-slate-700 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleSubmit} noValidate>
            <div className="mb-4">
              <label
                htmlFor="video-url"
                className="block text-sm font-medium mb-1.5 text-slate-300"
              >
                YouTube URL
              </label>
              <input
                ref={inputRef}
                id="video-url"
                type="url"
                value={url}
                onChange={handleUrlChange}
                onBlur={() => url && validateUrl(url)}
                placeholder="https://www.youtube.com/watch?v=..."
                aria-describedby={validationError ? 'url-error' : undefined}
                aria-invalid={!!validationError}
                className={cn(
                  'w-full px-3 py-2 rounded-md text-sm bg-slate-800 border',
                  'placeholder:text-slate-500 focus:outline-none focus:ring-2',
                  validationError
                    ? 'border-red-500 focus:ring-red-500'
                    : 'border-slate-600 focus:ring-slate-400'
                )}
              />

              {validationError && (
                <p
                  id="url-error"
                  role="alert"
                  className="mt-1.5 text-xs text-red-400"
                >
                  {validationError}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                className="text-slate-300 hover:text-slate-50 hover:bg-slate-700"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="bg-slate-600 hover:bg-slate-500 text-slate-50 disabled:opacity-50"
              >
                {submitting ? 'Adding…' : 'Add Video'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
