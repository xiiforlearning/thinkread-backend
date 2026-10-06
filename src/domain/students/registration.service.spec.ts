import { Group } from '../groups/group.entity';
import { GroupLevel } from '../groups/level';
import { MembershipService } from '../membership/membership.service';
import { studentMessages } from './messages';
import { RegistrationService } from './registration.service';
import { Student } from './student.entity';
import { ArchiveReason, StudentStatus } from './student.enums';
import { CreateStudentInput, StudentsService } from './students.service';

const user = { telegramUserId: 100, username: 'nine_nine' };

function student(over: Partial<Student>): Student {
  return Object.assign(new Student(), {
    id: 's1',
    telegramUserId: 100,
    username: 'nine_nine',
    status: StudentStatus.ACTIVE,
    archiveReason: null,
    firstName: 'Акмаль',
    ...over,
  });
}

type StudentsFake = jest.Mocked<
  Pick<
    StudentsService,
    'findByTelegramId' | 'updateUsername' | 'create' | 'setName' | 'touchActivity'
  >
>;
type MembershipFake = jest.Mocked<Pick<MembershipService, 'lookup' | 'reconcile'>>;

function makeStudents(existing: Student | null): StudentsFake {
  return {
    findByTelegramId: jest.fn().mockResolvedValue(existing),
    updateUsername: jest.fn().mockResolvedValue(undefined),
    create: jest.fn(async (_input: CreateStudentInput) =>
      student({ status: StudentStatus.PENDING_NAME, firstName: null }),
    ),
    setName: jest.fn(async (s: Student, f: string, l: string) =>
      Object.assign(s, { firstName: f, lastName: l, status: StudentStatus.ACTIVE }),
    ),
    touchActivity: jest.fn().mockResolvedValue(undefined),
  };
}

function makeMembership(memberOf: Group[]): MembershipFake {
  return {
    lookup: jest
      .fn()
      .mockResolvedValue({ memberOf, failedGroups: [], level: memberOf[0]?.level ?? null }),
    reconcile: jest.fn(),
  };
}

function make(
  existing: Student | null,
  memberOf: Group[] = [],
): { service: RegistrationService; students: StudentsFake; membership: MembershipFake } {
  const students = makeStudents(existing);
  const membership = makeMembership(memberOf);
  const service = new RegistrationService(students as never, membership as never);
  return { service, students, membership };
}

const PRE = Object.assign(new Group(), { chatId: -1, level: GroupLevel.PRE_INTERMEDIATE });

describe('RegistrationService.resolve (Mini App auth)', () => {
  it('refuses an unknown user who is in no group, without creating anything', async () => {
    const { service, students } = make(null, []);
    expect(await service.resolve(user)).toEqual({ status: 'NOT_MEMBER', student: null });
    expect(students.create).not.toHaveBeenCalled();
  });

  it('creates a group member as PENDING_NAME', async () => {
    const { service, students } = make(null, [PRE]);
    const r = await service.resolve(user);
    expect(r.status).toBe('PENDING_NAME');
    expect(students.create).toHaveBeenCalledWith({
      telegramUserId: 100,
      username: 'nine_nine',
      groupChatIds: [-1],
      level: GroupLevel.PRE_INTERMEDIATE,
    });
  });

  it('a teacher (group admin) is STAFF, not a new student — nothing is created', async () => {
    const { service, students, membership } = make(null, [PRE]);
    expect(await service.resolve(user, { staff: true })).toEqual({
      status: 'STAFF',
      student: null,
    });
    expect(students.create).not.toHaveBeenCalled();
    expect(membership.lookup).not.toHaveBeenCalled();
  });

  it('a staff member who already is an ACTIVE student keeps the student flow', async () => {
    const active = student({});
    const { service } = make(active);
    expect((await service.resolve(user, { staff: true })).status).toBe('ACTIVE');
  });

  it('reports an active student and records activity without re-checking membership', async () => {
    const active = student({});
    const { service, students, membership } = make(active);
    expect(await service.resolve(user)).toEqual({ status: 'ACTIVE', student: active });
    expect(students.touchActivity).toHaveBeenCalledWith('s1');
    expect(membership.lookup).not.toHaveBeenCalled();
  });

  it('keeps an archived student archived when still out of the groups', async () => {
    const archived = student({
      status: StudentStatus.ARCHIVED,
      archiveReason: ArchiveReason.LEFT_GROUP,
    });
    const { service, membership } = make(archived);
    membership.reconcile.mockResolvedValue({
      student: archived,
      action: 'kept',
      levelChanged: false,
      failedGroups: [],
    });
    expect((await service.resolve(user)).status).toBe('ARCHIVED');
  });

  it('restores an archived student who is back in a group right away', async () => {
    const archived = student({
      status: StudentStatus.ARCHIVED,
      archiveReason: ArchiveReason.LEFT_GROUP,
    });
    const { service, membership } = make(archived);
    membership.reconcile.mockResolvedValue({
      student: student({ status: StudentStatus.ACTIVE }),
      action: 'restored',
      levelChanged: false,
      failedGroups: [],
    });
    expect((await service.resolve(user)).status).toBe('ACTIVE');
  });

  it('keeps the stored username in sync', async () => {
    const active = student({ username: 'old' });
    const { service, students } = make(active);
    await service.resolve(user);
    expect(students.updateUsername).toHaveBeenCalledWith('s1', 'nine_nine');
  });
});

describe('RegistrationService.setName', () => {
  it('accepts a real name, capitalized', async () => {
    const pending = student({ status: StudentStatus.PENDING_NAME, firstName: null });
    const { service, students } = make(pending);
    await service.setName(pending, 'акмаль', 'хадиев');
    expect(students.setName).toHaveBeenCalledWith(pending, 'Акмаль', 'Хадиев');
  });

  it('rejects nicknames and digits with NAME_INVALID', async () => {
    const pending = student({ status: StudentStatus.PENDING_NAME, firstName: null });
    const { service, students } = make(pending);
    await expect(service.setName(pending, '9_9', 'x')).rejects.toMatchObject({ code: '203261' });
    expect(students.setName).not.toHaveBeenCalled();
  });
});

describe('RegistrationService.gate (bot)', () => {
  it('points a PENDING_NAME student to the app', async () => {
    const pending = student({ status: StudentStatus.PENDING_NAME, firstName: null });
    const { service } = make(pending);
    expect(await service.gate(user)).toEqual({ kind: 'reply', text: studentMessages.finishInApp });
  });

  it('passes an active student through', async () => {
    const active = student({});
    const { service } = make(active);
    expect(await service.gate(user)).toEqual({ kind: 'student', student: active });
  });
});
