import { Group } from './group.entity';
import { GroupsService } from './groups.service';
import { GroupLevel } from './level';

function make(existing: Group | null): {
  service: GroupsService;
  saved: Group[];
  updates: Array<[Record<string, unknown>, Record<string, unknown>]>;
} {
  const saved: Group[] = [];
  const updates: Array<[Record<string, unknown>, Record<string, unknown>]> = [];
  const repo = {
    findOne: jest.fn().mockResolvedValue(existing),
    create: jest.fn((v: Partial<Group>) => Object.assign(new Group(), v)),
    save: jest.fn(async (g: Group) => {
      saved.push(g);
      return g;
    }),
    update: jest.fn(async (where: Record<string, unknown>, patch: Record<string, unknown>) => {
      updates.push([where, patch]);
    }),
  };
  return { service: new GroupsService(repo as never), saved, updates };
}

describe('GroupsService — joining the school', () => {
  it('a group the bot was just added to is created inactive: anyone can add a public bot', async () => {
    const { service, saved } = make(null);
    const g = await service.upsert(-1, 'Stranger chat');
    expect(g.isActive).toBe(false);
    expect(g.level).toBeNull();
    expect(saved[0]).toBe(g);
  });

  it('a group the owner approved before (it has a level) comes back active when re-added', async () => {
    const known = Object.assign(new Group(), {
      chatId: -1,
      title: 'old',
      level: GroupLevel.INTERMEDIATE,
      isActive: false,
    });
    const { service } = make(known);
    const g = await service.upsert(-1, 'Inter 19:00');
    expect(g.isActive).toBe(true);
    expect(g.title).toBe('Inter 19:00');
  });

  it('a re-added group that was never approved stays pending', async () => {
    const pending = Object.assign(new Group(), {
      chatId: -1,
      title: 'x',
      level: null,
      isActive: false,
    });
    const { service } = make(pending);
    expect((await service.upsert(-1, 'x')).isActive).toBe(false);
  });

  it('approve() sets the level and activates in one step', async () => {
    const { service, updates } = make(null);
    await service.approve(-1, GroupLevel.IELTS);
    expect(updates[0]).toEqual([{ chatId: -1 }, { level: GroupLevel.IELTS, isActive: true }]);
  });
});
