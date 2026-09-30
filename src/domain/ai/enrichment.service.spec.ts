import type Anthropic from '@anthropic-ai/sdk';
import { ENRICH_TOOL_NAME } from './enrichment.prompt';
import { EnrichmentService } from './enrichment.service';
import { LlmPort, LlmRequest } from './llm.port';

const usage = { input_tokens: 10, output_tokens: 5 } as unknown as Anthropic.Usage;

describe('EnrichmentService', () => {
  it('asks the model only for unknown lemmas, stores them and applies the lexicon', async () => {
    const requests: LlmRequest[] = [];
    const llm: LlmPort = {
      complete: async (req) => {
        requests.push(req);
        return {
          content: [
            {
              type: 'tool_use',
              id: 't',
              name: ENRICH_TOOL_NAME,
              input: {
                words: [
                  {
                    lemma: 'wand',
                    translation: 'волшебная палочка',
                    examples: ['He waved his wand.'],
                    cefr: 'B1',
                    forms: ['wand', 'wands'],
                    gap_sentences: [{ sentence: 'He waved his ___.', hint: '(палочка)' }],
                    distractors: ['меч', 'шляпа', 'плащ'],
                  },
                  {
                    lemma: 'unrelated',
                    translation: 'x',
                    examples: [],
                    cefr: 'ZZ',
                    forms: [],
                    gap_sentences: [],
                    distractors: [],
                  },
                ],
              },
            },
          ],
          stop_reason: 'tool_use',
          usage,
        } as unknown as Anthropic.Message;
      },
    };
    const lexicon = {
      missing: jest.fn().mockResolvedValue(['wand']),
      upsert: jest.fn().mockResolvedValue(undefined),
    };
    const words = { applyLexicon: jest.fn().mockResolvedValue(1) };
    const usageSvc = { record: jest.fn().mockResolvedValue(undefined) };
    const svc = new EnrichmentService(
      llm,
      usageSvc as never,
      lexicon as never,
      words as never,
      { aiModelDialog: 'claude-haiku-4-5' } as never,
    );

    const fetched = await svc.enrich(['wand', 'owl', 'wand'], 's1');

    expect(fetched).toBe(1);
    expect(lexicon.missing).toHaveBeenCalledWith(['wand', 'owl']);
    expect(requests[0].toolChoice).toEqual({ type: 'tool', name: ENRICH_TOOL_NAME });
    expect(lexicon.upsert).toHaveBeenCalledWith([
      expect.objectContaining({
        lemma: 'wand',
        translation: 'волшебная палочка',
        gapSentences: [{ sentence: 'He waved his ___.', hint: '(палочка)' }],
      }),
    ]);
    expect(words.applyLexicon).toHaveBeenCalledWith(['wand', 'owl']);
    expect(usageSvc.record).toHaveBeenCalledWith('s1', 'ENRICH_WORDS', 'claude-haiku-4-5', usage);
  });

  it('skips the model entirely when everything is cached', async () => {
    const llm: LlmPort = { complete: jest.fn() };
    const lexicon = { missing: jest.fn().mockResolvedValue([]), upsert: jest.fn() };
    const words = { applyLexicon: jest.fn().mockResolvedValue(0) };
    const svc = new EnrichmentService(
      llm,
      { record: jest.fn() } as never,
      lexicon as never,
      words as never,
      {} as never,
    );
    await svc.enrich(['wand'], null);
    expect(llm.complete).not.toHaveBeenCalled();
    expect(lexicon.upsert).not.toHaveBeenCalled();
  });
});
