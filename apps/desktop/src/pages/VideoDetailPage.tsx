import { useState, useRef, useCallback, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch, apiDelete, type ApiResponse } from '@/lib/api'
import { VideoPlayer, type VideoPlayerHandle } from '@/components/VideoPlayer'
import { TranscriptView } from '@/components/TranscriptView'
import { SummaryPanel } from '@/components/SummaryPanel'
import { TagEditor } from '@/components/TagEditor'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { Button } from '@/components/ui/button'
import { ChevronRight, Trash2, MessageSquare, FileText } from 'lucide-react'
import { toast } from 'sonner'

interface Segment {
  id: string
  videoId: string
  startTime: number
  endTime: number
  text: string
  language: string
  segmentIndex: number
}

interface Chapter {
  id: string
  videoId: string
  title: string
  startTime: number
  endTime: number
  chapterIndex: number
}

interface Tag {
  id: string
  name: string
  color: string
  source: 'auto' | 'manual'
}

interface VideoData {
  id: string
  youtubeId: string
  url: string
  title: string
  description: string | null
  channelName: string
  channelId: string
  duration: number
  publishedAt: string | null
  thumbnailPath: string | null
  videoPath: string | null
  audioPath: string | null
  summary: string | null
  status: string
  segments: Segment[]
  chapters?: Chapter[]
  tags: Tag[]
}

export function VideoDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const playerRef = useRef<VideoPlayerHandle>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [activeTab, setActiveTab] = useState<'transcript' | 'chat'>('transcript')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const { data: video, isLoading, error } = useQuery({
    queryKey: ['video', id],
    queryFn: () => apiGet<ApiResponse<VideoData>>(`/videos/${id}`).then((r) => r.data!),
    enabled: !!id,
  })

  const saveSummary = useMutation({
    mutationFn: (summary: string) =>
      apiPatch<ApiResponse<VideoData>>(`/videos/${id}`, { summary }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['video', id] })
      toast.success('Summary saved')
    },
    onError: () => toast.error('Failed to save summary'),
  })

  const deleteVideo = useMutation({
    mutationFn: () => apiDelete<ApiResponse<void>>(`/videos/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['videos'] })
      toast.success('Video deleted')
      navigate('/')
    },
    onError: () => toast.error('Failed to delete video'),
  })

  const handleSeek = useCallback((time: number) => {
    playerRef.current?.seekTo(time)
    setCurrentTime(time)
  }, [])

  const handleTimeUpdate = useCallback((time: number) => {
    setCurrentTime(time)
  }, [])

  // Seek to timestamp from URL param `t` once player and video are ready
  useEffect(() => {
    const t = searchParams.get('t')
    if (!t || !video) return
    const seconds = parseFloat(t)
    if (!isNaN(seconds) && seconds > 0) {
      playerRef.current?.seekTo(seconds)
    }
  }, [video, searchParams])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (error || !video) {
    return (
      <div className="p-8">
        <p className="text-red-500">
          {error instanceof Error ? error.message : 'Video not found'}
        </p>
        <Link to="/" className="text-blue-500 hover:underline mt-2 inline-block">
          Back to Library
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 px-6 py-3 text-sm text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
        <Link to="/" className="hover:text-slate-700 dark:hover:text-slate-200">
          Library
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-slate-900 dark:text-slate-100 truncate max-w-md">
          {video.title}
        </span>
      </div>

      {/* Split layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel — 60% */}
        <div className="w-[60%] overflow-y-auto p-6 space-y-6 border-r border-slate-200 dark:border-slate-700">
          {/* Video Player */}
          <VideoPlayer
            ref={playerRef}
            youtubeId={video.youtubeId}
            videoPath={video.videoPath}
            onTimeUpdate={handleTimeUpdate}
          />

          {/* Video title and meta */}
          <div>
            <h2 className="text-xl font-semibold">{video.title}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {video.channelName}
              {video.publishedAt && ` \u00B7 ${new Date(video.publishedAt).toLocaleDateString()}`}
            </p>
          </div>

          {/* Tag Editor */}
          {id && <TagEditor videoId={id} />}

          {/* Summary */}
          <SummaryPanel
            summary={video.summary}
            onSave={(s) => saveSummary.mutate(s)}
            saving={saveSummary.isPending}
          />

          {/* Delete */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
            {showDeleteConfirm ? (
              <div className="flex items-center gap-3">
                <p className="text-sm text-red-600 dark:text-red-400">
                  Delete this video permanently?
                </p>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => deleteVideo.mutate()}
                  disabled={deleteVideo.isPending}
                >
                  {deleteVideo.isPending ? 'Deleting...' : 'Confirm Delete'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(false)}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Delete Video
              </Button>
            )}
          </div>
        </div>

        {/* Right panel — 40% */}
        <div className="w-[40%] flex flex-col overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-slate-200 dark:border-slate-700">
            <button
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'transcript'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
              onClick={() => setActiveTab('transcript')}
            >
              <FileText className="w-4 h-4" />
              Transcript
            </button>
            <button
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'chat'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
              onClick={() => setActiveTab('chat')}
            >
              <MessageSquare className="w-4 h-4" />
              Chat
            </button>
          </div>

          {/* Tab content — both panels always mounted, toggled via CSS for persistence */}
          <div className="relative flex-1 overflow-hidden">
            <div className={activeTab === 'transcript' ? 'absolute inset-0' : 'absolute inset-0 hidden'}>
              <TranscriptView
                segments={video.segments}
                chapters={video.chapters}
                currentTime={currentTime}
                onSeek={handleSeek}
              />
            </div>
            <div className={activeTab === 'chat' ? 'absolute inset-0' : 'absolute inset-0 hidden'}>
              <ChatPanel
                videoScope={{ videoId: video.id, videoTitle: video.title, onSeek: handleSeek }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
