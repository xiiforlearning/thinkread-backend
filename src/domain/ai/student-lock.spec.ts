import { KeyedLock } from './student-lock';

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 5));

describe('KeyedLock', () => {
  it('runs calls with the same key one after another', async () => {
    const lock = new KeyedLock();
    const order: string[] = [];
    const a = lock.run('s1', async () => {
      order.push('a-start');
      await tick();
      order.push('a-end');
    });
    const b = lock.run('s1', async () => {
      order.push('b-start');
      order.push('b-end');
    });
    await Promise.all([a, b]);
    expect(order).toEqual(['a-start', 'a-end', 'b-start', 'b-end']);
  });

  it('runs different keys in parallel', async () => {
    const lock = new KeyedLock();
    const order: string[] = [];
    await Promise.all([
      lock.run('s1', async () => {
        order.push('a-start');
        await tick();
        order.push('a-end');
      }),
      lock.run('s2', async () => {
        order.push('b-start');
        order.push('b-end');
      }),
    ]);
    expect(order).toEqual(['a-start', 'b-start', 'b-end', 'a-end']);
  });

  it('releases the key after a failure', async () => {
    const lock = new KeyedLock();
    await expect(lock.run('s1', async () => Promise.reject(new Error('boom')))).rejects.toThrow(
      'boom',
    );
    await expect(lock.run('s1', async () => 42)).resolves.toBe(42);
  });
});
