import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { apiGet, apiPost } from '@/lib/api'
import { useIngestionStore, type ActiveIngestion, type IngestionStatus } from '@/stores/ingestionStore'

const TERMINAL_STATUSES: IngestionStatus[] = ['ready', 'error']
const POLL_INTERVAL_MS = 2000

interface VideoStatusResponse {
  success: boolean
  data: {
    id: string
    status: IngestionStatus
    currentStep: string | null
    steps: Array<{ name: string; completed: boolean; active: boolean }>
    errorMessage: string | null
    title: string
    youtubeId: string
  }
}

/**
 * Starts polling ingestion status for a video and keeps the store updated.
 * Call this after adding a new video to trigger real-time updates.
 */
export function useIngestion(videoId: string | null) {
  const { updateIngestion, appendLog } = useIngestionStore()
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!videoId) return

    const poll = async () => {
      try {
        const res = await apiGet<VideoStatusResponse>(`/videos/${videoId}/status`)
        if (!isMountedRef.current) return

        const { data } = res
        const patch: Partial<ActiveIngestion> = {
          status: data.status,
          currentStep: data.currentStep,
          steps: data.steps,
          errorMessage: data.errorMessage,
          title: data.title,
        }
        updateIngestion(videoId, patch)
        appendLog(videoId, `[${new Date().toLocaleTimeString()}] Status: ${data.status}`)

        if (TERMINAL_STATUSES.includes(data.status)) {
          if (intervalRef.current) clearInterval(intervalRef.current)
          if (data.status === 'ready') {
            toast.success(`"${data.title}" is ready`, { id: videoId })
          } else {
            toast.error(`Ingestion failed: ${data.errorMessage ?? 'Unknown error'}`, { id: videoId })
          }
        }
      } catch {
        // silently skip transient errors; stop polling on repeated failures handled elsewhere
      }
    }

    // Immediate first poll
    poll()
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [videoId, updateIngestion, appendLog])
}

/**
 * Retry a failed video ingestion.
 */
export async function retryIngestion(videoId: string): Promise<void> {
  await apiPost(`/videos/${videoId}/retry`, {})
}
