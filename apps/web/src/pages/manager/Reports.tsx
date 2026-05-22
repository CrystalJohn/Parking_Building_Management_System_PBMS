import { useEffect, useState } from 'react'
import api from '../../lib/api'

// ─── Types ───────────────────────────────────────────────────────────────────

type Tab = 'revenue' | 'traffic' | 'occupancy'
type Period = 'daily' | 'weekly' | 'monthly'

interface RevenueRow {
  period: string
  vehicleType: string
  totalSessions: number
  totalRevenue: number
  totalPenalty: number
}

interface TrafficRow {
  period: string
  hour: number
  floorNumber: number
  floorName: string
  entryCount: number
  exitCount: number
}

interface OccupancyRow {
  floorNumber: number
  floorName: string
  zone: string
  vehicleType: string
  totalSlots: number
  avgOccupancy: number
  peakOccupancy: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const VND = (n: number) => `${n.toLocaleString('vi-VN')} VND`

const today = () => new Date().toISOString().split('T')[0]

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * 28: Manager Reports page — Revenue / Traffic / Occupancy tabs.
 * Req 11.4
 */
export default function Reports() {
  const [tab, setTab] = useState<Tab>('revenue')

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl font-bold">Báo cáo</h1>
          <p className="text-sm text-gray-500">Doanh thu, lưu lượng, và tỷ lệ lấp đầy</p>
        </header>

        {/* Tabs */}
        <nav className="flex gap-2" role="tablist">
          {([
            ['revenue', 'Doanh thu'],
            ['traffic', 'Lưu lượng'],
            ['occupancy', 'Lấp đầy'],
          ] as [Tab, string][]).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`px-4 py-2 rounded-md font-medium text-sm transition-colors ${
                tab === key
                  ? 'bg-primary-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        {/* Tab content */}
        {tab === 'revenue' && <RevenueTab />}
        {tab === 'traffic' && <TrafficTab />}
        {tab === 'occupancy' && <OccupancyTab />}
      </div>
    </div>
  )
}

// ─── Revenue Tab ─────────────────────────────────────────────────────────────

function RevenueTab() {
  const [period, setPeriod] = useState<Period>('daily')
  const [date, setDate] = useState(today())
  const [data, setData] = useState<RevenueRow[]>([])
  const [loading, setLoading] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    try {
      const { data: rows } = await api.get('/reports/revenue', {
        params: { period, date },
      })
      setData(rows)
    } catch {
      setData([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [period, date])

  const totalRevenue = data.reduce((s, r) => s + r.totalRevenue, 0)
  const totalSessions = data.reduce((s, r) => s + r.totalSessions, 0)
  const maxRevenue = Math.max(...data.map((r) => r.totalRevenue), 1)

  return (
    <div className="space-y-4">
      <FilterBar period={period} setPeriod={setPeriod} date={date} setDate={setDate} />

      {loading && <p className="text-gray-500 text-sm">Đang tải...</p>}

      {!loading && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 gap-4">
            <div className="card text-center">
              <p className="text-sm text-gray-500">Tổng doanh thu</p>
              <p className="text-2xl font-bold text-green-700">{VND(totalRevenue)}</p>
            </div>
            <div className="card text-center">
              <p className="text-sm text-gray-500">Tổng phiên</p>
              <p className="text-2xl font-bold">{totalSessions}</p>
            </div>
          </div>

          {/* Table + bars */}
          {data.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-8">Không có dữ liệu cho khoảng thời gian này.</p>
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-2 text-left">Thời gian</th>
                    <th className="px-4 py-2 text-left">Loại xe</th>
                    <th className="px-4 py-2 text-right">Phiên</th>
                    <th className="px-4 py-2 text-right">Doanh thu</th>
                    <th className="px-4 py-2 w-32"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.map((row, idx) => (
                    <tr key={idx}>
                      <td className="px-4 py-2 text-gray-600">
                        {new Date(row.period).toLocaleDateString('vi-VN')}
                      </td>
                      <td className="px-4 py-2">
                        {row.vehicleType === 'car' ? 'Ô tô' : 'Xe máy'}
                      </td>
                      <td className="px-4 py-2 text-right">{row.totalSessions}</td>
                      <td className="px-4 py-2 text-right font-medium">{VND(row.totalRevenue)}</td>
                      <td className="px-4 py-2">
                        <Bar value={row.totalRevenue} max={maxRevenue} color="bg-green-500" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Traffic Tab ─────────────────────────────────────────────────────────────

function TrafficTab() {
  const [period, setPeriod] = useState<Period>('daily')
  const [date, setDate] = useState(today())
  const [data, setData] = useState<TrafficRow[]>([])
  const [loading, setLoading] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    try {
      const { data: rows } = await api.get('/reports/traffic', {
        params: { period, date },
      })
      setData(rows)
    } catch {
      setData([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [period, date])

  const totalEntry = data.reduce((s, r) => s + r.entryCount, 0)
  const totalExit = data.reduce((s, r) => s + r.exitCount, 0)
  const maxCount = Math.max(...data.map((r) => Math.max(r.entryCount, r.exitCount)), 1)

  return (
    <div className="space-y-4">
      <FilterBar period={period} setPeriod={setPeriod} date={date} setDate={setDate} />

      {loading && <p className="text-gray-500 text-sm">Đang tải...</p>}

      {!loading && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div className="card text-center">
              <p className="text-sm text-gray-500">Tổng xe vào</p>
              <p className="text-2xl font-bold text-blue-700">{totalEntry}</p>
            </div>
            <div className="card text-center">
              <p className="text-sm text-gray-500">Tổng xe ra</p>
              <p className="text-2xl font-bold text-orange-700">{totalExit}</p>
            </div>
          </div>

          {data.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-8">Không có dữ liệu.</p>
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-2 text-left">Giờ</th>
                    <th className="px-4 py-2 text-left">Tầng</th>
                    <th className="px-4 py-2 text-right">Vào</th>
                    <th className="px-4 py-2 text-right">Ra</th>
                    <th className="px-4 py-2 w-40"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.map((row, idx) => (
                    <tr key={idx}>
                      <td className="px-4 py-2 font-mono">{String(row.hour).padStart(2, '0')}:00</td>
                      <td className="px-4 py-2">{row.floorName}</td>
                      <td className="px-4 py-2 text-right">{row.entryCount}</td>
                      <td className="px-4 py-2 text-right">{row.exitCount}</td>
                      <td className="px-4 py-2">
                        <div className="flex gap-0.5">
                          <Bar value={row.entryCount} max={maxCount} color="bg-blue-500" />
                          <Bar value={row.exitCount} max={maxCount} color="bg-orange-400" />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Occupancy Tab ───────────────────────────────────────────────────────────

function OccupancyTab() {
  const [data, setData] = useState<OccupancyRow[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    api
      .get('/reports/occupancy')
      .then(({ data: rows }) => setData(rows))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-4">
      {loading && <p className="text-gray-500 text-sm">Đang tải...</p>}

      {!loading && data.length === 0 && (
        <p className="text-gray-500 text-sm text-center py-8">Không có dữ liệu.</p>
      )}

      {!loading && data.length > 0 && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-2 text-left">Tầng</th>
                <th className="px-4 py-2 text-left">Khu</th>
                <th className="px-4 py-2 text-left">Loại xe</th>
                <th className="px-4 py-2 text-center">Tổng slot</th>
                <th className="px-4 py-2 text-center">Tỷ lệ lấp đầy</th>
                <th className="px-4 py-2 w-32"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.map((row, idx) => (
                <tr key={idx}>
                  <td className="px-4 py-2 font-medium">{row.floorName}</td>
                  <td className="px-4 py-2">{row.zone}</td>
                  <td className="px-4 py-2">
                    {row.vehicleType === 'car' ? 'Ô tô' : 'Xe máy'}
                  </td>
                  <td className="px-4 py-2 text-center">{row.totalSlots}</td>
                  <td className="px-4 py-2 text-center font-medium">
                    {row.avgOccupancy}%
                  </td>
                  <td className="px-4 py-2">
                    <Bar
                      value={row.avgOccupancy}
                      max={100}
                      color={row.avgOccupancy > 80 ? 'bg-red-500' : row.avgOccupancy > 50 ? 'bg-yellow-500' : 'bg-green-500'}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Shared Components ───────────────────────────────────────────────────────

function FilterBar({
  period,
  setPeriod,
  date,
  setDate,
}: {
  period: Period
  setPeriod: (p: Period) => void
  date: string
  setDate: (d: string) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        value={period}
        onChange={(e) => setPeriod(e.target.value as Period)}
        className="input w-auto"
      >
        <option value="daily">Theo ngày</option>
        <option value="weekly">Theo tuần</option>
        <option value="monthly">Theo tháng</option>
      </select>
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="input w-auto"
      />
    </div>
  )
}

function Bar({
  value,
  max,
  color,
}: {
  value: number
  max: number
  color: string
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="w-full bg-gray-200 rounded-full h-2.5">
      <div
        className={`h-2.5 rounded-full ${color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
