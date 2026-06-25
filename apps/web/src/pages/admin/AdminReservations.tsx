import { Eye } from 'lucide-react'
import { AdminPageHeader, EmptyState, StatCard } from './admin-ui'

export default function AdminReservations() {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Reservations"
        description="Read-only reservation monitoring for admin operations. Driver-owned reservation APIs are not reused for admin actions."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Active reservations"
          value="Unavailable"
          helper="No admin reservation list API yet"
          unavailable
          icon={<Eye className="h-5 w-5" strokeWidth={1.8} />}
        />
        <StatCard
          label="Expired today"
          value="Unavailable"
          helper="Requires reservation audit endpoint"
          unavailable
        />
        <StatCard
          label="Cancelled today"
          value="Unavailable"
          helper="Requires reservation audit endpoint"
          unavailable
        />
        <StatCard
          label="Fulfilled today"
          value="Unavailable"
          helper="Requires reservation audit endpoint"
          unavailable
        />
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-white/10">
          <h2 className="text-base font-black text-slate-950 dark:text-white">
            Reservation directory
          </h2>
          <p className="mt-1 text-sm font-medium text-slate-500 dark:text-slate-400">
            Expected columns: code, driver, plate, vehicle type, slot, status, created time, and valid until.
          </p>
        </div>
        <div className="p-5">
          <EmptyState
            title="No admin reservation data available"
            description="The backend currently exposes reservation list/detail endpoints only for the signed-in driver. This page is ready for a read-only admin reservation endpoint without adding check-in or gate actions."
          />
        </div>
      </section>
    </div>
  )
}
