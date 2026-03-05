import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Plus, Sparkles } from 'lucide-react'
import { apiGet, apiPost, apiDelete } from '@/lib/api'
import { cn } from '@/lib/utils'

// --- Types ---

interface Tag {
  id: string
  name: string
  color: string
  source?: 'auto' | 'manual'
}

interface TagEditorProps {
  videoId: string
}

// --- Helpers ---

const TAG_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e',
  '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#a855f7',
  '#ec4899', '#f43f5e',
]

function randomColor() {
  return TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)]
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

// --- Component ---

export function TagEditor({ videoId }: TagEditorProps) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const debouncedSearch = useDebounce(search, 250)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // --- Queries ---

  const videoQuery = useQuery({
    queryKey: ['video', videoId],
    queryFn: () => apiGet<{ success: boolean; data: { tags: Tag[] } }>(`/videos/${videoId}`),
    select: (res) => res.data.tags ?? [],
  })

  const allTagsQuery = useQuery({
    queryKey: ['tags'],
    queryFn: () => apiGet<{ success: boolean; data: Tag[] }>('/tags'),
    select: (res) => res.data ?? [],
  })

  const videoTags: Tag[] = videoQuery.data ?? []
  const allTags: Tag[] = allTagsQuery.data ?? []

  const videoTagIds = new Set(videoTags.map((t) => t.id))

  const filtered = allTags.filter(
    (t) =>
      !videoTagIds.has(t.id) &&
      t.name.toLowerCase().includes(debouncedSearch.toLowerCase())
  )

  const exactMatch = allTags.some(
    (t) => t.name.toLowerCase() === debouncedSearch.trim().toLowerCase()
  )

  // --- Mutations ---

  const addTagMutation = useMutation({
    mutationFn: (tagId: string) =>
      apiPost<{ success: boolean; data: Tag }>(`/videos/${videoId}/tags`, { tagId }),
    onMutate: async (tagId) => {
      await queryClient.cancelQueries({ queryKey: ['video', videoId] })
      const prev = queryClient.getQueryData(['video', videoId]) as { success: boolean; data: { tags: Tag[] } } | undefined
      const tag = allTags.find((t) => t.id === tagId)
      if (prev && tag) {
        queryClient.setQueryData(['video', videoId], {
          ...prev,
          data: {
            ...prev.data,
            tags: [...prev.data.tags, { ...tag, source: 'manual' as const }],
          },
        })
      }
      return { prev }
    },
    onError: (_err, _tagId, context) => {
      if (context?.prev) queryClient.setQueryData(['video', videoId], context.prev)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['video', videoId] })
    },
  })

  const removeTagMutation = useMutation({
    mutationFn: (tagId: string) =>
      apiDelete<{ success: boolean }>(`/videos/${videoId}/tags/${tagId}`),
    onMutate: async (tagId) => {
      await queryClient.cancelQueries({ queryKey: ['video', videoId] })
      const prev = queryClient.getQueryData(['video', videoId]) as { success: boolean; data: { tags: Tag[] } } | undefined
      if (prev) {
        queryClient.setQueryData(['video', videoId], {
          ...prev,
          data: {
            ...prev.data,
            tags: prev.data.tags.filter((t: Tag) => t.id !== tagId),
          },
        })
      }
      return { prev }
    },
    onError: (_err, _tagId, context) => {
      if (context?.prev) queryClient.setQueryData(['video', videoId], context.prev)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['video', videoId] })
    },
  })

  const createTagMutation = useMutation({
    mutationFn: async (name: string) => {
      const color = randomColor()
      const res = await apiPost<{ success: boolean; data: Tag }>('/tags', { name, color })
      await apiPost(`/videos/${videoId}/tags`, { tagId: res.data.id })
      return res.data
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['video', videoId] })
      queryClient.invalidateQueries({ queryKey: ['tags'] })
    },
  })

  // --- Handlers ---

  const handleAdd = useCallback(
    (tagId: string) => {
      addTagMutation.mutate(tagId)
      setSearch('')
      setOpen(false)
    },
    [addTagMutation]
  )

  const handleCreate = useCallback(() => {
    const name = search.trim()
    if (!name) return
    createTagMutation.mutate(name)
    setSearch('')
    setOpen(false)
  }, [search, createTagMutation])

  // --- Render ---

  return (
    <div className="space-y-3">
      {/* Current tags */}
      <div className="flex flex-wrap gap-2">
        {videoTags.map((tag) => (
          <span
            key={tag.id}
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium text-white',
            )}
            style={{ backgroundColor: tag.color }}
          >
            {tag.source === 'auto' && (
              <Sparkles className="h-3 w-3 opacity-75" />
            )}
            {tag.name}
            {tag.source === 'auto' && (
              <span className="opacity-75">(auto)</span>
            )}
            <button
              type="button"
              onClick={() => removeTagMutation.mutate(tag.id)}
              className="ml-0.5 rounded-full p-0.5 hover:bg-white/25 transition-colors"
              aria-label={`Remove tag ${tag.name}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {videoTags.length === 0 && (
          <span className="text-sm text-slate-400">No tags yet</span>
        )}
      </div>

      {/* Combobox */}
      <div className="relative">
        <div className="flex items-center gap-2">
          <Plus className="h-4 w-4 text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            placeholder="Add a tag..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
        </div>

        {open && (search.length > 0 || filtered.length > 0) && (
          <div
            ref={dropdownRef}
            className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-auto rounded-md border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800"
          >
            {filtered.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => handleAdd(tag.id)}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: tag.color }}
                />
                {tag.name}
              </button>
            ))}

            {debouncedSearch.trim() && !exactMatch && (
              <button
                type="button"
                onClick={handleCreate}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-blue-600 hover:bg-slate-100 dark:text-blue-400 dark:hover:bg-slate-700"
              >
                <Plus className="h-3 w-3" />
                Create tag: &ldquo;{debouncedSearch.trim()}&rdquo;
              </button>
            )}

            {filtered.length === 0 && (exactMatch || !debouncedSearch.trim()) && (
              <div className="px-3 py-2 text-sm text-slate-400">
                No tags to add
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
