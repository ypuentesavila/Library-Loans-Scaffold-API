import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { LoansService } from './loans.service';
import { Loan, LoanStatus } from './entities/loan.entity';
import { Item, ItemType } from '../items/entities/item.entity';
import { User, UserRole } from '../auth/entities/user.entity';
import { Reservation } from '../reservations/entities/reservation.entity';

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
  dueAt: new Date(Date.now() + 7 * 86_400_000),
  returnedAt: null,
  status: LoanStatus.ACTIVE,
  fineAmount: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('LoansService', () => {
  let service: LoansService;
  let loanRepo: {
    findOne: jest.Mock;
    count: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    createQueryBuilder: jest.Mock;
    update: jest.Mock;
  };
  let userRepo: { findOne: jest.Mock };
  let itemRepo: { findOne: jest.Mock };
  let reservationRepo: { findOne: jest.Mock; save: jest.Mock; find: jest.Mock };

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
    reservationRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoansService,
        { provide: getRepositoryToken(Loan), useValue: loanRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(Item), useValue: itemRepo },
        { provide: getRepositoryToken(Reservation), useValue: reservationRepo },
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
    const validDueAt = new Date(Date.now() + 7 * 86_400_000).toISOString();

    it('creates loan when item available, user under limit, dates valid', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      itemRepo.findOne.mockResolvedValue(makeItem());
      loanRepo.findOne.mockResolvedValue(null);
      loanRepo.count.mockResolvedValue(0);
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
      loanRepo.findOne.mockResolvedValue(makeLoan());

      await expect(
        service.createLoan({ userId: 'user-uuid-1', itemId: 'item-uuid-1', dueAt: validDueAt }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when user already has 3 active loans (R3)', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      itemRepo.findOne.mockResolvedValue(makeItem());
      loanRepo.findOne.mockResolvedValue(null);
      loanRepo.count.mockResolvedValue(3);

      await expect(
        service.createLoan({ userId: 'user-uuid-1', itemId: 'item-uuid-1', dueAt: validDueAt }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('returnLoan', () => {
    it('calculates fine: dueAt 5 days ago → fineAmount = 2.50 (R4)', async () => {
      const dueAt = new Date(Date.now() - 5 * 86_400_000 + 60_000);
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
