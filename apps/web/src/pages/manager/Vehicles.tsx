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
  Camera,
  FileText,
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
import { Progress } from '@/components/ui/progress'
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { getPendingRequests, reviewRequest, getRegistrationHistory, VehicleRegistrationRequest } from '../../api/vehicleRegistrations'
import { formatPlateForDisplay, normalizePlateForApi, formatVehicleType } from '../../lib/plate-format'

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
  const [searchProgress, setSearchProgress] = useState(0)
  const [vehicleData, setVehicleData] = useState<MatchedVehicleSummary | null>(null)
  
  const [pendingRequests, setPendingRequests] = useState<VehicleRegistrationRequest[]>([])
  const [loadingRequests, setLoadingRequests] = useState(false)
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [historyRequests, setHistoryRequests] = useState<VehicleRegistrationRequest[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [activeTab, setActiveTab] = useState('registry')
  const [selectedViewerRequest, setSelectedViewerRequest] = useState<VehicleRegistrationRequest | null>(null)
  const [activeViewerTab, setActiveViewerTab] = useState<'cavet' | 'vehicle' | 'plate'>('cavet')

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

  const fetchHistoryRequests = async () => {
    setLoadingHistory(true)
    try {
      const data = await getRegistrationHistory()
      setHistoryRequests(data)
    } catch (err) {
      toast.error('Failed to load vehicle registration history')
    } finally {
      setLoadingHistory(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'requests') {
      fetchPendingRequests()
      fetchHistoryRequests()
    }
  }, [activeTab])

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    const normalizedQuery = normalizePlateForApi(plateQuery)
    if (!normalizedQuery) return

    setSearching(true)
    setSearchProgress(0)
    setVehicleData(null)

    // Simulate progress for UX
    const progressInterval = setInterval(() => {
      setSearchProgress((prev) => {
        if (prev >= 90) return prev
        return prev + 15
      })
    }, 100)

    try {
      const { data } = await api.get<MatchedVehicleSummary>(
        `/vehicles/match-plate?plateNumber=${encodeURIComponent(normalizedQuery)}`
      )
      
      clearInterval(progressInterval)
      setSearchProgress(100)

      setTimeout(() => {
        setVehicleData(data)
        if (!data.matched) {
          toast.info('No active registered vehicle found for this plate number.')
        } else {
          toast.success('Vehicle loaded successfully.')
        }
        setSearching(false)
        setSearchProgress(0)
      }, 300)
    } catch (err) {
      clearInterval(progressInterval)
      setSearchProgress(0)
      toast.error(getErrorMessage(err, 'Failed to look up vehicle'))
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

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="registry">Vehicle Registry</TabsTrigger>
          <TabsTrigger value="requests">Registration Requests
            {pendingRequests.length > 0 && (
              <Badge variant="secondary" className="ml-2 bg-primary-100 text-primary-700">{pendingRequests.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="requests" className="space-y-8">
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
                      <TableHead>Evidence</TableHead>
                      <TableHead>Submitted At</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingRequests.map(req => (
                      <TableRow key={req.id}>
                        <TableCell className="font-mono font-medium">{formatPlateForDisplay(req.plateNumber)}</TableCell>
                        <TableCell className="font-medium">{formatVehicleType(req.vehicleType)}</TableCell>
                        <TableCell>
                          <div className="font-medium">{req.driver?.fullName || 'Unnamed'}</div>
                          <div className="text-xs text-muted-foreground">{req.driver?.phone}</div>
                        </TableCell>
                        <TableCell>
                          {req.evidenceUrlCaVant || req.evidenceUrlOverall || req.evidenceUrlPlate ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 font-semibold text-xs border-sky-300 bg-sky-50/70 text-sky-700 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300"
                              onClick={() => {
                                setSelectedViewerRequest(req)
                                setActiveViewerTab('cavet')
                              }}
                            >
                              <Camera className="size-3.5 mr-1 text-sky-600" />
                              View Photos (3)
                            </Button>
                          ) : (
                            <span className="text-muted-foreground italic text-xs">No evidence</span>
                          )}
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

          <Card className="border-border">
            <CardHeader>
              <CardTitle>Registration History</CardTitle>
              <CardDescription>Log of past vehicle registration reviews.</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingHistory ? (
                <div className="py-8 text-center text-muted-foreground">Loading history...</div>
              ) : historyRequests.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">No registration history available.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Plate Number</TableHead>
                      <TableHead>Vehicle Type</TableHead>
                      <TableHead>Driver</TableHead>
                      <TableHead>Evidence</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Reviewed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historyRequests.map(req => (
                      <TableRow key={req.id}>
                        <TableCell className="font-mono font-medium">{formatPlateForDisplay(req.plateNumber)}</TableCell>
                        <TableCell className="font-medium">{formatVehicleType(req.vehicleType)}</TableCell>
                        <TableCell>
                          <div className="font-medium">{req.driver?.fullName || 'Unnamed'}</div>
                          <div className="text-xs text-muted-foreground">{req.driver?.phone}</div>
                        </TableCell>
                        <TableCell>
                          {req.evidenceUrlCaVant || req.evidenceUrlOverall || req.evidenceUrlPlate ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 font-semibold text-xs border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300"
                              onClick={() => {
                                setSelectedViewerRequest(req)
                                setActiveViewerTab('cavet')
                              }}
                            >
                              <Camera className="size-3.5 mr-1 text-slate-600" />
                              View Photos (3)
                            </Button>
                          ) : (
                            <span className="text-muted-foreground italic text-xs">N/A</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={req.status === 'approved' ? 'default' : req.status === 'rejected' ? 'destructive' : 'secondary'} className="capitalize">
                            {req.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {req.reviewedAt ? (
                            <div>
                              <div className="text-sm">{new Date(req.reviewedAt).toLocaleString('vi-VN')}</div>
                              <div className="text-xs text-muted-foreground">by {req.reviewedBy?.fullName || 'System'}</div>
                            </div>
                          ) : '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="registry" className="space-y-6">
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
                  <Search className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={plateQuery}
                    onChange={(e) => setPlateQuery(e.target.value)}
                    placeholder="e.g. 59A12345"
                    className="pl-11 h-12 text-lg font-semibold uppercase border-border shadow-sm"
                  />
                </div>
                <Button type="submit" disabled={searching} className="h-12 px-6 font-medium shadow-sm transition-all duration-300">
                  {searching ? 'Searching...' : 'Search'}
                </Button>
              </form>
              
              {searching && (
                <div className="mt-6 space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="flex justify-between text-xs font-medium text-muted-foreground">
                    <span>Searching database for {plateQuery}...</span>
                    <span>{searchProgress}%</span>
                  </div>
                  <Progress value={searchProgress} className="h-1.5" />
                </div>
              )}
            </CardContent>
          </Card>

          {!vehicleData && !searching && (
            <div className="flex flex-col items-center justify-center py-16 text-center border rounded-xl bg-slate-50/50 dark:bg-slate-900/20 border-dashed">
              <div className="flex size-14 items-center justify-center rounded-full bg-white dark:bg-slate-800 text-slate-400 shadow-sm mb-4 ring-1 ring-slate-100 dark:ring-slate-700">
                <Search className="size-6" />
              </div>
              <h3 className="text-lg font-semibold">Ready to search</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                Enter a license plate number above to look up vehicle details, subscription state, and recent parking sessions.
              </p>
            </div>
          )}

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
                <Card className="border-border flex flex-col h-full">
                  <CardHeader className="flex flex-row items-start justify-between pb-4 space-y-0">
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 items-center justify-center rounded-lg bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-400">
                        <Car className="size-5" />
                      </div>
                      <div>
                        <CardTitle className="text-base">Vehicle Details</CardTitle>
                        <CardDescription>System metadata</CardDescription>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="h-8 text-xs font-medium">
                      Manage
                    </Button>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col space-y-6 text-sm">
                    <div className="space-y-5">
                      <div>
                        <span className="text-xs font-medium text-muted-foreground block mb-2">Plate Number</span>
                        <div className="inline-block bg-white dark:bg-slate-950 border-2 border-slate-900 dark:border-slate-700 rounded-md px-4 py-1.5 shadow-sm">
                          <span className="font-mono font-black text-xl text-slate-900 dark:text-slate-100 tracking-wider">
                            {formatPlateForDisplay(vehicleData.vehicle.plateNumber)}
                          </span>
                        </div>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground block">Type</span>
                        <Badge variant="outline" className="font-medium mt-1">
                          {formatVehicleType(vehicleData.vehicle.vehicleType)}
                        </Badge>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground block">Registered At</span>
                        <span className="font-medium">
                          {new Date(vehicleData.vehicle.registeredAt).toLocaleDateString('vi-VN')}
                        </span>
                      </div>
                    </div>

                    <div className="pt-5 mt-auto border-t border-dashed border-border">
                      <h4 className="text-sm font-semibold mb-3">Subscription State</h4>
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
                        <div className="flex items-center justify-between py-1">
                          <div className="flex items-center gap-2 text-muted-foreground font-medium">
                            <AlertCircle className="size-4" />
                            <span>No active subscription</span>
                          </div>
                          <Badge variant="secondary" className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400">
                            Walk-in Rate
                          </Badge>
                        </div>
                      )}
                    </div>
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
                              <TableCell className="pl-6">
                                <div className="flex items-center gap-3">
                                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-400 ring-1 ring-slate-200 dark:ring-white/10">
                                    {user.fullName?.charAt(0).toUpperCase() || 'U'}
                                  </div>
                                  <span className="font-medium text-foreground">{user.fullName || 'Unnamed User'}</span>
                                </div>
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

      <Dialog open={!!selectedViewerRequest} onOpenChange={(open) => !open && setSelectedViewerRequest(null)}>
        <DialogContent className="sm:max-w-4xl max-w-[95vw] p-6">
          <DialogHeader>
            <div className="flex items-center justify-between pr-4">
              <div>
                <DialogTitle className="text-lg font-bold flex items-center gap-2">
                  <span>Vehicle Verification Documents (3 Photos)</span>
                  {selectedViewerRequest?.plateNumber && (
                    <Badge className="font-mono text-xs font-bold">{formatPlateForDisplay(selectedViewerRequest.plateNumber)}</Badge>
                  )}
                </DialogTitle>
                <DialogDescription className="mt-1 text-xs">
                  Review uploaded verification documents submitted by <strong>{selectedViewerRequest?.driver?.fullName || 'Driver'}</strong> ({selectedViewerRequest?.driver?.phone || 'No phone'}).
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* 3 Document Tab Bar */}
          <div className="grid grid-cols-3 gap-2 rounded-xl bg-muted/40 p-1.5 text-xs font-semibold">
            <button
              type="button"
              className={`flex items-center justify-center gap-1.5 rounded-lg py-2 transition-all ${
                activeViewerTab === 'cavet'
                  ? 'bg-background text-foreground font-bold shadow-xs border'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setActiveViewerTab('cavet')}
            >
              <FileText className="size-3.5 text-primary" />
              <span>1. Cà vẹt xe</span>
            </button>
            <button
              type="button"
              className={`flex items-center justify-center gap-1.5 rounded-lg py-2 transition-all ${
                activeViewerTab === 'vehicle'
                  ? 'bg-background text-foreground font-bold shadow-xs border'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setActiveViewerTab('vehicle')}
            >
              <Car className="size-3.5 text-primary" />
              <span>2. Ảnh tổng thể xe</span>
            </button>
            <button
              type="button"
              className={`flex items-center justify-center gap-1.5 rounded-lg py-2 transition-all ${
                activeViewerTab === 'plate'
                  ? 'bg-background text-foreground font-bold shadow-xs border'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setActiveViewerTab('plate')}
            >
              <Camera className="size-3.5 text-primary" />
              <span>3. Cận cảnh biển số</span>
            </button>
          </div>

          {/* Photo Container */}
          <div className="relative flex flex-col items-center justify-center rounded-xl border bg-slate-950/90 p-4 min-h-[380px] overflow-hidden">
            {(() => {
              const src =
                activeViewerTab === 'cavet'
                  ? selectedViewerRequest?.evidenceUrlCaVant
                  : activeViewerTab === 'vehicle'
                  ? selectedViewerRequest?.evidenceUrlOverall
                  : selectedViewerRequest?.evidenceUrlPlate
              return src ? (
                <>
                  <img
                    src={src}
                    alt={activeViewerTab}
                    className="max-h-[55vh] max-w-full rounded-lg object-contain shadow-md transition-all duration-300"
                  />
                  <div className="absolute bottom-3 left-3 rounded-md bg-black/70 backdrop-blur px-3 py-1.5 text-xs font-semibold text-white">
                    {activeViewerTab === 'cavet' && '📄 Document 1/3: Registration Certificate (Cà vẹt xe)'}
                    {activeViewerTab === 'vehicle' && '🚗 Document 2/3: Overall Vehicle Photo'}
                    {activeViewerTab === 'plate' && '📷 Document 3/3: License Plate Close-up Photo'}
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground italic">No image uploaded</p>
              )
            })()}
          </div>

          {/* Footer Action Bar */}
          {selectedViewerRequest && selectedViewerRequest.status === 'pending' ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t pt-3.5">
              <p className="text-xs text-muted-foreground">Verify all 3 photos before granting vehicle access.</p>
              <div className="flex items-center gap-2 self-end sm:self-auto">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-rose-600 border-rose-200 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300"
                  disabled={reviewingId === selectedViewerRequest.id}
                  onClick={() => {
                    handleReview(selectedViewerRequest.id, 'rejected')
                    setSelectedViewerRequest(null)
                  }}
                >
                  <XCircle className="size-4 mr-1.5" />
                  Reject Request
                </Button>
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                  disabled={reviewingId === selectedViewerRequest.id}
                  onClick={() => {
                    handleReview(selectedViewerRequest.id, 'approved')
                    setSelectedViewerRequest(null)
                  }}
                >
                  <CheckCircle className="size-4 mr-1.5" />
                  Approve Vehicle
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
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
