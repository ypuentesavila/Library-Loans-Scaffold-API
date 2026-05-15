import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
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
