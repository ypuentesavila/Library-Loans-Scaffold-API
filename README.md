# Library Loans API — ISIS 3710 Parcial 2

Sistema de gestión de préstamos de biblioteca. NestJS + TypeORM + PostgreSQL.

## Arranque rápido (evaluación)

```bash
cp .env.example .env
docker compose up -d
npm install
npm run migration:run
npm run start:dev
```

Swagger UI: [http://localhost:3000/api/docs](http://localhost:3000/api/docs)

## Credenciales de prueba

No hay seed automático. Crear usuario vía `POST /api/auth/register`. Para cambiar rol (`admin`/`librarian`), modificar directamente en BD:

```sql
UPDATE users SET role = 'admin' WHERE email = 'tu@email.com';
```

## Decisión: transición automática a `overdue`

No hay job cron. La transición `active → overdue` es **lazy**: al consultar `GET /loans` o `GET /loans/:id`, el servicio detecta préstamos `active` donde `dueAt < now()` y actualiza su `status` a `overdue` en la base de datos en ese momento.

Ventaja: sin procesos en background ni dependencias adicionales. El costo: un préstamo no aparece como `overdue` hasta que alguien lo consulte.

## Tests

```bash
npm test
```

5 tests unitarios de `LoansService` (sin base de datos real, mocks de repositorio):
- Crear préstamo exitoso (item disponible, usuario bajo límite, fechas válidas)
- R2: item ya prestado → `ConflictException`
- R3: usuario con 3 activos → `ConflictException`
- R4: dueAt 5 días atrás → `fineAmount = 2.50`
- R5: devolver loan ya devuelto → `BadRequestException`

## Bonos implementados

Ninguno (solo parte obligatoria).

## Scripts disponibles

| Script | Descripción |
|---|---|
| `npm run start:dev` | Arranca con hot reload. |
| `npm run start:prod` | Arranca el build de producción (requiere `npm run build` antes). |
| `npm run build` | Compila TypeScript a `dist/`. |
| `npm run lint` | ESLint con autofix. |
| `npm run format` | Prettier. |
| `npm test` | Tests unitarios. |
| `npm run test:cov` | Tests con coverage. |
| `npm run test:e2e` | Tests e2e con `jest-e2e.json`. |
| `npm run migration:generate src/database/migrations/NombreDeLaMigracion` | Genera migración a partir del diff entre entidades y BD. |
| `npm run migration:run` | Aplica migraciones pendientes. |
| `npm run migration:revert` | Revierte la última migración. |

## Estructura

```
library-loans-scaffold/
├── docker-compose.yml          # Postgres 16-alpine
├── .env.example                # plantilla de variables (cópiala a .env)
├── package.json
├── tsconfig.json
├── nest-cli.json
├── src/
│   ├── main.ts                 # bootstrap: ValidationPipe + Swagger + /api prefix
│   ├── app.module.ts           # ConfigModule + TypeOrmModule + HealthModule
│   ├── config/
│   │   ├── configuration.ts    # AppConfig interface + factory
│   │   └── validation.schema.ts # Joi schema
│   ├── database/
│   │   ├── data-source.ts      # DataSource para CLI de TypeORM
│   │   └── migrations/         # (vacío — aquí van tus migraciones)
│   ├── common/
│   │   └── decorators/
│   │       └── public.decorator.ts
│   └── modules/
│       └── health/
│           ├── health.module.ts
│           └── health.controller.ts
└── test/
    └── jest-e2e.json
```

## Aliases de path

Configurados en `tsconfig.json` para imports limpios:

```typescript
import { ItemsModule } from '@modules/items/items.module';
import { Public } from '@common/decorators/public.decorator';
import configuration from '@config/configuration';
import { AppDataSource } from '@database/data-source';
```

## Configuración: variables que el scaffold ya valida

El `validationSchema` de Joi exige al arranque:

- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` (todas requeridas, sin defaults).
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (mínimo 32 caracteres).
- `BCRYPT_SALT_ROUNDS` (4-15, default 10).
- `MAX_ACTIVE_LOANS` (default 3), `DAILY_FINE_RATE` (default 0.50), `MAX_LOAN_DAYS` (default 30) — usadas por las reglas de negocio que implementarás (ver enunciado §4.4).

Si falta alguna requerida o no cumple el formato, la app **falla al arrancar** con un mensaje claro.

## Siguiente paso

Lee el enunciado completo:

```bash
open ../meditrack-api/docs/enunciado-parcial.md
```

Empieza por implementar la entidad `User` y el módulo `auth` (§4.1 del enunciado). Sin auth, los demás endpoints no se pueden probar.

¡Éxitos!
