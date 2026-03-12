import { Link, useRouterState } from '@tanstack/react-router'
import {
  LayoutDashboard,
  FolderKanban,
  Bot,
  GitBranch,
  BarChart2,
  Wrench,
  Clock,
  Settings,
  Users,
  Activity,
  Layers,
  Tag,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/store/ui'

type NavItem = {
  label: string
  to: string
  icon: React.ComponentType<{ className?: string }>
}

type NavGroup = {
  group: string
  short: string   // collapsed label
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    group: 'workspace',
    short: 'ws',
    items: [
      { label: 'boards',    to: '/boards',       icon: LayoutDashboard },
      { label: 'activity',  to: '/activity',    icon: Activity },
      { label: 'groups',    to: '/board-groups', icon: Layers },
      { label: 'people',    to: '/people',       icon: Users },
      { label: 'projects',  to: '/projects',     icon: FolderKanban },
    ],
  },
  {
    group: 'agents',
    short: 'ag',
    items: [
      { label: 'agents',    to: '/agents',    icon: Bot },
      { label: 'flow',      to: '/flow',      icon: GitBranch },
      { label: 'skills',    to: '/skills',    icon: Wrench },
    ],
  },
  {
    group: 'observe',
    short: 'ob',
    items: [
      { label: 'analytics', to: '/analytics', icon: BarChart2 },
      { label: 'cron',      to: '/cron',      icon: Clock },
    ],
  },
  {
    group: 'system',
    short: 'sy',
    items: [
      { label: 'tags',      to: '/tags',      icon: Tag },
      { label: 'settings',  to: '/settings',  icon: Settings },
    ],
  },
]

export function Sidebar() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed)
  const routerState = useRouterState()
  const pathname = routerState.location.pathname

  return (
    <aside
      className={cn(
        'flex flex-col bg-[#0d1117] border-r border-[#21262d] h-screen transition-all duration-200 overflow-hidden flex-shrink-0',
        collapsed ? 'w-12' : 'w-48',
      )}
    >
      {/* Header — matches topbar h-[72px] */}
      <div className={cn(
        'h-[72px] border-b border-[#21262d] flex-shrink-0 select-none',
        collapsed ? 'flex items-center justify-center' : 'flex flex-col items-start justify-center px-3',
      )}>
        <span className="font-mono font-bold text-[13px] tracking-[0.3em] text-[#58a6ff]">OC</span>
        {!collapsed && (
          <span className="font-mono text-[9px] text-[#6e7681] mt-0.5">v1.0.0</span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2">
        {collapsed ? (
          // Collapsed: icons only, centered
          <ul className="flex flex-col">
            {NAV_GROUPS.flatMap(({ items }) =>
              items.map(({ to, label, icon: Icon }) => {
                const active = pathname === to || pathname.startsWith(to + '/')
                return (
                  <li key={to}>
                    <Link
                      to={to}
                      title={label}
                      className={cn(
                        'flex items-center justify-center py-2 transition-colors',
                        active ? 'text-[#58a6ff]' : 'text-[#6e7681] hover:text-[#8b949e]',
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </Link>
                  </li>
                )
              })
            )}
          </ul>
        ) : (
          // Expanded: grouped nav with left border active state
          <ul className="flex flex-col">
            {NAV_GROUPS.map(({ group, items }) => (
              <li key={group}>
                {/* Group label */}
                <div className="px-3 py-1 mt-3">
                  <span className="font-mono text-[10px] tracking-[0.12em] text-[#6e7681] uppercase select-none">
                    {group}
                  </span>
                </div>
                {/* Nav items */}
                <ul>
                  {items.map(({ label, to, icon: Icon }) => {
                    const active = pathname === to || pathname.startsWith(to + '/')
                    return (
                      <li key={to}>
                        <Link
                          to={to}
                          className={cn(
                            'flex items-center gap-2.5 px-3 py-[6px] font-mono text-[12px] transition-colors border-l-[3px]',
                            active
                              ? 'border-[#58a6ff] bg-[#161b22] text-[#e6edf3]'
                              : 'border-transparent text-[#8b949e] hover:bg-[#161b22] hover:text-[#c9d1d9]',
                          )}
                        >
                          <Icon className={cn(
                            'h-3 w-3 flex-shrink-0',
                            active ? 'text-[#58a6ff]' : '',
                          )} />
                          <span>{label}</span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </nav>
    </aside>
  )
}
