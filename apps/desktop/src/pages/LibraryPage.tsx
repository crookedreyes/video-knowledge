import { useVideos } from '@/hooks/useVideos'
import { VideoGrid } from '@/components/VideoGrid'
import { VideoFilters } from '@/components/VideoFilters'

export function LibraryPage() {
  const {
    videos,
    isLoading,
    search,
    sort,
    selectedTags,
    allTags,
    setSearch,
    setSort,
    toggleTag,
    clearFilters,
  } = useVideos()

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Library</h1>
      </div>

      <div className="mb-6">
        <VideoFilters
          search={search}
          sort={sort}
          selectedTags={selectedTags}
          allTags={allTags}
          onSearchChange={setSearch}
          onSortChange={setSort}
          onTagToggle={toggleTag}
          onClearFilters={clearFilters}
        />
      </div>

      <VideoGrid
        videos={videos}
        isLoading={isLoading}
        onTagClick={toggleTag}
      />
    </div>
  )
}
