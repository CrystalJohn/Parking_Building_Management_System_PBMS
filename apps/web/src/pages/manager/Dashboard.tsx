import { useEffect, useState, useCallback } from 'react'
import api from '../../lib/api'

// ─── Types ───────────────────────────────────────────────────────────────────

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

// ─── Constants ───────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 5000

const STATUS_STYLES: Record<SlotStatus, { bg: string; border: string; text: string }> = {
  available: {
    bg: 'bg-emerald-500/[0.08] dark:bg-emerald-500/[0.12]',
    border: 'border-emerald-500/25',
    text: 'text-emerald-700 dark:text-emerald-400',
  },
  occupied: {
    bg: 'bg-red-500/[0.08] dark:bg-red-500/[0.12]',
    border: 'border-red-500/25',
    text: 'text-red-600 dark:text-red-400',
  },
  reserved: {
    bg: 'bg-amber-500/[0.08] dark:bg-amber-500/[0.12]',
    border: 'border-amber-500/25',
    text: 'text-amber-700 dark:text-amber-400',
  },
  maintenance: {
    bg: 'bg-gray-500/[0.06] dark:bg-gray-500/[0.08]',
    border: 'border-gray-400/20',
    text: 'text-gray-500 dark:text-gray-400',
  },
}

const STATUS_LABELS: Record<SlotStatus, string> = {
  available: 'Trống',
  occupied: 'Có xe',
  reserved: 'Đặt trước',
  maintenance: 'Bảo trì',
}

const STATUS_DOT: Record<SlotStatus, string> = {
  available: 'bg-emerald-500',
  occupied: 'bg-red-500',
  reserved: 'bg-amber-500',
  maintenance: 'bg-gray-400',
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Manager Dashboard — Glassmorphism slot map with real-time polling.
 */
export default function Dashboard() {
  const [floors, setFloors] = useState<FloorGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchSlots = useCallback(async () => {
    try {
      const { data } = await api.get<Slot[]>('/slots')
      const grouped = groupByFloor(data)
      setFloors(grouped)
      setLastUpdated(new Date())
      setError(null)
    } catch {
      setError('Không thể tải dữ liệu slot')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSlots()
    const interval = setInterval(fetchSlots, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [fetchSlots])

  // Compute totals
  const allSlots = floors.flatMap((f) => [...f.zoneA, ...f.zoneB])
  const totalSlots = allSlots.length
  const totalAvailable = allSlots.filter((s) => s.status === 'available').length
  const totalOccupied = allSlots.filter((s) => s.status === 'occupied').length
  const totalReserved = allSlots.filter((s) => s.status === 'reserved').length
  const overallOccupancy = totalSlots > 0
    ? Math.round(((totalOccupied + totalReserved) / totalSlots) * 100)
    : 0

  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a] transition-colors duration-300">
      {/* Mesh gradient background */}
      <div className="fixed inset-0 -z-10 opacity-30 dark:opacity-20 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 20% 20%, rgba(59,130,246,0.1) 0%, transparent 50%), ' +
            'radial-gradient(ellipse at 80% 80%, rgba(168,85,247,0.08) 0%, transparent 50%)',
          filter: 'blur(80px)',
        }}
      />

      <div className="max-w-[1400px] mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-[28px] font-bold text-[#171717] dark:text-[#ededed] tracking-tight">
              Bảng điều khiển
            </h1>
            <p className="text-[13px] text-[#888] mt-1">
              Sơ đồ slot thời gian thực — tự động cập nhật mỗi 5 giây
            </p>
          </div>
          {lastUpdated && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white/50 dark:bg-white/[0.04] backdrop-blur-sm rounded-xl border border-white/30 dark:border-white/10">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-[11px] font-mono text-[#888]">
                {lastUpdated.toLocaleTimeString('vi-VN')}
              </span>
            </div>
          )}
        </header>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          </div>
        )}
        {error && (
          <div className="p-4 rounded-2xl bg-red-50/80 dark:bg-red-500/10 border border-red-200/50 dark:border-red-500/20 text-[13px] text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Summary stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Tổng slot" value={totalSlots} icon="📊" />
              <StatCard label="Trống" value={totalAvailable} color="text-emerald-600 dark:text-emerald-400" icon="🟢" />
              <StatCard label="Có xe" value={totalOccupied} color="text-red-600 dark:text-red-400" icon="🔴" />
              <StatCard
                label="Tỷ lệ lấp đầy"
                value={`${overallOccupancy}%`}
                color={overallOccupancy > 80 ? 'text-red-600 dark:text-red-400' : 'text-[#171717] dark:text-[#ededed]'}
                icon="📈"
              />
            </div>

            {/* Floor maps */}
            {floors.map((floor) => (
              <FloorMap key={floor.floorNumber} floor={floor} />
            ))}

            {/* Legend */}
            <div className="flex flex-wrap gap-4 p-4 bg-white/50 dark:bg-white/[0.04] backdrop-blur-xl rounded-2xl border border-white/30 dark:border-white/[0.08]">
              {(Object.keys(STATUS_STYLES) as SlotStatus[]).map(
                (status) => (
                  <div key={status} className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT[status]}`} />
                    <span className="text-[12px] text-[#666] dark:text-[#888]">{STATUS_LABELS[status]}</span>
                  </div>
                ),
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  color = 'text-[#171717] dark:text-[#ededed]',
  icon,
}: {
  label: string
  value: number | string
  color?: string
  icon?: string
}) {
  return (
    <div className="bg-white/50 dark:bg-white/[0.04] backdrop-blur-2xl rounded-[1.5rem] p-5 border border-white/30 dark:border-white/[0.08] shadow-[0_4px_30px_rgba(0,0,0,0.04)] dark:shadow-[0_4px_30px_rgba(0,0,0,0.2)] ring-1 ring-black/[0.02] dark:ring-white/[0.02] hover:bg-white/70 dark:hover:bg-white/[0.08] transition-all">
      <div className="flex items-center gap-2 mb-2">
        {icon && <span className="text-[14px]">{icon}</span>}
        <p className="text-[11px] font-mono text-[#888] uppercase tracking-wider">{label}</p>
      </div>
      <p className={`text-[32px] font-bold leading-none ${color}`}>{value}</p>
    </div>
  )
}

function FloorMap({ floor }: { floor: FloorGroup }) {
  const allSlots = [...floor.zoneA, ...floor.zoneB]
  const available = allSlots.filter((s) => s.status === 'available').length
  const total = allSlots.length
  const occupancy = total > 0 ? Math.round(((total - available) / total) * 100) : 0

  // Progress bar color based on occupancy
  const barColor = occupancy > 80
    ? 'from-red-500 to-orange-500'
    : occupancy > 50
    ? 'from-amber-500 to-orange-500'
    : 'from-blue-500 to-indigo-500'

  return (
    <div className="bg-white/50 dark:bg-white/[0.04] backdrop-blur-2xl rounded-[1.5rem] p-6 border border-white/30 dark:border-white/[0.08] shadow-[0_4px_30px_rgba(0,0,0,0.04)] dark:shadow-[0_4px_30px_rgba(0,0,0,0.2)] ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
      {/* Floor header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/20">
            <span className="text-white text-sm font-bold">T{floor.floorNumber}</span>
          </div>
          <div>
            <h2 className="text-[16px] font-semibold text-[#171717] dark:text-[#ededed]">
              {floor.floorName}
            </h2>
            <p className="text-[11px] text-[#888]">Tầng {floor.floorNumber}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="text-emerald-600 dark:text-emerald-400 text-[14px] font-semibold">{available}</span>
            <span className="text-[#888] text-[12px] ml-1">trống</span>
          </div>
          <div className="w-24">
            <div className="flex justify-between text-[10px] text-[#888] mb-1">
              <span>{occupancy}%</span>
            </div>
            <div className="h-1.5 bg-black/5 dark:bg-white/10 rounded-full overflow-hidden">
              <div className={`h-full rounded-full bg-gradient-to-r ${barColor}`} style={{ width: `${occupancy}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Zone A — Cars */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] font-mono text-[#888] uppercase tracking-wider">
            Zone A — Ô tô
          </p>
          <span className="text-[11px] font-mono text-blue-600 dark:text-blue-400">
            {floor.zoneA.filter((s) => s.status === 'available').length}/{floor.zoneA.length} trống
          </span>
        </div>
        <div className="grid grid-cols-5 md:grid-cols-10 gap-2">
          {floor.zoneA.map((slot) => (
            <SlotCell key={slot.id} slot={slot} />
          ))}
        </div>
      </div>

      {/* Zone B — Motorbikes */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] font-mono text-[#888] uppercase tracking-wider">
            Zone B — Xe máy
          </p>
          <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
            {floor.zoneB.filter((s) => s.status === 'available').length}/{floor.zoneB.length} trống
          </span>
        </div>
        <div className="grid grid-cols-5 md:grid-cols-10 gap-2">
          {floor.zoneB.map((slot) => (
            <SlotCell key={slot.id} slot={slot} />
          ))}
        </div>
      </div>
    </div>
  )
}

function SlotCell({ slot }: { slot: Slot }) {
  const style = STATUS_STYLES[slot.status]

  return (
    <div
      className={`h-10 flex items-center justify-center rounded-xl border backdrop-blur-sm text-[11px] font-mono font-medium transition-all hover:scale-105 cursor-default ${style.bg} ${style.border} ${style.text}`}
      title={`${slot.code} — ${STATUS_LABELS[slot.status]}`}
    >
      {slot.slotNumber}
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function groupByFloor(slots: Slot[]): FloorGroup[] {
  const map = new Map<number, FloorGroup>()

  for (const slot of slots) {
    if (!map.has(slot.floor.floorNumber)) {
      map.set(slot.floor.floorNumber, {
        floorNumber: slot.floor.floorNumber,
        floorName: slot.floor.name,
        zoneA: [],
        zoneB: [],
      })
    }
    const group = map.get(slot.floor.floorNumber)!
    if (slot.zone === 'A') {
      group.zoneA.push(slot)
    } else {
      group.zoneB.push(slot)
    }
  }

  for (const group of map.values()) {
    group.zoneA.sort((a, b) => a.slotNumber - b.slotNumber)
    group.zoneB.sort((a, b) => a.slotNumber - b.slotNumber)
  }

  return Array.from(map.values()).sort((a, b) => a.floorNumber - b.floorNumber)
}
