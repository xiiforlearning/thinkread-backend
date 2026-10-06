import type Anthropic from '@anthropic-ai/sdk';
import { estimateCostUsd, totalTokens } from './usage.service';

const usage = {
  input_tokens: 1_000_000,
  output_tokens: 1_000_000,
  cache_creation_input_tokens: 1_000_000,
  cache_read_input_tokens: 1_000_000,
} as Anthropic.Usage;

describe('estimateCostUsd', () => {
  it('prices Haiku 4.5 per million tokens by kind', () => {
    // 1 + 5 + 1.25 + 0.10
    expect(estimateCostUsd('claude-haiku-4-5', usage)).toBeCloseTo(7.35, 6);
  });

  it('treats missing cache counters as zero', () => {
    const u = { input_tokens: 2_000_000, output_tokens: 0 } as Anthropic.Usage;
    expect(estimateCostUsd('claude-haiku-4-5', u)).toBeCloseTo(2, 6);
  });

  it('returns 0 for an unknown model rather than guessing', () => {
    expect(estimateCostUsd('some-other-model', usage)).toBe(0);
  });
});

describe('totalTokens', () => {
  it('sums every kind', () => {
    expect(totalTokens(usage)).toBe(4_000_000);
  });
});
