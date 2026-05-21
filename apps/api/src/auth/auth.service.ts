import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto, LoginDto } from './dto';

@Injectable()
export class AuthService {
  private readonly SALT_ROUNDS = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Register a new driver account (self-registration: phone + password)
   * Req 9.1
   */
  async register(dto: RegisterDto) {
    // Check if phone already exists
    const existing = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });

    if (existing) {
      throw new ConflictException('Phone number already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, this.SALT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        phone: dto.phone,
        passwordHash,
        role: Role.driver,
        fullName: dto.fullName,
      },
      select: { id: true, phone: true, role: true, fullName: true },
    });

    // Auto-login after registration
    const token = this.generateToken(user.id, user.role);

    return {
      user,
      access_token: token,
    };
  }

  /**
   * Login with phone + password, returns JWT containing userId and role
   * Req 9.3
   */
  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account has been deactivated');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = this.generateToken(user.id, user.role);

    return {
      user: {
        id: user.id,
        phone: user.phone,
        role: user.role,
        fullName: user.fullName,
      },
      access_token: token,
    };
  }

  /**
   * Logout — for stateless JWT, client discards token.
   * Token blacklist via version-bump when user is deactivated (Req 12.4).
   * The JwtStrategy.validate() checks isActive on every request.
   */
  async logout(_userId: string) {
    // Stateless JWT: no server-side invalidation needed for normal logout.
    // Deactivation-based revocation is handled by JwtStrategy checking isActive.
    return { message: 'Logged out successfully' };
  }

  private generateToken(userId: string, role: string): string {
    const payload = { sub: userId, role };
    return this.jwtService.sign(payload);
  }
}
