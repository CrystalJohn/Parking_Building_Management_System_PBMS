import { useState, type ReactNode } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  createOperationIssue,
  type OperationIssueSeverity,
  type OperationIssueType,
} from '@/lib/operation-issues-api'
import { cn } from '@/lib/utils'

interface RequestManagerReviewDialogProps {
  defaultType?: OperationIssueType
  defaultSeverity?: OperationIssueSeverity
  defaultNote?: string
  sessionId?: string
  reservationId?: string
  paymentId?: string
  slotId?: number
  plateNumber?: string
  trigger?: ReactNode
  buttonClassName?: string
}

const TYPE_OPTIONS: OperationIssueType[] = [
  'lost_ticket_review',
  'payment_issue',
  'ocr_mismatch',
  'reservation_exception',
  'slot_state_mismatch',
  'manual_review',
]

const SEVERITY_OPTIONS: OperationIssueSeverity[] = ['critical', 'warning', 'info']

export function RequestManagerReviewDialog({
  defaultType = 'manual_review',
  defaultSeverity = 'warning',
  defaultNote = '',
  sessionId,
  reservationId,
  paymentId,
  slotId,
  plateNumber,
  trigger,
  buttonClassName,
}: RequestManagerReviewDialogProps) {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<OperationIssueType>(defaultType)
  const [severity, setSeverity] = useState<OperationIssueSeverity>(defaultSeverity)
  const [note, setNote] = useState(defaultNote)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!note.trim()) {
      toast.error('Notes are required')
      return
    }

    setSubmitting(true)
    try {
      await createOperationIssue({
        type,
        severity,
        note: note.trim(),
        sessionId,
        reservationId,
        paymentId,
        slotId,
        plateNumber,
      })
      toast.success('Manager review requested')
      setOpen(false)
    } catch {
      toast.error('Unable to request manager review')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button" variant="outline" className={cn('h-11', buttonClassName)}>
            <AlertTriangle className="size-4" strokeWidth={1.8} />
            Request Manager Review
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Request Manager Review</DialogTitle>
          <DialogDescription>
            Escalate this case to the operations supervisor queue.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Reason</Label>
              <Select value={type} onValueChange={(value) => setType(value as OperationIssueType)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {labelize(option)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Severity</Label>
              <Select value={severity} onValueChange={(value) => setSeverity(value as OperationIssueSeverity)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEVERITY_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {labelize(option)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="manager-review-notes">Notes</Label>
            <textarea
              id="manager-review-notes"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="min-h-28 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder="Describe what the manager should review."
            />
          </div>

          <div className="rounded-xl border bg-muted/40 p-3 text-xs font-semibold text-muted-foreground">
            {plateNumber ? <span>Plate: {plateNumber}</span> : <span>No plate attached</span>}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" strokeWidth={1.8} /> : null}
            Submit Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function labelize(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}
