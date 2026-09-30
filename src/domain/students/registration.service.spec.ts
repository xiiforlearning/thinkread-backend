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
    lookup: jest.fn().mockResolvedValue({
      memberOf,
      failedGroups: [],
      level: memberOf[0]?.level ?? null,
    }),
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

describe('RegistrationService.gate', () => {
  it('refuses an unknown user who is in no group, without creating anything', async () => {
    const { service, students } = make(null, []);
    const g = await service.gate(user, 'hi');
    expect(g).toEqual({ kind: 'reply', text: studentMessages.notAMember });
    expect(students.create).not.toHaveBeenCalled();
  });

  it('registers a group member and asks for the name', async () => {
    const { service, students } = make(null, [PRE]);
    const g = await service.gate(user, '/start');
    expect(g).toEqual({ kind: 'reply', text: studentMessages.askName });
    expect(students.create).toHaveBeenCalledWith({
      telegramUserId: 100,
      username: 'nine_nine',
      groupChatIds: [-1],
      level: GroupLevel.PRE_INTERMEDIATE,
    });
  });

  it('re-asks when the name is not a real name', async () => {
    const pending = student({ status: StudentStatus.PENDING_NAME, firstName: null });
    const { service, students } = make(pending);
    const g = await service.gate(user, '9_9');
    expect(g).toEqual({ kind: 'reply', text: studentMessages.askNameAgain });
    expect(students.setName).not.toHaveBeenCalled();
  });

  it('accepts a real name and welcomes the student', async () => {
    const pending = student({ status: StudentStatus.PENDING_NAME, firstName: null });
    const { service, students } = make(pending);
    const g = await service.gate(user, 'акмаль хадиев');
    expect(students.setName).toHaveBeenCalledWith(pending, 'Акмаль', 'Хадиев');
    expect(g).toEqual({ kind: 'reply', text: studentMessages.welcome('Акмаль') });
  });

  it('passes an active student through to the dialog and records activity', async () => {
    const active = student({});
    const { service, students, membership } = make(active);
    const g = await service.gate(user, 'прочитал 10 страниц');
    expect(g).toEqual({ kind: 'student', student: active });
    expect(students.touchActivity).toHaveBeenCalledWith('s1');
    expect(membership.lookup).not.toHaveBeenCalled();
  });

  it('tells an archived student access is suspended when still out of the groups', async () => {
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
    const g = await service.gate(user, 'hello?');
    expect(g).toEqual({ kind: 'reply', text: studentMessages.archived });
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
    const g = await service.gate(user, 'hello?');
    expect(g).toEqual({ kind: 'reply', text: studentMessages.restored });
  });

  it('keeps the stored username in sync', async () => {
    const active = student({ username: 'old' });
    const { service, students } = make(active);
    await service.gate(user, 'hi');
    expect(students.updateUsername).toHaveBeenCalledWith('s1', 'nine_nine');
  });
});
