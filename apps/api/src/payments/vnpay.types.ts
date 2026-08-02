/**
 * VNPAY integration types for PBMS Flow 4B Bank QR checkout.
 * Provider migration: PayOS → VNPAY
 */

export interface CreateVnpayPaymentUrlInput {
  referenceType: 'session' | 'subscription' | 'reservation_deposit';
  referenceId?: string;
  referenceCode: string;
  description: string;
  /** Fee amount in VND (integer). Will be multiplied by 100 per VNPAY spec. */
  amount: number;
  /** Client IP address for vnp_IpAddr. */
  ipAddr?: string;
}

export interface CreateVnpayPaymentUrlResult {
  provider: 'vnpay';
  providerRef: null;
  /** Unique transaction reference — vnp_TxnRef stored as providerOrderCode. */
  providerOrderCode: string;
  /** Full signed VNPAY payment URL (redirect or QR source). */
  checkoutUrl: string;
  /** No static QR image from URL-based flow; null for now. */
  qrCode: null;
  expiredAt: Date;
  /** Params sent to VNPAY (without secret hash). */
  providerPayload: Record<string, string>;
}

export interface VnpayCallbackParams {
  vnp_Amount?: string;
  vnp_BankCode?: string;
  vnp_BankTranNo?: string;
  vnp_CardType?: string;
  vnp_OrderInfo?: string;
  vnp_PayDate?: string;
  vnp_ResponseCode?: string;
  vnp_TmnCode?: string;
  vnp_TransactionNo?: string;
  vnp_TransactionStatus?: string;
  vnp_TxnRef?: string;
  vnp_SecureHash?: string;
  [key: string]: string | undefined;
}

export interface VerifiedVnpayCallback {
  txnRef: string;
  amount: number;
  /** True only when both vnp_ResponseCode and vnp_TransactionStatus are "00". */
  success: boolean;
  responseCode: string;
  transactionStatus: string;
  payDate: string | null;
  bankCode: string | null;
  rawParams: Record<string, string>;
}
