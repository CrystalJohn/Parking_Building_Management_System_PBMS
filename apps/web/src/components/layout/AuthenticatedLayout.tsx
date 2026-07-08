import type { ReactNode } from 'react'
import AppHeader from './AppHeader'
import AppSidebar from './AppSidebar'
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
  return (
    <SidebarProvider>
      <ManagerOperationsProvider>
        <AppSidebar />
        <SidebarInset className="min-h-svh bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-slate-100">
          <AppHeader />
          <div className="flex-1 p-4 sm:p-5 lg:p-6">
            <div className="mx-auto w-full max-w-[1500px]">{children}</div>
          </div>
        </SidebarInset>
      </ManagerOperationsProvider>
    </SidebarProvider>
  )
}
