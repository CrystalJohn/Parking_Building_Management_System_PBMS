import { useEffect, useState } from 'react'
import { Calendar as CalendarIcon, Sparkles, TrendingUp, Clock, Building2, Info, ArrowUpRight } from 'lucide-react'
import api from '../../lib/api'
import { formatDateTimeVN } from '../../lib/date-time'
import { formatVehicleType } from '../../lib/plate-format'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'

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
  const [tab, setTab] = useState<string>('revenue')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">Revenue, traffic, and occupancy analytics</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="traffic">Traffic</TabsTrigger>
          <TabsTrigger value="occupancy">Occupancy</TabsTrigger>
        </TabsList>
        <TabsContent value="revenue"><RevenueTab /></TabsContent>
        <TabsContent value="traffic"><TrafficTab /></TabsContent>
        <TabsContent value="occupancy"><OccupancyTab /></TabsContent>
      </Tabs>
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

  // Insights calculation
  const carRevenue = data.filter(r => r.vehicleType === 'car').reduce((s, r) => s + r.totalRevenue, 0)
  const carPercentage = totalRevenue > 0 ? Math.round((carRevenue / totalRevenue) * 100) : 0

  return (
    <div className="space-y-4">
      <FilterBar period={period} setPeriod={setPeriod} date={date} setDate={setDate} />

      {loading && <p className="text-muted-foreground text-sm">Loading revenue data...</p>}

      {!loading && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="border-border shadow-sm">
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
                <TrendingUp className="size-4 text-emerald-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{VND(totalRevenue)}</div>
                <p className="text-xs text-muted-foreground mt-1">Aggregated for selected {period} period</p>
              </CardContent>
            </Card>

            <Card className="border-border shadow-sm">
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Parking Sessions</CardTitle>
                <Badge variant="secondary" className="font-mono text-xs">Vehicles: {data.length}</Badge>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{totalSessions}</div>
                <p className="text-xs text-muted-foreground mt-1">Total completed & active parkings</p>
              </CardContent>
            </Card>
          </div>

          {/* Automatic Insight Banner */}
          {data.length > 0 && (
            <div className="flex items-center gap-3 p-3.5 rounded-lg border border-primary/20 bg-primary/5 text-primary text-sm">
              <Sparkles className="size-4 shrink-0 text-primary" />
              <div>
                <span className="font-semibold mr-1.5">Revenue Insight:</span>
                Cars generated <span className="font-bold">{carPercentage}%</span> of total revenue in this period ({VND(carRevenue)}).
              </div>
            </div>
          )}

          {/* Table + bars */}
          {data.length === 0 ? (
            <div className="text-center py-10 border rounded-lg border-dashed bg-slate-50/50 dark:bg-slate-900/20 text-muted-foreground text-sm">
              No revenue data recorded for this period.
            </div>
          ) : (
            <Card className="border-border overflow-hidden">
              <CardContent className="p-2 sm:p-4">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="pl-4">Period / Time</TableHead>
                      <TableHead>Vehicle Type</TableHead>
                      <TableHead className="text-right">Sessions</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="w-32 pr-4"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-foreground font-medium pl-4">
                          {formatDateTimeVN(row.period)}
                        </TableCell>
                        <TableCell className="capitalize">
                          <Badge variant="outline" className="font-normal">
                            {formatVehicleType(row.vehicleType)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground">{row.totalSessions}</TableCell>
                        <TableCell className="text-right font-semibold text-emerald-600 dark:text-emerald-400">{VND(row.totalRevenue)}</TableCell>
                        <TableCell className="pr-4">
                          <Bar value={row.totalRevenue} max={maxRevenue} color="bg-emerald-500" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
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

  // Insights calculation & Sorting by hour ascending
  const sortedData = [...data].sort((a, b) => a.hour - b.hour)
  
  // Aggregate entryCount by hour across all floors
  const hourlyEntriesMap = data.reduce((acc, r) => {
    acc[r.hour] = (acc[r.hour] || 0) + r.entryCount
    return acc
  }, {} as Record<number, number>)

  const peakHourEntry = Object.entries(hourlyEntriesMap).sort((a, b) => b[1] - a[1])[0]
  const peakHour = peakHourEntry ? Number(peakHourEntry[0]) : null
  const peakHourCount = peakHourEntry ? peakHourEntry[1] : 0
  
  const busiestFloorMap = data.reduce((acc, r) => {
    acc[r.floorName] = (acc[r.floorName] || 0) + r.entryCount + r.exitCount
    return acc
  }, {} as Record<string, number>)
  const busiestFloor = Object.entries(busiestFloorMap).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A'

  return (
    <div className="space-y-4">
      <FilterBar period={period} setPeriod={setPeriod} date={date} setDate={setDate} />

      {loading && <p className="text-muted-foreground text-sm">Loading traffic data...</p>}

      {!loading && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="border-border shadow-sm">
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Check-ins</CardTitle>
                <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400">Entries</Badge>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{totalEntry} vehicles</div>
                <p className="text-xs text-muted-foreground mt-1">Total incoming entries recorded</p>
              </CardContent>
            </Card>

            <Card className="border-border shadow-sm">
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Check-outs</CardTitle>
                <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100 dark:bg-orange-900/30 dark:text-orange-400">Exits</Badge>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">{totalExit} vehicles</div>
                <p className="text-xs text-muted-foreground mt-1">Total outgoing exits recorded</p>
              </CardContent>
            </Card>
          </div>

          {/* Automatic Insight Banner */}
          {sortedData.length > 0 && peakHour !== null && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3.5 rounded-lg border border-blue-500/20 bg-blue-500/5 text-blue-900 dark:text-blue-200 text-sm">
              <div className="flex items-center gap-2">
                <Clock className="size-4 shrink-0 text-blue-600 dark:text-blue-400" />
                <span>
                  <span className="font-semibold">Peak Check-in Hour:</span> <span className="font-bold">{String(peakHour).padStart(2, '0')}:00</span> ({peakHourCount} check-ins across all floors)
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Building2 className="size-3.5 shrink-0" />
                <span>Busiest floor: <strong className="text-foreground">{busiestFloor}</strong></span>
              </div>
            </div>
          )}

          {sortedData.length === 0 ? (
            <div className="text-center py-10 border rounded-lg border-dashed bg-slate-50/50 dark:bg-slate-900/20 text-muted-foreground text-sm">
              No traffic flow data recorded for this period.
            </div>
          ) : (
            <Card className="border-border overflow-hidden">
              <CardContent className="p-2 sm:p-4">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="pl-4">Time of Day (Chronological)</TableHead>
                      <TableHead>Floor</TableHead>
                      <TableHead className="w-1/2 min-w-[220px] pr-4">Traffic Flow (In vs Out)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedData.map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-mono text-foreground font-semibold pl-4">
                          {String(row.hour).padStart(2, '0')}:00
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono">{row.floorName}</Badge>
                        </TableCell>
                        <TableCell className="pr-4">
                          <div className="flex flex-col gap-2.5 py-1">
                            <div className="flex items-center gap-3 text-xs">
                              <span className="w-16 text-right font-semibold text-blue-600 dark:text-blue-400">
                                <span className="text-muted-foreground font-normal mr-1">In:</span>{row.entryCount}
                              </span>
                              <Bar value={row.entryCount} max={maxCount} color="bg-blue-500" />
                            </div>
                            <div className="flex items-center gap-3 text-xs">
                              <span className="w-16 text-right font-semibold text-orange-600 dark:text-orange-400">
                                <span className="text-muted-foreground font-normal mr-1">Out:</span>{row.exitCount}
                              </span>
                              <Bar value={row.exitCount} max={maxCount} color="bg-orange-500" />
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
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

  // Insights calculation
  const highestOccupancy = data.length > 0 ? data.reduce((max, r) => (r.avgOccupancy > max.avgOccupancy ? r : max), data[0]) : null

  return (
    <div className="space-y-4">
      {loading && <p className="text-muted-foreground text-sm">Loading occupancy data...</p>}

      {!loading && (
        <>
          {/* Automatic Insight Banner */}
          {data.length > 0 && highestOccupancy && (
            <div className="flex items-center gap-3 p-3.5 rounded-lg border border-amber-500/20 bg-amber-500/5 text-amber-900 dark:text-amber-200 text-sm">
              <Info className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <div>
                <span className="font-semibold mr-1.5">Capacity Highlight:</span>
                Highest average occupancy is at <strong className="text-foreground">{highestOccupancy.floorName} - Zone {highestOccupancy.zone}</strong> ({highestOccupancy.avgOccupancy}% capacity).
              </div>
            </div>
          )}

          {data.length === 0 ? (
            <div className="text-center py-10 border rounded-lg border-dashed bg-slate-50/50 dark:bg-slate-900/20 text-muted-foreground text-sm">
              No occupancy data available.
            </div>
          ) : (
            <Card className="border-border overflow-hidden">
              <CardContent className="p-2 sm:p-4">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="pl-4">Floor</TableHead>
                      <TableHead>Zone</TableHead>
                      <TableHead>Vehicle Type</TableHead>
                      <TableHead className="text-center">Total Capacity</TableHead>
                      <TableHead className="text-center">Avg Occupancy Rate</TableHead>
                      <TableHead className="w-32 pr-4"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium text-foreground pl-4">
                          <Badge variant="outline" className="font-mono">{row.floorName}</Badge>
                        </TableCell>
                        <TableCell className="font-semibold">{row.zone}</TableCell>
                        <TableCell>
                          {formatVehicleType(row.vehicleType)}
                        </TableCell>
                        <TableCell className="text-center font-mono text-muted-foreground">{row.totalSlots} slots</TableCell>
                        <TableCell className="text-center font-bold">
                          <span className={row.avgOccupancy > 80 ? 'text-red-500' : row.avgOccupancy > 50 ? 'text-yellow-600 dark:text-yellow-500' : 'text-emerald-500'}>
                            {row.avgOccupancy}%
                          </span>
                        </TableCell>
                        <TableCell className="pr-4">
                          <Bar
                            value={row.avgOccupancy}
                            max={100}
                            color={row.avgOccupancy > 80 ? 'bg-red-500' : row.avgOccupancy > 50 ? 'bg-yellow-500' : 'bg-emerald-500'}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
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
  const getFilterDescription = () => {
    if (!date) return ''
    const d = new Date(date)
    if (period === 'daily') {
      return `Filter: ${d.toLocaleDateString('vi-VN')}`
    } else if (period === 'weekly') {
      return `Filter: Week containing ${d.toLocaleDateString('vi-VN')}`
    } else {
      return `Filter: Month ${d.getMonth() + 1}/${d.getFullYear()}`
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 bg-card p-3 rounded-lg border border-border">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="w-[140px] bg-background border-border font-medium">
            <SelectValue placeholder="Select period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="daily">Daily View</SelectItem>
            <SelectItem value="weekly">Weekly View</SelectItem>
            <SelectItem value="monthly">Monthly View</SelectItem>
          </SelectContent>
        </Select>
        
        <div className="relative">
          <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-auto pl-9 bg-background border-border font-medium"
          />
        </div>
      </div>

      <div className="text-xs font-medium text-muted-foreground bg-muted/60 px-3 py-1.5 rounded-md">
        {getFilterDescription()}
      </div>
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
    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2">
      <div
        className={`h-2 rounded-full ${color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
