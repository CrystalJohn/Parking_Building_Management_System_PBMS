import { Injectable } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type CreateNotificationInput = {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  relatedReservationId?: string | null;
  relatedSessionId?: string | null;
};

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async createForUser(input: CreateNotificationInput) {
    return this.prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        message: input.message,
        relatedReservationId: input.relatedReservationId ?? null,
        relatedSessionId: input.relatedSessionId ?? null,
      },
    });
  }

  async listForUser(userId: string) {
    const notifications = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return notifications.map((notification) => ({
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      relatedReservationId: notification.relatedReservationId,
      relatedSessionId: notification.relatedSessionId,
      createdAt: notification.createdAt,
      readAt: notification.readAt,
    }));
  }
}
