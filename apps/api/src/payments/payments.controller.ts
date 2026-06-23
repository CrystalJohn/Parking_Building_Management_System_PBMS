import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { Role } from '@prisma/client';
import { CurrentUser, Roles } from '../auth/decorators';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { PaymentsService } from './payments.service';

@Controller()
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * POST /sessions/:id/payments/bank-qr
   * Staff only — create a VNPAY payment URL for a checkout_pending session.
   * Idempotent: reuses an unexpired pending payment if one exists.
   */
  @Post('sessions/:id/payments/bank-qr')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.staff)
  createBankQrPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') staffId: string,
    @Req() req: Request,
  ) {
    const ipAddr =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      '127.0.0.1';
    return this.paymentsService.createBankQrPayment(id, staffId, ipAddr);
  }

  /**
   * GET /sessions/:id/payment-status
   * Staff only — poll payment + session state for the checkout UI.
   */
  @Get('sessions/:id/payment-status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.staff)
  getPaymentStatus(@Param('id', ParseUUIDPipe) id: string) {
    return this.paymentsService.getPaymentStatus(id);
  }

  /**
   * GET /payments/vnpay/return
   * VNPAY return URL — called by the customer's browser after payment.
   * All params are in the query string (VNPAY standard).
   * No auth required (public callback from VNPAY).
   */
  @Get('payments/vnpay/return')
  @HttpCode(HttpStatus.OK)
  handleVnpayReturn(@Query() params: Record<string, string>) {
    return this.paymentsService.handleVnpayReturn(params);
  }

  /**
   * GET /payments/vnpay/ipn
   * VNPAY IPN (Instant Payment Notification) — server-to-server callback.
   * Must always respond with { RspCode, Message } per VNPAY spec.
   * No auth required (public callback from VNPAY).
   */
  @Get('payments/vnpay/ipn')
  @HttpCode(HttpStatus.OK)
  handleVnpayIpn(@Query() params: Record<string, string>) {
    return this.paymentsService.handleVnpayIpn(params);
  }
}
