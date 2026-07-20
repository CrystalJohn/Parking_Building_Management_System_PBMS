/**
 * Section 7.6 — Bảo mật: Reservation Ownership (BOLA fix)
 * Verifies that drivers requesting another driver's reservation get 404 (not 403).
 */

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../app.module';
import * as request from 'supertest';
import { PrismaService } from '../prisma/prisma.service';
import { Role, VehicleType, ReservationStatus } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';

describe('Section 7.6 — BOLA: Reservation Ownership (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let driverAToken: string;
  let driverBToken: string;
  let driverCancelToken: string;
  let reservationAId: string;
  let jwtService: JwtService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get<PrismaService>(PrismaService);
    jwtService = moduleFixture.get(JwtService);
    await app.init();

    // Create Driver A
    const driverA = await prisma.user.create({
      data: {
        email: `res-driver-a-${Date.now()}@pbms.local`,
        username: `res-driver-a-${Date.now()}`,
        phone: `090${Math.random().toString().slice(2, 9)}`,
        passwordHash: 'hash',
        role: Role.driver,
        fullName: 'Res Driver A',
        isActive: true,
      },
    });

    // Create Driver B
    const driverB = await prisma.user.create({
      data: {
        email: `res-driver-b-${Date.now()}@pbms.local`,
        username: `res-driver-b-${Date.now()}`,
        phone: `091${Math.random().toString().slice(2, 9)}`,
        passwordHash: 'hash',
        role: Role.driver,
        fullName: 'Res Driver B',
        isActive: true,
      },
    });

    // Mock JWT tokens
    driverAToken = jwtService.sign({ sub: driverA.id, role: Role.driver });
    driverBToken = jwtService.sign({ sub: driverB.id, role: Role.driver });

    // Create a vehicle and link to Driver A
    const vehicle = await prisma.vehicle.create({
      data: {
        plateNumber: `88X${Date.now().toString().slice(-6)}`,
        vehicleType: VehicleType.car,
      },
    });

    await prisma.vehicleUser.create({
      data: {
        vehicleId: vehicle.id,
        userId: driverA.id,
        role: 'driver',
      },
    });

    const slot = await prisma.slot.findFirst();
    const reservation = await prisma.reservation.create({
      data: {
        driverId: driverA.id,
        vehicleId: vehicle.id,
        slotId: slot.id,
        vehicleType: VehicleType.car,
        status: ReservationStatus.active,
        plannedArrivalAt: new Date(Date.now() + 30 * 60 * 1000), // 30 min from now
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours from now
      },
    });

    reservationAId = reservation.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('7.6.1 — GET /reservations/:id ownership check', () => {
    it('Driver A retrieves own reservation → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/reservations/${reservationAId}`)
        .set('Authorization', `Bearer ${driverAToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('id', reservationAId);
    });

    it('Driver B requests Driver A reservation → 404 (not 403)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/reservations/${reservationAId}`)
        .set('Authorization', `Bearer ${driverBToken}`)
        .expect(404); // ← KEY: must be 404, not 403

      expect(res.body.message).toMatch(/not found/i);
    });
  });

  describe('7.6.2 — GET /reservations/:id/checkin-qr ownership check', () => {
    it('Driver A gets own reservation QR → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/reservations/${reservationAId}/checkin-qr`)
        .set('Authorization', `Bearer ${driverAToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('token');
    });

    it('Driver B requests Driver A reservation QR → 404 (not 403)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/reservations/${reservationAId}/checkin-qr`)
        .set('Authorization', `Bearer ${driverBToken}`)
        .expect(404); // ← KEY: must be 404, not 403

      expect(res.body.message).toMatch(/not found|access/i);
    });
  });

  describe('7.6.3 — DELETE /reservations/:id ownership check', () => {
    let cancelReservationId: string;
    let driverCancel: any;

    beforeAll(async () => {
      // Create a separate driver to cancel their reservation to avoid active reservation conflict
      driverCancel = await prisma.user.create({
        data: {
          email: `res-driver-cancel-${Date.now()}@pbms.local`,
          username: `res-driver-cancel-${Date.now()}`,
          phone: `093${Math.random().toString().slice(2, 9)}`,
          passwordHash: 'hash',
          role: Role.driver,
          fullName: 'Res Driver Cancel',
          isActive: true,
        },
      });
      driverCancelToken = jwtService.sign({ sub: driverCancel.id, role: Role.driver });
      const vehicle = await prisma.vehicle.findFirst();
      const slot = await prisma.slot.findFirst();

      const res = await prisma.reservation.create({
        data: {
          driverId: driverCancel.id,
          vehicleId: vehicle.id,
          slotId: slot.id,
          vehicleType: VehicleType.car,
          status: ReservationStatus.active,
          plannedArrivalAt: new Date(Date.now() + 30 * 60 * 1000),
          expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
        },
      });
      cancelReservationId = res.id;
    });

    it('Driver A cancels own reservation → 200', async () => {
      await request(app.getHttpServer())
        .delete(`/reservations/${cancelReservationId}`)
        .set('Authorization', `Bearer ${driverCancelToken}`)
        .expect(200);
    });

    it('Driver B attempts cancel of Driver A reservation → 404 (not 403)', async () => {
      // Create another reservation for the cancel test
      const vehicle = await prisma.vehicle.findFirst();
      const slot = await prisma.slot.findFirst();

      const anotherRes = await prisma.reservation.create({
        data: {
          driverId: driverCancel.id,
          vehicleId: vehicle.id,
          slotId: slot.id,
          vehicleType: VehicleType.car,
          status: ReservationStatus.active,
          plannedArrivalAt: new Date(Date.now() + 30 * 60 * 1000),
          expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
        },
      });

      const res = await request(app.getHttpServer())
        .delete(`/reservations/${anotherRes.id}`)
        .set('Authorization', `Bearer ${driverBToken}`)
        .expect(404); // ← KEY: must be 404, not 403

      expect(res.body.message).toMatch(/not found/i);
    });
  });
});
