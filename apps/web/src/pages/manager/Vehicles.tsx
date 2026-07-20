import { useState, useEffect } from 'react'
import { isAxiosError } from 'axios'
import {
  Search,
  Car,
  Users as UsersIcon,
  AlertCircle,
  Clock,
  CheckCircle,
  XCircle,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getPendingRequests, reviewRequest, VehicleRegistrationRequest } from '../../api/vehicleRegistrations'

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
  
  const [pendingRequests, setPendingRequests] = useState<VehicleRegistrationRequest[]>([])
  const [loadingRequests, setLoadingRequests] = useState(false)
  const [reviewingId, setReviewingId] = useState<string | null>(null)

  const fetchPendingRequests = async () => {
    setLoadingRequests(true)
    try {
      const data = await getPendingRequests()
      setPendingRequests(data)
    } catch (err) {
      toast.error('Failed to load pending vehicle registrations')
    } finally {
      setLoadingRequests(false)
    }
  }

  useEffect(() => {
    fetchPendingRequests()
  }, [])

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

  const handleReview = async (requestId: string, status: 'approved' | 'rejected') => {
    const reason = status === 'rejected' ? window.prompt('Reason for rejection:') : undefined
    if (status === 'rejected' && !reason) return

    setReviewingId(requestId)
    try {
      await reviewRequest(requestId, { status, rejectReason: reason || undefined })
      toast.success(`Request ${status} successfully`)
      fetchPendingRequests()
    } catch (err) {
      toast.error(getErrorMessage(err, `Failed to ${status} request`))
    } finally {
      setReviewingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Vehicle Registry
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage vehicle registrations, review requests, and look up vehicle records.
        </p>
      </div>

      <Tabs defaultValue="requests">
        <TabsList className="mb-4">
          <TabsTrigger value="requests">Pending Requests
            {pendingRequests.length > 0 && (
              <Badge variant="secondary" className="ml-2 bg-primary-100 text-primary-700">{pendingRequests.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="lookup">Vehicle Lookup</TabsTrigger>
        </TabsList>

        <TabsContent value="requests" className="space-y-4">
          <Card className="border-border">
            <CardHeader>
              <CardTitle>Driver Registration Requests</CardTitle>
              <CardDescription>Review and approve vehicle ownership claims submitted by drivers.</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingRequests ? (
                <div className="py-8 text-center text-muted-foreground">Loading requests...</div>
              ) : pendingRequests.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">No pending vehicle registration requests.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Plate Number</TableHead>
                      <TableHead>Vehicle Type</TableHead>
                      <TableHead>Driver</TableHead>
                      <TableHead>Submitted At</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingRequests.map(req => (
                      <TableRow key={req.id}>
                        <TableCell className="font-mono font-medium">{req.plateNumber}</TableCell>
                        <TableCell className="capitalize">{req.vehicleType}</TableCell>
                        <TableCell>
                          <div className="font-medium">{req.driver?.fullName || 'Unnamed'}</div>
                          <div className="text-xs text-muted-foreground">{req.driver?.phone}</div>
                        </TableCell>
                        <TableCell>{new Date(req.createdAt).toLocaleString('vi-VN')}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                              disabled={reviewingId === req.id}
                              onClick={() => handleReview(req.id, 'approved')}
                            >
                              <CheckCircle className="size-4 mr-1" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600 border-red-200 hover:bg-red-50"
                              disabled={reviewingId === req.id}
                              onClick={() => handleReview(req.id, 'rejected')}
                            >
                              <XCircle className="size-4 mr-1" />
                              Reject
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="lookup" className="space-y-6">
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Look Up Plate Number</CardTitle>
              <CardDescription>
                Enter a plate number to retrieve registered records and linked drivers.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSearch} className="flex gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={plateQuery}
                    onChange={(e) => setPlateQuery(e.target.value)}
                    placeholder="e.g. 59A12345"
                    className="pl-9 h-10 border-border"
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

          {vehicleData?.matched && vehicleData.vehicle && (
            <div className="grid gap-6 md:grid-cols-3">
              <div className="space-y-6 md:col-span-1">
                <Card className="border-border">
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
                      <span className="text-xs text-muted-foreground block">Plate Number</span>
                      <span className="font-mono font-bold text-lg text-primary-600 dark:text-primary-400">
                        {vehicleData.vehicle.plateNumber}
                      </span>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground block">Type</span>
                      <Badge variant="outline" className="capitalize mt-1">
                        {vehicleData.vehicle.vehicleType}
                      </Badge>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground block">Registered At</span>
                      <span className="font-medium">
                        {new Date(vehicleData.vehicle.registeredAt).toLocaleDateString('vi-VN')}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border">
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
                        <div className="text-xs text-muted-foreground space-y-1">
                          <p>Valid from: {new Date(vehicleData.activeSubscription.validFrom).toLocaleDateString('vi-VN')}</p>
                          <p>Valid to: {new Date(vehicleData.activeSubscription.validTo).toLocaleDateString('vi-VN')}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="text-muted-foreground py-2 flex items-center gap-2">
                        <AlertCircle className="size-4 text-muted-foreground" />
                        <span>No active subscription (Walk-in rate)</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-6 md:col-span-2">
                <Card className="border-border">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <UsersIcon className="size-4 text-muted-foreground" />
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
                            <TableCell colSpan={3} className="text-center py-6 text-muted-foreground">
                              No users linked to this vehicle.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                {vehicleData.recentSessions.length > 0 && (
                  <Card className="border-border">
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <Clock className="size-4 text-muted-foreground" />
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
        </TabsContent>
      </Tabs>
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
