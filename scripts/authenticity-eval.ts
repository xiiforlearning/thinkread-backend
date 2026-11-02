/**
 * Replay the authenticity check on real flagged reports and compare with the teacher's verdicts.
 *
 *   pnpm ai:authenticity-eval <flags-dump.json> [--expected verdicts.json] [--limit N] [--out results.json]
 *
 * The dump is the JSON of the "flags with report, previous reports and spot checks" query
 * (one row per flag; several flags of one report are one case). AI_MODE picks the model as
 * everywhere (anthropic needs ANTHROPIC_API_KEY; fake runs the stub for a dry run).
 * Previous connected reports (up to three) are measured first so the style baseline exists,
 * then the flagged report is analyzed; the result is printed next to the old kinds and the
 * teacher's verdict (FALSE / REAL / CHECK) when the expected file names the case:
 * `[{ "students": ["Name"], "title": "regex", "date": "YYYY-MM-DD"?, "verdict": "FALSE" }]`.
 * Both files hold students' texts and names: keep them outside the repository.
 */
import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { readFileSync, writeFileSync } from 'fs';
import { AppConfigService } from '../src/config/config.service';
import { Analysis, AuthenticityService } from '../src/domain/ai/authenticity.service';
import { LlmPort } from '../src/domain/ai/llm.port';
import { isConnectedText } from '../src/domain/ai/report-text';
import { GroupLevel } from '../src/domain/groups/level';
import { Report, ReportType } from '../src/domain/reports/report.entity';
import { Student } from '../src/domain/students/student.entity';
import { AnthropicLlmAdapter } from '../src/infra/ai/anthropic-llm.adapter';
import { ClaudeCliLlmAdapter } from '../src/infra/ai/claude-cli-llm.adapter';
import { FakeLlmAdapter } from '../src/infra/ai/fake-llm.adapter';

interface DumpReport {
  id: string;
  type: string;
  method?: string | null;
  source_title: string | null;
  episode?: string | null;
  pages: number | null;
  first_pass_pct: number | null;
  second_pass_pct?: number | null;
  listen_count?: number | null;
  is_forwarded?: boolean;
  created_at: string;
  raw_text: string;
}
interface DumpRow {
  flag_id: string;
  kind: string;
  status: string;
  reason: string;
  flagged_at: string;
  student: string;
  level: string | null;
  report: DumpReport;
  previous_reports: DumpReport[] | null;
}
interface Expected {
  students: string[];
  title: string;
  date?: string;
  verdict: 'FALSE' | 'REAL' | 'CHECK';
  note?: string;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

function toReport(d: DumpReport, studentId: string): Report {
  return Object.assign(new Report(), {
    id: d.id,
    studentId,
    type: d.type as ReportType,
    method: (d.method ?? null) as Report['method'],
    rawText: d.raw_text,
    sourceTitle: d.source_title,
    episode: d.episode ?? null,
    pages: d.pages,
    firstPassPct: d.first_pass_pct,
    secondPassPct: d.second_pass_pct ?? null,
    listenCount: d.listen_count ?? null,
    isForwarded: d.is_forwarded ?? false,
    unclearParts: [],
    aiMetrics: null,
    createdAt: new Date(d.created_at),
  });
}

function matchExpected(row: DumpRow, expected: Expected[]): Expected | undefined {
  const name = row.student.toLowerCase();
  const title = (row.report.source_title ?? '').toLowerCase();
  const day = row.flagged_at.slice(0, 10);
  const candidates = expected.filter(
    (e) =>
      e.students.some((s) => name.includes(s.toLowerCase().split(' ')[0])) &&
      new RegExp(e.title, 'i').test(title),
  );
  return candidates.find((e) => e.date === day) ?? candidates.find((e) => !e.date);
}

async function main(): Promise<void> {
  const [, , dumpPath] = process.argv;
  if (!dumpPath || dumpPath.startsWith('--')) {
    console.error(
      'usage: pnpm ai:authenticity-eval <flags-dump.json> [--expected file] [--limit N] [--out file]',
    );
    process.exit(1);
  }
  const rows = JSON.parse(readFileSync(dumpPath, 'utf8')) as DumpRow[];
  // The teacher's verdicts name students, so the file lives outside the repository.
  const expectedPath = arg('--expected');
  const expected = expectedPath
    ? (JSON.parse(readFileSync(expectedPath, 'utf8')) as Expected[])
    : [];
  const limit = Number(arg('--limit') ?? rows.length);

  const config = new AppConfigService(new ConfigService());
  const mode = config.aiMode;
  const llm: LlmPort =
    mode === 'fake'
      ? new FakeLlmAdapter()
      : mode === 'claude-cli'
        ? new ClaudeCliLlmAdapter(config)
        : new AnthropicLlmAdapter(config);
  const noop = {
    record: async () => undefined,
    recent: async () => [],
    setAiMetrics: async () => undefined,
  };
  const svc = new AuthenticityService(
    llm,
    noop as never,
    noop as never,
    noop as never,
    noop as never,
    config,
  );
  console.error(`[${mode}] ${rows.length} flag rows`);

  // One case per report: the old cards' kinds side by side.
  const byReport = new Map<string, DumpRow[]>();
  for (const r of rows) {
    const list = byReport.get(r.report.id) ?? [];
    list.push(r);
    byReport.set(r.report.id, list);
  }
  const cases = [...byReport.values()].slice(0, limit);

  const metricsCache = new Map<string, Report['aiMetrics']>();
  const results: Array<Record<string, unknown>> = [];
  let agree = 0;
  let judged = 0;
  for (const group of cases) {
    const row = group[0];
    const studentId = `student:${row.student}`;
    const student = Object.assign(new Student(), {
      id: studentId,
      level: (row.level as GroupLevel | null) ?? null,
      dialogState: {},
    });
    const target = toReport(row.report, studentId);
    const previous = (row.previous_reports ?? [])
      .filter((p) => p.type === row.report.type && isConnectedText(p.raw_text))
      .slice(0, 3)
      .map((p) => toReport(p, studentId));
    // Measure the history first: the style baseline the target is compared with.
    for (const p of previous) {
      if (!metricsCache.has(p.id)) {
        const a = await svc.analyze({ report: p, previous: [], student });
        metricsCache.set(p.id, a.metrics);
      }
      p.aiMetrics = metricsCache.get(p.id) ?? null;
    }
    const analysis: Analysis = await svc.analyze({ report: target, previous, student });
    const exp = matchExpected(row, expected);
    const flagged = analysis.kinds.length > 0;
    const ok = exp ? (exp.verdict === 'FALSE' ? !flagged : flagged) : null;
    if (ok !== null) {
      judged += 1;
      if (ok) agree += 1;
    }
    const oldKinds = group.map((g) => g.kind).join('+');
    const mark = ok === null ? '·' : ok ? '✓' : '✗';
    const base = analysis.baseline
      ? `, база: ${analysis.baseline.errorsPer100} по ${analysis.baseline.reports}`
      : ', базы нет';
    console.log(
      `${mark} ${row.student} · ${row.report.source_title ?? '—'} · ${row.flagged_at.slice(0, 10)}\n` +
        `    было: ${oldKinds}   стало: ${analysis.kinds.join('+') || 'нет'}   учитель: ${exp?.verdict ?? '?'}${exp?.note ? ` (${exp.note})` : ''}\n` +
        `    метрики: ${analysis.metrics.words} слов, ошибок/100 = ${analysis.metrics.errorsPer100}, выше уровня = ${analysis.metrics.advanced}${base}` +
        (analysis.dropped ? `, отброшено утверждений: ${analysis.dropped}` : '') +
        (analysis.kinds.length ? `\n    причины: ${Object.values(analysis.reasons).join(' | ')}` : ''),
    );
    results.push({
      student: row.student,
      title: row.report.source_title,
      flaggedAt: row.flagged_at,
      oldKinds: group.map((g) => g.kind),
      oldReason: row.reason,
      expected: exp ?? null,
      ok,
      analysis,
    });
  }
  console.log(
    `\nсовпало с учителем: ${agree} из ${judged} (без вердикта: ${cases.length - judged})`,
  );
  const out = arg('--out');
  if (out) writeFileSync(out, JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
