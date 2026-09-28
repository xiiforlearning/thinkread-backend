import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { bigintToNumber } from '../../common/transformers';
import { Group } from '../groups/group.entity';
import { Student } from './student.entity';

/** A student may belong to several groups; membership is re-checked monthly via getChatMember. */
@Entity({ name: 'student_groups' })
@Index('idx_student_groups_group', ['groupChatId'])
export class StudentGroup {
  @PrimaryColumn({ type: 'uuid', name: 'student_id' })
  studentId!: string;

  @PrimaryColumn({
    type: 'bigint',
    name: 'group_chat_id',
    transformer: bigintToNumber,
  })
  groupChatId!: number;

  @ManyToOne(() => Student, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student?: Student;

  @ManyToOne(() => Group, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'group_chat_id' })
  group?: Group;

  @Column({ type: 'boolean', name: 'is_member', default: true })
  isMember!: boolean;

  @Column({ type: 'timestamptz', name: 'joined_at', default: () => 'now()' })
  joinedAt!: Date;

  @Column({ type: 'timestamptz', name: 'checked_at', default: () => 'now()' })
  checkedAt!: Date;
}
