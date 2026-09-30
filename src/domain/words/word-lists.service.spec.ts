import { GroupLevel } from '../groups/level';
import { matchesStudent } from './word-lists.service';
import { WordListScope } from './word.enums';

describe('matchesStudent', () => {
  it('addresses lists by group, by level, or to everyone', () => {
    const groups = [-100, -200];
    expect(
      matchesStudent({ scope: WordListScope.ALL, groupChatId: null, level: null }, groups, null),
    ).toBe(true);
    expect(
      matchesStudent({ scope: WordListScope.GROUP, groupChatId: -200, level: null }, groups, null),
    ).toBe(true);
    expect(
      matchesStudent({ scope: WordListScope.GROUP, groupChatId: -300, level: null }, groups, null),
    ).toBe(false);
    expect(
      matchesStudent(
        { scope: WordListScope.LEVEL, groupChatId: null, level: GroupLevel.IELTS },
        groups,
        GroupLevel.IELTS,
      ),
    ).toBe(true);
    expect(
      matchesStudent(
        { scope: WordListScope.LEVEL, groupChatId: null, level: GroupLevel.IELTS },
        groups,
        null,
      ),
    ).toBe(false);
  });
});
