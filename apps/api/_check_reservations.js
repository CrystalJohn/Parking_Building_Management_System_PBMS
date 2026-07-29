const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  try {
    const reservations = await prisma.reservation.findMany({
      where: { status: 'active' },
      select: { id: true, status: true, slotId: true, expiresAt: true },
    });
    console.log('Active reservations:', JSON.stringify(reservations, null, 2));
    console.log('Count:', reservations.length);
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
})();
