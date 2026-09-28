/**
 * Split a long text into chunks of at most `maxLen` bytes (well, chars),
 * cutting on `\n` boundaries so individual log lines stay intact.
 *
 * If a single line exceeds `maxLen`, it is emitted as its own (oversize) chunk —
 * callers should expect Telegram to reject it. We choose this over silently
 * dropping the line.
 */
export function splitByNewlines(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return text.length === 0 ? [] : [text];

  const lines = text.split('\n');
  const chunks: string[] = [];
  let buf = '';

  const flush = (): void => {
    if (buf.length > 0) chunks.push(buf);
    buf = '';
  };

  for (const line of lines) {
    const next = buf.length === 0 ? line : `${buf}\n${line}`;
    if (next.length <= maxLen) {
      buf = next;
      continue;
    }
    // Flush current buffer; line either fits alone or is oversize.
    flush();
    buf = line;
  }
  flush();
  return chunks;
}
