import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Pencil, Save, X } from 'lucide-react'

interface SummaryPanelProps {
  summary: string | null
  onSave: (summary: string) => void
  saving?: boolean
}

export function SummaryPanel({ summary, onSave, saving }: SummaryPanelProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(summary ?? '')

  const handleEdit = () => {
    setDraft(summary ?? '')
    setEditing(true)
  }

  const handleCancel = () => {
    setEditing(false)
    setDraft(summary ?? '')
  }

  const handleSave = () => {
    onSave(draft)
    setEditing(false)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Summary</h3>
        {!editing ? (
          <Button variant="ghost" size="sm" onClick={handleEdit}>
            <Pencil className="w-3.5 h-3.5 mr-1" />
            Edit
          </Button>
        ) : (
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={handleCancel}>
              <X className="w-3.5 h-3.5 mr-1" />
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              <Save className="w-3.5 h-3.5 mr-1" />
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        )}
      </div>

      {editing ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="w-full min-h-[120px] p-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      ) : (
        <div className="prose prose-sm dark:prose-invert max-w-none">
          {summary ? (
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              {summary}
            </div>
          ) : (
            <p className="text-sm text-slate-400 italic">No summary available.</p>
          )}
        </div>
      )}
    </div>
  )
}
