import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CircleDollarSign, ParkingCircle, UserCheck, Users } from 'lucide-react'
import api from '../../lib/api'
import { AdminPageHeader, LoadingRows, StatCard } from './admin-ui'

type Role = 'admin' | 'manager' | 'staff' | 'driver'
type SlotStatus = 'available' | 'occupied' | 'reserved' | 'maintenance'

interface UserRecord {
  id: string
  role: Role
  isActive: boolean
}

interface SlotRecord {
  id: number
  status: SlotStatus
}

interface RevenueRow {
  totalRevenue: number
  totalPenalty: number
  totalSessions: number
}

export default function AdminDashboard() {
  const [users, setUsers] = useState<UserRecord[]>([])
  const [slots, setSlots] = useState<SlotRecord[]>([])
  const [revenueRows, setRevenueRows] = useState<RevenueRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadDashboard() {
      setLoading(true)
      setError(null)
      try {
        const today = new Date().toISOString().split('T')[0]
        const [usersResponse, slotsResponse, revenueResponse] = await Promise.all([
          api.get<UserRecord[]>('/users'),
          api.get<SlotRecord[]>('/slots'),
          api.get<RevenueRow[]>('/reports/revenue', {
            params: { period: 'daily', date: today },
          }),
        ])

        if (!cancelled) {
          setUsers(usersResponse.data)
          setSlots(slotsResponse.data)
          setRevenueRows(revenueResponse.data)
        }
      } catch {
        if (!cancelled) {
          setError('Unable to load admin dashboard metrics')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadDashboard()
    return () => {
      cancelled = true
    }
  }, [])

  const metrics = useMemo(() => {
    const totalUsers = users.length
    const activeUsers = users.filter((user) => user.isActive).length
    const occupiedSlots = slots.filter((slot) => slot.status === 'occupied').length
    const todayRevenue = revenueRows.reduce(
      (total, row) => total + Number(row.totalRevenue || 0) + Number(row.totalPenalty || 0),
      0,
    )

    return {
      totalUsers,
      activeUsers,
      occupiedSlots,
      todayRevenue,
    }
  }, [revenueRows, slots, users])

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Admin Dashboard"
        description="Operational overview for account control, slot utilization, and revenue signals available to the admin role."
      />

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-100">
          {error}
        </div>
      ) : null}

      {loading ? (
        <LoadingRows rows={4} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Total users"
            value={metrics.totalUsers}
            helper="From admin user directory"
            icon={<Users className="h-5 w-5" strokeWidth={1.8} />}
          />
          <StatCard
            label="Active users"
            value={metrics.activeUsers}
            helper="Accounts allowed to sign in"
            icon={<UserCheck className="h-5 w-5" strokeWidth={1.8} />}
          />
          <StatCard
            label="Occupied slots"
            value={metrics.occupiedSlots}
            helper="Live slot status snapshot"
            icon={<ParkingCircle className="h-5 w-5" strokeWidth={1.8} />}
          />
          <StatCard
            label="Today revenue"
            value={formatVnd(metrics.todayRevenue)}
            helper="Completed sessions in reports API"
            icon={<CircleDollarSign className="h-5 w-5" strokeWidth={1.8} />}
          />
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-100">
            <AlertTriangle className="h-5 w-5" strokeWidth={1.8} />
          </div>
          <div>
            <h2 className="text-base font-black text-slate-950 dark:text-white">
              Limited admin telemetry
            </h2>
            <p className="mt-1 text-sm font-medium leading-6 text-slate-500 dark:text-slate-400">
              Active parking sessions, active reservations, and pending payment flags do not currently have admin-safe list endpoints. They are intentionally not estimated here.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}

function formatVnd(value: number) {
  return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(value)} VND`
}
