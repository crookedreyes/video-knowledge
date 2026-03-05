import { create } from 'zustand'

export type IngestionStatus =
  | 'pending'
  | 'downloading'
  | 'transcribing'
  | 'embedding'
  | 'summarizing'
  | 'tagging'
  | 'ready'
  | 'error'

export interface PipelineStep {
  name: string
  completed: boolean
  active: boolean
}

export interface ActiveIngestion {
  id: string
  title: string
  youtubeId: string
  status: IngestionStatus
  currentStep: string | null
  steps: PipelineStep[]
  errorMessage: string | null
  /** Logs accumulated from status polls */
  logs: string[]
}

export interface IngestionStore {
  /** Map of videoId → ingestion state */
  ingestions: Record<string, ActiveIngestion>
  addIngestion: (ingestion: ActiveIngestion) => void
  updateIngestion: (id: string, patch: Partial<ActiveIngestion>) => void
  removeIngestion: (id: string) => void
  appendLog: (id: string, line: string) => void
}

export const useIngestionStore = create<IngestionStore>((set) => ({
  ingestions: {},

  addIngestion: (ingestion) =>
    set((state) => ({
      ingestions: { ...state.ingestions, [ingestion.id]: ingestion },
    })),

  updateIngestion: (id, patch) =>
    set((state) => {
      const existing = state.ingestions[id]
      if (!existing) return state
      return {
        ingestions: { ...state.ingestions, [id]: { ...existing, ...patch } },
      }
    }),

  removeIngestion: (id) =>
    set((state) => {
      const { [id]: _removed, ...rest } = state.ingestions
      return { ingestions: rest }
    }),

  appendLog: (id, line) =>
    set((state) => {
      const existing = state.ingestions[id]
      if (!existing) return state
      return {
        ingestions: {
          ...state.ingestions,
          [id]: { ...existing, logs: [...existing.logs, line] },
        },
      }
    }),
}))
