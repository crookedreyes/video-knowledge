import { useParams } from 'react-router-dom'

export function VideoDetailPage() {
  const { id } = useParams()

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-4">Video Detail</h1>
      <p className="text-slate-600 dark:text-slate-400">Video {id} - coming soon</p>
    </div>
  )
}
