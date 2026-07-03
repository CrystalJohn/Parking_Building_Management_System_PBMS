import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { Role } from '@prisma/client';
import { CurrentUser, Roles } from '../auth/decorators';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { DriverSessionPaymentDto } from './dto/driver-session-payment.dto';
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
   * POST /sessions/:id/pay
   * Driver only — create or reuse a VNPAY Bank QR payment for the driver's own checkout_pending session.
   */
  @Post('sessions/:id/pay')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.driver)
  driverCreateBankQrPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') driverId: string,
    @Body() _dto: DriverSessionPaymentDto,
    @Req() req: Request,
  ) {
    const ipAddr =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      '127.0.0.1';
    return this.paymentsService.createDriverBankQrPayment(id, driverId, ipAddr);
  }

  /**
   * GET /sessions/:id/payment-status
   * Staff only — poll payment + session state for the checkout UI.
   */
  @Get('sessions/:id/payment-status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.staff, Role.driver)
  getPaymentStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: Role,
  ) {
    if (role === Role.driver) {
      return this.paymentsService.getPaymentStatusForDriver(id, userId);
    }

    return this.paymentsService.getPaymentStatus(id);
  }

  /**
   * GET /payments/vnpay/return
   * VNPAY return URL — browser redirect after payment completes/fails/cancels.
   * Returns a simple HTML page so the user sees result and can close the tab.
   * The staff gate UI uses polling to detect the payment status change.
   */
  @Get('payments/vnpay/return')
  async handleVnpayReturn(
    @Query() params: Record<string, string>,
    @Res() res: import('express').Response,
  ) {
    let paid = false;
    let message = 'Đang xử lý...';

    try {
      const result = await this.paymentsService.handleVnpayReturn(params);
      paid = result.paid === true;
      message = paid
        ? 'Thanh toán thành công! Vui lòng quay lại quầy để nhân viên xác nhận xe ra.'
        : 'Thanh toán thất bại hoặc đã bị hủy.';
    } catch {
      message = 'Có lỗi xảy ra khi xử lý thanh toán.';
    }

    const color = paid ? '#16a34a' : '#dc2626';
    const icon = paid ? '✓' : '✗';
    const title = paid ? 'Thanh toán thành công' : 'Thanh toán thất bại';

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - PBMS</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; background: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: white; border-radius: 16px; padding: 48px 40px; text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,0.08); max-width: 400px; width: 90%; }
    .icon { width: 72px; height: 72px; border-radius: 50%; background: ${color}; color: white; font-size: 36px; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px; }
    h1 { font-size: 22px; font-weight: 700; color: #0f172a; margin-bottom: 12px; }
    p { font-size: 15px; color: #64748b; line-height: 1.6; margin-bottom: 28px; }
    .note { font-size: 13px; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${icon}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <p class="note">Bạn có thể đóng tab này.</p>
  </div>
</body>
</html>`);
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
