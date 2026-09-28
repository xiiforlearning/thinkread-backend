import { displayNameOf, parseFullName } from './name-validation';

describe('parseFullName', () => {
  it('accepts Cyrillic and Latin first + last name and capitalizes', () => {
    expect(parseFullName('акмаль хадиев')).toEqual({ firstName: 'Акмаль', lastName: 'Хадиев' });
    expect(parseFullName('  John   Smith ')).toEqual({ firstName: 'John', lastName: 'Smith' });
  });

  it('keeps compound last names', () => {
    expect(parseFullName("Anna-Maria O'Neil Junior")).toEqual({
      firstName: 'Anna-Maria',
      lastName: "O'Neil Junior",
    });
  });

  it.each(['9_9', 'Akmal', 'Akmal 123', 'A B', 'akmal@x', '', 'один два три четыре пять'])(
    'rejects %p',
    (raw) => {
      expect(parseFullName(raw)).toBeNull();
    },
  );
});

describe('displayNameOf', () => {
  const base = {
    displayName: null,
    firstName: null,
    lastName: null,
    username: null,
    telegramUserId: 42,
  };

  it('prefers the owner override, then the real name, then username, then id', () => {
    expect(displayNameOf({ ...base, displayName: 'Акмаль — Upper 16:00', firstName: 'A' })).toBe(
      'Акмаль — Upper 16:00',
    );
    expect(displayNameOf({ ...base, firstName: 'Акмаль', lastName: 'Хадиев' })).toBe(
      'Акмаль Хадиев',
    );
    expect(displayNameOf({ ...base, username: 'nine_nine' })).toBe('@nine_nine');
    expect(displayNameOf(base)).toBe('id 42');
  });
});
