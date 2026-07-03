import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import { AlertCircle, ChevronDown, Loader2, QrCode, ScanLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface QRScannerProps {
  onScan: (decodedText: string) => void
  onClose: () => void
  onManualInput?: (value: string) => void
  variant?: 'dialog' | 'inline'
  presentation?: 'framed' | 'bare'
  showCancelButton?: boolean
  title?: string
  instructions?: string
  manualToggleLabel?: string
  manualInputLabel?: string
  manualInputPlaceholder?: string
}

type ScannerStatus = 'starting' | 'scanning' | 'error'

function describeError(err: unknown): string {
  if (typeof err === 'string') return err
  if (err instanceof Error && err.message) return err.message
  if (err && typeof err === 'object') {
    const maybeMsg = (err as { message?: unknown }).message
    if (typeof maybeMsg === 'string' && maybeMsg) return maybeMsg
  }
  return 'Cannot access camera. Please grant camera permission in your browser.'
}

function waitForMount() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

export function QRScanner({
  onScan,
  onClose,
  onManualInput,
  variant = 'dialog',
  presentation = 'framed',
  showCancelButton = true,
  title = 'Scan QR code',
  instructions = 'Place the QR inside the frame.',
  manualToggleLabel = 'Paste token manually',
  manualInputLabel = 'QR token',
  manualInputPlaceholder = 'Paste the QR payload',
}: QRScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const stopPromiseRef = useRef<Promise<void> | null>(null)
  const scannedRef = useRef(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const readerId = `qr-reader-${useId().replace(/:/g, '')}`

  const [status, setStatus] = useState<ScannerStatus>('starting')
  const [error, setError] = useState<string | null>(null)
  const [manualOpen, setManualOpen] = useState(false)
  const [manualInput, setManualInput] = useState('')
  const isDialog = variant === 'dialog'
  const isBare = presentation === 'bare'

  const stopScanner = useCallback(async () => {
    if (stopPromiseRef.current) {
      await stopPromiseRef.current
      return
    }

    const scanner = scannerRef.current
    if (!scanner) return

    stopPromiseRef.current = (async () => {
      try {
        await scanner.stop()
      } catch {
        // Scanner may already be stopped or not fully started.
      }

      try {
        scanner.clear()
      } catch {
        // Clearing after teardown can throw in html5-qrcode; safe to ignore.
      }

      if (scannerRef.current === scanner) {
        scannerRef.current = null
      }
      stopPromiseRef.current = null
    })()

    await stopPromiseRef.current
  }, [])

  useEffect(() => {
    let cancelled = false
    scannedRef.current = false

    const startScanner = async () => {
      setStatus('starting')
      setError(null)

      try {
        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
          throw new Error(
            'Browser does not support camera. Please open this page via HTTPS or localhost.',
          )
        }

        await waitForMount()
        if (cancelled || !containerRef.current) return

        const scanner = new Html5Qrcode(readerId, {
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          experimentalFeatures: {
            useBarCodeDetectorIfSupported: true,
          },
          verbose: false,
        })
        scannerRef.current = scanner

        await scanner.start(
          {
            facingMode: { ideal: 'environment' },
          },
          {
            fps: 20,
            qrbox: (vw, vh) => {
              const min = Math.min(vw, vh)
              const size = Math.floor(Math.min(Math.max(min * 0.7, 220), 320))
              return { width: size, height: size }
            },
            aspectRatio: 1,
            disableFlip: true,
            videoConstraints: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          },
          async (decodedText) => {
            if (scannedRef.current) return
            scannedRef.current = true

            await stopScanner()
            if (cancelled) return

            onClose()
            onScan(decodedText)
          },
          () => {
            // Ignore per-frame decode misses.
          },
        )

        if (!cancelled) {
          setStatus('scanning')
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[QRScanner] start failed', err)
        if (!cancelled) {
          setStatus('error')
          setError(describeError(err))
        }
      }
    }

    void startScanner()

    return () => {
      cancelled = true
      void stopScanner()
    }
  }, [onClose, onScan, readerId, stopScanner])

  const handleManualSubmit = async () => {
    const trimmed = manualInput.trim()
    if (!trimmed || !onManualInput) return

    scannedRef.current = true
    await stopScanner()
    onClose()
    onManualInput(trimmed)
  }

  const statusMeta =
    status === 'starting'
      ? {
          icon: <Loader2 className="size-4 animate-spin" />,
          label: 'Starting camera...',
          tone: 'text-muted-foreground',
        }
      : status === 'error'
        ? {
            icon: <AlertCircle className="size-4" />,
            label: 'Camera unavailable',
            tone: 'text-destructive',
          }
        : {
            icon: <ScanLine className="size-4" />,
            label: 'Scanning',
            tone: 'text-emerald-700 dark:text-emerald-400',
          }

  const headerContent = isBare
    ? null
    : isDialog ? (
        <DialogHeader className="border-b bg-muted/30 px-5 py-4 pr-12">
          <DialogTitle className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
              <QrCode className="size-4" />
            </span>
            {title}
          </DialogTitle>
          <DialogDescription>{instructions}</DialogDescription>
        </DialogHeader>
      ) : (
        <div className="border-b bg-muted/30 px-5 py-4">
          <div className="flex items-center gap-2 text-base font-semibold text-foreground">
            <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
              <QrCode className="size-4" />
            </span>
            <h3>{title}</h3>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{instructions}</p>
        </div>
      )

  const content = (
    <>
      {headerContent}

      <div className={`overflow-y-auto ${isBare ? 'space-y-3 p-0' : 'space-y-4 p-5'}`}>
        <div className="mx-auto w-full max-w-[320px] sm:max-w-[380px]">
          <div
            id={readerId}
            ref={containerRef}
            className="aspect-square w-full overflow-hidden rounded-xl border bg-primary/5 [&_video]:!h-full [&_video]:!w-full [&_video]:!object-cover"
          />
        </div>

        <div
          className={`flex flex-col gap-2 rounded-xl border px-4 py-3 text-sm ${
            isBare ? 'bg-background' : 'bg-muted/15'
          } sm:flex-row sm:items-center sm:justify-between`}
        >
          <div className={`inline-flex items-center gap-2 font-medium ${statusMeta.tone}`}>
            {statusMeta.icon}
            <span>{statusMeta.label}</span>
          </div>
          {!isBare ? <span className="text-xs text-muted-foreground">QR only. Keep it centered.</span> : null}
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {!isBare && onManualInput ? (
          <div
            className={
              isDialog
                ? '-mx-5 -mb-5 rounded-b-xl border-t bg-muted/10 px-5 py-4'
                : 'rounded-xl border bg-muted/10 px-4 py-4'
            }
          >
            {manualOpen ? (
              <div className="mb-4 grid gap-3">
                <div className="space-y-2">
                  <Label htmlFor={`${readerId}-manual`}>{manualInputLabel}</Label>
                  <Input
                    id={`${readerId}-manual`}
                    value={manualInput}
                    onChange={(event) => setManualInput(event.target.value)}
                    placeholder={manualInputPlaceholder}
                    className="h-11 font-mono text-xs"
                  />
                </div>
                <Button
                  type="button"
                  onClick={() => void handleManualSubmit()}
                  disabled={!manualInput.trim()}
                  className="h-11 w-full whitespace-nowrap sm:w-auto"
                >
                  Confirm token
                </Button>
              </div>
            ) : null}

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setManualOpen((value) => !value)}
                className="h-10 justify-start px-0 text-sm font-medium text-muted-foreground hover:bg-transparent hover:text-foreground"
              >
                {manualToggleLabel}
                <ChevronDown
                  className={`ml-2 size-4 transition-transform ${manualOpen ? 'rotate-180' : ''}`}
                />
              </Button>
              {showCancelButton ? (
                <Button type="button" variant="outline" onClick={onClose} className="h-10 whitespace-nowrap">
                  Cancel
                </Button>
              ) : null}
            </div>
          </div>
        ) : !isBare && showCancelButton ? (
          <div
            className={
              isDialog
                ? '-mx-5 -mb-5 rounded-b-xl border-t bg-muted/10 px-5 py-4'
                : 'rounded-xl border bg-muted/10 px-4 py-4'
            }
          >
            <div className="flex justify-end">
              <Button type="button" variant="outline" onClick={onClose} className="h-10 whitespace-nowrap">
                Cancel
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </>
  )

  if (!isDialog) {
    if (isBare) return <div className="space-y-3">{content}</div>

    return <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">{content}</div>
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[calc(100vw-24px)] max-h-[calc(100dvh-2rem)] max-w-[480px] overflow-hidden p-0 sm:max-w-lg">
        {content}
      </DialogContent>
    </Dialog>
  )
}
