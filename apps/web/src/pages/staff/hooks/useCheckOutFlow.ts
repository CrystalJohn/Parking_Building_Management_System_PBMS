import { useMutation, useQuery } from '@tanstack/react-query'
import {
  checkOut,
  confirmPayment,
  createBankQrPayment,
  getPaymentStatus,
  confirmExit,
  type CheckOutRequest,
  type CheckOutResponse,
  type ConfirmPaymentResponse,
  type PaymentWorkflowResponse,
  type ConfirmExitResponse,
} from '../../../lib/sessions-api'

// === Types ===
export type CheckOutInitParams = {
  sessionId?: string
  licensePlate?: string
  identificationMethod?: 'SESSION_QR' | 'MANUAL_SESSION_CODE' | 'LICENSE_PLATE' | 'OCR'
}

export type PaymentMethod = 'cash' | 'bank_qr'

export interface InitCheckOutResult extends CheckOutResponse {
  id: string
  breakdown: CheckOutResponse['fee']
}

// === Hook 1: Khởi tạo checkout (tính phí) ===
export function useInitCheckOut() {
  return useMutation<InitCheckOutResult, unknown, CheckOutInitParams>({
    mutationFn: async (params: CheckOutInitParams) => {
      const request: CheckOutRequest = {
        sessionId: params.sessionId,
        licensePlate: params.licensePlate,
      }
      const res = await checkOut(request)
      return {
        ...res,
        id: res.sessionId,
        breakdown: res.fee,
      }
    },
  })
}

// === Hook 2: Xác nhận thanh toán tiền mặt ===
export function useConfirmCashPayment() {
  return useMutation<ConfirmPaymentResponse, unknown, string>({
    mutationFn: async (sessionId: string) => {
      const res = await confirmPayment(sessionId)
      return res
    },
  })
}

// === Hook 3: Tạo Bank QR ===
export interface CreateBankQrResult extends PaymentWorkflowResponse {
  qrCode: string | null
  checkoutUrl: string | null
}

export function useCreateBankQr() {
  return useMutation<CreateBankQrResult, unknown, string>({
    mutationFn: async (sessionId: string) => {
      const res = await createBankQrPayment(sessionId)
      return {
        ...res,
        qrCode: res.payment?.qrCode ?? null,
        checkoutUrl: res.payment?.checkoutUrl ?? null,
      }
    },
  })
}

// === Hook 4: Polling payment status ===
export function usePaymentStatus(sessionId: string | null, enabled: boolean) {
  return useQuery<PaymentWorkflowResponse, unknown>({
    queryKey: ['payment-status', sessionId],
    queryFn: () => getPaymentStatus(sessionId!),
    enabled: enabled && !!sessionId,
    refetchInterval: 3000,
  })
}

// === Hook 5: Xác nhận xe ra ===
export function useConfirmExit() {
  return useMutation<ConfirmExitResponse, unknown, string>({
    mutationFn: async (sessionId: string) => {
      const res = await confirmExit(sessionId)
      return res
    },
  })
}
