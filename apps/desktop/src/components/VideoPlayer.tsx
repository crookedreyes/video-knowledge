import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import { Button } from '@/components/ui/button'
import { Monitor, Youtube } from 'lucide-react'

export interface VideoPlayerHandle {
  seekTo: (time: number) => void
  getCurrentTime: () => number
}

interface VideoPlayerProps {
  youtubeId: string
  videoPath?: string | null
  onTimeUpdate?: (time: number) => void
}

export const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(
  function VideoPlayer({ youtubeId, videoPath, onTimeUpdate }, ref) {
    const [mode, setMode] = useState<'youtube' | 'local'>(videoPath ? 'local' : 'youtube')
    const videoRef = useRef<HTMLVideoElement>(null)
    const iframeRef = useRef<HTMLIFrameElement>(null)
    const currentTimeRef = useRef(0)

    useImperativeHandle(ref, () => ({
      seekTo(time: number) {
        if (mode === 'local' && videoRef.current) {
          videoRef.current.currentTime = time
        } else if (mode === 'youtube' && iframeRef.current?.contentWindow) {
          iframeRef.current.contentWindow.postMessage(
            JSON.stringify({ event: 'command', func: 'seekTo', args: [time, true] }),
            '*'
          )
        }
      },
      getCurrentTime() {
        if (mode === 'local' && videoRef.current) {
          return videoRef.current.currentTime
        }
        return currentTimeRef.current
      },
    }))

    const handleTimeUpdate = useCallback(() => {
      if (videoRef.current) {
        const t = videoRef.current.currentTime
        currentTimeRef.current = t
        onTimeUpdate?.(t)
      }
    }, [onTimeUpdate])

    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement
        )
          return

        const video = videoRef.current
        if (mode !== 'local' || !video) return

        switch (e.key) {
          case ' ':
            e.preventDefault()
            video.paused ? video.play() : video.pause()
            break
          case 'ArrowLeft':
            e.preventDefault()
            video.currentTime = Math.max(0, video.currentTime - 5)
            break
          case 'ArrowRight':
            e.preventDefault()
            video.currentTime = Math.min(video.duration, video.currentTime + 5)
            break
          case 'j':
            e.preventDefault()
            video.currentTime = Math.max(0, video.currentTime - 10)
            break
          case 'l':
            e.preventDefault()
            video.currentTime = Math.min(video.duration, video.currentTime + 10)
            break
        }
      }

      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }, [mode])

    return (
      <div className="space-y-2">
        <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden">
          {mode === 'youtube' ? (
            <iframe
              ref={iframeRef}
              className="absolute inset-0 w-full h-full"
              src={`https://www.youtube-nocookie.com/embed/${youtubeId}?enablejsapi=1`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title="Video player"
            />
          ) : (
            <video
              ref={videoRef}
              className="absolute inset-0 w-full h-full"
              src={`/api/files/videos/${youtubeId}/${youtubeId}.mp4`}
              controls
              onTimeUpdate={handleTimeUpdate}
            />
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={mode === 'local' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode('local')}
            disabled={!videoPath}
          >
            <Monitor className="w-4 h-4 mr-1" />
            Local
          </Button>
          <Button
            variant={mode === 'youtube' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode('youtube')}
          >
            <Youtube className="w-4 h-4 mr-1" />
            YouTube
          </Button>
        </div>
      </div>
    )
  }
)
