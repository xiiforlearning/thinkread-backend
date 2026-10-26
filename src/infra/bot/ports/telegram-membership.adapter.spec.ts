import { isUnknownUser } from './telegram-membership.adapter';

describe('TelegramMembershipAdapter.isUnknownUser', () => {
  it('reads every wording Telegram uses for "not in the chat" as a plain answer, not an error', () => {
    for (const d of [
      'Bad Request: user not found',
      'Bad Request: member not found',
      'Bad Request: PARTICIPANT_ID_INVALID',
      'Bad Request: USER_NOT_PARTICIPANT',
    ])
      expect(isUnknownUser(d)).toBe(true);
    expect(isUnknownUser('Bad Request: chat not found')).toBe(false);
    expect(isUnknownUser('Too Many Requests: retry after 5')).toBe(false);
  });
});
