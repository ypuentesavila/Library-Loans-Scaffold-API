# PLAN BASE — Library Loans Parcial

Referencia: `~/Desktop/ProyectoGuiaWEB/MediTrack-API/`

---

## 1. Qué trae el scaffold

| Archivo | Estado | Notas |
|---|---|---|
| `src/main.ts` | ✅ NO TOCAR | ValidationPipe global, Swagger, prefijo `/api` |
| `src/app.module.ts` | ⚠️ AMPLIAR | Falta APP_GUARD + módulos de negocio |
| `src/config/configuration.ts` | ✅ NO TOCAR | AppConfig con `loans.maxActivePerUser`, `loans.dailyFineRate`, `loans.maxLoanDays` |
| `src/config/validation.schema.ts` | ✅ NO TOCAR | Joi valida JWT secrets ≥32 chars, DB vars, loans vars |
| `src/database/data-source.ts` | ✅ NO TOCAR | CLI TypeORM, glob `**/*.entity.{ts,js}` automático |
| `src/database/migrations/` | ⚠️ VACÍO | Aquí van las migraciones generadas |
| `src/common/decorators/public.decorator.ts` | ✅ LISTO | `@Public()` para endpoints sin auth |
| `src/modules/health/` | ✅ LISTO | Ejemplo mínimo de módulo NestJS |
| `docker-compose.yml` | ✅ LISTO | Postgres 16-alpine, DB `loans`, user `loans`, pass `loans` |
| `.env.example` | ✅ LISTO | Copiar a `.env` antes de arrancar |

**Dependencias ya instaladas** (no hacer `npm install` de nada extra):
`@nestjs/jwt`, `@nestjs/passport`, `passport-jwt`, `bcrypt`, `uuid`, `class-validator`, `class-transformer`, `typeorm`, `pg`

**`ClassSerializerInterceptor` falta en `main.ts`** — necesario para que `@Exclude` en `User.passwordHash` funcione. Agregar al implementar auth.

---

## 2. Qué falta implementar

```
src/
├── main.ts                          ← agregar ClassSerializerInterceptor
├── app.module.ts                    ← agregar APP_GUARD x2 + AuthModule + módulos
├── common/
│   ├── decorators/
│   │   ├── roles.decorator.ts       ← CREAR
│   │   └── current-user.decorator.ts← CREAR
│   └── guards/
│       ├── jwt-auth.guard.ts        ← CREAR
│       └── roles.guard.ts           ← CREAR
└── modules/
    ├── auth/
    │   ├── entities/
    │   │   ├── user.entity.ts       ← CREAR
    │   │   └── refresh-token.entity.ts ← CREAR
    │   ├── dto/
    │   │   ├── register.dto.ts      ← CREAR
    │   │   ├── login.dto.ts         ← CREAR
    │   │   └── refresh-token.dto.ts ← CREAR
    │   ├── strategies/
    │   │   ├── jwt.strategy.ts      ← CREAR
    │   │   └── jwt-refresh.strategy.ts ← CREAR
    │   ├── auth.service.ts          ← CREAR
    │   ├── auth.controller.ts       ← CREAR
    │   └── auth.module.ts           ← CREAR
    ├── users/                       ← CREAR (UsersService necesario para JwtStrategy)
    │   ├── entities/user.entity.ts  ← mover aquí o reexportar
    │   ├── users.service.ts         ← CREAR
    │   └── users.module.ts          ← CREAR (exports: [UsersService])
    ├── items/                       ← CREAR (según enunciado)
    │   ├── entities/item.entity.ts
    │   ├── dto/
    │   ├── items.service.ts
    │   ├── items.controller.ts
    │   └── items.module.ts
    └── loans/                       ← CREAR (núcleo del parcial)
        ├── entities/loan.entity.ts
        ├── enums/loan-status.enum.ts
        ├── dto/
        ├── loans.service.ts         ← reglas de negocio con loans.* config vars
        ├── loans.controller.ts
        └── loans.module.ts
```

---

## 3. Orden recomendado

### Fase 1 — Entidades (sin lógica, solo schema)
```
1a. src/modules/users/entities/user.entity.ts
    - PrimaryGeneratedColumn('uuid'), email UNIQUE, passwordHash, role enum, isActive, timestamps
    - @Exclude({ toPlainOnly: true }) en passwordHash

1b. src/modules/auth/entities/refresh-token.entity.ts
    - userId FK → users ON DELETE CASCADE
    - token varchar(512) UNIQUE, expiresAt, revokedAt nullable

1c. src/modules/items/entities/item.entity.ts
    - Campos según enunciado: title, isbn, etc.
    - isActive boolean (soft delete)

1d. src/modules/loans/enums/loan-status.enum.ts
    - LoanStatus enum + ALLOWED_TRANSITIONS matrix

1e. src/modules/loans/entities/loan.entity.ts
    - itemId FK → items ON DELETE RESTRICT
    - userId FK → users ON DELETE CASCADE (o RESTRICT según enunciado)
    - loanDate, dueDate, returnDate, status enum, fineAmount nullable
```

### Fase 2 — Auth completa
```
2a. src/modules/users/users.service.ts
    - create(), findById(), findByEmail(), softDelete()
    - hash password con bcrypt (configService.get('bcrypt.saltRounds'))

2b. src/modules/users/users.module.ts
    - imports: [TypeOrmModule.forFeature([User])]
    - exports: [UsersService]

2c. src/modules/auth/strategies/jwt.strategy.ts
    - ExtractJwt.fromAuthHeaderAsBearerToken()
    - secretOrKey: config.get('jwt.accessSecret')
    - validate(): busca user, verifica isActive, retorna AuthenticatedUser

2d. src/modules/auth/strategies/jwt-refresh.strategy.ts
    - ExtractJwt.fromBodyField('refreshToken')
    - secretOrKey: config.get('jwt.refreshSecret')
    - passReqToCallback: true

2e. src/modules/auth/auth.service.ts
    - register(), login(), refresh(), logout(), getCurrentUser()
    - signTokens(): access (15m stateless) + refresh (7d stateful persistido)
    - computeExpiry() para calcular expiresAt del refresh token

2f. src/modules/auth/auth.controller.ts
    - POST /auth/register  → @Public()
    - POST /auth/login     → @Public()
    - POST /auth/refresh   → @Public() + @UseGuards(AuthGuard('jwt-refresh'))
    - POST /auth/logout    → autenticado
    - GET  /auth/me        → autenticado

2g. src/modules/auth/auth.module.ts
    - imports: [UsersModule, PassportModule, JwtModule.register({}), TypeOrmModule.forFeature([RefreshToken])]
```

### Fase 3 — Guards y decoradores
```
3a. src/common/decorators/roles.decorator.ts
    - SetMetadata(ROLES_KEY, roles)

3b. src/common/decorators/current-user.decorator.ts
    - createParamDecorator → extrae request.user (puesto por Passport)

3c. src/common/guards/jwt-auth.guard.ts
    - extends AuthGuard('jwt')
    - canActivate(): si @Public() → return true, sino → super.canActivate()
    - usa Reflector para leer IS_PUBLIC_KEY

3d. src/common/guards/roles.guard.ts
    - implements CanActivate
    - lee ROLES_KEY con Reflector
    - verifica request.user.role está en la lista requerida

3e. src/app.module.ts — AMPLIAR
    - agregar APP_GUARD x2 (JwtAuthGuard, RolesGuard)
    - agregar AuthModule, ItemsModule, LoansModule a imports
    - agregar ClassSerializerInterceptor a main.ts
```

### Fase 4 — Módulos de negocio
```
4a. Items: entity → DTOs → service → controller → module
    - CRUD estándar
    - softDelete en lugar de DELETE físico (isActive = false)
    - @Roles según enunciado

4b. Loans: entity → enums → DTOs → service → controller → module
    - create(): validar MAX_ACTIVE_LOANS, disponibilidad del item, scoping por rol
    - returnLoan(): FSM con ALLOWED_TRANSITIONS, calcular fineAmount con DAILY_FINE_RATE
    - findAll(): scoping por rol (MEMBER ve solo los propios)
```

### Fase 5 — Migración
```
5a. Asegurarse que TODAS las entidades están implementadas

5b. npm run migration:generate src/database/migrations/InitialSchema

5c. Verificar el SQL generado (up/down correctos, FKs en orden)

5d. npm run migration:run

5e. npm run start:dev → verificar que arranca sin errores
```

### Fase 6 — Tests (si el enunciado los pide)
```
6a. test/helpers/test-app.factory.ts  → createTestApp, truncateAll, destroyApp
6b. test/helpers/auth.helper.ts       → createUserWithRole
6c. test/*.e2e-spec.ts                → flujos con supertest
```

---

## 4. Cómo aplicar los patrones del proyecto guía

### Entidades — copiar de MediTrack

| MediTrack fuente | Library Loans destino | Cambios |
|---|---|---|
| `user.entity.ts` | `user.entity.ts` | Cambiar valores del enum `UserRole` |
| `refresh-token.entity.ts` | `refresh-token.entity.ts` | Sin cambios (copiar literal) |
| `appointment.entity.ts` | `loan.entity.ts` | `fineAmount`, `dueDate`, `returnDate` en vez de `reason`/`notes` |
| `appointment-status.enum.ts` | `loan-status.enum.ts` | Estados y transiciones según enunciado |

**ON DELETE — regla de decisión:**
```
FK "hijo no tiene sentido sin el padre"  → CASCADE   (refresh_tokens.userId)
FK "referencia histórica, no destruir"   → RESTRICT  (loans.itemId — no borrar item con préstamos)
FK "opcional, hijo sobrevive sin padre"  → SET NULL  (si hay asignaciones opcionales)
```

### Auth — copiar literal de MediTrack

`auth.service.ts`, `auth.controller.ts`, `auth.module.ts`, ambas strategies → copiar casi sin cambios. Solo adaptar:
- Valores del enum `UserRole`
- Rol por defecto en `register()` (era `PATIENT`, será `MEMBER` o el que diga el enunciado)

### Guards y decoradores — copiar literal

`jwt-auth.guard.ts`, `roles.guard.ts`, `roles.decorator.ts`, `current-user.decorator.ts` → copiar exacto de MediTrack. No hay nada específico del dominio médico.

### Service de negocio — adaptar AppointmentsService

| MediTrack (AppointmentsService) | Library Loans (LoansService) |
|---|---|
| lead time mínimo 1h | MAX_ACTIVE_LOANS por usuario |
| `assertNoOverlap` (query SQL) | verificar disponibilidad del item |
| FSM `ALLOWED_TRANSITIONS` | FSM `ALLOWED_TRANSITIONS` para loan status |
| `assertCanCancel` por rol | `assertCanReturn` / scoping por rol |
| scoping en `findAll` por rol | scoping en `findAll` por rol |
| sin multa | `fineAmount = diasAtraso * DAILY_FINE_RATE` |

**Leer vars de negocio en el service:**
```typescript
const max     = this.configService.get<number>('loans.maxActivePerUser');  // MAX_ACTIVE_LOANS
const rate    = this.configService.get<number>('loans.dailyFineRate');     // DAILY_FINE_RATE
const maxDays = this.configService.get<number>('loans.maxLoanDays');       // MAX_LOAN_DAYS
```

### Módulo — patrón forFeature

Si un service usa el repo de otra entidad → incluirla en `forFeature` del mismo módulo:
```typescript
// loans.module.ts — LoanService usa repos de Loan E Item
TypeOrmModule.forFeature([Loan, Item])
// + importar UsersModule para UsersService
```

### Controller — controlador delgado

Ninguna lógica en el controller. Una línea por handler:
```typescript
@Post()
create(@Body() dto: CreateLoanDto, @CurrentUser() actor: AuthenticatedUser) {
  return this.loansService.create(dto, actor);
}
```

---

## 5. Comandos importantes

### Setup inicial (una sola vez)
```bash
cp .env.example .env
docker compose up -d          # levanta Postgres en puerto 5432
npm install                   # ya debería estar, verificar
```

### Desarrollo
```bash
npm run start:dev             # hot reload en http://localhost:3000
# Swagger UI: http://localhost:3000/api/docs
```

### Migraciones (DESPUÉS de implementar todas las entidades)
```bash
# Generar migración a partir del diff entidades ↔ BD
npm run migration:generate src/database/migrations/InitialSchema

# Aplicar migraciones pendientes
npm run migration:run

# Revertir última migración (si algo salió mal)
npm run migration:revert
```

### Tests
```bash
npm test                      # unit tests
npm run test:cov              # unit con coverage
npm run test:e2e              # e2e (requiere Postgres corriendo)
```

### Lint y formato
```bash
npm run lint                  # ESLint con autofix
npm run format                # Prettier
```

### Verificar que la app arranca correctamente
```bash
npm run build && npm run start:prod   # simula producción
# Si falla al arrancar → revisar variables de entorno en .env
```

---

## Checklist pre-entrega

- [ ] `cp .env.example .env` hecho
- [ ] Docker Postgres corriendo (`docker compose up -d`)
- [ ] `npm run migration:run` exitoso
- [ ] `npm run start:dev` arranca sin errores
- [ ] `/api/docs` muestra todos los módulos en Swagger
- [ ] `/api/health/live` retorna `{"status":"ok"}`
- [ ] POST `/api/auth/register` crea usuario
- [ ] POST `/api/auth/login` retorna `accessToken` + `refreshToken`
- [ ] GET `/api/auth/me` con Bearer token retorna usuario (sin `passwordHash`)
- [ ] Endpoint protegido sin token → 401
- [ ] Endpoint con rol incorrecto → 403
- [ ] Regla `MAX_ACTIVE_LOANS` lanza 400 al exceder
- [ ] FSM rechaza transiciones inválidas con 400
- [ ] `npm run lint` sin errores
