import { Film } from 'lucide-react'
import { VideoCard } from '@/components/VideoCard'
import type { Video } from '@/hooks/useVideos'

interface VideoGridProps {
  videos: Video[]
  isLoading: boolean
  onTagClick?: (tag: string) => void
}

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="aspect-video w-full rounded-t-lg bg-slate-200 dark:bg-slate-800" />
      <div className="p-3 space-y-2">
        <div className="h-4 w-3/4 rounded bg-slate-200 dark:bg-slate-800" />
        <div className="h-3 w-1/2 rounded bg-slate-200 dark:bg-slate-800" />
        <div className="h-3 w-full rounded bg-slate-200 dark:bg-slate-800" />
        <div className="flex gap-1">
          <div className="h-5 w-12 rounded-full bg-slate-200 dark:bg-slate-800" />
          <div className="h-5 w-14 rounded-full bg-slate-200 dark:bg-slate-800" />
        </div>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="mb-4 rounded-full bg-slate-100 p-4 dark:bg-slate-800">
        <Film className="h-10 w-10 text-slate-400 dark:text-slate-500" />
      </div>
      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
        No videos yet
      </h3>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        No videos yet — add your first video!
      </p>
    </div>
  )
}

export function VideoGrid({ videos, isLoading, onTagClick }: VideoGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    )
  }

  if (videos.length === 0) {
    return <EmptyState />
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {videos.map((video) => (
        <VideoCard key={video.id} video={video} onTagClick={onTagClick} />
      ))}
    </div>
  )
}
