import { inWindow, minutesOf } from './reminders.cron';

describe('reminders cron window', () => {
  it('fires from the configured minute for two hours, not before and not later', () => {
    expect(minutesOf('18:00')).toBe(1080);
    expect(inWindow(minutesOf('17:59'), '18:00')).toBe(false);
    expect(inWindow(minutesOf('18:00'), '18:00')).toBe(true);
    expect(inWindow(minutesOf('19:59'), '18:00')).toBe(true);
    expect(inWindow(minutesOf('20:00'), '18:00')).toBe(false);
  });
});
