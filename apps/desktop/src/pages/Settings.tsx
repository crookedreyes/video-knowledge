import { useState, useEffect } from 'react'
import axios from 'axios'

interface SettingsData {
  apiBaseUrl: string
  theme: string
}

export function Settings() {
  const [settings, setSettings] = useState<SettingsData>({
    apiBaseUrl: '',
    theme: 'light',
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<string | null>(null)

  useEffect(() => {
    loadSettings()
  }, [])

  async function loadSettings() {
    try {
      setLoading(true)
      setError(null)
      const response = await axios.get('http://localhost:3001/api/settings')
      setSettings(response.data)
    } catch (err) {
      setError('Failed to load settings')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function handleUpdateSetting(key: string, value: string) {
    try {
      setSaveStatus(null)
      await axios.post(`http://localhost:3001/api/settings/${key}`, { value })
      setSaveStatus(`${key} updated successfully`)
      setTimeout(() => setSaveStatus(null), 3000)
      setSettings((prev) => ({
        ...prev,
        [key]: value,
      }))
    } catch (err) {
      setError(`Failed to update ${key}`)
      console.error(err)
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Settings</h1>
        <div className="text-gray-500">Loading settings...</div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Settings</h1>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded text-red-700">
          {error}
        </div>
      )}

      {saveStatus && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded text-green-700">
          {saveStatus}
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-6 max-w-2xl">
        <form className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              API Base URL
            </label>
            <input
              type="text"
              value={settings.apiBaseUrl}
              onChange={(e) => setSettings((prev) => ({ ...prev, apiBaseUrl: e.target.value }))}
              onBlur={(e) => handleUpdateSetting('apiBaseUrl', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="http://api.example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Theme
            </label>
            <select
              value={settings.theme}
              onChange={(e) => {
                setSettings((prev) => ({ ...prev, theme: e.target.value }))
                handleUpdateSetting('theme', e.target.value)
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="auto">Auto</option>
            </select>
          </div>
        </form>
      </div>
    </div>
  )
}
