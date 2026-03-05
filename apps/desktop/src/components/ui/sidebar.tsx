import * as React from 'react'
import { cn } from '@/lib/utils'

// Sidebar context
interface SidebarContextType {
  expanded: boolean
  setExpanded: (expanded: boolean) => void
}

const SidebarContext = React.createContext<SidebarContextType | undefined>(undefined)

function useSidebarContext() {
  const context = React.useContext(SidebarContext)
  if (!context) {
    throw new Error('Sidebar components must be used within Sidebar')
  }
  return context
}

// Main Sidebar container
interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {
  defaultExpanded?: boolean
}

const Sidebar = React.forwardRef<HTMLDivElement, SidebarProps>(
  ({ className, defaultExpanded = true, ...props }, ref) => {
    const [expanded, setExpanded] = React.useState(defaultExpanded)

    return (
      <SidebarContext.Provider value={{ expanded, setExpanded }}>
        <div
          ref={ref}
          className={cn(
            'flex flex-col h-screen bg-slate-900 text-slate-50 transition-all duration-300',
            expanded ? 'w-64' : 'w-16',
            className
          )}
          {...props}
        />
      </SidebarContext.Provider>
    )
  }
)
Sidebar.displayName = 'Sidebar'

// Sidebar Header
const SidebarHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex items-center justify-between p-4 border-b border-slate-700', className)}
    {...props}
  />
))
SidebarHeader.displayName = 'SidebarHeader'

// Sidebar Content
const SidebarContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex-1 overflow-y-auto py-4 px-2', className)}
    {...props}
  />
))
SidebarContent.displayName = 'SidebarContent'

// Sidebar Footer
const SidebarFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('p-4 border-t border-slate-700', className)}
    {...props}
  />
))
SidebarFooter.displayName = 'SidebarFooter'

// Sidebar Menu
const SidebarMenu = React.forwardRef<
  HTMLUListElement,
  React.HTMLAttributes<HTMLUListElement>
>(({ className, ...props }, ref) => (
  <ul ref={ref} className={cn('space-y-2', className)} {...props} />
))
SidebarMenu.displayName = 'SidebarMenu'

// Sidebar Menu Item
interface SidebarMenuItemProps extends React.LiHTMLAttributes<HTMLLIElement> {
  asChild?: boolean
}

const SidebarMenuItem = React.forwardRef<HTMLLIElement, SidebarMenuItemProps>(
  ({ className, ...props }, ref) => (
    <li ref={ref} className={cn('', className)} {...props} />
  )
)
SidebarMenuItem.displayName = 'SidebarMenuItem'

// Sidebar Menu Button
interface SidebarMenuButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isActive?: boolean
  icon?: React.ReactNode
}

const SidebarMenuButton = React.forwardRef<HTMLButtonElement, SidebarMenuButtonProps>(
  ({ className, isActive, icon, children, ...props }, ref) => {
    const { expanded } = useSidebarContext()

    return (
      <button
        ref={ref}
        className={cn(
          'w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-sm font-medium',
          isActive
            ? 'bg-slate-700 text-slate-50'
            : 'text-slate-400 hover:bg-slate-800 hover:text-slate-50',
          className
        )}
        {...props}
      >
        {icon && <span className="flex-shrink-0 w-5 h-5">{icon}</span>}
        {expanded && <span className="flex-1 text-left">{children}</span>}
      </button>
    )
  }
)
SidebarMenuButton.displayName = 'SidebarMenuButton'

// Sidebar Toggle Button
const SidebarToggle = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className, ...props }, ref) => {
    const { expanded, setExpanded } = useSidebarContext()

    return (
      <button
        ref={ref}
        onClick={() => setExpanded(!expanded)}
        className={cn(
          'p-2 rounded-md hover:bg-slate-800 transition-colors',
          className
        )}
        {...props}
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d={expanded ? 'M15 19l-7-7 7-7' : 'M9 5l7 7-7 7'}
          />
        </svg>
      </button>
    )
  }
)
SidebarToggle.displayName = 'SidebarToggle'

export {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarToggle,
}
