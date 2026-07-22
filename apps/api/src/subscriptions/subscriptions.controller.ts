import { Controller, Post, Get, Param, Body, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles, CurrentUser } from '../auth/decorators';
import { Role } from '@prisma/client';
import { SubscriptionsService } from './subscriptions.service';
import { CreateSubscriptionDto } from './dto';
import { Request } from 'express';

@Controller('subscriptions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.driver)
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Post()
  create(@Body() dto: CreateSubscriptionDto, @CurrentUser('id') driverId: string, @Req() req: Request) {
    const ipAddr = (req.headers['x-forwarded-for'] as string) || req.ip || '127.0.0.1';
    return this.subscriptionsService.create(dto, driverId, ipAddr);
  }

  @Get('my')
  findMySubscriptions(@CurrentUser('id') driverId: string) {
    return this.subscriptionsService.findMySubscriptions(driverId);
  }

  @Get(':id/payment-status')
  getPaymentStatus(@Param('id') id: string, @CurrentUser('id') driverId: string) {
    return this.subscriptionsService.getPaymentStatus(id, driverId);
  }
}
