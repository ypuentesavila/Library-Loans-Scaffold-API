import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Loan } from './entities/loan.entity';
import { Item } from '../items/entities/item.entity';
import { User } from '../auth/entities/user.entity';
import { Reservation } from '../reservations/entities/reservation.entity';
import { LoansService } from './loans.service';
import { LoansController } from './loans.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Loan, Item, User, Reservation])],
  controllers: [LoansController],
  providers: [LoansService],
})
export class LoansModule {}
