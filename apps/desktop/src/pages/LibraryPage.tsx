import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import {
  Clock,
  Calendar,
  Search,
  SortAsc,
  SortDesc,
  Filter,
  Play,
  AlertCircle,
  Loader2,
} from 'lucide-react'

interface VideoTag {
  id: string
  name: string
  color: string
  source: string
}

interface Video {
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
}

interface Tag {
  id: string
  name: string
  color: string
}

type SortField = 'createdAt' | 'title' | 'duration'
type SortDirection = 'asc' | 'desc'

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, { label: string; className: string }> = {
    ready: { label: 'Ready', className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
    error: { label: 'Error', className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' },
    pending: { label: 'Pending', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' },
    downloading: { label: 'Downloading', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
    transcribing: { label: 'Transcribing', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
    embedding: { label: 'Embedding', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
    summarizing: { label: 'Summarizing', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
    tagging: { label: 'Tagging', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
  }
  const v = variants[status] || { label: status, className: 'bg-slate-100 text-slate-800' }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${v.className}`}>
      {status === 'error' && <AlertCircle className="mr-1 h-3 w-3" />}
      {!['ready', 'error'].includes(status) && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
      {v.label}
    </span>
  )
}

function VideoCard({ video, tags }: { video: Video; tags: VideoTag[] }) {
  const navigate = useNavigate()
  const thumbnailUrl = video.thumbnailPath
    ? `http://localhost:3456/media/thumbnails/${video.thumbnailPath.split('/').pop()}`
    : `https://img.youtube.com/vi/${video.youtubeId}/mqdefault.jpg`

  return (
    <Card
      className="group cursor-pointer overflow-hidden transition-all hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600"
      onClick={() => navigate(`/video/${video.id}`)}
    >
      <div className="relative aspect-video bg-slate-200 dark:bg-slate-800 overflow-hidden">
        <img
          src={thumbnailUrl}
          alt={video.title}
          className="h-full w-full object-cover transition-transform group-hover:scale-105"
          loading="lazy"
        />
        <div className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-xs font-medium text-white">
          {formatDuration(video.duration)}
        </div>
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/20">
          <Play className="h-12 w-12 text-white opacity-0 transition-opacity group-hover:opacity-80" />
        </div>
      </div>
      <div className="p-3">
        <h3 className="line-clamp-2 text-sm font-medium leading-snug">{video.title}</h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{video.channelName}</p>
        <div className="mt-2 flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDuration(video.duration)}
          </span>
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {formatDate(video.createdAt)}
          </span>
        </div>
        <div className="mt-2 flex items-center gap-1">
          <StatusBadge status={video.status} />
        </div>
        {tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {tags.slice(0, 3).map((tag) => (
              <Badge
                key={tag.id}
                variant="secondary"
                className="text-[10px] px-1.5 py-0"
                style={{ borderLeft: `3px solid ${tag.color}` }}
              >
                {tag.name}
              </Badge>
            ))}
            {tags.length > 3 && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                +{tags.length - 3}
              </Badge>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}

export function LibraryPage() {
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<SortField>('createdAt')
  const [sortDir, setSortDir] = useState<SortDirection>('desc')
  const [filterTag, setFilterTag] = useState<string>('')
  const [filterStatus, setFilterStatus] = useState<string>('')

  const { data: videosData, isLoading } = useQuery({
    queryKey: ['videos'],
    queryFn: () => apiGet<{ success: boolean; data: Video[] }>('/videos'),
    refetchInterval: 10000,
  })

  const { data: tagsData } = useQuery({
    queryKey: ['tags'],
    queryFn: () => apiGet<{ success: boolean; data: Tag[] }>('/tags'),
  })

  // For each video, fetch its tags via the detail endpoint (since list doesn't include tags)
  const { data: videoDetailsData } = useQuery({
    queryKey: ['video-details-tags'],
    queryFn: async () => {
      const videos = videosData?.data || []
      const details = await Promise.all(
        videos.map((v) =>
          apiGet<{ success: boolean; data: { tags: VideoTag[] } }>(`/videos/${v.id}`)
            .then((r) => ({ videoId: v.id, tags: r.data?.tags || [] }))
            .catch(() => ({ videoId: v.id, tags: [] as VideoTag[] }))
        )
      )
      return details
    },
    enabled: !!videosData?.data?.length,
  })

  const videoTagsMap = useMemo(() => {
    const map = new Map<string, VideoTag[]>()
    if (videoDetailsData) {
      for (const d of videoDetailsData) {
        map.set(d.videoId, d.tags)
      }
    }
    return map
  }, [videoDetailsData])

  const videos = videosData?.data || []
  const allTags = tagsData?.data || []

  const filteredAndSorted = useMemo(() => {
    let result = [...videos]

    // Search filter
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(
        (v) =>
          v.title.toLowerCase().includes(q) ||
          v.channelName.toLowerCase().includes(q) ||
          v.description?.toLowerCase().includes(q)
      )
    }

    // Status filter
    if (filterStatus) {
      result = result.filter((v) => v.status === filterStatus)
    }

    // Tag filter
    if (filterTag) {
      result = result.filter((v) => {
        const vTags = videoTagsMap.get(v.id) || []
        return vTags.some((t) => t.id === filterTag)
      })
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'title':
          cmp = a.title.localeCompare(b.title)
          break
        case 'duration':
          cmp = a.duration - b.duration
          break
        case 'createdAt':
        default:
          cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          break
      }
      return sortDir === 'desc' ? -cmp : cmp
    })

    return result
  }, [videos, search, sortField, sortDir, filterTag, filterStatus, videoTagsMap])

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Library</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {videos.length} video{videos.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Filter/Sort bar */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search videos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-400" />
          <Select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="ready">Ready</option>
            <option value="pending">Pending</option>
            <option value="error">Error</option>
            <option value="downloading">Downloading</option>
            <option value="transcribing">Transcribing</option>
          </Select>
        </div>

        {allTags.length > 0 && (
          <Select
            value={filterTag}
            onChange={(e) => setFilterTag(e.target.value)}
          >
            <option value="">All tags</option>
            {allTags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </Select>
        )}

        <div className="flex items-center gap-2">
          <Select
            value={sortField}
            onChange={(e) => setSortField(e.target.value as SortField)}
          >
            <option value="createdAt">Date added</option>
            <option value="title">Title</option>
            <option value="duration">Duration</option>
          </Select>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
          >
            {sortDir === 'asc' ? <SortAsc className="h-4 w-4" /> : <SortDesc className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      ) : filteredAndSorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <Search className="mb-4 h-12 w-12" />
          <p className="text-lg font-medium">No videos found</p>
          <p className="text-sm">
            {videos.length === 0
              ? 'Add a video to get started'
              : 'Try adjusting your filters'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredAndSorted.map((video) => (
            <VideoCard
              key={video.id}
              video={video}
              tags={videoTagsMap.get(video.id) || []}
            />
          ))}
        </div>
      )}
    </div>
  )
}
