import { useEffect, useState } from 'react'
import { CheckCircle2, AlertTriangle, LogOut, Loader2, Camera, Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { fetchEvidenceImageBlobResult, type CheckoutWorkflowResponse } from '../../lib/sessions-api'
import { normalizeVehicleType, VEHICLE_TYPE_LABEL } from '../../lib/vehicle-type'

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount)
}

export interface CheckoutPreviewModalProps {
  previewData: CheckoutWorkflowResponse
  checkoutSnapshotUrl: string | null
  exitConfidence: number | null
  exitPlate: string | null
  exitVehicleType: string | null
  submitting: boolean
  onConfirm: () => void
  onCancel: () => void
  onOverride: () => void
}

export function CheckoutPreviewModal({
  previewData,
  checkoutSnapshotUrl,
  exitConfidence,
  exitPlate,
  exitVehicleType,
  submitting,
  onConfirm,
  onCancel,
  onOverride,
}: CheckoutPreviewModalProps) {
  const { session, checkOutLane, fee, checkInEvidence } = previewData

  const [entryImageUrl, setEntryImageUrl] = useState<string | null>(null)
  const [entryImageFailed, setEntryImageFailed] = useState(false)
  
  const hasImage = (checkInEvidence?.status === 'LINKED' || checkInEvidence?.status === 'AUTO_RECONCILED')
    && (checkInEvidence.thumbnailUrl != null || checkInEvidence.imageUrl != null)

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    const path = checkInEvidence?.thumbnailUrl ?? checkInEvidence?.imageUrl
    
    if (hasImage && path) {
      void fetchEvidenceImageBlobResult(path).then((result) => {
        if (!cancelled) {
          if (result.status === 'loaded' && result.url) {
            objectUrl = result.url
            setEntryImageUrl(objectUrl)
            setEntryImageFailed(false)
          } else {
            setEntryImageFailed(true)
          }
        }
      })
    } else {
      setEntryImageFailed(false)
    }
    
    return () => {
      cancelled = true
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [checkInEvidence?.thumbnailUrl, checkInEvidence?.imageUrl, hasImage])

  const evidenceStatus = checkInEvidence?.status ?? 'MISSING'

  // Plate was corrected by staff only when OCR produced a reading that differs
  // from what the staff confirmed. Pure manual entry (no OCR) is NOT a correction.
  const isPlateCorrected =
    !!session.plateNumberOcr &&
    session.plateNumberOcr !== (session.plateNumberConfirmed ?? session.licensePlate)

  const EvidenceStatusBadge = () => {
    if (evidenceStatus === 'LINKED') {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="size-3" /> OCR Evidence Linked
        </span>
      )
    }
    if (evidenceStatus === 'AUTO_RECONCILED') {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-teal-600 dark:text-teal-400">
          <CheckCircle2 className="size-3" /> Auto-Reconciled
        </span>
      )
    }
    if (evidenceStatus === 'MANUAL_ENTRY' && isPlateCorrected) {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
          <Pencil className="size-3" /> Plate Corrected
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
        <AlertTriangle className="size-3" /> Missing Evidence
      </span>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
      <Card className="w-full max-w-4xl shadow-2xl border-none overflow-hidden flex flex-col bg-slate-50/90 dark:bg-slate-900/90 h-[90vh] sm:h-auto sm:max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-primary px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="bg-primary-foreground/20 p-2 rounded-full">
              <LogOut className="size-6 text-primary-foreground" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-primary-foreground">Checkout Preview</h2>
              <p className="text-sm text-primary-foreground/80 font-medium">
                Verify session details before final checkout
              </p>
            </div>
          </div>
          <Badge variant="outline" className="text-primary-foreground border-primary-foreground/30 px-3 py-1 bg-primary-foreground/10 text-sm">
            {session.sessionCode}
          </Badge>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-900/50 flex flex-col p-4 sm:p-6 gap-4">
          
          {/* EVIDENCE SECTION (LARGE) */}
          <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col">
            <div className="grid grid-cols-2 gap-6">
              
              {/* Entry Evidence */}
              <div className="flex flex-col min-w-0">
                <div className="flex items-center justify-between mb-3 shrink-0">
                  <p className="text-xs font-semibold text-slate-500 uppercase">Entry Evidence</p>
                  <EvidenceStatusBadge />
                </div>
                <div className="aspect-video w-full bg-slate-100 dark:bg-slate-900 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 relative">
                  {hasImage && entryImageUrl ? (
                    <img 
                      src={entryImageUrl} 
                      alt="Entry Evidence" 
                      className="w-full h-full object-contain bg-black/5" 
                    />
                  ) : hasImage && !entryImageFailed ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-2 p-2">
                      <Loader2 className="size-5 animate-spin opacity-50" />
                      <span className="text-sm">Loading image...</span>
                    </div>
                  ) : evidenceStatus === 'MANUAL_ENTRY' ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-2 p-2">
                      <Camera className="size-5 opacity-30" />
                      <span className="text-sm text-center">Not available</span>
                      <span className="text-xs text-center opacity-70">Vehicle identified via manual plate entry</span>
                    </div>
                  ) : evidenceStatus === 'MISSING' ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-2 p-2">
                      <AlertTriangle className="size-5 opacity-40 text-amber-400" />
                      <span className="text-sm text-center">Not available</span>
                      <span className="text-xs text-center opacity-70">No check-in evidence was recorded</span>
                    </div>
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-2 p-2">
                      <AlertTriangle className="size-5 opacity-40" />
                      <span className="text-sm text-center">Image load failed</span>
                    </div>
                  )}
                </div>
                <div className="mt-4 shrink-0 flex flex-col gap-1 px-1">
                  <p className="text-base text-slate-500 dark:text-slate-400">
                    Plate: <span className="font-bold text-slate-900 dark:text-slate-100">{session.plateDisplay ?? session.licensePlate}</span>
                  </p>
                  {isPlateCorrected && (
                    <p className="text-base text-slate-500 dark:text-slate-400">
                      Corrected: <span className="font-medium text-slate-900 dark:text-slate-100 line-through">{session.plateNumberOcr}</span>
                      {' → '}
                      <span className="font-medium text-slate-900 dark:text-slate-100">{session.plateDisplay ?? session.licensePlate}</span>
                      {session.checkedInByName ? (
                        <span className="ml-1 text-slate-400">by {session.checkedInByName}</span>
                      ) : session.checkedInById ? (
                        <span className="ml-1 text-slate-400">by staff {session.checkedInById.slice(0, 8)}</span>
                      ) : null}
                    </p>
                  )}
                  {checkInEvidence?.ocrConfidence != null && !isPlateCorrected && (
                    <p className="text-base text-slate-500 dark:text-slate-400">
                      Confidence: <span className="font-medium text-slate-900 dark:text-slate-100">{Math.round(checkInEvidence.ocrConfidence * 100)}%</span>
                    </p>
                  )}
                  {checkInEvidence?.vehicleType && !isPlateCorrected && (
                    <p className="text-base text-slate-500 dark:text-slate-400">
                      Type: <span className="font-medium text-slate-900 dark:text-slate-100 capitalize">{checkInEvidence.vehicleType.toLowerCase()}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Exit Evidence */}
              <div className="flex flex-col min-w-0">
                <p className="text-xs font-semibold text-primary uppercase mb-3 shrink-0">Live Exit Snapshot</p>
                <div className="aspect-video w-full bg-slate-100 dark:bg-slate-900 rounded-lg overflow-hidden border-2 border-primary/40 relative">
                  {checkoutSnapshotUrl ? (
                    <img 
                      src={checkoutSnapshotUrl} 
                      alt="Exit Evidence" 
                      className="w-full h-full object-contain bg-black/5" 
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm p-2">
                      Live snapshot unavailable
                    </div>
                  )}
                </div>
                <div className="mt-4 shrink-0 flex flex-col gap-1 px-1">
                  <p className="text-base text-slate-500 dark:text-slate-400">
                    Plate: <span className="font-bold text-slate-900 dark:text-slate-100">{exitPlate ?? session.plateDisplay ?? session.licensePlate}</span>
                  </p>
                  {exitConfidence != null && (
                    <p className="text-base text-slate-500 dark:text-slate-400">
                      Confidence: <span className="font-medium text-slate-900 dark:text-slate-100">{Math.round(exitConfidence * 100)}%</span>
                    </p>
                  )}
                  {exitVehicleType && (
                    <p className="text-base text-slate-500 dark:text-slate-400">
                      Type: <span className="font-medium text-slate-900 dark:text-slate-100 capitalize">{exitVehicleType.toLowerCase()}</span>
                    </p>
                  )}
                </div>
              </div>

            </div>
          </div>

          {/* VERIFICATION SUMMARY SECTION */}
          <div className="shrink-0 bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col gap-2">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Verification Summary</h3>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-medium">
                <CheckCircle2 className="size-4" /> Plate Match
              </div>
              
              {checkInEvidence?.vehicleType && exitVehicleType ? (() => {
                const entryCanonical = normalizeVehicleType(checkInEvidence.vehicleType)
                const exitCanonical  = normalizeVehicleType(exitVehicleType)
                return entryCanonical === exitCanonical ? (
                  <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-medium">
                    <CheckCircle2 className="size-4" /> Vehicle Type Match
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-medium">
                    <AlertTriangle className="size-4" />
                    Vehicle Type Mismatch — Entry:{' '}
                    <span className="font-semibold">{VEHICLE_TYPE_LABEL[entryCanonical]}</span>
                    {' '}vs Exit:{' '}
                    <span className="font-semibold">{VEHICLE_TYPE_LABEL[exitCanonical]}</span>
                  </div>
                )
              })() : null}
            </div>
          </div>

          {/* FEE SUMMARY SECTION */}
          <div className="shrink-0 bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <div className="flex items-center gap-8">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Total Amount</p>
                <p className="text-4xl font-bold text-primary leading-none">{formatCurrency(fee.total)}</p>
              </div>
              
              <div className="h-12 w-px bg-slate-200 dark:bg-slate-700 mx-2"></div>
              
              <div className="flex flex-col gap-1.5 text-base text-slate-600 dark:text-slate-400">
                <p>Duration: <span className="font-medium text-slate-900 dark:text-slate-100">{fee.durationHours}h</span></p>
                <p>Exit lane: <span className="font-medium text-slate-900 dark:text-slate-100">{checkOutLane ? `${checkOutLane.code} (${checkOutLane.vehicleType === 'car' ? 'Car' : 'Motorbike'})` : 'Ground floor'}</span></p>
              </div>
            </div>
            
            <div className="flex items-center gap-6">
              {fee.penalty > 0 && (
                <div className="flex flex-col items-end">
                  <span className="text-xs font-semibold text-rose-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                    <AlertTriangle className="size-3" /> Includes Penalty
                  </span>
                  <span className="text-xl font-bold text-rose-600">{formatCurrency(fee.penalty)}</span>
                </div>
              )}
              {session.isPaid && fee.total > 0 && (
                <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300 px-3 py-1 text-sm h-auto">
                  Already Paid
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-4 shrink-0 flex items-center justify-between gap-4">
          <Button 
            variant="ghost" 
            onClick={onCancel}
            disabled={submitting}
            className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
          >
            Cancel [Esc]
          </Button>
          <div className="flex items-center gap-3">
            <Button 
              variant="outline" 
              onClick={onOverride}
              disabled={submitting}
              className="border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 bg-transparent hover:bg-slate-50 dark:hover:bg-slate-800 shadow-sm"
            >
              Request Assistance
            </Button>
            <Button 
              onClick={onConfirm}
              disabled={submitting}
              className="bg-primary hover:bg-primary/90 text-primary-foreground min-w-[200px] h-10 shadow-sm"
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CheckCircle2 className="size-4 mr-2" />
                  Complete Checkout [Enter]
                </>
              )}
            </Button>
          </div>
        </div>

      </Card>
    </div>
  )
}
