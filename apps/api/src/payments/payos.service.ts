import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import {
  CreatePayosPaymentLinkInput,
  CreatePayosPaymentLinkResult,
  VerifiedPayosWebhook,
} from './payos.types';

type PayosPayloadValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Record<string, unknown>
  | Array<Record<string, unknown>>;

@Injectable()
export class PayosService {
  private readonly apiBaseUrl =
    process.env.PAYOS_API_BASE_URL ?? 'https://api-merchant.payos.vn';

  isConfigured() {
    return Boolean(
      process.env.PAYOS_CLIENT_ID &&
        process.env.PAYOS_API_KEY &&
        process.env.PAYOS_CHECKSUM_KEY,
    );
  }

  async createPaymentLink(
    input: CreatePayosPaymentLinkInput,
  ): Promise<CreatePayosPaymentLinkResult> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'PayOS is not configured. Please set PAYOS_CLIENT_ID, PAYOS_API_KEY, and PAYOS_CHECKSUM_KEY.',
      );
    }

    const expiredAt = new Date(Date.now() + 15 * 60 * 1000);
    const orderCode = this.buildOrderCode();
    const payload = {
      orderCode: Number(orderCode),
      amount: input.amount,
      description: this.buildDescription(input.sessionCode),
      items: [
        {
          name: `Parking ${input.licensePlate}`,
          quantity: 1,
          price: input.amount,
        },
      ],
      returnUrl:
        process.env.PAYOS_RETURN_URL ?? 'http://localhost:5173/staff/gate',
      cancelUrl:
        process.env.PAYOS_CANCEL_URL ?? 'http://localhost:5173/staff/gate',
      expiredAt: Math.floor(expiredAt.getTime() / 1000),
    };

    const signedPayload = {
      ...payload,
      signature: this.signData(payload),
    };

    const response = await fetch(`${this.apiBaseUrl}/v2/payment-requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-id': process.env.PAYOS_CLIENT_ID!,
        'x-api-key': process.env.PAYOS_API_KEY!,
      },
      body: JSON.stringify(signedPayload),
    });

    const body = (await response.json().catch(() => null)) as {
      code?: string;
      desc?: string;
      message?: string;
      data?: Record<string, unknown>;
    } | null;

    if (!response.ok || body?.code !== '00' || !body.data) {
      throw new BadRequestException(
        body?.desc ?? body?.message ?? 'Failed to create PayOS payment link',
      );
    }

    const data = body.data;
    const providerRef =
      this.readString(data.paymentLinkId) ??
      this.readString(data.id) ??
      this.readString(data.reference);

    return {
      provider: 'payos',
      providerRef,
      providerOrderCode: orderCode,
      checkoutUrl: this.readString(data.checkoutUrl),
      qrCode: this.readString(data.qrCode),
      expiredAt,
      providerPayload: data,
    };
  }

  verifyWebhook(payload: unknown): VerifiedPayosWebhook {
    if (!process.env.PAYOS_CHECKSUM_KEY) {
      throw new ServiceUnavailableException(
        'PayOS checksum key is not configured.',
      );
    }

    const body = payload as {
      code?: string;
      success?: boolean;
      data?: Record<string, unknown>;
      signature?: string;
    };

    if (!body?.data || !body.signature) {
      throw new BadRequestException('Invalid PayOS webhook payload');
    }

    const expectedSignature = this.signData(body.data as Record<string, PayosPayloadValue>);
    if (!this.safeEqual(expectedSignature, body.signature)) {
      throw new BadRequestException('Invalid PayOS webhook signature');
    }

    const data = body.data;
    return {
      orderCode: String(data.orderCode ?? ''),
      amount: Number(data.amount ?? 0),
      success:
        body.success === true &&
        body.code === '00' &&
        String(data.code ?? '') === '00',
      reference: this.readString(data.reference),
      paymentLinkId: this.readString(data.paymentLinkId),
      transactionDateTime: this.readString(data.transactionDateTime),
      rawData: data,
    };
  }

  private signData(data: Record<string, PayosPayloadValue>) {
    const query = Object.keys(data)
      .filter((key) => data[key] !== undefined)
      .sort()
      .map((key) => {
        let value = data[key];
        if ([null, undefined, 'undefined', 'null'].includes(value as any)) {
          value = '';
        } else if (Array.isArray(value)) {
          value = JSON.stringify(value.map((item) => this.sortObject(item)));
        }
        return `${key}=${value}`;
      })
      .join('&');

    return createHmac('sha256', process.env.PAYOS_CHECKSUM_KEY!)
      .update(query)
      .digest('hex');
  }

  private sortObject(object: Record<string, unknown>) {
    return Object.keys(object)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = object[key];
        return result;
      }, {});
  }

  private safeEqual(expected: string, actual: string) {
    const expectedBuffer = Buffer.from(expected);
    const actualBuffer = Buffer.from(actual);
    return (
      expectedBuffer.length === actualBuffer.length &&
      timingSafeEqual(expectedBuffer, actualBuffer)
    );
  }

  private buildOrderCode() {
    const random = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0');
    return `${Date.now()}${random}`.slice(-12);
  }

  private buildDescription(sessionCode: string) {
    const compact = sessionCode.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    return `PBMS${compact.slice(-5)}`.slice(0, 9);
  }

  private readString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value : null;
  }
}
