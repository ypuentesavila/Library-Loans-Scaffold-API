import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Reservation } from './entities/reservation.entity';
import { Item } from '../items/entities/item.entity';
import { Loan, LoanStatus } from '../loans/entities/loan.entity';
import { CreateReservationDto } from './dto/create-reservation.dto';

@Injectable()
export class ReservationsService {
  constructor(
    @InjectRepository(Reservation) private readonly reservationRepo: Repository<Reservation>,
    @InjectRepository(Item) private readonly itemRepo: Repository<Item>,
    @InjectRepository(Loan) private readonly loanRepo: Repository<Loan>,
  ) {}

  async create(dto: CreateReservationDto, userId: string): Promise<Reservation> {
    const item = await this.itemRepo.findOne({ where: { id: dto.itemId, isActive: true } });
    if (!item) throw new NotFoundException(`Item ${dto.itemId} not found`);

    const activeLoan = await this.loanRepo.findOne({
      where: [
        { itemId: dto.itemId, status: LoanStatus.ACTIVE },
        { itemId: dto.itemId, status: LoanStatus.OVERDUE },
      ],
    });
    if (!activeLoan) {
      throw new BadRequestException('Item is currently available — borrow it directly');
    }

    // R-B1.1: max 1 pending reservation per user per item
    const existing = await this.reservationRepo.findOne({
      where: { userId, itemId: dto.itemId, cancelledAt: IsNull(), fulfilledAt: IsNull() },
    });
    if (existing) {
      throw new ConflictException('You already have a pending reservation for this item');
    }

    const reservation = this.reservationRepo.create({ userId, itemId: dto.itemId });
    return this.reservationRepo.save(reservation);
  }

  async findAll(requestingUserId: string, requestingUserRole: string): Promise<Reservation[]> {
    const qb = this.reservationRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.user', 'user')
      .leftJoinAndSelect('r.item', 'item')
      .orderBy('r.createdAt', 'ASC');

    if (requestingUserRole === 'member') {
      qb.where('r.userId = :userId', { userId: requestingUserId });
    }

    return qb.getMany();
  }

  async cancel(id: string, userId: string, userRole: string): Promise<Reservation> {
    const reservation = await this.reservationRepo.findOne({ where: { id } });
    if (!reservation) throw new NotFoundException(`Reservation ${id} not found`);

    if (userRole === 'member' && reservation.userId !== userId) {
      throw new ForbiddenException("Cannot cancel another user's reservation");
    }

    if (reservation.cancelledAt) {
      throw new BadRequestException('Reservation already cancelled');
    }

    reservation.cancelledAt = new Date();
    return this.reservationRepo.save(reservation);
  }

  async fulfillNextReservation(itemId: string): Promise<void> {
    const next = await this.reservationRepo.findOne({
      where: { itemId, cancelledAt: IsNull(), fulfilledAt: IsNull() },
      order: { createdAt: 'ASC' },
    });
    if (!next) return;

    const now = new Date();
    next.fulfilledAt = now;
    next.expiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    await this.reservationRepo.save(next);
  }

  async getFirstEligible(itemId: string): Promise<Reservation | null> {
    const now = new Date();
    // Skip expired fulfilled reservations, find first valid pending
    const candidates = await this.reservationRepo.find({
      where: { itemId, cancelledAt: IsNull() },
      order: { createdAt: 'ASC' },
    });

    for (const r of candidates) {
      if (r.fulfilledAt && r.expiresAt && r.expiresAt < now) {
        // expired fulfilled — skip (don't re-fulfill here, just skip)
        continue;
      }
      if (!r.fulfilledAt) {
        return r; // first unfulfilled pending
      }
      if (r.fulfilledAt && r.expiresAt && r.expiresAt >= now) {
        return r; // fulfilled and still within window
      }
    }
    return null;
  }
}
