import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVehicleRegistrationDto, ReviewVehicleRegistrationDto } from './dto';
import { VehicleRegistrationStatus, VehicleUserRole, NotificationType } from '@prisma/client';
import { normalizePlateNumber } from '../vehicles/vehicles.service';
import { PlateFormatter } from '../plates';
import { NotificationsService } from '../notifications/notifications.service';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class VehicleRegistrationsService {
  private readonly logger = new Logger(VehicleRegistrationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService,
  ) {}

  private async uploadFile(
    file: { buffer: Buffer; mimetype: string; originalname: string },
    prefix: string,
  ): Promise<string> {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL') || process.env.SUPABASE_URL;
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_KEY') || process.env.SUPABASE_SERVICE_KEY;

    if (supabaseUrl && supabaseKey) {
      try {
        const supabase = createClient(supabaseUrl, supabaseKey, {
          auth: { persistSession: false },
          realtime: { transport: ws as any },
        });
        const fileExt = file.originalname.split('.').pop();
        const fileName = `${prefix}-${Date.now()}.${fileExt}`;
        const { error } = await supabase.storage
          .from('vehicle-evidences')
          .upload(fileName, file.buffer, { contentType: file.mimetype });
        if (!error) {
          const { data: { publicUrl } } = supabase.storage
            .from('vehicle-evidences')
            .getPublicUrl(fileName);
          return publicUrl;
        }
        this.logger.warn(`Supabase upload error for ${prefix}: ${error.message}, falling back to Data URL`);
      } catch (err) {
        this.logger.warn(`Supabase client error for ${prefix}: ${err}, falling back to Data URL`);
      }
    }

    // Fallback: Convert to Base64 Data URL so local development works seamlessly without Supabase!
    const base64 = file.buffer.toString('base64');
    return `data:${file.mimetype || 'image/jpeg'};base64,${base64}`;
  }

  private validateUploadedImages(
    caVantFile: { buffer: Buffer; mimetype: string; originalname: string },
    overallFile: { buffer: Buffer; mimetype: string; originalname: string },
    plateFile: { buffer: Buffer; mimetype: string; originalname: string },
  ) {
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const minSizeBytes = 5 * 1024; // 5 KB minimum size

    const files = [
      { file: caVantFile, name: 'Ảnh cà vẹt / Giấy tờ xe' },
      { file: overallFile, name: 'Ảnh toàn cảnh xe' },
      { file: plateFile, name: 'Ảnh cận cảnh biển số xe' },
    ];

    for (const item of files) {
      if (!item.file || !item.file.buffer) {
        throw new BadRequestException(`${item.name} không được để trống.`);
      }
      if (!allowedMimeTypes.includes(item.file.mimetype?.toLowerCase())) {
        throw new BadRequestException(
          `${item.name} không đúng định dạng ảnh cho phép (chỉ chấp nhận JPG, PNG, WEBP).`,
        );
      }
      if (item.file.buffer.length < minSizeBytes) {
        throw new BadRequestException(
          `${item.name} có dung lượng quá nhỏ (< 5KB), quá mờ hoặc không đạt tiêu chuẩn làm rõ. Vui lòng chụp lại ảnh rõ nét.`,
        );
      }
    }

    // Ensure the 3 uploaded images are 3 distinct files (not duplicates)
    const hashCaVant = caVantFile.buffer.toString('hex', 0, 256);
    const hashOverall = overallFile.buffer.toString('hex', 0, 256);
    const hashPlate = plateFile.buffer.toString('hex', 0, 256);

    if (hashCaVant === hashOverall || hashCaVant === hashPlate || hashOverall === hashPlate) {
      throw new BadRequestException(
        '3 ảnh tải lên phải là 3 hình ảnh riêng biệt (Giấy tờ, Xe và Biển số). Không được dùng trùng 1 tấm ảnh cho nhiều mục.',
      );
    }
  }

  async createRequest(
    driverId: string, 
    dto: CreateVehicleRegistrationDto, 
    caVantFile: { buffer: Buffer; mimetype: string; originalname: string },
    overallFile: { buffer: Buffer; mimetype: string; originalname: string },
    plateFile: { buffer: Buffer; mimetype: string; originalname: string },
  ) {
    // 1. Hệ thống tự động xác minh 3 ảnh tải lên trước khi gửi cho Manager
    this.validateUploadedImages(caVantFile, overallFile, plateFile);

    const normalizedPlate = normalizePlateNumber(dto.plateNumber);
    if (!normalizedPlate) {
      throw new BadRequestException('Invalid plate number');
    }

    // Check if vehicle already exists and has an owner
    const existingVehicle = await this.prisma.vehicle.findFirst({
      where: { plateNumber: normalizedPlate, isActive: true },
      include: {
        vehicleUsers: {
          where: { role: VehicleUserRole.owner },
        },
      },
    });

    if (existingVehicle && existingVehicle.vehicleUsers.length > 0) {
      if (existingVehicle.vehicleUsers[0].userId === driverId) {
        throw new ConflictException('You are already the owner of this vehicle');
      }
      throw new ConflictException('This vehicle is already registered to another user');
    }

    // Check if the driver already has a pending request for this plate
    const existingRequest = await this.prisma.vehicleRegistrationRequest.findFirst({
      where: {
        plateNumber: normalizedPlate,
        status: VehicleRegistrationStatus.pending,
      },
    });

    if (existingRequest) {
      if (existingRequest.driverId === driverId) {
        throw new ConflictException('You already have a pending registration request for this vehicle');
      }
      throw new ConflictException('Another user has a pending registration request for this vehicle');
    }

    // Upload 3 evidence files (Supabase Storage with Base64 Data URL fallback)
    const [caVantUrl, overallUrl, plateUrl] = await Promise.all([
      this.uploadFile(caVantFile, `${driverId}-cavant`),
      this.uploadFile(overallFile, `${driverId}-overall`),
      this.uploadFile(plateFile, `${driverId}-plate`),
    ]);

    const request = await this.prisma.vehicleRegistrationRequest.create({
      data: {
        driverId,
        plateNumber: normalizedPlate,
        vehicleType: dto.vehicleType,
        evidenceUrlCaVant: caVantUrl,
        evidenceUrlOverall: overallUrl,
        evidenceUrlPlate: plateUrl,
      },
    });

    return request;
  }

  async findMyRequests(driverId: string) {
    const requests = await this.prisma.vehicleRegistrationRequest.findMany({
      where: { driverId },
      orderBy: { createdAt: 'desc' },
    });
    return requests.map((request) => ({
      ...request,
      plateDisplay: PlateFormatter.toDisplay(PlateFormatter.normalize(request.plateNumber)),
    }));
  }

  async findPendingRequests() {
    const requests = await this.prisma.vehicleRegistrationRequest.findMany({
      where: { status: VehicleRegistrationStatus.pending },
      include: {
        driver: {
          select: { fullName: true, phone: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    return requests.map((request) => ({
      ...request,
      plateDisplay: PlateFormatter.toDisplay(PlateFormatter.normalize(request.plateNumber)),
    }));
  }

  async findHistoricalRequests() {
    const requests = await this.prisma.vehicleRegistrationRequest.findMany({
      where: { status: { not: VehicleRegistrationStatus.pending } },
      include: {
        driver: {
          select: { fullName: true, phone: true },
        },
        reviewedBy: {
          select: { fullName: true },
        },
      },
      orderBy: { reviewedAt: 'desc' },
    });
    return requests.map((request) => ({
      ...request,
      plateDisplay: PlateFormatter.toDisplay(PlateFormatter.normalize(request.plateNumber)),
    }));
  }

  async reviewRequest(requestId: string, dto: ReviewVehicleRegistrationDto, managerId: string) {
    const request = await this.prisma.vehicleRegistrationRequest.findUnique({
      where: { id: requestId },
      include: { driver: true },
    });

    if (!request) {
      throw new NotFoundException('Registration request not found');
    }

    if (request.status !== VehicleRegistrationStatus.pending) {
      throw new ConflictException(`Request is already ${request.status}`);
    }

    await this.prisma.$transaction(async (tx) => {
      // 1. Update the request status
      await tx.vehicleRegistrationRequest.update({
        where: { id: requestId },
        data: {
          status: dto.status,
          rejectReason: dto.status === 'rejected' ? dto.rejectReason : null,
          reviewedById: managerId,
          reviewedAt: new Date(),
        },
      });

      // 2. If approved, link or create vehicle
      if (dto.status === 'approved') {
        let vehicle = await tx.vehicle.findFirst({
          where: { plateNumber: request.plateNumber },
        });

        if (vehicle && !vehicle.plateDisplay) {
          vehicle = await tx.vehicle.update({
            where: { id: vehicle.id },
            data: { plateDisplay: PlateFormatter.toDisplay(PlateFormatter.normalize(request.plateNumber)) },
          });
        }

        if (!vehicle) {
          vehicle = await tx.vehicle.create({
            data: {
              plateNumber: request.plateNumber,
              plateDisplay: PlateFormatter.toDisplay(PlateFormatter.normalize(request.plateNumber)),
              vehicleType: request.vehicleType,
              isActive: true,
            },
          });
        }

        // Check if link exists
        const existingLink = await tx.vehicleUser.findUnique({
          where: {
            vehicleId_userId: {
              vehicleId: vehicle.id,
              userId: request.driverId,
            },
          },
        });

        if (!existingLink) {
          await tx.vehicleUser.create({
            data: {
              vehicleId: vehicle.id,
              userId: request.driverId,
              role: VehicleUserRole.owner,
            },
          });
        }
      }
    });

    // Send notification
    try {
      const title = dto.status === 'approved' ? 'Vehicle Approved' : 'Vehicle Rejected';
      const message = dto.status === 'approved'
        ? `Your request to register vehicle ${request.plateNumber} has been approved.`
        : `Your request to register vehicle ${request.plateNumber} was rejected. Reason: ${dto.rejectReason}`;

      // Re-use session_started or create a new general type if needed. We only have session_started and reservation_expiring_soon.
      // Let's use session_started for now as it's just a general push notification channel in this MVP.
      await this.notificationsService.createForUser({
        userId: request.driverId,
        type: NotificationType.session_started,
        title,
        message,
      });
    } catch (e) {
      this.logger.error(`Failed to send notification for request ${requestId}: ${e.message}`);
    }

    return { message: `Request ${dto.status} successfully` };
  }

  @Cron(CronExpression.EVERY_HOUR)
  async expireStaleRequests() {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const staleRequests = await this.prisma.vehicleRegistrationRequest.findMany({
      where: {
        status: VehicleRegistrationStatus.pending,
        createdAt: { lt: yesterday },
      },
    });

    if (staleRequests.length === 0) return;

    for (const req of staleRequests) {
      await this.prisma.vehicleRegistrationRequest.update({
        where: { id: req.id },
        data: { status: VehicleRegistrationStatus.expired },
      });

      try {
        await this.notificationsService.createForUser({
          userId: req.driverId,
          type: NotificationType.session_started,
          title: 'Registration Expired',
          message: `Your request to register vehicle ${req.plateNumber} has expired after 24 hours.`,
        });
      } catch (e) {
        this.logger.error(`Failed to notify expired request ${req.id}: ${e.message}`);
      }
    }

    this.logger.log(`Expired ${staleRequests.length} vehicle registration requests`);
  }
}
