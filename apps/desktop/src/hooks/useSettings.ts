import { useEffect } from 'react'
import { useSettingsStore } from '@/stores/settingsStore'

/**
 * Hook for reading and updating settings
 * Automatically fetches settings on first use
 */
export function useSettings() {
  const { settings, loading, error, fetchSettings, updateSettings, setTheme } = useSettingsStore()

  useEffect(() => {
    // Fetch settings on mount if not already loaded
    if (!settings && !loading) {
      fetchSettings()
    }
  }, [])

  return {
    settings,
    loading,
    error,
    updateSettings,
    setTheme,
  }
}
