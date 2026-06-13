import type { ReactNode } from 'react'
import AppHeader from '../ui/AppHeader'

interface Props {
  children: ReactNode
  hideHeader?: boolean
}

/**
 * Layout wrapper for all authenticated pages.
 * Renders the shared header (with logout button) above page content.
 */
export default function AuthenticatedLayout({ children, hideHeader = false }: Props) {
  return (
    <div className="min-h-screen flex flex-col">
      {!hideHeader && <AppHeader />}
      <main className="flex-1">{children}</main>
    </div>
  )
}
