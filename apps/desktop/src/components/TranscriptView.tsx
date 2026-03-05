import { useState, useRef, useEffect, useCallback } from 'react'
import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Segment {
  id: string
  startTime: number
  endTime: number
  text: string
  segmentIndex: number
}

interface Chapter {
  id: string
  title: string
  startTime: number
  endTime: number
  chapterIndex: number
}

interface TranscriptViewProps {
  segments: Segment[]
  chapters?: Chapter[]
  currentTime: number
  onSeek: (time: number) => void
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function highlightText(text: string, query: string): React.ReactNode {
  if (!query) return text
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`(${escaped})`, 'gi')
  const parts = text.split(regex)
  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className="bg-yellow-300 dark:bg-yellow-700 rounded px-0.5">
        {part}
      </mark>
    ) : (
      part
    )
  )
}

export function TranscriptView({ segments, chapters = [], currentTime, onSeek }: TranscriptViewProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [autoScroll, setAutoScroll] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)
  const activeSegmentRef = useRef<HTMLDivElement>(null)
  const userScrollingRef = useRef(false)

  const activeIndex = segments.findIndex(
    (s) => currentTime >= s.startTime && currentTime < s.endTime
  )

  // Auto-scroll to active segment
  useEffect(() => {
    if (autoScroll && activeSegmentRef.current && containerRef.current) {
      activeSegmentRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    }
  }, [activeIndex, autoScroll])

  // Detect manual scrolling to pause auto-scroll
  const handleScroll = useCallback(() => {
    if (userScrollingRef.current) {
      setAutoScroll(false)
    }
  }, [])

  const handleWheel = useCallback(() => {
    userScrollingRef.current = true
    setTimeout(() => {
      userScrollingRef.current = false
    }, 200)
  }, [])

  const filteredSegments = searchQuery
    ? segments.filter((s) => s.text.toLowerCase().includes(searchQuery.toLowerCase()))
    : segments

  // Build chapter map: startTime -> chapter
  const chapterMap = new Map<number, Chapter>()
  for (const ch of chapters) {
    // Find the first segment that starts at or after chapter start
    const seg = segments.find((s) => s.startTime >= ch.startTime)
    if (seg) chapterMap.set(seg.segmentIndex, ch)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search bar */}
      <div className="flex items-center gap-2 p-3 border-b border-slate-200 dark:border-slate-700">
        <Search className="w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Search transcript..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery('')} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Chapter quick-nav */}
      {chapters.length > 0 && !searchQuery && (
        <div className="flex flex-wrap gap-1 p-2 border-b border-slate-200 dark:border-slate-700">
          {chapters.map((ch) => (
            <Button
              key={ch.id}
              variant="ghost"
              size="sm"
              className="text-xs h-7"
              onClick={() => onSeek(ch.startTime)}
            >
              {formatTime(ch.startTime)} {ch.title}
            </Button>
          ))}
        </div>
      )}

      {/* Auto-scroll toggle */}
      {!autoScroll && (
        <button
          onClick={() => setAutoScroll(true)}
          className="text-xs text-center py-1 text-blue-600 dark:text-blue-400 hover:underline border-b border-slate-200 dark:border-slate-700"
        >
          Resume auto-scroll
        </button>
      )}

      {/* Segments */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto"
        onScroll={handleScroll}
        onWheel={handleWheel}
      >
        {filteredSegments.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">
            {searchQuery ? 'No matching segments.' : 'No transcript available.'}
          </p>
        ) : (
          filteredSegments.map((segment) => {
            const isActive = segment.segmentIndex === (activeIndex >= 0 ? segments[activeIndex].segmentIndex : -1)
            const chapter = chapterMap.get(segment.segmentIndex)

            return (
              <div key={segment.id}>
                {chapter && !searchQuery && (
                  <div className="px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                    {chapter.title}
                  </div>
                )}
                <div
                  ref={isActive ? activeSegmentRef : undefined}
                  className={`flex gap-3 px-3 py-2 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${
                    isActive ? 'bg-blue-50 dark:bg-blue-950 border-l-2 border-blue-500' : ''
                  }`}
                  onClick={() => onSeek(segment.startTime)}
                >
                  <span className="text-xs font-mono text-blue-600 dark:text-blue-400 whitespace-nowrap pt-0.5 min-w-[3rem]">
                    {formatTime(segment.startTime)}
                  </span>
                  <span className="text-sm leading-relaxed">
                    {highlightText(segment.text, searchQuery)}
                  </span>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
