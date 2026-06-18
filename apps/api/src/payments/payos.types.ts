export interface CreatePayosPaymentLinkInput {
  sessionId: string;
  sessionCode: string;
  licensePlate: string;
  amount: number;
}

export interface CreatePayosPaymentLinkResult {
  provider: 'payos';
  providerRef: string | null;
  providerOrderCode: string;
  checkoutUrl: string | null;
  qrCode: string | null;
  expiredAt: Date | null;
  providerPayload: Record<string, unknown>;
}

export interface VerifiedPayosWebhook {
  orderCode: string;
  amount: number;
  success: boolean;
  reference: string | null;
  paymentLinkId: string | null;
  transactionDateTime: string | null;
  rawData: Record<string, unknown>;
}
