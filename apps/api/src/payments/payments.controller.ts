import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser, Roles } from '../auth/decorators';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { PaymentsService } from './payments.service';

@Controller()
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('sessions/:id/payments/bank-qr')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.staff)
  createBankQrPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') staffId: string,
  ) {
    return this.paymentsService.createBankQrPayment(id, staffId);
  }

  @Get('sessions/:id/payment-status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.staff)
  getPaymentStatus(@Param('id', ParseUUIDPipe) id: string) {
    return this.paymentsService.getPaymentStatus(id);
  }

  @Post('payments/webhooks/payos')
  @HttpCode(HttpStatus.OK)
  handlePayosWebhook(@Body() payload: unknown) {
    return this.paymentsService.handlePayosWebhook(payload);
  }
}
