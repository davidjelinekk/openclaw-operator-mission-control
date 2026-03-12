import { createRootRoute, Outlet, redirect, useRouterState, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { Sidebar } from '@/components/organisms/Sidebar'
import { Topbar } from '@/components/organisms/Topbar'
import { useMe } from '@/hooks/api/auth'
import { useAuthStore } from '@/store/auth'

export const Route = createRootRoute({
  beforeLoad: ({ location }) => {
    if (location.pathname === '/login') return
    const token = useAuthStore.getState().token
    if (!token) {
      throw redirect({ to: '/login' })
    }
  },
  component: RootLayout,
})

function RootLayout() {
  const { location } = useRouterState()
  if (location.pathname === '/login') {
    return <Outlet />
  }
  return <MainLayout />
}

// Separate component so hooks are always called unconditionally
function MainLayout() {
  const navigate = useNavigate()
  const { data: me, isError, isLoading } = useMe()

  // Redirect to login if session expired / token became invalid
  useEffect(() => {
    if (!isLoading && isError) {
      useAuthStore.getState().clear()
      navigate({ to: '/login' })
    }
  }, [isLoading, isError, navigate])

  if (isLoading || isError || !me) {
    return <div className="min-h-screen bg-[#0d1117]" />
  }

  return (
    <div className="flex h-screen bg-[#0d1117] overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <Topbar user={me} />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
