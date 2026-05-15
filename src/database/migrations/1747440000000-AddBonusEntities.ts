import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBonusEntities1747440000000 implements MigrationInterface {
  name = 'AddBonusEntities1747440000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id"         uuid              NOT NULL DEFAULT gen_random_uuid(),
        "userId"     uuid              NOT NULL,
        "token"      varchar(512)      NOT NULL,
        "expiresAt"  timestamptz       NOT NULL,
        "revokedAt"  timestamptz,
        "createdAt"  timestamptz       NOT NULL DEFAULT now(),
        CONSTRAINT "PK_refresh_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_refresh_tokens_token" UNIQUE ("token"),
        CONSTRAINT "FK_refresh_tokens_userId"
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_refresh_tokens_userId" ON "refresh_tokens" ("userId")
    `);

    await queryRunner.query(`
      CREATE TABLE "reservations" (
        "id"          uuid        NOT NULL DEFAULT gen_random_uuid(),
        "userId"      uuid        NOT NULL,
        "itemId"      uuid        NOT NULL,
        "createdAt"   timestamptz NOT NULL DEFAULT now(),
        "fulfilledAt" timestamptz,
        "cancelledAt" timestamptz,
        "expiresAt"   timestamptz,
        CONSTRAINT "PK_reservations" PRIMARY KEY ("id"),
        CONSTRAINT "FK_reservations_userId"
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_reservations_itemId"
          FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_reservations_item_created"
        ON "reservations" ("itemId", "createdAt")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_reservations_user"
        ON "reservations" ("userId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_reservations_user"`);
    await queryRunner.query(`DROP INDEX "IDX_reservations_item_created"`);
    await queryRunner.query(`DROP TABLE "reservations"`);
    await queryRunner.query(`DROP INDEX "IDX_refresh_tokens_userId"`);
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
  }
}
