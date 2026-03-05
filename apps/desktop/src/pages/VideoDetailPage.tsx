import { useState, useRef, useCallback, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch, apiPost, apiDelete } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Edit3,
  Save,
  X,
  Trash2,
  Plus,
  ExternalLink,
  Clock,
  Youtube,
  Monitor,
  Loader2,
  Tag,
} from 'lucide-react'

interface TranscriptSegment {
  id: string
  videoId: string
  startTime: number
  endTime: number
  text: string
  language: string
  segmentIndex: number
}

interface VideoTag {
  id: string
  name: string
  color: string
  source: string
}

interface Chapter {
  id: string
  videoId: string
  title: string
  startTime: number
  endTime: number
  chapterIndex: number
}

interface VideoDetail {
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
  summary: string | null
  status: string
  errorMessage: string | null
  createdAt: string
  updatedAt: string
  segments: TranscriptSegment[]
  chapters: Chapter[]
  tags: VideoTag[]
}

interface AllTag {
  id: string
  name: string
  color: string
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatDuration(seconds: number): string {
  return formatTime(seconds)
}

// Video Player Component
function VideoPlayer({
  video,
  playerMode,
  onTimeUpdate,
  videoRef,
}: {
  video: VideoDetail
  playerMode: 'local' | 'youtube'
  onTimeUpdate: (time: number) => void
  videoRef: React.RefObject<HTMLVideoElement>
}) {
  if (playerMode === 'youtube') {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
        <iframe
          src={`https://www.youtube.com/embed/${video.youtubeId}?enablejsapi=1`}
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title={video.title}
        />
      </div>
    )
  }

  const videoSrc = video.videoPath
    ? `http://localhost:3456/media/videos/${video.videoPath.split('/').pop()}`
    : null

  if (!videoSrc) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-lg bg-slate-200 dark:bg-slate-800">
        <p className="text-sm text-slate-500">No local video file available</p>
      </div>
    )
  }

  return (
    <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
      <video
        ref={videoRef}
        src={videoSrc}
        className="h-full w-full"
        controls
        onTimeUpdate={(e) => onTimeUpdate(e.currentTarget.currentTime)}
      />
    </div>
  )
}

// Summary Panel
function SummaryPanel({ video }: { video: VideoDetail }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(video.summary || '')
  const queryClient = useQueryClient()

  const saveMutation = useMutation({
    mutationFn: (summary: string) =>
      apiPatch(`/videos/${video.id}`, { summary }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['video', video.id] })
      setEditing(false)
      toast.success('Summary saved')
    },
    onError: () => toast.error('Failed to save summary'),
  })

  useEffect(() => {
    setDraft(video.summary || '')
  }, [video.summary])

  if (editing) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Summary</h3>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDraft(video.summary || '')
                setEditing(false)
              }}
            >
              <X className="mr-1 h-3 w-3" /> Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => saveMutation.mutate(draft)}
              disabled={saveMutation.isPending}
            >
              <Save className="mr-1 h-3 w-3" />
              {saveMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={8}
          className="text-sm"
        />
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Summary</h3>
        <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
          <Edit3 className="mr-1 h-3 w-3" /> Edit
        </Button>
      </div>
      {video.summary ? (
        <p className="whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          {video.summary}
        </p>
      ) : (
        <p className="text-sm italic text-slate-400">No summary available</p>
      )}
    </div>
  )
}

// Tag Editor
function TagEditor({ video }: { video: VideoDetail }) {
  const [showAdd, setShowAdd] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const queryClient = useQueryClient()

  const { data: allTagsData } = useQuery({
    queryKey: ['tags'],
    queryFn: () => apiGet<{ success: boolean; data: AllTag[] }>('/tags'),
  })
  const allTags = allTagsData?.data || []

  const addTagMutation = useMutation({
    mutationFn: (tagId: string) =>
      apiPost(`/videos/${video.id}/tags`, { tagId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['video', video.id] })
      toast.success('Tag added')
    },
  })

  const removeTagMutation = useMutation({
    mutationFn: (tagId: string) =>
      apiDelete(`/videos/${video.id}/tags/${tagId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['video', video.id] })
      toast.success('Tag removed')
    },
  })

  const createTagMutation = useMutation({
    mutationFn: (name: string) =>
      apiPost<{ success: boolean; data: AllTag }>('/tags', { name }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tags'] })
      if (data.data) {
        addTagMutation.mutate(data.data.id)
      }
      setNewTagName('')
    },
    onError: () => toast.error('Failed to create tag'),
  })

  const existingTagIds = new Set(video.tags.map((t) => t.id))
  const availableTags = allTags.filter((t) => !existingTagIds.has(t.id))

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-1">
          <Tag className="h-3.5 w-3.5" /> Tags
        </h3>
        <Button variant="ghost" size="sm" onClick={() => setShowAdd(!showAdd)}>
          <Plus className="mr-1 h-3 w-3" /> Add
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {video.tags.map((tag) => (
          <Badge
            key={tag.id}
            variant="secondary"
            className="gap-1 pr-1"
            style={{ borderLeft: `3px solid ${tag.color}` }}
          >
            {tag.name}
            <button
              className="ml-0.5 rounded-full p-0.5 hover:bg-slate-300 dark:hover:bg-slate-600"
              onClick={() => removeTagMutation.mutate(tag.id)}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </Badge>
        ))}
        {video.tags.length === 0 && (
          <span className="text-xs text-slate-400 italic">No tags</span>
        )}
      </div>
      {showAdd && (
        <div className="mt-2 space-y-2 rounded-md border border-slate-200 p-2 dark:border-slate-700">
          {availableTags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {availableTags.map((tag) => (
                <button
                  key={tag.id}
                  className="rounded-full border border-slate-200 px-2 py-0.5 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                  onClick={() => addTagMutation.mutate(tag.id)}
                  style={{ borderLeftColor: tag.color, borderLeftWidth: 3 }}
                >
                  {tag.name}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-1">
            <Input
              placeholder="New tag name..."
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              className="h-7 text-xs"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newTagName.trim()) {
                  createTagMutation.mutate(newTagName.trim())
                }
              }}
            />
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={!newTagName.trim() || createTagMutation.isPending}
              onClick={() => {
                if (newTagName.trim()) createTagMutation.mutate(newTagName.trim())
              }}
            >
              Create
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// Transcript Panel
function TranscriptPanel({
  segments,
  currentTime,
  onSeek,
}: {
  segments: TranscriptSegment[]
  currentTime: number
  onSeek: (time: number) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLButtonElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  const activeIndex = segments.findIndex(
    (s) => currentTime >= s.startTime && currentTime < s.endTime
  )

  useEffect(() => {
    if (autoScroll && activeRef.current && containerRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [activeIndex, autoScroll])

  if (segments.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-slate-400">
        <p className="text-sm">No transcript available</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2 dark:border-slate-700">
        <h3 className="text-sm font-semibold">Transcript</h3>
        <label className="flex items-center gap-1.5 text-xs text-slate-500">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            className="rounded"
          />
          Auto-scroll
        </label>
      </div>
      <ScrollArea ref={containerRef} className="flex-1 p-2">
        <div className="space-y-0.5">
          {segments.map((segment, i) => {
            const isActive = i === activeIndex
            return (
              <button
                key={segment.id}
                ref={isActive ? activeRef : undefined}
                className={`w-full rounded px-2 py-1.5 text-left text-sm transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-900 dark:bg-blue-950 dark:text-blue-100'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
                onClick={() => onSeek(segment.startTime)}
              >
                <span
                  className={`mr-2 inline-block w-12 text-right font-mono text-xs ${
                    isActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'
                  }`}
                >
                  {formatTime(segment.startTime)}
                </span>
                <span className="text-slate-700 dark:text-slate-300">{segment.text}</span>
              </button>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}

// Delete Confirmation Dialog
function DeleteDialog({
  open,
  onClose,
  onConfirm,
  isPending,
  videoTitle,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  isPending: boolean
  videoTitle: string
}) {
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogHeader>
        <DialogTitle>Delete Video</DialogTitle>
        <DialogDescription>
          Are you sure you want to delete &quot;{videoTitle}&quot;? This will permanently
          remove the video, transcript, tags, and all associated data. This action cannot
          be undone.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
        <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
          {isPending ? (
            <>
              <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Deleting...
            </>
          ) : (
            <>
              <Trash2 className="mr-1 h-3 w-3" /> Delete
            </>
          )}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}

// Main Video Detail Page
export function VideoDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const videoRef = useRef<HTMLVideoElement>(null!)
  const [currentTime, setCurrentTime] = useState(0)
  const [playerMode, setPlayerMode] = useState<'local' | 'youtube'>('local')
  const [deleteOpen, setDeleteOpen] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['video', id],
    queryFn: () => apiGet<{ success: boolean; data: VideoDetail }>(`/videos/${id}`),
    enabled: !!id,
  })

  const deleteMutation = useMutation({
    mutationFn: () => apiDelete(`/videos/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['videos'] })
      toast.success('Video deleted')
      navigate('/')
    },
    onError: () => toast.error('Failed to delete video'),
  })

  const handleSeek = useCallback(
    (time: number) => {
      if (videoRef.current) {
        videoRef.current.currentTime = time
        videoRef.current.play()
      }
      setCurrentTime(time)
    },
    []
  )

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    )
  }

  if (error || !data?.data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-slate-500">Video not found</p>
        <Button variant="outline" onClick={() => navigate('/')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Library
        </Button>
      </div>
    )
  }

  const video = data.data
  const chapters = video.chapters || []

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2 dark:border-slate-700">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold">{video.title}</h1>
            <p className="text-xs text-slate-500">{video.channelName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-md border border-slate-200 p-0.5 dark:border-slate-700">
            <Button
              variant={playerMode === 'local' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setPlayerMode('local')}
            >
              <Monitor className="mr-1 h-3 w-3" /> Local
            </Button>
            <Button
              variant={playerMode === 'youtube' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setPlayerMode('youtube')}
            >
              <Youtube className="mr-1 h-3 w-3" /> YouTube
            </Button>
          </div>
          <a
            href={video.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-400 hover:text-slate-600"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
          <Button
            variant="ghost"
            size="sm"
            className="text-red-500 hover:text-red-600"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content: split layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel: Player + Summary + Tags */}
        <div className="flex w-1/2 flex-col overflow-y-auto border-r border-slate-200 dark:border-slate-700">
          <div className="p-4 space-y-4">
            <VideoPlayer
              video={video}
              playerMode={playerMode}
              onTimeUpdate={setCurrentTime}
              videoRef={videoRef}
            />

            {/* Video metadata */}
            <div className="flex items-center gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDuration(video.duration)}
              </span>
              {video.publishedAt && (
                <span>
                  Published{' '}
                  {new Date(video.publishedAt).toLocaleDateString()}
                </span>
              )}
            </div>

            <Separator />

            <SummaryPanel video={video} />

            <Separator />

            <TagEditor video={video} />

            {/* Chapters */}
            {chapters.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Chapters</h3>
                  <div className="space-y-1">
                    {chapters.map((ch) => (
                      <button
                        key={ch.id}
                        className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50"
                        onClick={() => handleSeek(ch.startTime)}
                      >
                        <span className="font-mono text-xs text-slate-400 w-12 text-right">
                          {formatTime(ch.startTime)}
                        </span>
                        <span className="text-slate-700 dark:text-slate-300">{ch.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right panel: Transcript */}
        <div className="flex w-1/2 flex-col">
          <TranscriptPanel
            segments={video.segments}
            currentTime={currentTime}
            onSeek={handleSeek}
          />
        </div>
      </div>

      {/* Delete dialog */}
      <DeleteDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => deleteMutation.mutate()}
        isPending={deleteMutation.isPending}
        videoTitle={video.title}
      />
    </div>
  )
}
