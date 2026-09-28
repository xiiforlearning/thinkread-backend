/**
 * Serializes work per key (student id) within one process: two messages from
 * the same student are handled one after the other, so the dialog history and
 * tool side effects never interleave. Other students run in parallel.
 */
export class KeyedLock {
  private readonly tails = new Map<string, Promise<void>>();

  async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const mine = new Promise<void>((resolve) => (release = resolve));
    this.tails.set(
      key,
      previous.then(() => mine),
    );
    try {
      await previous;
      return await fn();
    } finally {
      release();
      if (this.tails.get(key) === mine) this.tails.delete(key);
    }
  }
}
