import { EventEmitter } from 'node:events';
import type { NextFunction, Request, Response } from 'express';
import { formatBody, httpLogMiddleware, parseHttpLogLevel, redact } from './http-log';

function fakeExchange(req: Partial<Request>): { req: Request; res: Response; finish: () => void } {
  const res = new EventEmitter() as unknown as Response & EventEmitter;
  res.statusCode = 200;
  res.json = ((body: unknown) => {
    void body;
    return res;
  }) as Response['json'];
  return {
    req: { method: 'GET', originalUrl: '/x', path: '/x', headers: {}, ...req } as Request,
    res,
    finish: () => res.emit('finish'),
  };
}

function spyLogger(): {
  lines: Array<[string, string]>;
  log: (m: string) => number;
  warn: (m: string) => number;
  error: (m: string) => number;
} {
  const lines: Array<[string, string]> = [];
  return {
    lines,
    log: (m: string) => lines.push(['log', m]),
    warn: (m: string) => lines.push(['warn', m]),
    error: (m: string) => lines.push(['error', m]),
  };
}

describe('http log', () => {
  it('parses LOG_HTTP with full as the default', () => {
    expect(parseHttpLogLevel(undefined)).toBe('full');
    expect(parseHttpLogLevel('summary')).toBe('summary');
    expect(parseHttpLogLevel('OFF')).toBe('off');
    expect(parseHttpLogLevel('false')).toBe('off');
  });

  it('hides credentials and keeps only the length of report texts', () => {
    expect(
      redact({
        initData: 'query_id=…',
        code: '123456',
        text: 'I read a book about the sea',
        nested: {
          data: { token: 'jwt', summary: 'retelling', unclearParts: ['a', 'b'], word: 'sea' },
        },
        list: [{ text: 'x' }],
        error: { code: '204254', message: 'no words' },
      }),
    ).toEqual({
      initData: '[secret]',
      code: '[secret]',
      text: '[text 27 chars]',
      nested: {
        data: {
          token: '[secret]',
          summary: '[text 9 chars]',
          unclearParts: '[text ×2]',
          word: 'sea',
        },
      },
      list: [{ text: '[text 1 chars]' }],
      error: { code: '204254', message: 'no words' },
    });
  });

  it('formats empty bodies as "-" and truncates long ones', () => {
    expect(formatBody(undefined)).toBe('-');
    expect(formatBody({})).toBe('-');
    expect(formatBody({ a: 1 })).toBe('{"a":1}');
    const long = formatBody({ words: 'w'.repeat(5000) });
    expect(long.length).toBeLessThan(2100);
    expect(long).toMatch(/…\(\d+ chars\)$/);
  });

  it('logs one line with the bodies, the caller and the level by status', () => {
    const logger = spyLogger();
    const mw = httpLogMiddleware('full', logger);
    const { req, res, finish } = fakeExchange({
      method: 'POST',
      originalUrl: '/me/words',
      body: { text: 'cat — кошка' },
      headers: { authorization: 'Bearer x' },
    });
    const next = jest.fn() as unknown as NextFunction;
    mw(req, res, next);
    expect(next).toHaveBeenCalled();
    (req as Request & { principal?: unknown }).principal = {
      telegramUserId: 1,
      studentId: 'stu-1',
      status: 'ACTIVE',
      roles: [],
    };
    res.statusCode = 201;
    res.json({ data: { added: [{ word: 'cat' }] } });
    finish();
    expect(logger.lines).toHaveLength(1);
    const [level, line] = logger.lines[0];
    expect(level).toBe('log');
    expect(line).toMatch(/^POST \/me\/words 201 \d+ms who=student:stu-1 /);
    expect(line).toContain('req={"text":"[text 11 chars]"}');
    expect(line).toContain('res={"data":{"added":[{"word":"cat"}]}}');
  });

  it('warns on 4xx and shows the error code without bodies in summary mode', () => {
    const logger = spyLogger();
    const mw = httpLogMiddleware('summary', logger);
    const { req, res, finish } = fakeExchange({ originalUrl: '/me/profile', body: {} });
    mw(req, res, jest.fn() as unknown as NextFunction);
    res.statusCode = 401;
    res.json({ error: { code: '301003', message: 'Unauthorized' } });
    finish();
    expect(logger.lines).toEqual([
      ['warn', expect.stringMatching(/^GET \/me\/profile 401 \d+ms who=anon error=301003$/)],
    ]);
  });

  it('skips /health and everything when off', () => {
    const logger = spyLogger();
    const a = fakeExchange({ path: '/health', originalUrl: '/health' });
    httpLogMiddleware('full', logger)(a.req, a.res, jest.fn() as unknown as NextFunction);
    a.finish();
    const b = fakeExchange({});
    httpLogMiddleware('off', logger)(b.req, b.res, jest.fn() as unknown as NextFunction);
    b.finish();
    expect(logger.lines).toEqual([]);
  });
});
