import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  Banknote,
  CalendarClock,
  Car,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  CreditCard,
  Flag,
  Gauge,
  Layers3,
  ParkingCircle,
  ShieldCheck,
  Timer,
} from 'lucide-react'
import api from '../../lib/api'
import {
  getAdminPendingPayments,
  getAdminSummary,
  type AdminOperationFlag,
  type AdminOperationsFlags,
  type AdminPendingPaymentItem,
  type AdminPendingPayments,
  type AdminSummary,
  type PaymentMonitoringRisk,
} from '../../lib/admin-api'
import { formatDateTimeVN } from '../../lib/date-time'

type SlotStatus = 'available' | 'occupied' | 'reserved' | 'maintenance'
type Zone = 'A' | 'B'
type VehicleType = 'car' | 'motorbike'

interface Slot {
  id: number
  code: string
  zone: Zone
  slotNumber: number
  status: SlotStatus
  vehicleType: VehicleType
  floor: {
    id: number
    floorNumber: number
    name: string
  }
}

interface FloorGroup {
  floorNumber: number
  floorName: string
  zoneA: Slot[]
  zoneB: Slot[]
}

interface TrafficRow {
  entryCount: number
  exitCount: number
}

interface TodayTraffic {
  checkIns: number | null
  checkOuts: number | null
}

const POLL_INTERVAL_MS = 10000

const STATUS_LABELS: Record<SlotStatus, string> = {
  available: 'Available',
  occupied: 'Occupied',
  reserved: 'Reserved',
  maintenance: 'Maintenance',
}

const STATUS_STYLES: Record<SlotStatus, string> = {
  available:
    'border-emerald-200 bg-emerald-50 text-emerald-800 ring-emerald-100 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-100 dark:ring-emerald-400/20',
  occupied:
    'border-rose-200 bg-rose-50 text-rose-800 ring-rose-100 dark:border-rose-400/30 dark:bg-rose-500/15 dark:text-rose-100 dark:ring-rose-400/20',
  reserved:
    'border-amber-200 bg-amber-50 text-amber-900 ring-amber-100 dark:border-amber-400/30 dark:bg-amber-500/15 dark:text-amber-100 dark:ring-amber-400/20',
  maintenance:
    'border-slate-300 bg-slate-100 text-slate-600 ring-slate-200 dark:border-slate-500/40 dark:bg-slate-800/80 dark:text-slate-300 dark:ring-slate-500/30',
}

const STATUS_DOT: Record<SlotStatus, string> = {
  available: 'bg-emerald-400',
  occupied: 'bg-rose-400',
  reserved: 'bg-amber-400',
  maintenance: 'bg-slate-500',
}

export const todayIsoDate = () => new Date().toISOString().slice(0, 10)

export default function Dashboard() {
  const [floors, setFloors] = useState<FloorGroup[]>([])
  const [summary, setSummary] = useState<AdminSummary | null>(null)
  const [pendingPayments, setPendingPayments] = useState<AdminPendingPayments | null>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedFloorNumber, setSelectedFloorNumber] = useState<number | null>(null)
  const [selectedZone, setSelectedZone] = useState<Zone>('A')
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)

  const loadDashboard = useCallback(async () => {
    try {
      const [slotData, summaryData, paymentData] = await Promise.all([
        api.get<Slot[]>('/slots'),
        getAdminSummary(),
        getAdminPendingPayments(),
      ])

      setFloors(groupByFloor(slotData.data))
      setSummary(summaryData)
      setPendingPayments(paymentData)

      setError(null)
    } catch {
      setError('Unable to load manager operations telemetry')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadDashboard()
    const interval = window.setInterval(() => void loadDashboard(), POLL_INTERVAL_MS)
    return () => window.clearInterval(interval)
  }, [loadDashboard])

  useEffect(() => {
    if (floors.length === 0) {
      setSelectedFloorNumber(null)
      return
    }

    const hasSelectedFloor = floors.some((floor) => floor.floorNumber === selectedFloorNumber)
    if (!hasSelectedFloor) setSelectedFloorNumber(floors[0].floorNumber)
  }, [floors, selectedFloorNumber])

  const slotTotals = useMemo(() => {
    const slots = floors.flatMap((floor) => [...floor.zoneA, ...floor.zoneB])
    const total = slots.length
    const available = countByStatus(slots, 'available')
    const occupied = countByStatus(slots, 'occupied')
    const reserved = countByStatus(slots, 'reserved')
    const maintenance = countByStatus(slots, 'maintenance')
    const occupancyRate = total > 0 ? Math.round((occupied / total) * 100) : 0
    return { total, available, occupied, reserved, maintenance, occupancyRate }
  }, [floors])

  const selectedFloor = useMemo(
    () => floors.find((floor) => floor.floorNumber === selectedFloorNumber) ?? null,
    [floors, selectedFloorNumber],
  )

  const currentSlots = useMemo(() => {
    if (!selectedFloor) return []
    return selectedZone === 'A' ? selectedFloor.zoneA : selectedFloor.zoneB
  }, [selectedFloor, selectedZone])

  useEffect(() => {
    if (!selectedSlot) return
    const updatedSlot = floors
      .flatMap((floor) => [...floor.zoneA, ...floor.zoneB])
      .find((slot) => slot.id === selectedSlot.id)
    if (updatedSlot) setSelectedSlot(updatedSlot)
  }, [floors, selectedSlot])



  const kpis = buildKpis(summary, pendingPayments, slotTotals)

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-5 text-slate-950 transition-colors duration-300 dark:bg-slate-950 dark:text-slate-100 lg:px-6">
      <div className="mx-auto max-w-[1500px] space-y-5">
        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-100">
            {error}
          </div>
        ) : null}

        {loading ? <DashboardSkeleton /> : null}

        {!loading ? (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {kpis.map((kpi) => (
                <KpiCard key={kpi.label} {...kpi} />
              ))}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-200/60 transition-colors dark:border-white/10 dark:bg-white/[0.04] dark:shadow-none">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <h2 className="text-lg font-black tracking-tight text-slate-950 dark:text-white">
                      Slot occupancy map
                    </h2>
                    <p className="mt-1 text-sm font-medium text-slate-600 dark:text-slate-400">
                      Floor and zone snapshot from the slot source of truth. Select a slot to inspect available session context.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <SlotLegend status="available" count={slotTotals.available} />
                    <SlotLegend status="occupied" count={slotTotals.occupied} />
                    <SlotLegend status="reserved" count={slotTotals.reserved} />
                    {slotTotals.maintenance > 0 ? <SlotLegend status="maintenance" count={slotTotals.maintenance} /> : null}
                  </div>
                </div>

                {floors.length > 0 ? (
                  <div className="mt-5 flex flex-wrap gap-2">
                    {floors.map((floor) => (
                      <button
                        key={floor.floorNumber}
                        type="button"
                        onClick={() => setSelectedFloorNumber(floor.floorNumber)}
                        className={`min-h-11 rounded-xl px-4 text-sm font-black transition focus:outline-none focus:ring-2 focus:ring-cyan-300 ${floor.floorNumber === selectedFloorNumber
                            ? 'bg-cyan-300 text-slate-950 dark:bg-cyan-400 dark:text-slate-950'
                            : 'border border-slate-200 bg-slate-50 text-slate-700 hover:border-cyan-400 hover:text-slate-950 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-cyan-300/40 dark:hover:text-white'
                          }`}
                      >
                        {floor.floorName}
                      </button>
                    ))}
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  {(['A', 'B'] as Zone[]).map((zone) => (
                    <button
                      key={zone}
                      type="button"
                      onClick={() => setSelectedZone(zone)}
                      className={`min-h-11 rounded-xl px-4 text-sm font-black transition focus:outline-none focus:ring-2 focus:ring-cyan-300 ${selectedZone === zone
                          ? 'bg-white text-slate-950'
                          : 'border border-slate-200 bg-slate-50 text-slate-700 hover:text-slate-950 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-white'
                        }`}
                    >
                      Zone {zone}
                    </button>
                  ))}
                </div>

                <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 transition-colors dark:border-white/10 dark:bg-slate-950/70">
                  {currentSlots.length === 0 ? (
                    <EmptyPanel
                      title="No slots configured for this zone."
                      description="The backend did not return any slot records for the selected floor and zone."
                    />
                  ) : (
                    <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-9 2xl:grid-cols-10">
                      {currentSlots.map((slot) => (
                        <SlotButton
                          key={slot.id}
                          slot={slot}
                          selected={selectedSlot?.id === slot.id}
                          onSelect={() => setSelectedSlot(slot)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </section>


          </>
        ) : null}
      </div>
    </main>
  )
}

function buildKpis(
  summary: AdminSummary | null,
  pendingPayments: AdminPendingPayments | null,
  fallback: {
    total: number
    available: number
    occupied: number
    occupancyRate: number
  },
) {
  return [
    {
      label: 'Total slots',
      value: summary?.slots.total ?? fallback.total,
      helper: `${summary?.slots.reserved ?? 0} reserved`,
      icon: <ParkingCircle className="h-5 w-5" strokeWidth={1.8} />,
    },
    {
      label: 'Available slots',
      value: summary?.slots.available ?? fallback.available,
      helper: 'Ready for allocation',
      icon: <CheckCircle2 className="h-5 w-5" strokeWidth={1.8} />,
    },
    {
      label: 'Occupied slots',
      value: summary?.slots.occupied ?? fallback.occupied,
      helper: 'Currently unavailable',
      icon: <Car className="h-5 w-5" strokeWidth={1.8} />,
    },
    {
      label: 'Occupancy rate',
      value: `${summary?.slots.occupancyRate ?? fallback.occupancyRate}%`,
      helper: 'Occupied over total',
      icon: <Gauge className="h-5 w-5" strokeWidth={1.8} />,
    },
    {
      label: 'Active sessions',
      value: summary?.sessions.active ?? 'Unavailable',
      helper: `${summary?.sessions.checkoutPending ?? 0} checkout pending`,
      icon: <Timer className="h-5 w-5" strokeWidth={1.8} />,
      unavailable: !summary,
    },
    {
      label: 'Today revenue',
      value: summary ? formatVnd(summary.payments.revenueToday) : 'Unavailable',
      helper: `${formatVnd(summary?.payments.byMethod.bankQr ?? 0)} via Bank QR`,
      icon: <CircleDollarSign className="h-5 w-5" strokeWidth={1.8} />,
      unavailable: !summary,
    },
    {
      label: 'Pending payments',
      value: pendingPayments?.summary.total ?? summary?.payments.pending ?? 'Unavailable',
      helper: `${pendingPayments?.summary.overdue ?? 0} overdue`,
      icon: <CreditCard className="h-5 w-5" strokeWidth={1.8} />,
      unavailable: !summary && !pendingPayments,
    },
    {
      label: 'Active reservations',
      value: summary?.reservations.active ?? 'Unavailable',
      helper: `${summary?.reservations.expiredToday ?? 0} expired today`,
      icon: <CalendarClock className="h-5 w-5" strokeWidth={1.8} />,
      unavailable: !summary,
    },
  ]
}

function KpiCard({
  label,
  value,
  helper,
  icon,
  unavailable = false,
}: {
  label: string
  value: number | string
  helper: string
  icon: ReactNode
  unavailable?: boolean
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-200/60 dark:border-white/10 dark:bg-white/[0.04] dark:shadow-none">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-bold text-slate-600 dark:text-slate-400">{label}</p>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200 dark:bg-cyan-300/10 dark:text-cyan-200 dark:ring-cyan-300/20">
          {icon}
        </div>
      </div>
      <p
        className={`mt-4 text-2xl font-black tracking-tight ${unavailable ? 'text-slate-500' : 'text-slate-950 dark:text-white'
          }`}
      >
        {value}
      </p>
      <p className="mt-2 text-xs font-semibold text-slate-500">{helper}</p>
    </article>
  )
}

export function SlotButton({
  slot,
  selected,
  onSelect,
}: {
  slot: Slot
  selected: boolean
  onSelect: () => void
}) {
  const isOccupied = slot.status === 'occupied';

  if (selected) {
    return (
      <button
        type="button"
        onClick={onSelect}
        className="flex aspect-[3/2] flex-col items-center justify-center rounded-xl bg-[#2563eb] text-white transition hover:-translate-y-0.5 shadow-lg shadow-blue-500/30 ring-2 ring-white/20"
      >
        <span className="text-[10px] md:text-xs font-medium">Selected</span>
        <span className="font-bold text-sm">{slot.code}</span>
      </button>
    );
  }

  if (isOccupied) {
    const imgSrc = slot.vehicleType === 'motorbike' ? '/motor.jpg' : '/car.jpg';
    return (
      <button
        type="button"
        onClick={onSelect}
        className="flex aspect-[3/2] items-center justify-center rounded-xl bg-[#262626] transition hover:-translate-y-0.5 overflow-hidden ring-1 ring-white/5"
      >
        <img src={imgSrc} alt="Occupied vehicle" className="w-full h-full object-cover" />
      </button>
    );
  }

  // Available, Maintenance, Reserved
  const styleClass = slot.status === 'available'
    ? "bg-white text-slate-950 dark:bg-white dark:text-slate-950 ring-1 ring-black/5"
    : STATUS_STYLES[slot.status];

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex aspect-[3/2] flex-col items-center justify-center rounded-xl transition hover:-translate-y-0.5 shadow-sm ${styleClass}`}
    >
      <span className="text-[10px] md:text-xs font-medium capitalize opacity-70">{STATUS_LABELS[slot.status]}</span>
      <span className="font-bold text-sm">{slot.code}</span>
    </button>
  );
}

export function OperationalFlagsCard({
  flags,
  latestFlag,
  recentFlags,
}: {
  flags: AdminOperationsFlags | null
  latestFlag: AdminOperationFlag | null
  recentFlags: AdminOperationFlag[]
}) {
  return (
    <InfoCard
      title="Operational Flags"
      icon={<Flag className="h-4 w-4" strokeWidth={1.8} />}
      action={<LinkButton to="/manager/reports" label="View Reports & Flags" />}
    >
      <div className="grid grid-cols-3 gap-2">
        <MiniMetric label="Critical" value={flags?.summary.critical ?? 0} tone="critical" />
        <MiniMetric label="Warning" value={flags?.summary.warning ?? 0} tone="warning" />
        <MiniMetric label="Info" value={flags?.summary.info ?? 0} tone="normal" />
      </div>

      {latestFlag ? (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-slate-950/70 p-3">
          <div className="flex items-start justify-between gap-3">
            <StatusBadge tone={flagTone(latestFlag.severity)} label={latestFlag.severity} />
            <span className="text-xs font-semibold text-slate-500">
              {formatAge(latestFlag.ageMinutes)}
            </span>
          </div>
          <p className="mt-3 text-sm font-bold leading-5 text-slate-950 dark:text-white">{latestFlag.message}</p>
          <p className="mt-2 text-xs font-semibold text-slate-500">
            {latestFlag.sessionCode ?? latestFlag.plateNumber ?? 'No linked session'}
          </p>
        </div>
      ) : (
        <EmptyInline title="No operational flags detected." />
      )}

      {recentFlags.length > 1 ? (
        <ul className="mt-3 space-y-2">
          {recentFlags.slice(1).map((flag) => (
            <li key={`${flag.type}-${flag.createdAt}-${flag.sessionCode ?? ''}`} className="flex items-start gap-2 text-xs">
              <span className={`mt-1 h-2 w-2 rounded-full ${flagDot(flag.severity)}`} />
              <span className="font-medium leading-5 text-slate-600 dark:text-slate-400">{flag.message}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </InfoCard>
  )
}

export function PaymentMonitoringCard({
  pendingPayments,
  recentPaymentIssues,
}: {
  pendingPayments: AdminPendingPayments | null
  recentPaymentIssues: AdminPendingPaymentItem[]
}) {
  return (
    <InfoCard
      title="Payment Monitoring"
      icon={<CreditCard className="h-4 w-4" strokeWidth={1.8} />}
      action={<LinkButton to="/manager/reports" label="View Payment Monitoring" />}
    >
      <div className="grid grid-cols-3 gap-2">
        <MiniMetric label="Pending" value={pendingPayments?.summary.total ?? 0} tone="normal" />
        <MiniMetric label="Overdue" value={pendingPayments?.summary.overdue ?? 0} tone="warning" />
        <MiniMetric label="Critical" value={pendingPayments?.summary.critical ?? 0} tone="critical" />
      </div>

      {recentPaymentIssues.length === 0 ? (
        <EmptyInline title="No pending payment issues detected." />
      ) : (
        <ul className="mt-4 space-y-3">
          {recentPaymentIssues.map((item) => (
            <li key={item.paymentId} className="rounded-xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-slate-950/70 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-xs font-black text-slate-950 dark:text-white">
                    {item.sessionCode ?? 'Not linked'}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    {item.plateNumber ?? 'Unknown plate'} - {item.locationLabel}
                  </p>
                </div>
                <StatusBadge tone={riskTone(item.risk)} label={item.risk} />
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 text-xs">
                <span className="font-black text-slate-800 dark:text-slate-200">{formatVnd(item.amount)}</span>
                <span className="font-semibold text-slate-500">
                  Staff: {item.responsibleStaff.name ?? 'Unassigned'}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </InfoCard>
  )
}

export function ReservationOverviewCard({ summary }: { summary: AdminSummary | null }) {
  return (
    <InfoCard title="Reservation Overview" icon={<CalendarClock className="h-4 w-4" strokeWidth={1.8} />}>
      <div className="grid grid-cols-2 gap-2">
        <MiniMetric label="Active" value={summary?.reservations.active ?? 0} tone="normal" />
        <MiniMetric label="Fulfilled" value={summary?.reservations.fulfilledToday ?? 0} tone="normal" />
        <MiniMetric label="Cancelled" value={summary?.reservations.cancelledToday ?? 0} tone="muted" />
        <MiniMetric label="Expired" value={summary?.reservations.expiredToday ?? 0} tone="warning" />
      </div>
      <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 dark:border-white/10 dark:bg-slate-950/50 p-3 text-xs font-semibold leading-5 text-slate-500">
        Active reservation counts are available from backend summary. A reservation detail list is unavailable on this manager endpoint.
      </div>
    </InfoCard>
  )
}

export function CurrentParkedCard({
  slot,
  paymentIssue,
}: {
  slot: Slot | null
  paymentIssue: AdminPendingPaymentItem | null
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-200/60 dark:border-white/10 dark:bg-white/[0.04] dark:shadow-none">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-black text-slate-950 dark:text-white">Current Parked</h2>
          <p className="mt-1 text-sm font-medium text-slate-600 dark:text-slate-400">
            Read-only slot inspection.
          </p>
        </div>
        <Layers3 className="h-5 w-5 text-cyan-700 dark:text-cyan-200" strokeWidth={1.8} />
      </div>

      {!slot ? (
        <EmptyPanel
          title="Select a slot to inspect vehicle/session details."
          description="No checkout, payment confirmation, or exit actions are available in the manager view."
        />
      ) : (
        <div className="mt-5 space-y-3">
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-slate-950/60 p-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Slot code</p>
              <p className="mt-1 font-mono text-lg font-black text-slate-950 dark:text-white">{slot.code}</p>
            </div>
            <StatusBadge tone={slotTone(slot.status)} label={STATUS_LABELS[slot.status]} />
          </div>

          <DetailGrid
            rows={[
              ['Plate number', paymentIssue?.plateNumber ?? 'Unavailable'],
              ['Vehicle type', titleCase(slot.vehicleType)],
              ['Session code', paymentIssue?.sessionCode ?? 'Unavailable'],
              ['Check-in time', paymentIssue ? formatDateTimeVN(paymentIssue.createdAt) : 'Unavailable'],
              ['Billed duration', paymentIssue?.waitingLabel ?? 'Unavailable'],
              ['Session status', paymentIssue?.sessionStatus ?? slot.status],
              ['Staff check-in / owner', paymentIssue?.responsibleStaff.name ?? 'Unavailable'],
            ]}
          />

          {!paymentIssue ? (
            <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 dark:border-white/10 dark:bg-slate-950/50 p-3 text-xs font-semibold leading-5 text-slate-500">
              Vehicle and session fields require an active session detail endpoint for managers. This view does not fabricate plate numbers or timers.
            </p>
          ) : null}
        </div>
      )}
    </section>
  )
}

export function DailyOperationsCard({
  summary,
  traffic,
  selectedDate,
}: {
  summary: AdminSummary | null
  traffic: TodayTraffic
  selectedDate: string
}) {
  const isToday = selectedDate === todayIsoDate();
  const cardTitle = isToday ? `Operations for Today · ${selectedDate}` : `Operations for ${selectedDate}`;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-200/60 dark:border-white/10 dark:bg-white/[0.04] dark:shadow-none">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-black text-slate-950 dark:text-white">{cardTitle}</h2>
          <p className="mt-1 text-sm font-medium text-slate-600 dark:text-slate-400">Movement and session status.</p>
        </div>
        <ClipboardList className="h-5 w-5 text-cyan-700 dark:text-cyan-200" strokeWidth={1.8} />
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <MiniMetric label="Daily Check-ins" value={traffic.checkIns ?? 'Unavailable'} tone="normal" />
        <MiniMetric label="Daily Checkouts" value={traffic.checkOuts ?? 'Unavailable'} tone="normal" />
        <MiniMetric label="Daily Completed" value={summary?.sessions.completedToday ?? 0} tone="normal" />
        <MiniMetric label="Current Active" value={summary?.sessions.active ?? 0} tone="normal" />
        <MiniMetric label="Current Pending" value={summary?.sessions.checkoutPending ?? 0} tone="warning" />
        <MiniMetric label="Current Auth'd" value={summary?.sessions.exitAuthorized ?? 0} tone="normal" />
      </div>
    </section>
  )
}

export function RevenueSummaryCard({ summary }: { summary: AdminSummary | null }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-200/60 dark:border-white/10 dark:bg-white/[0.04] dark:shadow-none">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-black text-slate-950 dark:text-white">Revenue Summary</h2>
          <p className="mt-1 text-sm font-medium text-slate-600 dark:text-slate-400">Payments collected today.</p>
        </div>
        <Banknote className="h-5 w-5 text-cyan-700 dark:text-cyan-200" strokeWidth={1.8} />
      </div>
      <div className="mt-5 space-y-3">
        <div className="rounded-xl border border-cyan-300/20 bg-cyan-300/10 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-cyan-700 dark:text-cyan-200">Today revenue</p>
          <p className="mt-2 text-2xl font-black text-slate-950 dark:text-white">
            {summary ? formatVnd(summary.payments.revenueToday) : 'Unavailable'}
          </p>
        </div>
        <DetailGrid
          rows={[
            ['Paid today', String(summary?.payments.paidToday ?? 0)],
            ['Cash', formatVnd(summary?.payments.byMethod.cash ?? 0)],
            ['Bank QR', formatVnd(summary?.payments.byMethod.bankQr ?? 0)],
            ['Failed today', String(summary?.payments.failedToday ?? 0)],
            ['Expired today', String(summary?.payments.expiredToday ?? 0)],
          ]}
        />
      </div>
    </section>
  )
}

export function InfoCard({
  title,
  icon,
  action,
  children,
}: {
  title: string
  icon: ReactNode
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-200/60 dark:border-white/10 dark:bg-white/[0.04] dark:shadow-none">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200 dark:bg-cyan-300/10 dark:text-cyan-200 dark:ring-cyan-300/20">
            {icon}
          </span>
          <h2 className="text-base font-black text-slate-950 dark:text-white">{title}</h2>
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

export function DetailGrid({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="grid gap-2">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-slate-950/50 px-3 py-2"
        >
          <dt className="text-xs font-semibold text-slate-500">{label}</dt>
          <dd className="text-right text-xs font-black text-slate-800 dark:text-slate-200">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function MiniMetric({
  label,
  value,
  tone,
}: {
  label: string
  value: number | string
  tone: 'normal' | 'warning' | 'critical' | 'muted'
}) {
  const toneClass = {
    normal: 'text-cyan-700 dark:text-cyan-100',
    warning: 'text-amber-700 dark:text-amber-100',
    critical: 'text-rose-700 dark:text-rose-100',
    muted: 'text-slate-700 dark:text-slate-300',
  }[tone]

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-slate-950/60 p-3">
      <p className="text-[11px] font-bold text-slate-500">{label}</p>
      <p className={`mt-2 text-xl font-black ${toneClass}`}>{value}</p>
    </div>
  )
}

export function StatusBadge({
  label,
  tone,
}: {
  label: string
  tone: 'normal' | 'warning' | 'critical' | 'muted'
}) {
  const toneClass = {
    normal: 'bg-emerald-400/10 text-emerald-100 ring-emerald-400/20',
    warning: 'bg-amber-400/10 text-amber-700 dark:text-amber-100 ring-amber-400/20',
    critical: 'bg-rose-400/10 text-rose-700 dark:text-rose-100 ring-rose-400/20',
    muted: 'bg-slate-100 text-slate-800 ring-slate-200 dark:bg-slate-700/60 dark:text-slate-200 dark:ring-white/10',
  }[tone]

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black capitalize ring-1 ${toneClass}`}>
      {label}
    </span>
  )
}

export function SlotLegend({ status, count }: { status: SlotStatus; count: number }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-white/10">
      <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />
      {count} {STATUS_LABELS[status].toLowerCase()}
    </span>
  )
}

export function LinkButton({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 transition hover:border-cyan-400 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-cyan-300 dark:border-white/10 dark:text-slate-300 dark:hover:border-cyan-300/40 dark:hover:text-white"
    >
      {label}
    </Link>
  )
}

export function EmptyPanel({ title, description }: { title: string; description: string }) {
  return (
    <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 dark:border-white/10 dark:bg-slate-950/50 p-6 text-center">
      <ShieldCheck className="mx-auto h-6 w-6 text-slate-500" strokeWidth={1.8} />
      <p className="mt-3 text-sm font-black text-slate-800 dark:text-slate-200">{title}</p>
      <p className="mx-auto mt-2 max-w-lg text-xs font-medium leading-5 text-slate-500">
        {description}
      </p>
    </div>
  )
}

export function EmptyInline({ title }: { title: string }) {
  return (
    <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 dark:border-white/10 dark:bg-slate-950/50 p-3 text-sm font-bold text-slate-600 dark:text-slate-400">
      {title}
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="h-32 rounded-2xl bg-white/[0.06]" />
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_410px]">
        <div className="h-[520px] rounded-2xl bg-white/[0.06]" />
        <div className="h-[520px] rounded-2xl bg-white/[0.06]" />
      </div>
    </div>
  )
}

function countByStatus(slots: Slot[], status: SlotStatus) {
  return slots.filter((slot) => slot.status === status).length
}

function groupByFloor(slots: Slot[]): FloorGroup[] {
  const map = new Map<number, FloorGroup>()

  for (const slot of slots) {
    if (!map.has(slot.floor.floorNumber)) {
      map.set(slot.floor.floorNumber, {
        floorNumber: slot.floor.floorNumber,
        floorName: slot.floor.name || `T${slot.floor.floorNumber}`,
        zoneA: [],
        zoneB: [],
      })
    }

    const group = map.get(slot.floor.floorNumber)!
    if (slot.zone === 'A') group.zoneA.push(slot)
    else group.zoneB.push(slot)
  }

  for (const group of map.values()) {
    group.zoneA.sort((a, b) => a.slotNumber - b.slotNumber)
    group.zoneB.sort((a, b) => a.slotNumber - b.slotNumber)
  }

  return Array.from(map.values()).sort((a, b) => a.floorNumber - b.floorNumber)
}

export async function getTodayTraffic(date?: string): Promise<TodayTraffic> {
  try {
    const targetDate = date || todayIsoDate();
    const { data } = await api.get<TrafficRow[]>('/reports/traffic', {
      params: { period: 'daily', date: targetDate },
    })

    return {
      checkIns: data.reduce((total, row) => total + Number(row.entryCount || 0), 0),
      checkOuts: data.reduce((total, row) => total + Number(row.exitCount || 0), 0),
    }
  } catch {
    return { checkIns: null, checkOuts: null }
  }
}

export function formatVnd(value: number) {
  return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(value)} VND`
}

export function formatAge(ageMinutes: number) {
  if (ageMinutes >= 1440) return `${Math.floor(ageMinutes / 1440)}d`
  if (ageMinutes >= 60) return `${Math.floor(ageMinutes / 60)}h ${ageMinutes % 60}m`
  return `${ageMinutes}m`
}

export function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export function slotTone(status: SlotStatus): 'normal' | 'warning' | 'critical' | 'muted' {
  if (status === 'available') return 'normal'
  if (status === 'reserved') return 'warning'
  if (status === 'occupied') return 'critical'
  return 'muted'
}

export function riskTone(risk: PaymentMonitoringRisk): 'normal' | 'warning' | 'critical' {
  if (risk === 'critical') return 'critical'
  if (risk === 'warning') return 'warning'
  return 'normal'
}

export function flagTone(severity: AdminOperationFlag['severity']): 'normal' | 'warning' | 'critical' {
  if (severity === 'critical') return 'critical'
  if (severity === 'warning') return 'warning'
  return 'normal'
}

export function flagDot(severity: AdminOperationFlag['severity']) {
  if (severity === 'critical') return 'bg-rose-400'
  if (severity === 'warning') return 'bg-amber-400'
  return 'bg-cyan-300'
}

