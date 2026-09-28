/**
 * SQL for a CHECK constraint that limits a varchar/smallint column to enum
 * values. Used with TypeORM's `@Check` so the schema builder knows about the
 * constraint (and `migration:generate` stays clean). NULL passes the check —
 * nullability is controlled by the column itself.
 */
export function enumCheck(column: string, values: Record<string, string | number>): string {
  const all = Object.values(values);
  // Numeric TS enums also contain reverse (name) mappings — keep only the numbers.
  const numbers = all.filter((v): v is number => typeof v === 'number');
  const list = numbers.length > 0 ? numbers.map(String) : all.map((v) => `'${v}'`);
  return `"${column}" IN (${list.join(', ')})`;
}
