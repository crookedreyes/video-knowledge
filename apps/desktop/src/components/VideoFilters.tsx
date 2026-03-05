import { Search, X } from 'lucide-react'
import type { SortOption } from '@/hooks/useVideos'

interface VideoFiltersProps {
  search: string
  sort: SortOption
  selectedTags: string[]
  allTags: string[]
  onSearchChange: (value: string) => void
  onSortChange: (value: SortOption) => void
  onTagToggle: (tag: string) => void
  onClearFilters: () => void
}

export function VideoFilters({
  search,
  sort,
  selectedTags,
  allTags,
  onSearchChange,
  onSortChange,
  onTagToggle,
  onClearFilters,
}: VideoFiltersProps) {
  const hasActiveFilters = search || selectedTags.length > 0 || sort !== 'newest'

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
        {/* Search input */}
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search videos..."
            className="h-9 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Tag filter dropdown */}
        {allTags.length > 0 && (
          <div className="relative">
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) onTagToggle(e.target.value)
              }}
              className="h-9 rounded-md border border-slate-200 bg-white px-3 pr-8 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            >
              <option value="">Filter by tag...</option>
              {allTags.map((tag) => (
                <option key={tag} value={tag}>
                  {selectedTags.includes(tag) ? `\u2713 ${tag}` : tag}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Sort dropdown */}
        <select
          value={sort}
          onChange={(e) => onSortChange(e.target.value as SortOption)}
          className="h-9 rounded-md border border-slate-200 bg-white px-3 pr-8 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="title-az">Title A-Z</option>
          <option value="duration">Longest first</option>
        </select>
      </div>

      {/* Active tag chips + clear */}
      {(selectedTags.length > 0 || hasActiveFilters) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {selectedTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => onTagToggle(tag)}
              className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-900/60"
            >
              {tag}
              <X className="h-3 w-3" />
            </button>
          ))}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={onClearFilters}
              className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            >
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  )
}
