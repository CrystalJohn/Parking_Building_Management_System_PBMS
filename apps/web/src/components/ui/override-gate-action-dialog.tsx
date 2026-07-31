import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { GateRecommendedAction } from '@/lib/sessions-api'

const ACTIONS: GateRecommendedAction[] = ['CHECKOUT', 'CHECKIN', 'MANUAL_REVIEW']

const ACTION_LABEL: Record<GateRecommendedAction, string> = {
  CHECKOUT: 'Check out',
  CHECKIN: 'Check in',
  MANUAL_REVIEW: 'Manual review',
}

const OPPOSITE_ACTION: Record<GateRecommendedAction, GateRecommendedAction> = {
  CHECKOUT: 'CHECKIN',
  CHECKIN: 'CHECKOUT',
  // Deliberate product choice: a "manual review" recommendation means the guard
  // inspects manually, so the override defaults to the resolve-and-release path
  // (CHECKOUT) rather than flipping to CHECKIN.
  MANUAL_REVIEW: 'CHECKOUT',
}

type OverrideGateActionDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  plate: string
  currentAction: GateRecommendedAction
  onConfirm: (action: GateRecommendedAction, reason: string) => void
}

export function OverrideGateActionDialog({
  open,
  onOpenChange,
  plate,
  currentAction,
  onConfirm,
}: OverrideGateActionDialogProps) {
  const [action, setAction] = useState<GateRecommendedAction>(OPPOSITE_ACTION[currentAction])
  const [reason, setReason] = useState('')
  const canConfirm = reason.trim().length > 0

  // Reset selection/reason only on the false -> true open transition, so a
  // reopened dialog (e.g. for a new scan) always starts from the opposite of
  // the current recommendation instead of stale state from the previous scan.
  const wasOpenRef = useRef(open)
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setAction(OPPOSITE_ACTION[currentAction])
      setReason('')
    }
    wasOpenRef.current = open
  }, [open, currentAction])

  const handleConfirm = () => {
    onConfirm(action, reason.trim())
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Override Gate Action</DialogTitle>
          <DialogDescription>
            Pick a different action than the recommendation. A reason is required to override.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="rounded-xl border bg-muted/40 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Plate
            </p>
            <p className="mt-1 break-all font-mono text-xl font-black tracking-[0.12em] text-foreground">
              {plate}
            </p>
          </div>

          <div className="rounded-xl border bg-muted/40 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Recommended action
            </p>
            <p className="mt-1 text-sm font-bold text-foreground">{ACTION_LABEL[currentAction]}</p>
          </div>

          <div className="space-y-2">
            <Label>Action</Label>
            <Select value={action} onValueChange={(value) => setAction(value as GateRecommendedAction)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {ACTION_LABEL[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="override-reason">Reason</Label>
            <textarea
              id="override-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="min-h-24 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder="Explain why the recommended action is overridden."
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={!canConfirm}>
            Confirm Override
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
