import { useLocation, Link } from 'react-router-dom'
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarToggle,
} from '@/components/ui/sidebar'
import { Library, Search, MessageSquare, Tag, Settings, Plus } from 'lucide-react'

export function AppSidebar() {
  const location = useLocation()

  const isActive = (path: string) => location.pathname.startsWith(path)

  const menuItems = [
    { icon: <Library size={20} />, label: 'Library', path: '/' },
    { icon: <Search size={20} />, label: 'Search', path: '/search' },
    { icon: <MessageSquare size={20} />, label: 'Chat', path: '/chat' },
    { icon: <Tag size={20} />, label: 'Tags', path: '/tags' },
  ]

  return (
    <Sidebar className="border-r border-slate-700">
      <SidebarHeader>
        <h1 className="text-lg font-bold">VideóKnow</h1>
        <SidebarToggle />
      </SidebarHeader>

      <SidebarContent>
        <SidebarMenu>
          {menuItems.map((item) => (
            <SidebarMenuItem key={item.path}>
              <Link to={item.path} className="w-full">
                <SidebarMenuButton
                  isActive={isActive(item.path)}
                  icon={item.icon}
                >
                  {item.label}
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter className="space-y-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <Link to="/settings" className="w-full">
              <SidebarMenuButton
                isActive={isActive('/settings')}
                icon={<Settings size={20} />}
              >
                Settings
              </SidebarMenuButton>
            </Link>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton className="bg-slate-700 hover:bg-slate-600 text-slate-50">
              <Plus size={20} />
              <span>Add Video</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
