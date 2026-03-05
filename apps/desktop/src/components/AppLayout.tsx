import { Outlet } from 'react-router-dom'
import { AppSidebar } from './AppSidebar'
import { useSettings } from '@/hooks/useSettings'
import { useEffect } from 'react'

export function AppLayout() {
  const { settings } = useSettings()

  useEffect(() => {
    // Apply theme to document
    if (settings) {
      const isDark =
        settings.theme === 'dark' ||
        (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

      const html = document.documentElement
      if (isDark) {
        html.classList.add('dark')
      } else {
        html.classList.remove('dark')
      }
    }
  }, [settings?.theme])

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 text-slate-950 dark:text-slate-50">
      <AppSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar with app title and status indicators */}
        <div className="flex items-center justify-between h-16 px-6 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          <h1 className="text-xl font-semibold">VideóKnow</h1>
          <div className="flex items-center gap-4">
            {/* Status indicators placeholder */}
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              <span className="text-sm text-slate-600 dark:text-slate-400">Ready</span>
            </div>
          </div>
        </div>

        {/* Main content area */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
