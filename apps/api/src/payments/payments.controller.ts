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

    try {
      const result = await this.paymentsService.handleVnpayReturn(params);
      paid = result.paid === true;
    } catch {
      paid = false;
    }

    // Đọc thông tin thực tế từ VNPay params
    const responseCode = params['vnp_ResponseCode'] ?? '';
    const transactionNo = params['vnp_TransactionNo'] ?? '';
    const bankCode = params['vnp_BankCode'] ?? '';
    const amountRaw = params['vnp_Amount'] ?? '0';
    const amount = Math.round(Number(amountRaw) / 100);
    const orderInfo = decodeURIComponent((params['vnp_OrderInfo'] ?? '').replace(/\+/g, ' '));
    const payDate = params['vnp_PayDate'] ?? '';
    const formattedDate = payDate.length === 14
      ? `${payDate.slice(6,8)}/${payDate.slice(4,6)}/${payDate.slice(0,4)} ${payDate.slice(8,10)}:${payDate.slice(10,12)}:${payDate.slice(12,14)}`
      : payDate;

    const redirectUrl = `http://localhost:3000/driver/reservations?payment=${paid ? 'success' : 'failed'}`;

    const color = paid ? '#16a34a' : '#dc2626';
    const bgColor = paid ? '#f0fdf4' : '#fef2f2';
    const borderColor = paid ? '#86efac' : '#fca5a5';
    const icon = paid ? '✓' : '✗';
    const title = paid ? 'Thanh toán thành công' : 'Thanh toán thất bại';
    const subtitle = paid
      ? `Giao dịch VNPay đã được xác nhận. Lượt đặt chỗ của bạn đã được kích hoạt.`
      : `Giao dịch thất bại (Mã lỗi: ${responseCode}). Vui lòng thử lại.`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} – PBMS</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #f1f5f9;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    .card {
      background: white;
      border-radius: 20px;
      padding: 40px 36px;
      max-width: 420px;
      width: 100%;
      box-shadow: 0 8px 32px rgba(0,0,0,0.10);
      border: 1px solid #e2e8f0;
    }
    .icon-wrap {
      width: 72px; height: 72px;
      border-radius: 50%;
      background: ${color};
      color: white;
      font-size: 34px;
      display: flex; align-items: center; justify-content: center;
      margin: 0 auto 20px;
      box-shadow: 0 4px 16px ${color}55;
    }
    h1 { font-size: 22px; font-weight: 800; color: #0f172a; text-align: center; margin-bottom: 6px; }
    .subtitle { font-size: 13.5px; color: #64748b; text-align: center; line-height: 1.6; margin-bottom: 24px; }
    .detail-box {
      background: ${bgColor};
      border: 1px solid ${borderColor};
      border-radius: 12px;
      padding: 16px 18px;
      margin-bottom: 24px;
    }
    .row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 0;
      font-size: 13px;
    }
    .row + .row { border-top: 1px solid ${borderColor}; }
    .row .label { color: #64748b; font-weight: 600; }
    .row .value { color: #0f172a; font-weight: 700; text-align: right; }
    .row .value.amount { color: ${color}; font-size: 16px; }
    .btn {
      display: block;
      background: ${color};
      color: white;
      text-align: center;
      padding: 13px;
      border-radius: 12px;
      text-decoration: none;
      font-weight: 700;
      font-size: 14px;
      box-shadow: 0 2px 12px ${color}44;
      transition: opacity 0.2s;
    }
    .btn:hover { opacity: 0.88; }
    .note { font-size: 12px; color: #94a3b8; text-align: center; margin-top: 14px; }
    .progress-bar {
      height: 3px;
      background: #e2e8f0;
      border-radius: 99px;
      margin-top: 10px;
      overflow: hidden;
    }
    .progress-fill {
      height: 100%;
      background: ${color};
      border-radius: 99px;
      animation: shrink 4s linear forwards;
    }
    @keyframes shrink { from { width: 100%; } to { width: 0%; } }
  </style>
  <script>
    var t = 4;
    function tick() {
      var el = document.getElementById('countdown');
      if (el) el.textContent = t;
      if (t <= 0) { window.location.href = '${redirectUrl}'; return; }
      t--;
      setTimeout(tick, 1000);
    }
    window.onload = tick;
  </script>
</head>
<body>
  <div class="card">
    <div class="icon-wrap">${icon}</div>
    <h1>${title}</h1>
    <p class="subtitle">${subtitle}</p>

    <div class="detail-box">
      ${paid ? `
      <div class="row">
        <span class="label">Số tiền</span>
        <span class="value amount">${amount.toLocaleString('vi-VN')} VNĐ</span>
      </div>
      <div class="row">
        <span class="label">Mã GD VNPay</span>
        <span class="value">${transactionNo}</span>
      </div>
      <div class="row">
        <span class="label">Ngân hàng</span>
        <span class="value">${bankCode}</span>
      </div>
      <div class="row">
        <span class="label">Thời gian</span>
        <span class="value">${formattedDate}</span>
      </div>
      ` : `
      <div class="row">
        <span class="label">Mã lỗi</span>
        <span class="value">${responseCode}</span>
      </div>
      <div class="row">
        <span class="label">Nội dung</span>
        <span class="value">${orderInfo || 'Không xác định'}</span>
      </div>
      `}
    </div>

    <a href="${redirectUrl}" class="btn">Quay về trang đặt chỗ</a>

    <p class="note">Tự động chuyển hướng sau <span id="countdown">4</span> giây...</p>
    <div class="progress-bar"><div class="progress-fill"></div></div>
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
