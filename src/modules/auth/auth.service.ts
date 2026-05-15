import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

type AuthResponse = { accessToken: string; refreshToken: string; user: User };

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(RefreshToken) private readonly refreshRepo: Repository<RefreshToken>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const exists = await this.userRepo.findOne({ where: { email: dto.email } });
    if (exists) throw new ConflictException('Email already registered');

    const saltRounds = this.config.get<number>('bcrypt.saltRounds', 10);
    const passwordHash = await bcrypt.hash(dto.password, saltRounds);

    const user = this.userRepo.create({
      email: dto.email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
    });
    const saved = await this.userRepo.save(user);
    const refreshToken = await this.issueRefreshToken(saved.id);
    return { accessToken: this.signAccessToken(saved), refreshToken, user: saved };
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.userRepo.findOne({ where: { email: dto.email } });
    if (!user || !user.isActive) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const refreshToken = await this.issueRefreshToken(user.id);
    return { accessToken: this.signAccessToken(user), refreshToken, user };
  }

  async refresh(rawToken: string): Promise<{ accessToken: string }> {
    let payload: { sub: string; email: string; role: string };
    try {
      payload = this.jwtService.verify(rawToken, {
        secret: this.config.get<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new ForbiddenException('Invalid refresh token');
    }

    const stored = await this.refreshRepo.findOne({ where: { token: rawToken } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new ForbiddenException('Refresh token expired or revoked');
    }

    const user = await this.userRepo.findOne({ where: { id: payload.sub } });
    if (!user || !user.isActive) throw new ForbiddenException('User inactive');

    return { accessToken: this.signAccessToken(user) };
  }

  async logout(rawToken: string): Promise<void> {
    const stored = await this.refreshRepo.findOne({ where: { token: rawToken } });
    if (!stored || stored.revokedAt) return;
    stored.revokedAt = new Date();
    await this.refreshRepo.save(stored);
  }

  async findById(id: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  private async issueRefreshToken(userId: string): Promise<string> {
    const expiresIn = this.config.get<string>('jwt.refreshExpiresIn', '7d');
    const secret = this.config.get<string>('jwt.refreshSecret');
    const token = this.jwtService.sign({ sub: userId }, { secret, expiresIn });

    const expiresAt = new Date();
    const days = parseInt(expiresIn.replace('d', ''), 10) || 7;
    expiresAt.setDate(expiresAt.getDate() + days);

    const rt = this.refreshRepo.create({ userId, token, expiresAt, revokedAt: null });
    await this.refreshRepo.save(rt);
    return token;
  }

  private signAccessToken(user: User): string {
    const payload = { sub: user.id, email: user.email, role: user.role };
    return this.jwtService.sign(payload, {
      secret: this.config.get<string>('jwt.accessSecret'),
      expiresIn: this.config.get<string>('jwt.accessExpiresIn', '15m'),
    });
  }
}
