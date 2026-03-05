import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { apiGet, apiPost } from '@/lib/api'
import { useIngestionStore, type ActiveIngestion, type IngestionStatus } from '@/stores/ingestionStore'

const TERMINAL_STATUSES: IngestionStatus[] = ['ready', 'error']
const POLL_INTERVAL_MS = 2000

const ALL_STEPS = ['downloading', 'transcribing', 'embedding', 'summarizing', 'tagging'] as const

interface VideoResponse {
  success: boolean
  data: {
    id: string
    status: IngestionStatus
    errorMessage: string | null
    title: string
    youtubeId: string
  }
}

function deriveSteps(status: IngestionStatus): Array<{ name: string; completed: boolean; active: boolean }> {
  const currentIdx = ALL_STEPS.indexOf(status as typeof ALL_STEPS[number])
  return ALL_STEPS.map((name, idx) => ({
    name,
    completed: status === 'ready' ? true : idx < currentIdx,
    active: idx === currentIdx,
  }))
}

/**
 * Starts polling ingestion status for a video and keeps the store updated.
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
        const res = await apiGet<VideoResponse>(`/videos/${videoId}`)
        if (!isMountedRef.current) return

        const { data } = res
        const steps = deriveSteps(data.status)
        const patch: Partial<ActiveIngestion> = {
          status: data.status,
          currentStep: data.status,
          steps,
          errorMessage: data.errorMessage,
          title: data.title,
          youtubeId: data.youtubeId,
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
        // silently skip transient errors
      }
    }

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
