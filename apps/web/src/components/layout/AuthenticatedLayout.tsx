import type { ReactNode } from 'react'
import AppHeader from './AppHeader'
import AppSidebar from './AppSidebar'
import DriverMobileNav from './DriverMobileNav'
import { getUser } from '@/lib/auth'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { ManagerOperationsProvider } from '@/lib/ManagerOperationsContext'

interface Props {
  children: ReactNode
}

/**
 * Layout wrapper for all authenticated pages.
 * Renders the shared shadcn/ui sidebar shell for every signed-in role.
 */
export default function AuthenticatedLayout({ children }: Props) {
  const isDriver = getUser()?.role === 'driver'
  return (
    <SidebarProvider>
      <ManagerOperationsProvider>
        <AppSidebar />
        {isDriver ? <DriverMobileNav /> : null}
        <SidebarInset className="min-h-svh bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-slate-100">
          <AppHeader />
          <div className={isDriver ? 'flex-1 p-4 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:p-5 sm:pb-[calc(5rem+env(safe-area-inset-bottom))] lg:p-6' : 'flex-1 p-4 sm:p-5 lg:p-6'}>
            <div className="mx-auto w-full max-w-[1500px]">{children}</div>
          </div>
        </SidebarInset>
      </ManagerOperationsProvider>
    </SidebarProvider>
  )
}
