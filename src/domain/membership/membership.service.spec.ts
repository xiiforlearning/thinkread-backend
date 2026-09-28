import { Group } from '../groups/group.entity';
import { GroupLevel } from '../groups/level';
import { Student } from '../students/student.entity';
import { ArchiveReason, StudentStatus } from '../students/student.enums';
import { StudentsService } from '../students/students.service';
import { MembershipCheck } from './membership-check.entity';
import { MemberStatus, MembershipPort } from './membership.port';
import { MembershipService } from './membership.service';

/** In-memory stand-ins; only what MembershipService calls. */
class FakeTelegram implements MembershipPort {
  constructor(private readonly table: Record<string, MemberStatus>) {}
  async getMemberStatus(chatId: number, userId: number): Promise<MemberStatus> {
    return this.table[`${chatId}:${userId}`] ?? 'not_member';
  }
}

function group(chatId: number, level: GroupLevel | null): Group {
  return Object.assign(new Group(), { chatId, title: `g${chatId}`, level, isActive: true });
}

function student(over: Partial<Student>): Student {
  return Object.assign(new Student(), {
    id: 's1',
    telegramUserId: 100,
    status: StudentStatus.ACTIVE,
    archiveReason: null,
    level: null,
    manualAccess: false,
    firstName: 'A',
    ...over,
  });
}

function makeStudents(
  previousGroups: number[] = [],
): jest.Mocked<
  Pick<
    StudentsService,
    'memberGroupIds' | 'syncGroups' | 'setLevel' | 'archive' | 'restore' | 'findForMembershipCheck'
  >
> {
  return {
    memberGroupIds: jest.fn().mockResolvedValue(previousGroups),
    syncGroups: jest.fn().mockResolvedValue(undefined),
    setLevel: jest.fn().mockResolvedValue(undefined),
    archive: jest.fn(async (s: Student, reason: ArchiveReason) =>
      Object.assign(s, { status: StudentStatus.ARCHIVED, archiveReason: reason }),
    ),
    restore: jest.fn(async (s: Student) =>
      Object.assign(s, { status: StudentStatus.ACTIVE, archiveReason: null }),
    ),
    findForMembershipCheck: jest.fn().mockResolvedValue([]),
  };
}

const PRE = group(-1, GroupLevel.PRE_INTERMEDIATE);
const UPPER = group(-2, GroupLevel.UPPER_INTERMEDIATE);

type ChecksFake = {
  create: jest.Mock;
  save: jest.Mock;
  find: jest.Mock;
};

function make(
  table: Record<string, MemberStatus>,
  students = makeStudents(),
  groups = [PRE, UPPER],
): { service: MembershipService; students: ReturnType<typeof makeStudents>; checks: ChecksFake } {
  const checks: ChecksFake = {
    create: jest.fn((x: Partial<MembershipCheck>) => Object.assign(new MembershipCheck(), x)),
    save: jest.fn(async (x: MembershipCheck) => x),
    find: jest.fn(),
  };
  const groupsSvc = { findAllActive: jest.fn().mockResolvedValue(groups) };
  const service = new MembershipService(
    new FakeTelegram(table),
    checks as never,
    groupsSvc as never,
    students as never,
  );
  return { service, students, checks };
}

describe('MembershipService.lookup', () => {
  it('returns the groups the user is in and the highest level', async () => {
    const { service } = make({ '-1:100': 'member', '-2:100': 'member' });
    const r = await service.lookup(100);
    expect(r.memberOf.map((g) => g.chatId)).toEqual([-1, -2]);
    expect(r.level).toBe(GroupLevel.UPPER_INTERMEDIATE);
    expect(r.failedGroups).toEqual([]);
  });

  it('separates groups it could not query', async () => {
    const { service } = make({ '-1:100': 'member', '-2:100': 'error' });
    const r = await service.lookup(100);
    expect(r.memberOf.map((g) => g.chatId)).toEqual([-1]);
    expect(r.failedGroups.map((g) => g.chatId)).toEqual([-2]);
  });
});

describe('MembershipService.reconcile', () => {
  it('archives an active student who is in no group', async () => {
    const { service, students } = make({});
    const r = await service.reconcile(student({}));
    expect(r.action).toBe('archived');
    expect(students.archive).toHaveBeenCalledWith(expect.anything(), ArchiveReason.LEFT_GROUP);
  });

  it('never archives a student added by hand', async () => {
    const { service, students } = make({});
    const r = await service.reconcile(student({ manualAccess: true }));
    expect(r.action).toBe('kept');
    expect(students.archive).not.toHaveBeenCalled();
  });

  it('restores a student archived for leaving who is back in a group', async () => {
    const { service } = make({ '-1:100': 'member' });
    const r = await service.reconcile(
      student({ status: StudentStatus.ARCHIVED, archiveReason: ArchiveReason.LEFT_GROUP }),
    );
    expect(r.action).toBe('restored');
  });

  it('does not lift a manual archive even when the student is in a group', async () => {
    const { service, students } = make({ '-1:100': 'member' });
    const r = await service.reconcile(
      student({ status: StudentStatus.ARCHIVED, archiveReason: ArchiveReason.MANUAL }),
    );
    expect(r.action).toBe('kept');
    expect(students.restore).not.toHaveBeenCalled();
  });

  it('keeps previous membership for a group it could not query', async () => {
    const { service, students } = make(
      { '-1:100': 'not_member', '-2:100': 'error' },
      makeStudents([-2]),
    );
    const r = await service.reconcile(student({ level: GroupLevel.UPPER_INTERMEDIATE }));
    expect(r.action).toBe('kept');
    expect(students.syncGroups).toHaveBeenCalledWith('s1', [-2]);
    expect(r.levelChanged).toBe(false);
  });

  it('recomputes the level when the student changed group', async () => {
    const { service, students } = make({ '-2:100': 'member' });
    const r = await service.reconcile(student({ level: GroupLevel.PRE_INTERMEDIATE }));
    expect(r.levelChanged).toBe(true);
    expect(students.setLevel).toHaveBeenCalledWith('s1', GroupLevel.UPPER_INTERMEDIATE);
  });
});

describe('MembershipService.runCheck', () => {
  it('counts outcomes, collects failed groups and survives a failing student', async () => {
    const students = makeStudents();
    students.findForMembershipCheck.mockResolvedValue([
      student({ id: 'a', telegramUserId: 1 }),
      student({ id: 'b', telegramUserId: 2 }),
      student({ id: 'c', telegramUserId: 3 }),
    ]);
    students.syncGroups.mockImplementation(async (id: string) => {
      if (id === 'c') throw new Error('db down');
    });
    const { service, checks } = make(
      { '-1:1': 'member', '-2:1': 'error', '-1:2': 'not_member', '-2:2': 'not_member' },
      students,
    );
    const run = await service.runCheck();
    expect(run.checked).toBe(2);
    expect(run.archived).toBe(1);
    expect(run.details?.archived).toEqual(['b']);
    expect(run.details?.failedGroups).toEqual([-2]);
    expect(run.finishedAt).toBeInstanceOf(Date);
    expect(checks.save).toHaveBeenCalledTimes(2);
  });
});
