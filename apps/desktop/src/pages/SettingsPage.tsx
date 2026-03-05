import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSettings } from '@/hooks/useSettings'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'

type TabType = 'general' | 'llm' | 'transcription' | 'docker'

export function SettingsPage() {
  const { tab = 'general' } = useParams()
  const navigate = useNavigate()
  const { settings, loading, error, updateSettings, setTheme } = useSettings()
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState<Record<string, any>>(settings || {})

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center h-full">
        <Loader2 className="animate-spin w-8 h-8" />
      </div>
    )
  }

  if (!settings) {
    return (
      <div className="p-8">
        <p className="text-red-600">Failed to load settings: {error}</p>
      </div>
    )
  }

  const tabs: { id: TabType; label: string }[] = [
    { id: 'general', label: 'General' },
    { id: 'llm', label: 'LLM / Embeddings' },
    { id: 'transcription', label: 'Transcription' },
    { id: 'docker', label: 'Docker / ChromaDB' },
  ]

  const currentTab = (tab as TabType) || 'general'

  const handleThemeChange = (theme: 'light' | 'dark' | 'system') => {
    setTheme(theme)
    updateSettings({ theme })
  }

  const handleInputChange = (field: string, value: unknown) => {
    setFormData((prev) => {
      const keys = field.split('.')
      let obj = { ...prev }
      let current = obj
      for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i]
        current[key] = { ...current[key] }
        current = current[key]
      }
      current[keys[keys.length - 1]] = value
      return obj
    })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateSettings(formData)
    } catch {
      // Error is handled by the store
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex h-full">
      {/* Tabs navigation */}
      <div className="w-48 border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
        <div className="p-4 space-y-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => navigate(`/settings/${t.id}`)}
              className={`w-full text-left px-4 py-2 rounded-md transition-colors ${
                currentTab === t.id
                  ? 'bg-slate-200 dark:bg-slate-800 text-slate-950 dark:text-slate-50 font-medium'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-2xl p-8 space-y-6">
          {currentTab === 'general' && (
            <GeneralTab settings={settings} onThemeChange={handleThemeChange} />
          )}
          {currentTab === 'llm' && (
            <LLMTab
              formData={formData}
              onInputChange={handleInputChange}
            />
          )}
          {currentTab === 'transcription' && (
            <TranscriptionTab
              formData={formData}
              onInputChange={handleInputChange}
            />
          )}
          {currentTab === 'docker' && (
            <DockerTab
              formData={formData}
              onInputChange={handleInputChange}
            />
          )}

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-200 dark:border-slate-700">
            <Button
              onClick={handleSave}
              disabled={saving}
              variant="default"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function GeneralTab({
  settings,
  onThemeChange,
}: {
  settings: any
  onThemeChange: (theme: 'light' | 'dark' | 'system') => void
}) {
  return (
    <>
      <div>
        <h2 className="text-2xl font-bold mb-6">General Settings</h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Data Directory</CardTitle>
          <CardDescription>Location where video data is stored</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-slate-100 dark:bg-slate-800 px-4 py-3 rounded-md font-mono text-sm">
            {settings.dataDirectory}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Theme</CardTitle>
          <CardDescription>Choose your preferred color theme</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            {(['light', 'dark', 'system'] as const).map((theme) => (
              <button
                key={theme}
                onClick={() => onThemeChange(theme)}
                className={`px-6 py-2 rounded-md font-medium transition-colors capitalize ${
                  settings.theme === theme
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-950 dark:text-slate-50 hover:bg-slate-300 dark:hover:bg-slate-600'
                }`}
              >
                {theme}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </>
  )
}

function LLMTab({
  formData,
  onInputChange,
}: {
  formData: any
  onInputChange: (field: string, value: unknown) => void
}) {
  const models = ['default', 'gpt-4', 'gpt-3.5-turbo', 'claude-2']

  return (
    <>
      <div>
        <h2 className="text-2xl font-bold mb-6">LLM / Embeddings</h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>LM Studio Configuration</CardTitle>
          <CardDescription>Configure local LLM server settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">LM Studio URL</label>
            <input
              type="text"
              value={formData.llm?.lmStudioUrl || ''}
              onChange={(e) => onInputChange('llm.lmStudioUrl', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800"
              placeholder="http://localhost:1234"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">API Key</label>
            <input
              type="password"
              value={formData.llm?.apiKey || ''}
              onChange={(e) => onInputChange('llm.apiKey', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800"
              placeholder="Leave empty if not required"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Model</label>
            <select
              value={formData.llm?.modelId || 'default'}
              onChange={(e) => onInputChange('llm.modelId', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800"
            >
              {models.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Provider</label>
            <div className="flex gap-4">
              {(['local', 'hosted'] as const).map((provider) => (
                <label key={provider} className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={formData.llm?.provider === provider}
                    onChange={() => onInputChange('llm.provider', provider)}
                    className="w-4 h-4"
                  />
                  <span className="capitalize">{provider}</span>
                </label>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  )
}

function TranscriptionTab({
  formData,
  onInputChange,
}: {
  formData: any
  onInputChange: (field: string, value: unknown) => void
}) {
  const modelSizes: Array<'tiny' | 'base' | 'small' | 'medium' | 'large'> = [
    'tiny',
    'base',
    'small',
    'medium',
    'large',
  ]
  const languages = ['en', 'es', 'fr', 'de', 'zh', 'ja', 'ko']

  return (
    <>
      <div>
        <h2 className="text-2xl font-bold mb-6">Transcription</h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Whisper Configuration</CardTitle>
          <CardDescription>Configure speech-to-text settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Model Size</label>
            <select
              value={formData.transcription?.modelSize || 'base'}
              onChange={(e) => onInputChange('transcription.modelSize', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800"
            >
              {modelSizes.map((size) => (
                <option key={size} value={size}>
                  {size.charAt(0).toUpperCase() + size.slice(1)}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Larger models are more accurate but slower
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Language</label>
            <select
              value={formData.transcription?.language || 'en'}
              onChange={(e) => onInputChange('transcription.language', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800"
            >
              {languages.map((lang) => (
                <option key={lang} value={lang}>
                  {lang.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>
    </>
  )
}

function DockerTab({
  formData,
  onInputChange,
}: {
  formData: any
  onInputChange: (field: string, value: unknown) => void
}) {
  return (
    <>
      <div>
        <h2 className="text-2xl font-bold mb-6">Docker / ChromaDB</h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>ChromaDB Status</CardTitle>
          <CardDescription>Monitor and control ChromaDB service</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
            <span className="text-sm text-slate-600 dark:text-slate-400">Status indicator</span>
          </div>

          <div className="flex gap-2">
            <Button variant="outline">Start</Button>
            <Button variant="outline">Stop</Button>
            <Button variant="outline">Restart</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Port Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">ChromaDB Port</label>
            <input
              type="number"
              value={formData.docker?.chromadbPort || 8000}
              onChange={(e) => onInputChange('docker.chromadbPort', parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800"
              placeholder="8000"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="autoStart"
              checked={formData.docker?.autoStart || false}
              onChange={(e) => onInputChange('docker.autoStart', e.target.checked)}
              className="w-4 h-4"
            />
            <label htmlFor="autoStart" className="text-sm font-medium">
              Auto-start on app launch
            </label>
          </div>
        </CardContent>
      </Card>
    </>
  )
}
