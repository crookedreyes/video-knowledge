import { useMutation } from '@tanstack/react-query'
import { apiPost, type ApiResponse } from '@/lib/api'

export interface SearchResult {
  videoId: string
  youtubeId: string
  title: string
  channelName: string | null
  thumbnailPath: string | null
  excerpt: string
  startTime: number
  score: number
}

interface SearchResponse {
  results: SearchResult[]
}

export function useSearch() {
  return useMutation({
    mutationFn: (query: string) =>
      apiPost<ApiResponse<SearchResponse>>('/search', { query, limit: 20 }).then(
        (r) => r.data?.results ?? []
      ),
  })
}
