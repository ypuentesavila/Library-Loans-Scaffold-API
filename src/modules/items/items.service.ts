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
