import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { apiGet, type ApiResponse } from '@/lib/api'
import type { IngestionStatus } from '@/stores/ingestionStore'

export interface Video {
  id: string
  youtubeId: string
  title: string
  description: string | null
  channelName: string | null
  duration: number | null
  status: IngestionStatus
  thumbnailPath: string | null
  summary: string | null
  tags: string[]
  createdAt: string
  errorMessage: string | null
}

export type SortOption = 'newest' | 'oldest' | 'title-az' | 'duration'

export function useVideos() {
  const [searchParams, setSearchParams] = useSearchParams()

  const search = searchParams.get('search') ?? ''
  const sort = (searchParams.get('sort') as SortOption) ?? 'newest'
  const selectedTags = searchParams.getAll('tag')

  const query = useQuery({
    queryKey: ['videos', search, sort, selectedTags],
    queryFn: async () => {
      const res = await apiGet<ApiResponse<Video[]>>('/videos')
      return res.data ?? []
    },
    select: (videos) => {
      let filtered = videos

      if (search) {
        const lower = search.toLowerCase()
        filtered = filtered.filter(
          (v) =>
            v.title.toLowerCase().includes(lower) ||
            v.channelName?.toLowerCase().includes(lower) ||
            v.summary?.toLowerCase().includes(lower)
        )
      }

      if (selectedTags.length > 0) {
        filtered = filtered.filter((v) =>
          selectedTags.every((tag) => v.tags?.includes(tag))
        )
      }

      const sorted = [...filtered]
      switch (sort) {
        case 'newest':
          sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          break
        case 'oldest':
          sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
          break
        case 'title-az':
          sorted.sort((a, b) => a.title.localeCompare(b.title))
          break
        case 'duration':
          sorted.sort((a, b) => (b.duration ?? 0) - (a.duration ?? 0))
          break
      }

      return sorted
    },
  })

  const allTags = query.data
    ? [...new Set(query.data.flatMap((v) => v.tags ?? []))].sort()
    : []

  function setSearch(value: string) {
    setSearchParams((prev) => {
      if (value) prev.set('search', value)
      else prev.delete('search')
      return prev
    }, { replace: true })
  }

  function setSort(value: SortOption) {
    setSearchParams((prev) => {
      prev.set('sort', value)
      return prev
    }, { replace: true })
  }

  function toggleTag(tag: string) {
    setSearchParams((prev) => {
      const current = prev.getAll('tag')
      prev.delete('tag')
      if (current.includes(tag)) {
        current.filter((t) => t !== tag).forEach((t) => prev.append('tag', t))
      } else {
        current.forEach((t) => prev.append('tag', t))
        prev.append('tag', tag)
      }
      return prev
    }, { replace: true })
  }

  function clearFilters() {
    setSearchParams({}, { replace: true })
  }

  return {
    videos: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    search,
    sort,
    selectedTags,
    allTags,
    setSearch,
    setSort,
    toggleTag,
    clearFilters,
  }
}
