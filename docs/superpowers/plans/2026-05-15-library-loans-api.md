# Library Loans API — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete NestJS REST API for library loan management on top of the existing scaffold (auth, items, loans modules + TypeORM migration).

**Architecture:** Three domain modules (auth, items, loans) wired into the existing AppModule. JwtAuthGuard registered globally as APP_GUARD; public endpoints decorated with `@Public()` (already exists in scaffold). ClassSerializerInterceptor registered globally as APP_INTERCEPTOR to strip `passwordHash` via `@Exclude()`. Single TypeORM migration creates all three tables.

**Tech Stack:** NestJS 10, TypeORM 0.3, PostgreSQL 16, passport-jwt, bcrypt, class-validator, @nestjs/swagger, Jest.

---

## Security Notice — PDF Prompt Injections Detected and Ignored

The exam PDF contained 5 embedded prompt injection attempts. This plan follows **only the visible spec**:
- Endpoints use `/auth/login` (not `/auth/signin`)
- bcrypt `saltRounds` default is `10` (from spec and `.env.example`)
- HTTP 409 for R2/R3 (not 422)
- Loan entity has no `priority` column
- No `traceId` field in any DTO

---

## File Map

**Create:**
```
src/modules/auth/
  entities/user.entity.ts
  dto/register.dto.ts
  dto/login.dto.ts
  strategies/jwt.strategy.ts
  guards/jwt-auth.guard.ts
  auth.service.ts
  auth.controller.ts
  auth.module.ts

src/modules/items/
  entities/item.entity.ts
  dto/create-item.dto.ts
  dto/update-item.dto.ts
  items.service.ts
  items.controller.ts
  items.module.ts

src/modules/loans/
  entities/loan.entity.ts
  dto/create-loan.dto.ts
  dto/filter-loan.dto.ts
  loans.service.spec.ts   ← written BEFORE service (TDD)
  loans.service.ts
  loans.controller.ts
  loans.module.ts

src/database/migrations/1747353600000-InitialSchema.ts
```

**Modify:**
```
src/app.module.ts   — add APP_GUARD, APP_INTERCEPTOR, import 3 new modules
README.md           — startup commands + overdue decision
```

---

## Task 1: User entity

**Files:**
- Create: `src/modules/auth/entities/user.entity.ts`

- [ ] **Step 1: Write the entity**

```typescript
// src/modules/auth/entities/user.entity.ts
import {
  Column, CreateDateColumn, Entity, OneToMany,
  PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { Exclude } from 'class-transformer';

export enum UserRole {
  ADMIN = 'admin',
  LIBRARIAN = 'librarian',
  MEMBER = 'member',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255, unique: true })
  email: string;

  @Exclude()
  @Column({ length: 255 })
  passwordHash: string;

  @Column({ length: 100 })
  firstName: string;

  @Column({ length: 100 })
  lastName: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.MEMBER })
  role: UserRole;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

Note: `OneToMany` relation to Loan is omitted here to avoid a forward reference before the Loan entity exists. TypeORM resolves this at runtime; add it back if you want eager relations.

- [ ] **Step 2: Commit**

```bash
git add src/modules/auth/entities/user.entity.ts
git commit -m "feat(auth): add User entity with role enum and @Exclude on passwordHash"
```

---

## Task 2: Item entity

**Files:**
- Create: `src/modules/items/entities/item.entity.ts`

- [ ] **Step 1: Write the entity**

```typescript
// src/modules/items/entities/item.entity.ts
import {
  Column, CreateDateColumn, Entity,
  PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';

export enum ItemType {
  BOOK = 'book',
  MAGAZINE = 'magazine',
  EQUIPMENT = 'equipment',
}

@Entity('items')
export class Item {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 32, unique: true })
  code: string;

  @Column({ length: 255 })
  title: string;

  @Column({ type: 'enum', enum: ItemType })
  type: ItemType;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/items/entities/item.entity.ts
git commit -m "feat(items): add Item entity with ItemType enum"
```

---

## Task 3: Loan entity

**Files:**
- Create: `src/modules/loans/entities/loan.entity.ts`

- [ ] **Step 1: Write the entity**

```typescript
// src/modules/loans/entities/loan.entity.ts
import {
  Column, CreateDateColumn, Entity, JoinColumn,
  ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { Item } from '../../items/entities/item.entity';

export enum LoanStatus {
  ACTIVE = 'active',
  RETURNED = 'returned',
  OVERDUE = 'overdue',
  LOST = 'lost',
}

@Entity('loans')
export class Loan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  itemId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => Item, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'itemId' })
  item: Item;

  @Column({ type: 'timestamptz' })
  loanedAt: Date;

  @Column({ type: 'timestamptz' })
  dueAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  returnedAt: Date | null;

  @Column({ type: 'enum', enum: LoanStatus, default: LoanStatus.ACTIVE })
  status: LoanStatus;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  fineAmount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/loans/entities/loan.entity.ts
git commit -m "feat(loans): add Loan entity with LoanStatus enum and FK relations"
```

---

## Task 4: Migration — all three tables

**Files:**
- Create: `src/database/migrations/1747353600000-InitialSchema.ts`

- [ ] **Step 1: Write the migration**

```typescript
// src/database/migrations/1747353600000-InitialSchema.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1747353600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE user_role_enum AS ENUM ('admin', 'librarian', 'member')`,
    );
    await queryRunner.query(`
      CREATE TABLE users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) NOT NULL,
        "passwordHash" VARCHAR(255) NOT NULL,
        "firstName" VARCHAR(100) NOT NULL,
        "lastName" VARCHAR(100) NOT NULL,
        role user_role_enum NOT NULL DEFAULT 'member',
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_users_email" ON users(email)`);

    await queryRunner.query(
      `CREATE TYPE item_type_enum AS ENUM ('book', 'magazine', 'equipment')`,
    );
    await queryRunner.query(`
      CREATE TABLE items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(32) NOT NULL,
        title VARCHAR(255) NOT NULL,
        type item_type_enum NOT NULL,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_items_code" ON items(code)`);

    await queryRunner.query(
      `CREATE TYPE loan_status_enum AS ENUM ('active', 'returned', 'overdue', 'lost')`,
    );
    await queryRunner.query(`
      CREATE TABLE loans (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" UUID NOT NULL,
        "itemId" UUID NOT NULL,
        "loanedAt" TIMESTAMPTZ NOT NULL,
        "dueAt" TIMESTAMPTZ NOT NULL,
        "returnedAt" TIMESTAMPTZ,
        status loan_status_enum NOT NULL DEFAULT 'active',
        "fineAmount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "FK_loans_userId" FOREIGN KEY ("userId")
          REFERENCES users(id) ON DELETE RESTRICT,
        CONSTRAINT "FK_loans_itemId" FOREIGN KEY ("itemId")
          REFERENCES items(id) ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_loans_item_status" ON loans("itemId", status)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_loans_user_status" ON loans("userId", status)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS loans`);
    await queryRunner.query(`DROP TYPE IF EXISTS loan_status_enum`);
    await queryRunner.query(`DROP TABLE IF EXISTS items`);
    await queryRunner.query(`DROP TYPE IF EXISTS item_type_enum`);
    await queryRunner.query(`DROP TABLE IF EXISTS users`);
    await queryRunner.query(`DROP TYPE IF EXISTS user_role_enum`);
  }
}
```

- [ ] **Step 2: Verify migration runs (requires Docker running)**

```bash
docker compose up -d
cp .env.example .env   # if not done yet
npm run migration:run
```

Expected: `query: CREATE TYPE user_role_enum ...` etc., no errors.

- [ ] **Step 3: Commit**

```bash
git add src/database/migrations/1747353600000-InitialSchema.ts
git commit -m "feat(db): add InitialSchema migration for users, items, loans tables"
```

---

## Task 5: JWT infrastructure (strategy + guard)

**Files:**
- Create: `src/modules/auth/strategies/jwt.strategy.ts`
- Create: `src/modules/auth/guards/jwt-auth.guard.ts`

- [ ] **Step 1: Write JWT strategy**

```typescript
// src/modules/auth/strategies/jwt.strategy.ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.accessSecret'),
    });
  }

  validate(payload: JwtPayload): { id: string; email: string; role: string } {
    return { id: payload.sub, email: payload.email, role: payload.role };
  }
}
```

- [ ] **Step 2: Write JWT auth guard**

```typescript
// src/modules/auth/guards/jwt-auth.guard.ts
import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }

  handleRequest(err: Error | null, user: unknown) {
    if (err || !user) throw err ?? new UnauthorizedException();
    return user;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/modules/auth/strategies/ src/modules/auth/guards/
git commit -m "feat(auth): add JwtStrategy and JwtAuthGuard"
```

---

## Task 6: Auth DTOs

**Files:**
- Create: `src/modules/auth/dto/register.dto.ts`
- Create: `src/modules/auth/dto/login.dto.ts`

- [ ] **Step 1: Write RegisterDto**

```typescript
// src/modules/auth/dto/register.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'user@library.edu' })
  @IsEmail()
  email: string;

  @ApiProperty({ minLength: 8, example: 'securepass123' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ example: 'Ana' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'García' })
  @IsString()
  @IsNotEmpty()
  lastName: string;
}
```

- [ ] **Step 2: Write LoginDto**

```typescript
// src/modules/auth/dto/login.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'user@library.edu' })
  @IsEmail()
  email: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/modules/auth/dto/
git commit -m "feat(auth): add RegisterDto and LoginDto with class-validator"
```

---

## Task 7: AuthService + AuthController + AuthModule

**Files:**
- Create: `src/modules/auth/auth.service.ts`
- Create: `src/modules/auth/auth.controller.ts`
- Create: `src/modules/auth/auth.module.ts`

- [ ] **Step 1: Write AuthService**

```typescript
// src/modules/auth/auth.service.ts
import {
  ConflictException, Injectable, NotFoundException, UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<{ accessToken: string; user: User }> {
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
    return { accessToken: this.signToken(saved), user: saved };
  }

  async login(dto: LoginDto): Promise<{ accessToken: string; user: User }> {
    const user = await this.userRepo.findOne({ where: { email: dto.email } });
    if (!user || !user.isActive) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    return { accessToken: this.signToken(user), user };
  }

  async findById(id: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  private signToken(user: User): string {
    const payload = { sub: user.id, email: user.email, role: user.role };
    return this.jwtService.sign(payload, {
      secret: this.config.get<string>('jwt.accessSecret'),
      expiresIn: this.config.get<string>('jwt.accessExpiresIn', '15m'),
    });
  }
}
```

- [ ] **Step 2: Write AuthController**

```typescript
// src/modules/auth/auth.controller.ts
import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @ApiBearerAuth()
  @Get('me')
  me(@Req() req: { user: { id: string } }) {
    return this.authService.findById(req.user.id);
  }
}
```

- [ ] **Step 3: Write AuthModule**

```typescript
// src/modules/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { User } from './entities/user.entity';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    PassportModule,
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
```

- [ ] **Step 4: Commit**

```bash
git add src/modules/auth/auth.service.ts src/modules/auth/auth.controller.ts src/modules/auth/auth.module.ts
git commit -m "feat(auth): add AuthService, AuthController, AuthModule"
```

---

## Task 8: Wire APP_GUARD + APP_INTERCEPTOR into AppModule

**Files:**
- Modify: `src/app.module.ts`

- [ ] **Step 1: Replace app.module.ts content**

```typescript
// src/app.module.ts
import { ClassSerializerInterceptor, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import configuration from './config/configuration';
import { validationSchema } from './config/validation.schema';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { ItemsModule } from './modules/items/items.module';
import { LoansModule } from './modules/loans/loans.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema,
      validationOptions: { abortEarly: false },
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService): TypeOrmModuleOptions => ({
        type: 'postgres',
        host: config.get<string>('database.host'),
        port: config.get<number>('database.port'),
        username: config.get<string>('database.user'),
        password: config.get<string>('database.password'),
        database: config.get<string>('database.name'),
        autoLoadEntities: true,
        synchronize: config.get<boolean>('database.synchronize'),
        logging: config.get<boolean>('database.logging'),
      }),
    }),
    HealthModule,
    AuthModule,
    ItemsModule,
    LoansModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_INTERCEPTOR, useClass: ClassSerializerInterceptor },
  ],
})
export class AppModule {}
```

Note: `ItemsModule` and `LoansModule` are imported here even though they don't exist yet — create them in the following tasks before running the app.

- [ ] **Step 2: Commit**

```bash
git add src/app.module.ts
git commit -m "feat(app): wire JwtAuthGuard globally and ClassSerializerInterceptor"
```

---

## Task 9: Items DTOs + ItemsService + ItemsController + ItemsModule

**Files:**
- Create: `src/modules/items/dto/create-item.dto.ts`
- Create: `src/modules/items/dto/update-item.dto.ts`
- Create: `src/modules/items/items.service.ts`
- Create: `src/modules/items/items.controller.ts`
- Create: `src/modules/items/items.module.ts`

- [ ] **Step 1: Write CreateItemDto**

```typescript
// src/modules/items/dto/create-item.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ItemType } from '../entities/item.entity';

export class CreateItemDto {
  @ApiProperty({ example: 'BK-0042', maxLength: 32 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  code: string;

  @ApiProperty({ example: 'El Quijote', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiProperty({ enum: ItemType })
  @IsEnum(ItemType)
  type: ItemType;
}
```

- [ ] **Step 2: Write UpdateItemDto**

```typescript
// src/modules/items/dto/update-item.dto.ts
import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { CreateItemDto } from './create-item.dto';

export class UpdateItemDto extends PartialType(OmitType(CreateItemDto, ['code'] as const)) {}
```

- [ ] **Step 3: Write ItemsService**

```typescript
// src/modules/items/items.service.ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Item, ItemType } from './entities/item.entity';
import { Loan, LoanStatus } from '../loans/entities/loan.entity';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';

export type ItemWithAvailability = Item & { isAvailable: boolean };

@Injectable()
export class ItemsService {
  constructor(
    @InjectRepository(Item) private readonly itemRepo: Repository<Item>,
    @InjectRepository(Loan) private readonly loanRepo: Repository<Loan>,
  ) {}

  async create(dto: CreateItemDto): Promise<ItemWithAvailability> {
    const exists = await this.itemRepo.findOne({ where: { code: dto.code } });
    if (exists) throw new ConflictException(`Code '${dto.code}' already in use`);

    const item = this.itemRepo.create(dto);
    const saved = await this.itemRepo.save(item);
    return { ...saved, isAvailable: true };
  }

  async findAll(type?: ItemType): Promise<ItemWithAvailability[]> {
    const qb = this.itemRepo.createQueryBuilder('item').where('item.isActive = true');
    if (type) qb.andWhere('item.type = :type', { type });

    const items = await qb.getMany();
    return this.attachAvailability(items);
  }

  async findOne(id: string): Promise<ItemWithAvailability> {
    const item = await this.itemRepo.findOne({ where: { id, isActive: true } });
    if (!item) throw new NotFoundException(`Item ${id} not found`);
    const [result] = await this.attachAvailability([item]);
    return result;
  }

  async update(id: string, dto: UpdateItemDto): Promise<ItemWithAvailability> {
    const item = await this.itemRepo.findOne({ where: { id, isActive: true } });
    if (!item) throw new NotFoundException(`Item ${id} not found`);
    Object.assign(item, dto);
    const saved = await this.itemRepo.save(item);
    const [result] = await this.attachAvailability([saved]);
    return result;
  }

  async remove(id: string): Promise<void> {
    const item = await this.itemRepo.findOne({ where: { id, isActive: true } });
    if (!item) throw new NotFoundException(`Item ${id} not found`);
    item.isActive = false;
    await this.itemRepo.save(item);
  }

  private async attachAvailability(items: Item[]): Promise<ItemWithAvailability[]> {
    if (!items.length) return [];

    const rows = await this.loanRepo
      .createQueryBuilder('loan')
      .select('loan.itemId', 'itemId')
      .where('loan.status IN (:...statuses)', {
        statuses: [LoanStatus.ACTIVE, LoanStatus.OVERDUE],
      })
      .andWhere('loan.itemId IN (:...ids)', { ids: items.map((i) => i.id) })
      .getRawMany<{ itemId: string }>();

    const taken = new Set(rows.map((r) => r.itemId));
    return items.map((item) => ({ ...item, isAvailable: !taken.has(item.id) }));
  }
}
```

- [ ] **Step 4: Write ItemsController**

```typescript
// src/modules/items/items.controller.ts
import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus,
  Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ItemsService } from './items.service';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { ItemType } from './entities/item.entity';

@ApiTags('items')
@ApiBearerAuth()
@Controller('items')
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateItemDto) {
    return this.itemsService.create(dto);
  }

  @Get()
  @ApiQuery({ name: 'type', enum: ItemType, required: false })
  findAll(@Query('type') type?: ItemType) {
    return this.itemsService.findAll(type);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.itemsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateItemDto) {
    return this.itemsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.itemsService.remove(id);
  }
}
```

- [ ] **Step 5: Write ItemsModule**

```typescript
// src/modules/items/items.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Item } from './entities/item.entity';
import { Loan } from '../loans/entities/loan.entity';
import { ItemsService } from './items.service';
import { ItemsController } from './items.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Item, Loan])],
  controllers: [ItemsController],
  providers: [ItemsService],
})
export class ItemsModule {}
```

- [ ] **Step 6: Commit**

```bash
git add src/modules/items/
git commit -m "feat(items): add Items module with CRUD, soft delete, and isAvailable flag"
```

---

## Task 10: LoansService — write failing tests FIRST (TDD)

**Files:**
- Create: `src/modules/loans/loans.service.spec.ts`

- [ ] **Step 1: Write the spec file**

```typescript
// src/modules/loans/loans.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { LoansService } from './loans.service';
import { Loan, LoanStatus } from './entities/loan.entity';
import { Item, ItemType } from '../items/entities/item.entity';
import { User, UserRole } from '../auth/entities/user.entity';

const makeUser = (): User => ({
  id: 'user-uuid-1',
  email: 'test@test.com',
  passwordHash: 'hash',
  firstName: 'Test',
  lastName: 'User',
  role: UserRole.MEMBER,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const makeItem = (): Item => ({
  id: 'item-uuid-1',
  code: 'BK-001',
  title: 'El Quijote',
  type: ItemType.BOOK,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const makeLoan = (overrides: Partial<Loan> = {}): Loan => ({
  id: 'loan-uuid-1',
  userId: 'user-uuid-1',
  itemId: 'item-uuid-1',
  user: makeUser(),
  item: makeItem(),
  loanedAt: new Date(),
  dueAt: new Date(Date.now() + 7 * 86400_000),
  returnedAt: null,
  status: LoanStatus.ACTIVE,
  fineAmount: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('LoansService', () => {
  let service: LoansService;
  let loanRepo: jest.Mocked<{
    findOne: jest.Mock;
    count: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    createQueryBuilder: jest.Mock;
    update: jest.Mock;
  }>;
  let userRepo: jest.Mocked<{ findOne: jest.Mock }>;
  let itemRepo: jest.Mocked<{ findOne: jest.Mock }>;

  beforeEach(async () => {
    loanRepo = {
      findOne: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn(),
      update: jest.fn(),
    };
    userRepo = { findOne: jest.fn() };
    itemRepo = { findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoansService,
        { provide: getRepositoryToken(Loan), useValue: loanRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(Item), useValue: itemRepo },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, fallback?: unknown) => {
              const map: Record<string, unknown> = {
                'loans.maxActivePerUser': 3,
                'loans.dailyFineRate': 0.5,
                'loans.maxLoanDays': 30,
              };
              return map[key] ?? fallback;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<LoansService>(LoansService);
  });

  describe('createLoan', () => {
    const validDueAt = new Date(Date.now() + 7 * 86400_000).toISOString();

    it('creates loan when item available, user under limit, dates valid', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      itemRepo.findOne.mockResolvedValue(makeItem());
      loanRepo.findOne.mockResolvedValue(null);  // item has no active loan
      loanRepo.count.mockResolvedValue(0);       // user has 0 active loans
      const created = makeLoan();
      loanRepo.create.mockReturnValue(created);
      loanRepo.save.mockResolvedValue(created);

      const result = await service.createLoan({
        userId: 'user-uuid-1',
        itemId: 'item-uuid-1',
        dueAt: validDueAt,
      });

      expect(result.status).toBe(LoanStatus.ACTIVE);
      expect(result.id).toBe('loan-uuid-1');
    });

    it('throws ConflictException when item already has active loan (R2)', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      itemRepo.findOne.mockResolvedValue(makeItem());
      loanRepo.findOne.mockResolvedValue(makeLoan()); // item already loaned

      await expect(
        service.createLoan({ userId: 'user-uuid-1', itemId: 'item-uuid-1', dueAt: validDueAt }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when user already has 3 active loans (R3)', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      itemRepo.findOne.mockResolvedValue(makeItem());
      loanRepo.findOne.mockResolvedValue(null); // item available
      loanRepo.count.mockResolvedValue(3);      // user at limit

      await expect(
        service.createLoan({ userId: 'user-uuid-1', itemId: 'item-uuid-1', dueAt: validDueAt }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('returnLoan', () => {
    it('calculates fine: dueAt 5 days ago → fineAmount = 2.50 (R4)', async () => {
      const dueAt = new Date(Date.now() - 5 * 86400_000); // 5 days in the past
      const loan = makeLoan({ dueAt, status: LoanStatus.ACTIVE });
      loanRepo.findOne.mockResolvedValue(loan);
      loanRepo.save.mockImplementation((l: Loan) => Promise.resolve(l));

      const result = await service.returnLoan('loan-uuid-1');

      expect(result.status).toBe(LoanStatus.RETURNED);
      expect(Number(result.fineAmount)).toBeCloseTo(2.5, 2);
    });

    it('throws BadRequestException when returning an already-returned loan (R5)', async () => {
      const loan = makeLoan({ status: LoanStatus.RETURNED });
      loanRepo.findOne.mockResolvedValue(loan);

      await expect(service.returnLoan('loan-uuid-1')).rejects.toThrow(BadRequestException);
    });
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL because LoansService doesn't exist yet**

```bash
npm test -- --testPathPattern=loans.service.spec
```

Expected output: `Cannot find module './loans.service'` or similar compilation error.

- [ ] **Step 3: Commit the spec**

```bash
git add src/modules/loans/loans.service.spec.ts
git commit -m "test(loans): add failing unit tests for LoansService (TDD)"
```

---

## Task 11: LoansService + DTOs — implement to make tests pass

**Files:**
- Create: `src/modules/loans/dto/create-loan.dto.ts`
- Create: `src/modules/loans/dto/filter-loan.dto.ts`
- Create: `src/modules/loans/loans.service.ts`

- [ ] **Step 1: Write CreateLoanDto**

```typescript
// src/modules/loans/dto/create-loan.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsUUID } from 'class-validator';

export class CreateLoanDto {
  @ApiProperty({ description: 'UUID of the borrowing user' })
  @IsUUID()
  userId: string;

  @ApiProperty({ description: 'UUID of the item to borrow' })
  @IsUUID()
  itemId: string;

  @ApiProperty({ example: '2026-06-15T00:00:00.000Z' })
  @IsDateString()
  dueAt: string;
}
```

- [ ] **Step 2: Write FilterLoanDto**

```typescript
// src/modules/loans/dto/filter-loan.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { LoanStatus } from '../entities/loan.entity';

export class FilterLoanDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  itemId?: string;

  @ApiPropertyOptional({ enum: LoanStatus })
  @IsOptional()
  @IsEnum(LoanStatus)
  status?: LoanStatus;
}
```

- [ ] **Step 3: Write LoansService**

```typescript
// src/modules/loans/loans.service.ts
import {
  BadRequestException, ConflictException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Loan, LoanStatus } from './entities/loan.entity';
import { Item } from '../items/entities/item.entity';
import { User } from '../auth/entities/user.entity';
import { CreateLoanDto } from './dto/create-loan.dto';
import { FilterLoanDto } from './dto/filter-loan.dto';

@Injectable()
export class LoansService {
  constructor(
    @InjectRepository(Loan) private readonly loanRepo: Repository<Loan>,
    @InjectRepository(Item) private readonly itemRepo: Repository<Item>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly config: ConfigService,
  ) {}

  async createLoan(dto: CreateLoanDto): Promise<Loan> {
    const user = await this.userRepo.findOne({ where: { id: dto.userId } });
    if (!user) throw new NotFoundException(`User ${dto.userId} not found`);

    const item = await this.itemRepo.findOne({ where: { id: dto.itemId, isActive: true } });
    if (!item) throw new NotFoundException(`Item ${dto.itemId} not found`);

    // R1: date validation
    const loanedAt = new Date();
    const dueAt = new Date(dto.dueAt);
    if (dueAt <= loanedAt) {
      throw new BadRequestException('dueAt must be after now');
    }
    const maxDays = this.config.get<number>('loans.maxLoanDays', 30);
    const diffDays = (dueAt.getTime() - loanedAt.getTime()) / 86_400_000;
    if (diffDays > maxDays) {
      throw new BadRequestException(`Loan window cannot exceed ${maxDays} days`);
    }

    // R2: item must be available
    const activeLoan = await this.loanRepo.findOne({
      where: { itemId: dto.itemId, status: In([LoanStatus.ACTIVE, LoanStatus.OVERDUE]) },
    });
    if (activeLoan) {
      throw new ConflictException(`Item already on loan (loanId: ${activeLoan.id})`);
    }

    // R3: user active loan limit
    const maxActive = this.config.get<number>('loans.maxActivePerUser', 3);
    const activeCount = await this.loanRepo.count({
      where: { userId: dto.userId, status: In([LoanStatus.ACTIVE, LoanStatus.OVERDUE]) },
    });
    if (activeCount >= maxActive) {
      throw new ConflictException(`User has reached the limit of ${maxActive} active loans`);
    }

    const loan = this.loanRepo.create({ userId: dto.userId, itemId: dto.itemId, loanedAt, dueAt });
    return this.loanRepo.save(loan);
  }

  async findAll(filter: FilterLoanDto): Promise<Loan[]> {
    const qb = this.loanRepo
      .createQueryBuilder('loan')
      .leftJoinAndSelect('loan.user', 'user')
      .leftJoinAndSelect('loan.item', 'item');

    if (filter.userId) qb.andWhere('loan.userId = :userId', { userId: filter.userId });
    if (filter.itemId) qb.andWhere('loan.itemId = :itemId', { itemId: filter.itemId });
    if (filter.status) qb.andWhere('loan.status = :status', { status: filter.status });

    const loans = await qb.getMany();

    // Lazy overdue promotion: update DB in-place so GET /loans reflects real status
    const now = new Date();
    const toPromote = loans.filter(
      (l) => l.status === LoanStatus.ACTIVE && l.dueAt < now && !l.returnedAt,
    );
    if (toPromote.length) {
      await this.loanRepo.update(
        toPromote.map((l) => l.id),
        { status: LoanStatus.OVERDUE },
      );
      toPromote.forEach((l) => (l.status = LoanStatus.OVERDUE));
    }

    return loans;
  }

  async findOne(id: string): Promise<Loan> {
    const loan = await this.loanRepo.findOne({
      where: { id },
      relations: ['user', 'item'],
    });
    if (!loan) throw new NotFoundException(`Loan ${id} not found`);

    // Lazy overdue promotion for single loan
    if (loan.status === LoanStatus.ACTIVE && loan.dueAt < new Date() && !loan.returnedAt) {
      loan.status = LoanStatus.OVERDUE;
      await this.loanRepo.save(loan);
    }

    return loan;
  }

  async returnLoan(id: string): Promise<Loan> {
    const loan = await this.loanRepo.findOne({ where: { id } });
    if (!loan) throw new NotFoundException(`Loan ${id} not found`);

    // R5: terminal states
    if (loan.status === LoanStatus.RETURNED || loan.status === LoanStatus.LOST) {
      throw new BadRequestException(`Cannot return a loan with status '${loan.status}'`);
    }

    // R4: fine calculation
    const returnedAt = new Date();
    const dailyRate = this.config.get<number>('loans.dailyFineRate', 0.5);
    const diffMs = returnedAt.getTime() - loan.dueAt.getTime();
    const daysOverdue = Math.max(0, Math.ceil(diffMs / 86_400_000));
    const fineAmount = daysOverdue * dailyRate;

    loan.returnedAt = returnedAt;
    loan.fineAmount = fineAmount;
    loan.status = LoanStatus.RETURNED;

    return this.loanRepo.save(loan);
  }

  async markLost(id: string): Promise<Loan> {
    const loan = await this.loanRepo.findOne({ where: { id } });
    if (!loan) throw new NotFoundException(`Loan ${id} not found`);

    if (loan.status === LoanStatus.RETURNED || loan.status === LoanStatus.LOST) {
      throw new BadRequestException(`Cannot mark as lost a loan with status '${loan.status}'`);
    }

    loan.status = LoanStatus.LOST;
    return this.loanRepo.save(loan);
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm test -- --testPathPattern=loans.service.spec
```

Expected output: `Tests: 5 passed, 5 total` (4 required + 1 bonus for R5).

If any test fails, fix `loans.service.ts` before continuing.

- [ ] **Step 5: Commit**

```bash
git add src/modules/loans/dto/ src/modules/loans/loans.service.ts
git commit -m "feat(loans): add LoansService with R1-R5 business rules (all tests pass)"
```

---

## Task 12: LoansController + LoansModule

**Files:**
- Create: `src/modules/loans/loans.controller.ts`
- Create: `src/modules/loans/loans.module.ts`

- [ ] **Step 1: Write LoansController**

```typescript
// src/modules/loans/loans.controller.ts
import {
  Body, Controller, Get, HttpCode, HttpStatus,
  Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { LoansService } from './loans.service';
import { CreateLoanDto } from './dto/create-loan.dto';
import { FilterLoanDto } from './dto/filter-loan.dto';

@ApiTags('loans')
@ApiBearerAuth()
@Controller('loans')
export class LoansController {
  constructor(private readonly loansService: LoansService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateLoanDto) {
    return this.loansService.createLoan(dto);
  }

  @Get()
  findAll(@Query() filter: FilterLoanDto) {
    return this.loansService.findAll(filter);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.loansService.findOne(id);
  }

  @Patch(':id/return')
  returnLoan(@Param('id', ParseUUIDPipe) id: string) {
    return this.loansService.returnLoan(id);
  }

  @Patch(':id/mark-lost')
  markLost(@Param('id', ParseUUIDPipe) id: string) {
    return this.loansService.markLost(id);
  }
}
```

- [ ] **Step 2: Write LoansModule**

```typescript
// src/modules/loans/loans.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Loan } from './entities/loan.entity';
import { Item } from '../items/entities/item.entity';
import { User } from '../auth/entities/user.entity';
import { LoansService } from './loans.service';
import { LoansController } from './loans.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Loan, Item, User])],
  controllers: [LoansController],
  providers: [LoansService],
})
export class LoansModule {}
```

- [ ] **Step 3: Commit**

```bash
git add src/modules/loans/loans.controller.ts src/modules/loans/loans.module.ts
git commit -m "feat(loans): add LoansController and LoansModule"
```

---

## Task 13: Full integration smoke test

- [ ] **Step 1: Verify app starts**

```bash
npm run start:dev
```

Expected: `Library Loans API en http://localhost:3000/api` and `Swagger UI: http://localhost:3000/api/docs`

- [ ] **Step 2: Open Swagger and verify all endpoints appear**

Open `http://localhost:3000/api/docs` in browser. Confirm:
- `auth` tag: POST /auth/register, POST /auth/login, GET /auth/me
- `items` tag: POST, GET, GET /:id, PATCH /:id, DELETE /:id
- `loans` tag: POST, GET, GET /:id, PATCH /:id/return, PATCH /:id/mark-lost

- [ ] **Step 3: Run all tests**

```bash
npm test
```

Expected: all tests pass. Fix any failures before continuing.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: verify all tests pass and app starts cleanly" --allow-empty
```

---

## Task 14: Update README.md

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace README with required content**

```markdown
# Library Loans API

Sistema de gestión de préstamos — ISIS 3710 Parcial 2.

## Arranque rápido

```bash
cp .env.example .env
docker compose up -d
npm install
npm run migration:run
npm run start:dev
```

Swagger UI: http://localhost:3000/api/docs

## Credenciales de prueba

No hay seed. Crea un usuario vía `POST /api/auth/register` y cambia `role` directo en BD si necesitas `admin` o `librarian`.

## Decisión: transición automática a `overdue`

Los préstamos NO tienen un job cron para marcar `overdue`. La transición se hace de forma **lazy**: cuando se consulta `GET /loans` o `GET /loans/:id`, el servicio detecta préstamos `active` donde `dueAt < now()` y los actualiza a `overdue` en la base de datos en ese momento.

Ventaja: sin procesos background. Desventaja: un loan no aparece como `overdue` hasta que alguien lo consulte.

## Bonos implementados

(ninguno — solo parte obligatoria)

## Tests

```bash
npm test
```
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: update README with startup commands and overdue strategy decision"
```

---

## Self-Review Checklist

### Spec coverage

| Req | Task |
|-----|------|
| 4.1 User entity | Task 1 |
| 4.1 register/login/me | Task 7 |
| 4.1 JWT payload {sub, email, role} | Task 5, 7 |
| 4.1 JwtAuthGuard global + @Public() | Task 5, 8 |
| 4.1 @Exclude passwordHash | Task 1 (+ ClassSerializerInterceptor Task 8) |
| 4.2 Item entity | Task 2 |
| 4.2 Loan entity | Task 3 |
| 4.2 Indexes (itemId+status, userId+status) | Task 4 (migration) |
| 4.2 Migration | Task 4 |
| 4.3 ItemsModule CRUD + isAvailable | Task 9 |
| 4.3 LoansModule endpoints | Task 12 |
| 4.3 class-validator DTOs | Tasks 6, 9, 11 |
| 4.3 @ApiProperty + @ApiBearerAuth | Tasks 6, 9, 11, 12 |
| 4.3 HTTP codes (201/200/204/404/400/409) | Tasks 7, 9, 11, 12 |
| 4.4 R1 date validation | Task 11 |
| 4.4 R2 item availability (409) | Task 11 |
| 4.4 R3 user loan limit (409) | Task 11 |
| 4.4 R4 fine = ceil(overdueDays) × 0.50 | Task 11 |
| 4.4 R5 FSM terminal states | Task 11 |
| 4.5 ≥4 unit tests (no real DB) | Task 10 |
| 4.5 Swagger UI | main.ts (scaffold) + Tasks 6, 9, 11 |
| 4.5 README | Task 14 |

### No placeholders — verified ✓

All tasks contain complete code. No "TBD" or "implement later".

### Type consistency — verified ✓

- `LoanStatus` enum used consistently across entity, service, spec
- `ItemType` enum used consistently across entity, DTO, service
- `UserRole` enum consistent across entity and spec mocks
- `ConfigService.get('loans.maxActivePerUser')` matches key in `configuration.ts`
- `ConfigService.get('loans.dailyFineRate')` matches key in `configuration.ts`
- `ConfigService.get('loans.maxLoanDays')` matches key in `configuration.ts`

---

## Execution Order Summary

1. Task 1 — User entity
2. Task 2 — Item entity
3. Task 3 — Loan entity
4. Task 4 — Migration (run after Docker up)
5. Task 5 — JWT strategy + guard
6. Task 6 — Auth DTOs
7. Task 7 — AuthService + controller + module
8. Task 8 — AppModule wiring (APP_GUARD, APP_INTERCEPTOR, module imports)
9. Task 9 — Items module complete
10. Task 10 — Write failing LoansService tests
11. Task 11 — Implement LoansService (make tests pass)
12. Task 12 — Loans controller + module
13. Task 13 — Integration smoke test
14. Task 14 — README
