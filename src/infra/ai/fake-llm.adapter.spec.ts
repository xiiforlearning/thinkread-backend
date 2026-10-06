import type Anthropic from '@anthropic-ai/sdk';
import { parseTool, PARSE_TOOL_NAME } from '../../domain/ai/report-intake.prompt';
import { ENRICH_TOOL, ENRICH_TOOL_NAME } from '../../domain/ai/enrichment.prompt';
import { VERDICT_TOOL, VERDICT_TOOL_NAME } from '../../domain/ai/authenticity.prompt';
import { extractWords, FakeLlmAdapter, parseListening, parseReading } from './fake-llm.adapter';

function toolUse(msg: Anthropic.Message, name: string): Record<string, unknown> {
  const block = msg.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === name,
  );
  if (!block) throw new Error(`no tool_use ${name}`);
  return block.input as Record<string, unknown>;
}

describe('FakeLlmAdapter', () => {
  const llm = new FakeLlmAdapter();
  const base = { model: 'fake', maxTokens: 100, system: [] };

  it('extracts words from a "слова:" list', () => {
    expect(extractWords('слушал подкаст, слова: drowsy — сонный, nap, sleep debt')).toEqual([
      'drowsy',
      'nap',
      'sleep debt',
    ]);
    expect(extractWords('ничего нет')).toEqual([]);
  });

  it('parses a reading report into the parsed_report tool', async () => {
    const msg = await llm.complete({
      ...base,
      tools: [parseTool('READING')],
      toolChoice: { type: 'tool', name: PARSE_TOOL_NAME },
      messages: [
        {
          role: 'user',
          content:
            'прочитал 15 страниц Harry Potter and the Philosopher’s Stone, про то как он узнал что волшебник, слова: wand, muggle',
        },
      ],
    });
    expect(msg.stop_reason).toBe('tool_use');
    const input = toolUse(msg, PARSE_TOOL_NAME);
    expect(input.pages).toBe(15);
    expect(input.book_title).toContain('Harry Potter');
    expect(input.new_words).toEqual(['wand', 'muggle']);
  });

  it('parses a listening report with percentages, count and an English retelling', () => {
    const r = parseListening(
      'слушал 6 Minute English про сон, с первого раза 70%, после третьего 88%, слушал 3 раза. The episode was about why we sleep. The hosts said a nap helps memory. слова: drowsy',
    );
    expect(r.source_title).toBe('6 Minute English');
    expect(parseListening('слушал «Why do we sleep?» на BBC, 60%').source_title).toBe(
      'Why do we sleep?',
    );
    expect(
      parseListening('уровень студента: «Upper», отчёт: слушал The Great Race, 60%').source_title,
    ).toBe('The Great Race');
    expect(parseListening('слушал 6 Minute English — Why do we sleep?, 70%').source_title).toBe(
      '6 Minute English — Why do we sleep?',
    );
    expect(r.first_pass_pct).toBe(70);
    expect(r.second_pass_pct).toBe(88);
    expect(r.listen_count).toBe(3);
    expect(String(r.retelling)).toContain('why we sleep');
    expect(r.new_words).toEqual(['drowsy']);
    expect(parseReading('ничего').pages).toBeNull();
  });

  it('enriches every requested lemma and never flags a report', async () => {
    const enriched = await llm.complete({
      ...base,
      tools: [ENRICH_TOOL],
      toolChoice: { type: 'tool', name: ENRICH_TOOL_NAME },
      messages: [{ role: 'user', content: JSON.stringify({ lemmas: ['postpone', 'zzz'] }) }],
    });
    const words = toolUse(enriched, ENRICH_TOOL_NAME).words as Array<Record<string, unknown>>;
    expect(words.map((w) => w.lemma)).toEqual(['postpone', 'zzz']);
    expect(words[0].translation).toBe('откладывать');
    expect(String(words[1].translation)).toContain('fake');

    const v = await llm.complete({
      ...base,
      tools: [VERDICT_TOOL],
      toolChoice: { type: 'tool', name: VERDICT_TOOL_NAME },
      messages: [{ role: 'user', content: 'аудирование: The hosts talked about sleep and naps.' }],
    });
    const input = toolUse(v, VERDICT_TOOL_NAME);
    expect(input.suspicious).toBe(false);
    expect(typeof input.spot_check_question).toBe('string');
  });

  it('answers a free dialog with text and end_turn', async () => {
    const msg = await llm.complete({
      ...base,
      tools: [],
      messages: [{ role: 'user', content: 'привет' }],
    });
    expect(msg.stop_reason).toBe('end_turn');
    expect(msg.content[0]).toMatchObject({ type: 'text' });
  });
});
