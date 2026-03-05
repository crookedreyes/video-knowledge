import * as React from 'react'
import {
  Check,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useIngestionStore, type ActiveIngestion } from '@/stores/ingestionStore'
import { retryIngestion } from '@/hooks/useIngestion'

const STEP_LABELS: Record<string, string> = {
  downloading: 'Download',
  transcribing: 'Transcribe',
  embedding: 'Embed',
  summarizing: 'Summarize',
  tagging: 'Tag',
}

const ALL_STEPS = ['downloading', 'transcribing', 'embedding', 'summarizing', 'tagging']

// ---------------------------------------------------------------------------
// Single ingestion row
// ---------------------------------------------------------------------------

interface IngestionRowProps {
  ingestion: ActiveIngestion
  onDismiss: (id: string) => void
}

function IngestionRow({ ingestion, onDismiss }: IngestionRowProps) {
  const [logsOpen, setLogsOpen] = React.useState(false)
  const [retrying, setRetrying] = React.useState(false)

  const isError = ingestion.status === 'error'
  const isDone = ingestion.status === 'ready'

  // Build step list — if server hasn't returned steps yet, use ALL_STEPS as placeholders
  const steps =
    ingestion.steps.length > 0
      ? ingestion.steps
      : ALL_STEPS.map((name) => ({ name, completed: false, active: false }))

  const handleRetry = async () => {
    setRetrying(true)
    try {
      await retryIngestion(ingestion.id)
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div
      className={cn(
        'rounded-lg border p-4 bg-slate-800',
        isError ? 'border-red-700' : isDone ? 'border-green-700' : 'border-slate-700'
      )}
      role="region"
      aria-label={`Ingestion progress for ${ingestion.title}`}
    >
      {/* Row header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          {isError ? (
            <AlertCircle
              size={16}
              className="text-red-400 flex-shrink-0"
              aria-label="Error"
            />
          ) : isDone ? (
            <Check
              size={16}
              className="text-green-400 flex-shrink-0"
              aria-label="Complete"
            />
          ) : (
            <Loader2
              size={16}
              className="text-slate-400 flex-shrink-0 animate-spin"
              aria-label="Processing"
            />
          )}
          <span className="text-sm font-medium truncate" title={ingestion.title}>
            {ingestion.title}
          </span>
        </div>

        <button
          aria-label={`Dismiss ${ingestion.title}`}
          onClick={() => onDismiss(ingestion.id)}
          className="p-1 rounded hover:bg-slate-700 transition-colors flex-shrink-0 text-slate-400 hover:text-slate-200"
        >
          <X size={14} />
        </button>
      </div>

      {/* Step indicators */}
      <ol
        className="flex items-center gap-1 mb-3"
        aria-label="Pipeline steps"
      >
        {steps.map((step, idx) => {
          const label = STEP_LABELS[step.name] ?? step.name
          return (
            <React.Fragment key={step.name}>
              <li className="flex flex-col items-center">
                <div
                  className={cn(
                    'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
                    step.completed
                      ? 'bg-green-600 text-white'
                      : step.active
                      ? 'bg-slate-500 text-white ring-2 ring-slate-300'
                      : 'bg-slate-700 text-slate-400'
                  )}
                  aria-current={step.active ? 'step' : undefined}
                  title={label}
                >
                  {step.completed ? (
                    <Check size={12} aria-label={`${label} complete`} />
                  ) : step.active ? (
                    <Loader2 size={12} className="animate-spin" aria-label={`${label} in progress`} />
                  ) : (
                    <span aria-label={label}>{idx + 1}</span>
                  )}
                </div>
                <span className="text-xs text-slate-400 mt-0.5 hidden sm:block">
                  {label}
                </span>
              </li>
              {idx < steps.length - 1 && (
                <li
                  aria-hidden="true"
                  className={cn(
                    'flex-1 h-px mb-3',
                    step.completed ? 'bg-green-600' : 'bg-slate-700'
                  )}
                />
              )}
            </React.Fragment>
          )
        })}
      </ol>

      {/* Error state */}
      {isError && (
        <div className="flex items-center justify-between gap-2 p-2 rounded bg-red-950/50 border border-red-700 text-red-300 text-xs mb-3">
          <span className="truncate">
            {ingestion.errorMessage ?? 'An unknown error occurred'}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleRetry}
            disabled={retrying}
            aria-label="Retry ingestion"
            className="text-red-300 hover:text-red-100 hover:bg-red-900 flex-shrink-0 h-6 px-2"
          >
            <RefreshCw size={12} className={cn('mr-1', retrying && 'animate-spin')} />
            {retrying ? 'Retrying…' : 'Retry'}
          </Button>
        </div>
      )}

      {/* Collapsible log */}
      {ingestion.logs.length > 0 && (
        <div>
          <button
            aria-expanded={logsOpen}
            aria-controls={`log-${ingestion.id}`}
            onClick={() => setLogsOpen((v) => !v)}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            {logsOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {logsOpen ? 'Hide log' : 'Show log'}
          </button>

          {logsOpen && (
            <pre
              id={`log-${ingestion.id}`}
              className="mt-2 max-h-32 overflow-y-auto text-xs bg-slate-950 text-slate-400 rounded p-2 font-mono"
            >
              {ingestion.logs.join('\n')}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main IngestionProgress panel
// ---------------------------------------------------------------------------

export function IngestionProgress() {
  const { ingestions, removeIngestion } = useIngestionStore()

  const entries = Object.values(ingestions)

  if (entries.length === 0) return null

  return (
    <div
      className="fixed bottom-4 right-4 z-40 w-80 max-h-[70vh] overflow-y-auto flex flex-col gap-2"
      aria-label="Ingestion progress"
      role="status"
    >
      <div className="flex items-center justify-between px-1 mb-1">
        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
          Processing ({entries.length})
        </span>
      </div>

      {entries.map((ingestion) => (
        <IngestionRow
          key={ingestion.id}
          ingestion={ingestion}
          onDismiss={removeIngestion}
        />
      ))}
    </div>
  )
}
