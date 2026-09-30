import { enumCheck } from './db-checks';

enum Color {
  RED = 'RED',
  GREEN = 'GREEN',
}

enum Stage {
  ONE = 1,
  TWO = 2,
}

describe('enumCheck', () => {
  it('quotes string enum values', () => {
    expect(enumCheck('color', Color)).toBe(`"color" IN ('RED', 'GREEN')`);
  });

  it('drops reverse mappings of numeric enums', () => {
    expect(enumCheck('stage', Stage)).toBe(`"stage" IN (1, 2)`);
  });
});
