import { useState, useEffect, useRef, type FormEvent, type KeyboardEvent } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Search, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useSearch, type SearchResult } from '@/hooks/useSearch'

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function getThumbnailUrl(result: SearchResult): string {
  if (result.thumbnailPath) return result.thumbnailPath
  return `https://img.youtube.com/vi/${result.youtubeId}/mqdefault.jpg`
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <span>{text}</span>

  const words = query.trim().split(/\s+/).filter(Boolean)
  const pattern = new RegExp(
    `(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
    'gi'
  )

  const parts = text.split(pattern)
  return (
    <span>
      {parts.map((part, i) =>
        pattern.test(part) ? (
          <mark key={i} className="bg-yellow-200 dark:bg-yellow-800 rounded px-0.5">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  )
}

interface SearchResultCardProps {
  result: SearchResult
  query: string
}

function SearchResultCard({ result, query }: SearchResultCardProps) {
  const navigate = useNavigate()

  function handleClick() {
    navigate(`/video/${result.videoId}?t=${Math.floor(result.startTime)}`)
  }

  const relevancePct = Math.round(result.score * 100)

  return (
    <button
      type="button"
      onClick={handleClick}
      className="w-full text-left group rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm transition-shadow hover:shadow-md flex gap-4 items-start"
    >
      {/* Thumbnail */}
      <div className="flex-shrink-0 w-32 aspect-video rounded overflow-hidden bg-slate-100 dark:bg-slate-800">
        <img
          src={getThumbnailUrl(result)}
          alt={result.title}
          className="w-full h-full object-cover transition-transform group-hover:scale-105"
          loading="lazy"
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1">
        <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100 line-clamp-2 leading-snug">
          {result.title}
        </h3>

        {result.channelName && (
          <p className="text-xs text-slate-500 dark:text-slate-400">{result.channelName}</p>
        )}

        <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-3 leading-relaxed">
          <HighlightedText text={result.excerpt} query={query} />
        </p>

        <div className="flex items-center gap-3 pt-1">
          <span className="text-xs font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded">
            {formatTime(result.startTime)}
          </span>

          <div className="flex items-center gap-1.5">
            <div className="w-16 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full"
                style={{ width: `${relevancePct}%` }}
              />
            </div>
            <span className="text-xs text-slate-400 dark:text-slate-500">{relevancePct}%</span>
          </div>
        </div>
      </div>
    </button>
  )
}

function SkeletonCard() {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 flex gap-4 items-start animate-pulse">
      <div className="flex-shrink-0 w-32 aspect-video rounded bg-slate-200 dark:bg-slate-700" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
        <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/4" />
        <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-full" />
        <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-5/6" />
      </div>
    </div>
  )
}

function SearchResults({
  results,
  isLoading,
  query,
  hasSearched,
}: {
  results: SearchResult[]
  isLoading: boolean
  query: string
  hasSearched: boolean
}) {
  if (!hasSearched) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-400 dark:text-slate-500">
        <Search className="w-12 h-12 mb-4 opacity-40" />
        <p className="text-base">Search your video library</p>
        <p className="text-sm mt-1 opacity-70">Enter a query above and press Enter or click Search</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    )
  }

  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-400 dark:text-slate-500">
        <Search className="w-12 h-12 mb-4 opacity-40" />
        <p className="text-base">No matches found for &ldquo;{query}&rdquo;</p>
        <p className="text-sm mt-1 opacity-70">Try different keywords or a broader search</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {results.map((result, i) => (
        <SearchResultCard key={`${result.videoId}-${result.startTime}-${i}`} result={result} query={query} />
      ))}
    </div>
  )
}

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const urlQuery = searchParams.get('q') ?? ''
  const [inputValue, setInputValue] = useState(urlQuery)
  const [hasSearched, setHasSearched] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const didMountSearch = useRef(false)

  const search = useSearch()

  // On mount, trigger search if q param is already in URL
  useEffect(() => {
    if (urlQuery && !didMountSearch.current) {
      didMountSearch.current = true
      setHasSearched(true)
      search.mutate(urlQuery)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function submitSearch(q: string) {
    const trimmed = q.trim()
    if (!trimmed) return
    setSearchParams({ q: trimmed }, { replace: true })
    setHasSearched(true)
    search.mutate(trimmed)
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    submitSearch(inputValue)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      submitSearch(inputValue)
    }
  }

  const results = search.data ?? []

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Header + SearchBar */}
      <div className="px-6 pt-8 pb-6 border-b border-slate-200 dark:border-slate-700">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-5">Search</h1>
        <form onSubmit={handleSubmit} className="flex gap-2 max-w-2xl">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search transcripts, topics, concepts…"
              className="pl-10 h-11 text-base"
              autoFocus
            />
          </div>
          <Button type="submit" disabled={search.isPending} className="h-11 px-5">
            {search.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              'Search'
            )}
          </Button>
        </form>
        {hasSearched && !search.isPending && results.length > 0 && (
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            {results.length} result{results.length !== 1 ? 's' : ''} for &ldquo;{urlQuery}&rdquo;
          </p>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 px-6 py-6 max-w-3xl w-full">
        <SearchResults
          results={results}
          isLoading={search.isPending}
          query={urlQuery}
          hasSearched={hasSearched}
        />
      </div>
    </div>
  )
}
