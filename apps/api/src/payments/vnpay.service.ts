import { BadRequestException, Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import {
  CreateVnpayPaymentUrlInput,
  CreateVnpayPaymentUrlResult,
  VnpayCallbackParams,
  VerifiedVnpayCallback,
} from './vnpay.types';

/**
 * VnpayService
 *
 * Handles VNPAY sandbox/production payment URL generation and callback
 * verification for PBMS Flow 4B Bank QR checkout.
 *
 * PBMS business rules preserved:
 * - URL generation does NOT move session lifecycle.
 * - Only verifyReturnOrIpn() + PaymentsService decides lifecycle transitions.
 * - Slot is never released here.
 */
@Injectable()
export class VnpayService {
  // ─── Config helpers ─────────────────────────────────────────────────────

  private get tmnCode(): string {
    return process.env.VNPAY_TMN_CODE ?? '';
  }

  private get hashSecret(): string {
    return process.env.VNPAY_HASH_SECRET ?? '';
  }

  private get paymentUrl(): string {
    return (
      process.env.VNPAY_PAYMENT_URL ??
      'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html'
    );
  }

  private get returnUrl(): string {
    return (
      process.env.VNPAY_RETURN_URL ?? 'http://localhost:5173/staff/gate'
    );
  }

  private get version(): string {
    return process.env.VNPAY_VERSION ?? '2.1.0';
  }

  private get orderType(): string {
    return process.env.VNPAY_ORDER_TYPE ?? 'other';
  }

  isConfigured(): boolean {
    return Boolean(this.tmnCode && this.hashSecret && this.paymentUrl);
  }

  // ─── Payment URL creation ────────────────────────────────────────────────

  createPaymentUrl(input: CreateVnpayPaymentUrlInput): CreateVnpayPaymentUrlResult {
    const txnRef = this.buildTxnRef(input.sessionCode);
    const now = new Date();
    const expiredAt = new Date(now.getTime() + 15 * 60 * 1000);

    const createDate = this.formatVnpDate(now);
    const expireDate = this.formatVnpDate(expiredAt);

    const orderInfo = this.buildOrderInfo(input.sessionCode);

    // Build params — only include non-empty values
    const params: Record<string, string> = {
      vnp_Version: this.version,
      vnp_Command: 'pay',
      vnp_TmnCode: this.tmnCode,
      vnp_Amount: String(input.amount * 100),
      vnp_CurrCode: 'VND',
      vnp_TxnRef: txnRef,
      vnp_OrderInfo: orderInfo,
      vnp_OrderType: this.orderType,
      vnp_Locale: 'vn',
      vnp_ReturnUrl: this.returnUrl,
      vnp_IpAddr: input.ipAddr || '127.0.0.1',
      vnp_CreateDate: createDate,
      vnp_ExpireDate: expireDate,
    };

    const signedUrl = this.buildSignedUrl(params);

    return {
      provider: 'vnpay',
      providerRef: null,
      providerOrderCode: txnRef,
      checkoutUrl: signedUrl,
      qrCode: null,
      expiredAt,
      providerPayload: params,
    };
  }

  // ─── Return / IPN verification ───────────────────────────────────────────

  /**
   * Verify the signature on a VNPAY return or IPN callback.
   * Throws BadRequestException on invalid signature.
   * Returns VerifiedVnpayCallback with parsed values.
   */
  verifyReturnOrIpn(params: VnpayCallbackParams): VerifiedVnpayCallback {
    const { vnp_SecureHash, ...restParams } = params;

    if (!vnp_SecureHash) {
      throw new BadRequestException('Missing vnp_SecureHash');
    }

    // Build hash from sorted params (exclude vnp_SecureHash)
    const hashData = this.buildHashData(restParams as Record<string, string>);
    const expectedHash = this.hmacSha512(hashData);

    if (!this.safeEqual(expectedHash, vnp_SecureHash)) {
      throw new BadRequestException('Invalid VNPAY signature');
    }

    const rawAmount = params.vnp_Amount ?? '0';
    // VNPAY amount is original * 100; convert back to VND
    const amount = Math.round(Number(rawAmount) / 100);

    return {
      txnRef: params.vnp_TxnRef ?? '',
      amount,
      success:
        params.vnp_ResponseCode === '00' &&
        params.vnp_TransactionStatus === '00',
      responseCode: params.vnp_ResponseCode ?? '',
      transactionStatus: params.vnp_TransactionStatus ?? '',
      payDate: params.vnp_PayDate ?? null,
      bankCode: params.vnp_BankCode ?? null,
      rawParams: restParams as Record<string, string>,
    };
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  private buildTxnRef(sessionCode: string): string {
    // Compact session code + timestamp suffix, max 100 chars (VNPAY limit)
    const compact = sessionCode.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(-8);
    const ts = Date.now().toString().slice(-10);
    return `PBMS${compact}${ts}`.slice(0, 100);
  }

  private buildOrderInfo(sessionCode: string): string {
    // Must be ASCII, max 255 chars per VNPAY docs
    const compact = sessionCode.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(-10);
    return `PBMS checkout ${compact}`.slice(0, 255);
  }

  /**
   * Format date as yyyyMMddHHmmss in GMT+7.
   */
  private formatVnpDate(date: Date): string {
    const gmt7 = new Date(date.getTime() + 7 * 60 * 60 * 1000);
    return gmt7.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  }

  private buildHashData(params: Record<string, string>): string {
    return Object.keys(params)
      .filter((key) => params[key] !== undefined && params[key] !== '')
      .sort()
      .map((key) => `${key}=${params[key]}`)
      .join('&');
  }

  private buildSignedUrl(params: Record<string, string>): string {
    const hashData = this.buildHashData(params);
    const secureHash = this.hmacSha512(hashData);
    const query = new URLSearchParams({ ...params, vnp_SecureHash: secureHash });
    return `${this.paymentUrl}?${query.toString()}`;
  }

  private hmacSha512(data: string): string {
    return createHmac('sha512', this.hashSecret).update(data).digest('hex');
  }

  private safeEqual(expected: string, actual: string): boolean {
    // Normalise to same length to avoid timing attacks with different lengths
    const a = Buffer.from(expected.toLowerCase());
    const b = Buffer.from(actual.toLowerCase());
    if (a.length !== b.length) {
      // Still run a dummy comparison to avoid early-exit timing leak
      timingSafeEqual(a, Buffer.alloc(a.length));
      return false;
    }
    return timingSafeEqual(a, b);
  }
}
