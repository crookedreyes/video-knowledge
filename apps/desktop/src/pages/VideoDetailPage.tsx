import { useParams } from 'react-router-dom'
import { TagEditor } from '@/components/TagEditor'

export function VideoDetailPage() {
  const { id } = useParams()

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-4">Video Detail</h1>
      <p className="text-slate-600 dark:text-slate-400 mb-6">Video {id} - coming soon</p>

      {id && (
        <div className="max-w-lg">
          <h2 className="text-lg font-semibold mb-3">Tags</h2>
          <TagEditor videoId={id} />
        </div>
      )}
    </div>
  )
}
