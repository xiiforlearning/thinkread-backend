/**
 * One-off: post the "we moved to ThinkRead" message in every active study group, with a button
 * that opens the bot in private chat (`?start=app` → the bot answers with the Mini App button;
 * web_app buttons are not allowed in groups, so the deep link does the job).
 *
 *   pnpm ops:announce            # dry run: lists the groups and prints the text
 *   pnpm ops:announce --send     # really posts, one group per second
 *   pnpm ops:announce --send --only=-1001234567890,-1009876543210
 *
 * Needs BOT_TOKEN and the database (same env as the app). Safe to re-run: it posts again, so
 * run --send once.
 */
import 'reflect-metadata';
import { Markup, Telegraf } from 'telegraf';
import dataSource from '../ormconfig';
import { Group } from '../src/domain/groups/group.entity';
import { DEFAULT_LANG } from '../src/domain/students/language';
import { studentMessagesFor } from '../src/domain/students/messages';

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

async function main(): Promise<void> {
  const token = process.env.BOT_TOKEN;
  if (!token) throw new Error('BOT_TOKEN is not set');
  const send = process.argv.includes('--send');
  const only = new Set((arg('only') ?? '').split(',').filter(Boolean).map(Number));

  const bot = new Telegraf(token);
  const me = await bot.telegram.getMe();
  const texts = studentMessagesFor(DEFAULT_LANG);
  const text = texts.groupAnnouncement(me.username);
  const keyboard = Markup.inlineKeyboard([
    Markup.button.url(texts.groupAnnouncementButton, `https://t.me/${me.username}?start=app`),
  ]);

  const ds = await dataSource.initialize();
  const groups = (await ds.getRepository(Group).find({ where: { isActive: true } })).filter(
    (g) => only.size === 0 || only.has(g.chatId),
  );
  await ds.destroy();

  console.log(`bot @${me.username}, ${groups.length} active group(s)${send ? '' : ' — dry run'}`);
  console.log('---\n' + text + '\n---');
  let ok = 0;
  for (const g of groups) {
    if (!send) {
      console.log(`  would post to ${g.chatId} "${g.title}"`);
      continue;
    }
    try {
      await bot.telegram.sendMessage(g.chatId, text, {
        ...keyboard,
        link_preview_options: { is_disabled: true },
      });
      ok += 1;
      console.log(`  posted to ${g.chatId} "${g.title}"`);
    } catch (err) {
      console.error(`  FAILED ${g.chatId} "${g.title}": ${(err as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (send) console.log(`done: ${ok} of ${groups.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
