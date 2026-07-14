import { useState } from 'react'
import { isAxiosError } from 'axios'
import {
  Search,
  Car,
  UserPlus,
  Users as UsersIcon,
  AlertCircle,
  Clock,
} from 'lucide-react'
import { toast } from 'sonner'
import api from '../../lib/api'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'

interface User {
  id: string
  phone: string
  fullName: string | null
  role: string
}

interface MatchedVehicleSummary {
  inputPlate: string
  normalizedPlate: string
  matched: boolean
  vehicle: null | {
    id: string
    plateNumber: string
    vehicleType: string
    isActive: boolean
    registeredAt: string
  }
  owner: null | {
    id: string
    fullName: string | null
    phone: string
    role: string
  }
  linkedUsers: Array<{
    id: string
    fullName: string | null
    phone: string
    role: string
  }>
  activeSubscription: null | {
    id: string
    planType: string
    validFrom: string
    validTo: string
  }
  recentSessions: Array<{
    id: string
    licensePlate: string
    status: string
    checkInTime: string
    checkOutTime: string | null
    slot: {
      code: string
      floor: {
        name: string
      }
    }
  }>
}

export default function Vehicles() {
  const [plateQuery, setPlateQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [vehicleData, setVehicleData] = useState<MatchedVehicleSummary | null>(null)
  
  // Link user form state
  const [phoneQuery, setPhoneQuery] = useState('')
  const [lookupLoading, setLookupLoading] = useState(false)
  const [resolvedDriver, setResolvedDriver] = useState<User | null>(null)
  const [phoneLookupError, setPhoneLookupError] = useState(false)
  const [linkRole, setLinkRole] = useState<'owner' | 'driver'>('driver')
  const [linking, setLinking] = useState(false)

  const handleLookupDriver = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!phoneQuery.trim()) return

    setLookupLoading(true)
    setResolvedDriver(null)
    setPhoneLookupError(false)
    try {
      const { data } = await api.get<User>(
        `/users/lookup-by-phone?phone=${encodeURIComponent(phoneQuery.trim())}`
      )
      if (data.role !== 'driver') {
        toast.error('The user found is not a Driver. Only Drivers can be linked to vehicles.')
      } else {
        setResolvedDriver(data)
        toast.success(`Driver found: ${data.fullName || 'Unnamed'}`)
      }
    } catch {
      setPhoneLookupError(true)
      toast.error('Driver not found with this phone number.')
    } finally {
      setLookupLoading(false)
    }
  }

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!plateQuery.trim()) return

    setSearching(true)
    setVehicleData(null)
    try {
      const { data } = await api.get<MatchedVehicleSummary>(
        `/vehicles/match-plate?plateNumber=${encodeURIComponent(plateQuery)}`
      )
      setVehicleData(data)
      if (!data.matched) {
        toast.info('No active registered vehicle found for this plate number.')
      } else {
        toast.success('Vehicle loaded successfully.')
      }
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to look up vehicle'))
    } finally {
      setSearching(false)
    }
  }

  const handleLinkUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!vehicleData?.vehicle || !resolvedDriver) return

    setLinking(true)
    try {
      await api.post(`/vehicles/${vehicleData.vehicle.id}/users`, {
        userId: resolvedDriver.id,
        role: linkRole,
      })
      toast.success('User linked to vehicle successfully!')
      
      // Reload vehicle data
      const { data } = await api.get<MatchedVehicleSummary>(
        `/vehicles/match-plate?plateNumber=${encodeURIComponent(vehicleData.vehicle.plateNumber)}`
      )
      setVehicleData(data)
      setResolvedDriver(null)
      setPhoneQuery('')
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to link user to vehicle'))
    } finally {
      setLinking(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white md:text-3xl">
          Vehicle & Ownership Registry
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Look up vehicles, view driver ownership details, and manage linked operators.
        </p>
      </div>

      {/* Search Bar */}
      <Card className="border-slate-200 dark:border-white/10">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Look Up Plate Number</CardTitle>
          <CardDescription>
            Enter a plate number to retrieve registered records and linked drivers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={plateQuery}
                onChange={(e) => setPlateQuery(e.target.value)}
                placeholder="e.g. 59A12345"
                className="pl-9 h-10 border-slate-200 dark:border-white/10"
              />
            </div>
            <Button type="submit" disabled={searching} className="h-10 px-5">
              {searching ? 'Searching...' : 'Search'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {vehicleData && !vehicleData.matched && (
        <Alert variant="destructive" className="border-red-200 bg-red-50 text-red-900 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-200">
          <AlertCircle className="size-4" />
          <AlertTitle>No Vehicle Record</AlertTitle>
          <AlertDescription>
            No active vehicle matches "{plateQuery}". Vehicles are registered automatically upon first check-in or by drivers on their mobile app.
          </AlertDescription>
        </Alert>
      )}

      {/* Vehicle Details & Management */}
      {vehicleData?.matched && vehicleData.vehicle && (
        <div className="grid gap-6 md:grid-cols-3">
          {/* Left Col: Vehicle & Subscription Info */}
          <div className="space-y-6 md:col-span-1">
            <Card className="border-slate-200 dark:border-white/10">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-400">
                    <Car className="size-4" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Vehicle Details</CardTitle>
                    <CardDescription>System metadata</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div>
                  <span className="text-xs text-slate-500 block">Plate Number</span>
                  <span className="font-mono font-bold text-lg text-primary-600 dark:text-primary-400">
                    {vehicleData.vehicle.plateNumber}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Type</span>
                  <Badge variant="outline" className="capitalize mt-1">
                    {vehicleData.vehicle.vehicleType}
                  </Badge>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Registered At</span>
                  <span className="font-medium">
                    {new Date(vehicleData.vehicle.registeredAt).toLocaleDateString('vi-VN')}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Subscription Card */}
            <Card className="border-slate-200 dark:border-white/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Subscription State</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                {vehicleData.activeSubscription ? (
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white">Active Plan</Badge>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400 capitalize">
                        {vehicleData.activeSubscription.planType}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 space-y-1">
                      <p>Valid from: {new Date(vehicleData.activeSubscription.validFrom).toLocaleDateString('vi-VN')}</p>
                      <p>Valid to: {new Date(vehicleData.activeSubscription.validTo).toLocaleDateString('vi-VN')}</p>
                    </div>
                  </div>
                ) : (
                  <div className="text-slate-500 py-2 flex items-center gap-2">
                    <AlertCircle className="size-4 text-slate-400" />
                    <span>No active subscription (Walk-in rate)</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Col: Operators & Link User */}
          <div className="space-y-6 md:col-span-2">
            {/* Linked Users Table */}
            <Card className="border-slate-200 dark:border-white/10">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <UsersIcon className="size-4 text-slate-500" />
                  <CardTitle className="text-base">Linked Drivers & Owners</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-6">Driver</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Role</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vehicleData.linkedUsers.length > 0 ? (
                      vehicleData.linkedUsers.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell className="pl-6 font-medium">
                            {user.fullName || 'Unnamed User'}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{user.phone}</TableCell>
                          <TableCell>
                            <Badge
                              variant={user.role === 'owner' ? 'default' : 'secondary'}
                              className={user.role === 'owner' ? 'bg-primary-600 text-white' : ''}
                            >
                              {user.role === 'owner' ? 'Owner' : 'Driver'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center py-6 text-slate-500">
                          No users linked to this vehicle.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Link User Form */}
            <Card className="border-slate-200 dark:border-white/10">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <UserPlus className="size-4 text-slate-500" />
                  <CardTitle className="text-base">Link Driver to Vehicle</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Step 1: Lookup Driver by Phone */}
                  <form onSubmit={handleLookupDriver} className="space-y-2">
                    <Label htmlFor="driver-phone">Driver Phone Number</Label>
                    <div className="flex gap-2">
                      <Input
                        id="driver-phone"
                        value={phoneQuery}
                        onChange={(e) => {
                          setPhoneQuery(e.target.value)
                          setResolvedDriver(null)
                          setPhoneLookupError(false)
                        }}
                        placeholder="e.g. 0944941764"
                        className="border-slate-200 dark:border-white/10 flex-1 h-10"
                      />
                      <Button
                        type="submit"
                        variant="outline"
                        disabled={lookupLoading || !phoneQuery.trim()}
                        className="h-10 px-4 shrink-0"
                      >
                        {lookupLoading ? 'Looking up...' : 'Look Up'}
                      </Button>
                    </div>
                  </form>

                  {/* Step 2: Show resolved driver and linkage form */}
                  {resolvedDriver ? (
                    <form onSubmit={handleLinkUser} className="space-y-4 border-t pt-4 mt-4">
                      <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/30 p-3 text-sm flex items-center justify-between">
                        <div>
                          <p className="font-bold text-emerald-800 dark:text-emerald-300">
                            Driver Found: {resolvedDriver.fullName || 'Unnamed User'}
                          </p>
                          <p className="text-xs text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">
                            Phone: {resolvedDriver.phone}
                          </p>
                        </div>
                        <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white capitalize">
                          {resolvedDriver.role}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="link-role">Relationship Role</Label>
                          <Select value={linkRole} onValueChange={(v) => setLinkRole(v as 'owner' | 'driver')}>
                            <SelectTrigger id="link-role" className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="driver">Driver (Allowed to park)</SelectItem>
                              <SelectItem value="owner">Owner (Sole vehicle owner)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="flex items-end">
                          <Button type="submit" disabled={linking} className="w-full h-10">
                            {linking ? 'Linking...' : 'Link User'}
                          </Button>
                        </div>
                      </div>
                    </form>
                  ) : phoneLookupError ? (
                    <Alert variant="destructive" className="border-red-200 bg-red-50 text-red-900 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-200">
                      <AlertCircle className="size-4" />
                      <AlertTitle>Driver Not Found</AlertTitle>
                      <AlertDescription>
                        No active driver registered with phone number "{phoneQuery}". Please verify and try again.
                      </AlertDescription>
                    </Alert>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            {/* Recent Sessions */}
            {vehicleData.recentSessions.length > 0 && (
              <Card className="border-slate-200 dark:border-white/10">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Clock className="size-4 text-slate-500" />
                    <CardTitle className="text-base">Recent Sessions</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-6">Slot</TableHead>
                        <TableHead>Check-in</TableHead>
                        <TableHead>Check-out</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {vehicleData.recentSessions.map((session) => (
                        <TableRow key={session.id}>
                          <TableCell className="pl-6 font-medium">
                            {session.slot.floor.name} - {session.slot.code}
                          </TableCell>
                          <TableCell className="text-xs">
                            {new Date(session.checkInTime).toLocaleString('vi-VN')}
                          </TableCell>
                          <TableCell className="text-xs">
                            {session.checkOutTime
                              ? new Date(session.checkOutTime).toLocaleString('vi-VN')
                              : '-'}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={session.status === 'active' ? 'default' : 'secondary'}
                              className={session.status === 'active' ? 'bg-emerald-500 hover:bg-emerald-600 text-white' : ''}
                            >
                              {session.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function getErrorMessage(err: unknown, fallback: string) {
  if (!isAxiosError(err)) return fallback
  const message = err.response?.data?.message
  if (typeof message === 'string') return message
  if (Array.isArray(message)) return message.join(', ')
  return fallback
}
