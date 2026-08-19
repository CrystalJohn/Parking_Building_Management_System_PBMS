import { useState, useEffect, useCallback } from 'react'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { InfoRow, Section, Spinner } from '@/components/ui'
import { ArrowLeft, CreditCard, Banknote } from 'lucide-react'
import { DualCapturePanel, type CapturedOverviewData, type CapturedPlateData } from '../../../components/camera'
import {
  useInitCheckOut,
  useConfirmCashPayment,
  useCreateBankQr,
  usePaymentStatus,
  useConfirmExit,
} from '../hooks/useCheckOutFlow'

// === TYPES ===
export type CheckOutPanelProps = {
  session: {
    id: string
    sessionCode?: string
    checkInTime: string
    slotCode: string
  }
  vehicle: {
    plate: string
    type: 'car' | 'motorbike'
  }
  fee?: {
    amount: number
    breakdown?: {
      baseFee?: number
      overtimeFee?: number
      lostTicketPenalty?: number
      penalty?: number
      total?: number
    }
  }
  onDone: () => void
  onCancel: () => void
  showExitCapture?: boolean
}

export type PaymentMethod = 'cash' | 'bank_qr'

export type CheckOutStep =
  | 'select_payment' // Chọn phương thức
  | 'processing' // Đang xử lý
  | 'show_qr' // Hiển thị QR, chờ thanh toán
  | 'confirming_exit' // Đang xác nhận xe ra
  | 'done' // Hoàn tất
  | 'error' // Lỗi

// === HELPERS ===
function formatDateTime(isoString: string): string {
  const date = new Date(isoString)
  if (isNaN(date.getTime())) return isoString
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount)
}

function calculateDuration(checkInTime: string): string {
  const start = new Date(checkInTime).getTime()
  if (isNaN(start)) return '0h 0m'
  const diffMs = Math.max(0, Date.now() - start)
  const hours = Math.floor(diffMs / (1000 * 60 * 60))
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
  return `${hours}h ${minutes}m`
}

function getErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object') {
    if ('response' in err) {
      const axiosErr = err as { response?: { data?: { message?: string } } }
      if (axiosErr.response?.data?.message) {
        return axiosErr.response.data.message
      }
    }
    if (err instanceof Error && err.message) {
      return err.message
    }
  }
  return fallback
}

// === COMPONENT ===
export function CheckOutPanel({
  session,
  vehicle,
  fee: initialFee,
  onDone,
  onCancel,
  showExitCapture = false,
}: CheckOutPanelProps) {
  // State
  const [step, setStep] = useState<CheckOutStep>('select_payment')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [error, setError] = useState<string | null>(null)
  const [qrData, setQrData] = useState<string | null>(null)
  const [checkoutSessionId, setCheckoutSessionId] = useState<string>(session.id)
  const [fee, setFee] = useState(initialFee)
  const [exitPlateImage, setExitPlateImage] = useState<CapturedPlateData | null>(null)
  const [exitOverviewImage, setExitOverviewImage] = useState<CapturedOverviewData | null>(null)

  // Hooks
  const initCheckOut = useInitCheckOut()
  const confirmCash = useConfirmCashPayment()
  const createQr = useCreateBankQr()
  const confirmExit = useConfirmExit()

  // Polling QR payment status
  const { data: paymentStatus } = usePaymentStatus(
    checkoutSessionId,
    step === 'show_qr',
  )

  const handleConfirmExit = useCallback(async () => {
    setError(null)
    setStep('confirming_exit')
    try {
      await confirmExit.mutateAsync(checkoutSessionId)
      setStep('done')
      onDone()
    } catch (err) {
      setError(getErrorMessage(err, 'Lỗi khi xác nhận xe ra'))
      setStep('error')
    }
  }, [confirmExit, checkoutSessionId, onDone])

  // Watch paymentStatus changes
  useEffect(() => {
    if (!paymentStatus) return
    const isPaid =
      paymentStatus.payment?.status === 'paid' ||
      (paymentStatus as unknown as { status?: string })?.status === 'paid' ||
      (paymentStatus as unknown as { isPaid?: boolean })?.isPaid
    if (isPaid && step === 'show_qr') {
      void handleConfirmExit()
    }
  }, [paymentStatus, step, handleConfirmExit])

  // Handlers
  const handleStartCheckOut = async () => {
    setError(null)
    setStep('processing')

    try {
      const initResult = await initCheckOut.mutateAsync({ sessionId: session.id })
      const sessId = initResult.sessionId || initResult.id || session.id
      setCheckoutSessionId(sessId)

      const totalFee = initResult.fee?.total ?? fee?.amount ?? 0
      const baseFeeAmount = initResult.fee?.baseFee ?? 0
      const penaltyAmount = initResult.fee?.penalty ?? 0

      setFee({
        amount: totalFee,
        breakdown: {
          baseFee: baseFeeAmount,
          penalty: penaltyAmount,
          total: totalFee,
        },
      })

      if (paymentMethod === 'cash') {
        await confirmCash.mutateAsync(sessId)
        await handleConfirmExit()
      } else {
        const qrResult = await createQr.mutateAsync(sessId)
        setQrData(qrResult.qrCode || (qrResult as unknown as { qrData?: string }).qrData || null)
        setStep('show_qr')
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Lỗi khi xử lý check-out'))
      setStep('error')
    }
  }

  const handleRetry = () => {
    setError(null)
    setStep('select_payment')
  }

  const duration = calculateDuration(session.checkInTime)
  const isLoading =
    step === 'processing' ||
    step === 'confirming_exit' ||
    initCheckOut.isPending ||
    confirmCash.isPending ||
    createQr.isPending ||
    confirmExit.isPending

  const baseFee = fee?.breakdown?.baseFee ?? 0
  const overtimeFee =
    fee?.breakdown?.overtimeFee ??
    fee?.breakdown?.penalty ??
    0
  const lostTicketPenalty = fee?.breakdown?.lostTicketPenalty ?? 0
  const displayFee = fee?.amount ?? fee?.breakdown?.total ?? 0

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={isLoading}
          className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Quay lại tra cứu
        </Button>
        <span className="text-xs font-medium text-muted-foreground">
          Check-out thanh toán
        </span>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
        {/* Left Column: Camera out or Vehicle Details */}
        <div className="space-y-4 lg:col-span-6">
          {showExitCapture ? (
            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-bold text-foreground">
                Ảnh đối chứng xe ra
              </h3>
              <DualCapturePanel
                plateImage={exitPlateImage}
                overviewImage={exitOverviewImage}
                onPlateCaptured={setExitPlateImage}
                onOverviewCaptured={setExitOverviewImage}
                disabled={isLoading}
              />
            </div>
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Chi tiết phiên gửi xe</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Section title="Thông tin xe">
                  <InfoRow label="Biển số" value={vehicle.plate} highlight />
                  <InfoRow label="Loại xe" value={vehicle.type === 'car' ? 'Ô tô' : 'Xe máy'} />
                  <InfoRow label="Vị trí đỗ" value={session.slotCode} />
                </Section>

                <Section title="Thời gian lưu đỗ">
                  <InfoRow label="Giờ vào" value={formatDateTime(session.checkInTime)} />
                  <InfoRow label="Giờ ra" value={formatDateTime(new Date().toISOString())} />
                  <InfoRow label="Tổng thời gian" value={duration} highlight />
                </Section>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column: Fee & Payment */}
        <div className="space-y-4 lg:col-span-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Thanh toán &amp; Xác nhận xe ra</CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Fee Breakdown */}
              <div className="rounded-xl bg-muted/40 p-3.5 space-y-2 border border-border">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Phí cơ bản:</span>
                  <span>{formatCurrency(baseFee)}</span>
                </div>
                {overtimeFee > 0 && (
                  <div className="flex items-center justify-between text-xs text-amber-600 dark:text-amber-400">
                    <span>Phụ thu quá giờ:</span>
                    <span>+{formatCurrency(overtimeFee)}</span>
                  </div>
                )}
                {lostTicketPenalty > 0 && (
                  <div className="flex items-center justify-between text-xs text-red-600 dark:text-red-400">
                    <span>Phạt mất vé:</span>
                    <span>+{formatCurrency(lostTicketPenalty)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-border pt-2 text-base font-bold text-foreground">
                  <span>Tổng tiền thanh toán:</span>
                  <span className="text-lg text-primary">{formatCurrency(displayFee)}</span>
                </div>
              </div>

              {/* Step: Select payment */}
              {step === 'select_payment' && (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-foreground">
                    Phương thức thanh toán:
                  </label>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('cash')}
                      className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-semibold transition-all ${
                        paymentMethod === 'cash'
                          ? 'border-primary bg-primary/10 text-primary shadow-sm'
                          : 'border-border bg-card text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      <Banknote className="size-4" />
                      Tiền mặt
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('bank_qr')}
                      className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-semibold transition-all ${
                        paymentMethod === 'bank_qr'
                          ? 'border-primary bg-primary/10 text-primary shadow-sm'
                          : 'border-border bg-card text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      <CreditCard className="size-4" />
                      QR Chuyển khoản
                    </button>
                  </div>
                </div>
              )}

              {/* QR display */}
              {step === 'show_qr' && qrData && (
                <div className="rounded-xl border border-border bg-muted/20 p-4 text-center">
                  <p className="mb-2 text-xs font-semibold text-foreground">
                    Khách quét mã VietQR để thanh toán:
                  </p>
                  <div className="inline-block rounded-xl bg-white p-2.5 shadow-sm">
                    <img
                      src={
                        qrData.startsWith('http') || qrData.startsWith('data:')
                          ? qrData
                          : `data:image/png;base64,${qrData}`
                      }
                      alt="VietQR"
                      className="size-40 object-contain mx-auto"
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                    <Spinner className="size-3.5" />
                    <span>Đang chờ nhận tiền vào tài khoản...</span>
                  </div>
                </div>
              )}

              {isLoading && step !== 'show_qr' && (
                <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                  <Spinner className="mr-2" />
                  <span>
                    {step === 'confirming_exit' ? 'Đang xác nhận xe ra...' : 'Đang xử lý thanh toán...'}
                  </span>
                </div>
              )}
            </CardContent>

            <CardFooter className="flex gap-2 pt-0">
              {step === 'select_payment' && (
                <Button
                  onClick={handleStartCheckOut}
                  size="lg"
                  disabled={isLoading}
                  className="w-full font-bold"
                >
                  {isLoading && <Spinner className="mr-2" />}
                  Xác nhận Check-out — {formatCurrency(displayFee)}
                </Button>
              )}

              {step === 'error' && (
                <Button onClick={handleRetry} variant="secondary" className="w-full">
                  Thử lại
                </Button>
              )}

              {step === 'show_qr' && (
                <Button onClick={() => void handleConfirmExit()} variant="secondary" className="w-full text-xs">
                  Xác nhận đã thu tiền mặt thay
                </Button>
              )}
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  )
}
