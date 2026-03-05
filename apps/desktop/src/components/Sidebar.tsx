import { Link, useLocation } from 'react-router-dom'
import { Home, Settings as SettingsIcon } from 'lucide-react'
import clsx from 'clsx'

export function Sidebar() {
  const location = useLocation()

  const navigationItems = [
    { label: 'Dashboard', path: '/', icon: Home },
    { label: 'Settings', path: '/settings', icon: SettingsIcon },
  ]

  return (
    <div className="w-64 bg-slate-900 text-white flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-slate-700">
        <h1 className="text-2xl font-bold text-white">Vide Know</h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-2">
        {navigationItems.map(({ label, path, icon: Icon }) => {
          const isActive = location.pathname === path
          return (
            <Link
              key={path}
              to={path}
              className={clsx(
                'flex items-center gap-3 px-4 py-2 rounded-lg transition-colors',
                isActive
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-200 hover:bg-slate-800'
              )}
            >
              <Icon size={20} />
              <span>{label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-slate-700">
        <p className="text-xs text-slate-400">v0.0.1</p>
      </div>
    </div>
  )
}
