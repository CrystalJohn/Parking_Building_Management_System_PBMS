import { Loader2, Printer } from 'lucide-react'
import { Button } from '../ui/button'
import { useTicketPrint } from '../../hooks/useTicketPrint'

export interface TicketPrintButtonProps {
  onPrint?: () => void
  disabled?: boolean
  className?: string
  variant?: 'default' | 'outline' | 'secondary'
  size?: 'default' | 'sm' | 'lg'
}

export function TicketPrintButton({
  onPrint,
  disabled = false,
  className = '',
  variant = 'default',
  size = 'default',
}: TicketPrintButtonProps) {
  const { isPrinting, printTicket } = useTicketPrint()

  const handleClick = () => {
    onPrint?.()
    printTicket()
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={handleClick}
      disabled={disabled || isPrinting}
      className={`gap-2 font-semibold ${className}`}
    >
      {isPrinting ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Printer className="size-4" />
      )}
      In vé (58mm)
    </Button>
  )
}
