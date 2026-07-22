import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import {
  CreateVnpayPaymentUrlInput,
  CreateVnpayPaymentUrlResult,
  VnpayCallbackParams,
  VerifiedVnpayCallback,
} from './vnpay.types';

/**
 * VnpayService — PBMS Flow 4B Bank QR / card checkout.
 *
 * Signing follows application/x-www-form-urlencoded:
 *   - spaces → '+'
 *   - other chars → %XX (encodeURIComponent then replace %20 → +)
 *
 * Based on proven implementation pattern from CrystalJohn/vnpay project.
 */
@Injectable()
export class VnpayService {
  // ─── Config ──────────────────────────────────────────────────────────────

  private get tmnCode() { return process.env.VNPAY_TMN_CODE ?? ''; }
  private get hashSecret() { return process.env.VNPAY_HASH_SECRET ?? ''; }
  private get paymentUrl() { return (process.env.VNPAY_PAYMENT_URL ?? 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html').trim(); }
  private get returnUrl() { return process.env.VNPAY_RETURN_URL ?? 'http://localhost:3001/payments/vnpay/return'; }
  private get version() { return process.env.VNPAY_VERSION ?? '2.1.0'; }
  private get orderType() { return process.env.VNPAY_ORDER_TYPE ?? 'other'; }
  private get bankCode() { return process.env.VNPAY_BANK_CODE ?? ''; }

  private missingConfig(): string[] {
    const missing: string[] = [];
    if (!process.env.VNPAY_TMN_CODE) missing.push('VNPAY_TMN_CODE');
    if (!process.env.VNPAY_HASH_SECRET) missing.push('VNPAY_HASH_SECRET');
    if (!process.env.VNPAY_PAYMENT_URL) missing.push('VNPAY_PAYMENT_URL');
    return missing;
  }

  isConfigured(): boolean {
    return this.missingConfig().length === 0;
  }

  // ─── Payment URL creation ─────────────────────────────────────────────────

  createPaymentUrl(input: CreateVnpayPaymentUrlInput): CreateVnpayPaymentUrlResult {
    const missing = this.missingConfig();
    if (missing.length > 0) {
      throw new ServiceUnavailableException(
        `VNPAY is not configured. Missing: ${missing.join(', ')}`,
      );
    }

    const txnRef = this.buildTxnRef(input.referenceCode, input.referenceType);
    const now = new Date();
    const expiredAt = new Date(now.getTime() + 15 * 60 * 1000);

    const params: Record<string, string> = {
      vnp_Version: this.version,
      vnp_Command: 'pay',
      vnp_TmnCode: this.tmnCode,
      vnp_Amount: String(input.amount * 100),
      vnp_CurrCode: 'VND',
      vnp_TxnRef: txnRef,
      vnp_OrderInfo: this.buildOrderInfo(input.referenceCode, input.description),
      vnp_OrderType: this.orderType,
      vnp_Locale: 'vn',
      vnp_ReturnUrl: this.returnUrl,
      vnp_IpAddr: input.ipAddr || '127.0.0.1',
      vnp_CreateDate: this.formatVnpayDate(now),
      vnp_ExpireDate: this.formatVnpayDate(expiredAt),
    };

    // Only include bank code if configured
    if (this.bankCode) {
      params.vnp_BankCode = this.bankCode;
    }

    const signedQuery = this.buildSignedQuery(params);
    const checkoutUrl = `${this.paymentUrl}?${signedQuery}`;

    return {
      provider: 'vnpay',
      providerRef: null,
      providerOrderCode: txnRef,
      checkoutUrl,
      qrCode: null,
      expiredAt,
      providerPayload: params,
    };
  }

  // ─── Callback verification ────────────────────────────────────────────────

  /**
   * Verify signature and parse VNPAY return/IPN callback.
   * Throws BadRequestException on invalid signature.
   *
   * IMPORTANT: NestJS @Query() decodes %XX but NOT '+' → space.
   * We must normalize '+' → space on each value before verifying,
   * because the hash was computed with space (not '+' or '%20').
   */
  verifyReturnOrIpn(params: VnpayCallbackParams): VerifiedVnpayCallback {
    // Normalize: decode '+' → space (NestJS doesn't do this automatically)
    const normalized: Record<string, string> = {};
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) {
        normalized[k] = v.replace(/\+/g, ' ');
      }
    }

    const incoming = normalized.vnp_SecureHash;
    if (!incoming) {
      throw new BadRequestException('Missing vnp_SecureHash');
    }

    // Strip hash fields before recomputing
    const { vnp_SecureHash, vnp_SecureHashType, ...signParams } = normalized as Record<string, string> & { vnp_SecureHashType?: string };
    void vnp_SecureHashType; // unused

    const expected = this.hmacSha512(this.buildSignData(signParams));
    if (expected.toLowerCase() !== incoming.toLowerCase()) {
      throw new BadRequestException('Invalid VNPAY signature');
    }

    const rawAmount = normalized.vnp_Amount ?? '0';
    const amount = Math.round(Number(rawAmount) / 100);

    return {
      txnRef: normalized.vnp_TxnRef ?? '',
      amount,
      success:
        normalized.vnp_ResponseCode === '00' &&
        normalized.vnp_TransactionStatus === '00',
      responseCode: normalized.vnp_ResponseCode ?? '',
      transactionStatus: normalized.vnp_TransactionStatus ?? '',
      payDate: normalized.vnp_PayDate ?? null,
      bankCode: normalized.vnp_BankCode ?? null,
      rawParams: signParams,
    };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * VNPAY uses application/x-www-form-urlencoded:
   * spaces → '+', other special chars → %XX
   */
  private vnpEncode(value: string): string {
    return encodeURIComponent(value).replace(/%20/g, '+');
  }

  private buildSignData(params: Record<string, string>): string {
    return Object.keys(params)
      .filter((k) => params[k] !== '' && params[k] !== undefined && params[k] !== null)
      .sort()
      .map((k) => `${this.vnpEncode(k)}=${this.vnpEncode(params[k])}`)
      .join('&');
  }

  private buildSignedQuery(params: Record<string, string>): string {
    const signData = this.buildSignData(params);
    const secureHash = this.hmacSha512(signData);
    return `${signData}&vnp_SecureHash=${secureHash}`;
  }

  private hmacSha512(data: string): string {
    return createHmac('sha512', this.hashSecret)
      .update(Buffer.from(data, 'utf-8'))
      .digest('hex');
  }

  /**
   * Format date as yyyyMMddHHmmss in Asia/Ho_Chi_Minh timezone.
   * Uses Intl.DateTimeFormat (no external deps) — same as reference impl.
   */
  private formatVnpayDate(date: Date): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(date);

    const get = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((p) => p.type === type)?.value ?? '';

    return [
      get('year'), get('month'), get('day'),
      get('hour'), get('minute'), get('second'),
    ].join('');
  }

  private buildTxnRef(reference: string, type: 'session' | 'subscription'): string {
    const compact = reference.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(-8);
    const ts = Date.now().toString().slice(-10);
    const prefix = type === 'subscription' ? 'SUB' : 'SES';
    return `PBMS-${prefix}-${compact}${ts}`.slice(0, 100);
  }

  private buildOrderInfo(reference: string, description: string): string {
    const compact = reference.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(-10);
    return `${description} ${compact}`.slice(0, 255);
  }
}
