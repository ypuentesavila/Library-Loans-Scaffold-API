import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Loan, LoanStatus } from './entities/loan.entity';
import { Item } from '../items/entities/item.entity';
import { User } from '../auth/entities/user.entity';
import { Reservation } from '../reservations/entities/reservation.entity';
import { CreateLoanDto } from './dto/create-loan.dto';
import { FilterLoanDto } from './dto/filter-loan.dto';

@Injectable()
export class LoansService {
  constructor(
    @InjectRepository(Loan) private readonly loanRepo: Repository<Loan>,
    @InjectRepository(Item) private readonly itemRepo: Repository<Item>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Reservation) private readonly reservationRepo: Repository<Reservation>,
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

    // R-B1.4: if pending reservations exist, only first in queue can take the item
    const now = new Date();
    const firstReservation = await this.reservationRepo.findOne({
      where: { itemId: dto.itemId, cancelledAt: IsNull() },
      order: { createdAt: 'ASC' },
    });
    if (firstReservation) {
      const isExpiredFulfilled =
        firstReservation.fulfilledAt &&
        firstReservation.expiresAt &&
        firstReservation.expiresAt < now;

      if (!isExpiredFulfilled && firstReservation.userId !== dto.userId) {
        throw new ForbiddenException(
          'Item has pending reservations — only the first in queue can borrow it now',
        );
      }
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

    // Lazy overdue promotion: update DB so status reflects reality on every query
    const promotionNow = new Date();
    const toPromote = loans.filter(
      (l) => l.status === LoanStatus.ACTIVE && l.dueAt < promotionNow && !l.returnedAt,
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

    const saved = await this.loanRepo.save(loan);

    // R-B1.2: fulfill next reservation in queue
    await this.fulfillNextReservation(loan.itemId);

    return saved;
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

  private async fulfillNextReservation(itemId: string): Promise<void> {
    const now = new Date();
    const next = await this.reservationRepo.findOne({
      where: { itemId, cancelledAt: IsNull(), fulfilledAt: IsNull() },
      order: { createdAt: 'ASC' },
    });
    if (!next) return;

    next.fulfilledAt = now;
    next.expiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    await this.reservationRepo.save(next);
  }
}
