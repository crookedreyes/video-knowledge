import { create } from 'zustand'
import { apiGet, apiPut } from '@/lib/api'

export type Theme = 'light' | 'dark' | 'system'
export type WhisperModel = 'tiny' | 'base' | 'small' | 'medium' | 'large'
export type Provider = 'local' | 'hosted'

export interface LLMSettings {
  lmStudioUrl: string
  apiKey: string
  modelId: string
  provider: Provider
}

export interface TranscriptionSettings {
  modelSize: WhisperModel
  language: string
}

export interface DockerSettings {
  chromadbPort: number
  autoStart: boolean
}

export interface Settings {
  theme: Theme
  dataDirectory: string
  llm: LLMSettings
  transcription: TranscriptionSettings
  docker: DockerSettings
}

export interface SettingsStore {
  settings: Settings | null
  loading: boolean
  error: string | null
  fetchSettings: () => Promise<void>
  updateSettings: (settings: Partial<Settings>) => Promise<void>
  setTheme: (theme: Theme) => void
}

const defaultSettings: Settings = {
  theme: 'system',
  dataDirectory: '~/.vide-know',
  llm: {
    lmStudioUrl: 'http://localhost:1234',
    apiKey: '',
    modelId: 'default',
    provider: 'local',
  },
  transcription: {
    modelSize: 'base',
    language: 'en',
  },
  docker: {
    chromadbPort: 8000,
    autoStart: false,
  },
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  settings: null,
  loading: false,
  error: null,

  fetchSettings: async () => {
    set({ loading: true, error: null })
    try {
      const data = await apiGet<Settings>('/settings')
      set({ settings: data, loading: false })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch settings'
      set({ error: message, loading: false, settings: defaultSettings })
    }
  },

  updateSettings: async (newSettings: Partial<Settings>) => {
    set((state) => ({
      settings: state.settings ? { ...state.settings, ...newSettings } : defaultSettings,
    }))
    try {
      const updated = await apiPut<Settings>('/settings', newSettings)
      set({ settings: updated, error: null })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update settings'
      set({ error: message })
    }
  },

  setTheme: (theme: Theme) => {
    set((state) => ({
      settings: state.settings ? { ...state.settings, theme } : { ...defaultSettings, theme },
    }))
  },
}))
