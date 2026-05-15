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
