import { useCallback, useEffect, useState } from 'react'

export function useTicketPrint() {
  const [isPrinting, setIsPrinting] = useState(false)

  useEffect(() => {
    const handleBeforePrint = () => {
      setIsPrinting(true)
    }

    const handleAfterPrint = () => {
      setIsPrinting(false)
    }

    window.addEventListener('beforeprint', handleBeforePrint)
    window.addEventListener('afterprint', handleAfterPrint)

    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint)
      window.removeEventListener('afterprint', handleAfterPrint)
    }
  }, [])

  const printTicket = useCallback(() => {
    setIsPrinting(true)
    // Slight timeout ensures DOM / QR code images are fully flushed before invoking browser print dialog
    setTimeout(() => {
      window.print()
    }, 150)
  }, [])

  return {
    isPrinting,
    printTicket,
  }
}
