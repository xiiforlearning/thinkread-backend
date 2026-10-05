import { useMutation } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import type { Cefr, Word, WordsQuery } from '../api/types';
import { downloadText, useRecommendations, useSummary, useWords } from '../app/hooks';
import { ErrorBox, Loading, Screen } from '../app/Shell';
import { useApi } from '../app/session';
import { words as wordsLabel } from '../lib/dates';
import {
  Button,
  Card,
  Cell,
  Chip,
  Icon,
  IconButton,
  ListGroup,
  SearchField,
  type Tone,
} from '../ui/components';

type Filter = 'all' | 'learning' | 'priority' | 'learned';
const TONES: Tone[] = ['brand', 'listen', 'cards', 'rose'];
const CEFR: Array<Cefr | ''> = ['', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

function toQuery(f: Filter, q: string, cefr: Cefr | ''): WordsQuery {
  const base: WordsQuery = { limit: 100, q: q.trim() || undefined, cefr: cefr || undefined };
  if (f === 'learning') return { ...base, status: 'LEARNING' };
  if (f === 'learned') return { ...base, status: 'LEARNED' };
  if (f === 'priority') return { ...base, priority: 'HIGH' };
  return base;
}

function sub(w: Word): string {
  const t = w.translation ?? 'перевод подбирается…';
  if (w.priority === 'HIGH' && w.status !== 'LEARNED')
    return `${t} · приоритет${w.source === 'TEACHER' ? ' · от учителя' : ''}`;
  return t;
}

/** 03 · Словарь */
export function DictionaryScreen() {
  const api = useApi();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [cefr, setCefr] = useState<Cefr | ''>('');
  const query = useMemo(() => toQuery(filter, q, cefr), [filter, q, cefr]);
  const words = useWords(query);
  const summary = useSummary();
  const recs = useRecommendations();

  const exportCsv = useMutation({
    mutationFn: () => api.words.exportText('csv'),
    onSuccess: (f) => downloadText(f.filename, f.content),
  });

  const s = summary.data;
  const teacher = recs.data?.[0];
  const missing = recs.data?.reduce((n, r) => n + r.items.length, 0) ?? 0;
  const items = words.data ?? [];
  const header =
    filter === 'learned'
      ? `Выучено · ${s?.learned ?? ''}`
      : filter === 'learning'
        ? `Изучается · ${s?.learning ?? ''}`
        : filter === 'priority'
          ? `Приоритетные · ${s?.priority ?? ''}`
          : `Все слова · ${s?.total ?? ''}`;

  return (
    <Screen
      tab="dict"
      head={
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 className="tr-h1" style={{ flexGrow: 1 }}>
              Словарь{' '}
              {s ? (
                <span
                  style={{ fontSize: 15, fontWeight: 500, color: 'var(--ink-2)', letterSpacing: 0 }}
                >
                  · {wordsLabel(s.total)}
                </span>
              ) : null}
            </h1>
            <IconButton
              icon="download"
              label="Экспорт CSV"
              onClick={() => exportCsv.mutate()}
              disabled={exportCsv.isPending}
            />
          </div>
          <SearchField
            placeholder="Найти слово или перевод"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="tr-chips">
            {(
              [
                ['all', 'Все'],
                ['learning', 'Изучается'],
                ['priority', 'Приоритетные'],
                ['learned', 'Выучено'],
              ] as Array<[Filter, string]>
            ).map(([k, label]) => (
              <Chip key={k} selected={filter === k} onClick={() => setFilter(k)}>
                {label}
              </Chip>
            ))}
            <Chip
              icon="chevron-down"
              selected={cefr !== ''}
              onClick={() => setCefr(CEFR[(CEFR.indexOf(cefr) + 1) % CEFR.length])}
            >
              CEFR: {cefr || 'все'}
            </Chip>
          </div>
        </>
      }
    >
      {teacher && filter === 'all' && !q ? (
        <Card
          tone="wash-brand"
          title="Рекомендовано учителем"
          meta={`${teacher.list.title} · ${wordsLabel(missing)}`}
          to="/words/teacher"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="tr-muted" style={{ flexGrow: 1, color: 'var(--on-brand-wash)' }}>
              Список для твоей группы. {missing} из него у тебя ещё нет — посмотри и добавь одним
              нажатием.
            </span>
            <Icon name="chevron-right" label="Открыть список" />
          </div>
        </Card>
      ) : null}
      <Button variant="tonal" size="md" block icon="plus" to="/words/add">
        Добавить слова
      </Button>

      {words.error ? <ErrorBox error={words.error} retry={() => words.refetch()} /> : null}
      {exportCsv.error ? <ErrorBox error={exportCsv.error} /> : null}

      <ListGroup
        header={header}
        footer={words.data ? `Показано ${items.length}${s ? ` из ${s.total}` : ''}.` : undefined}
      >
        {words.isLoading ? <Loading /> : null}
        {items.map((w, i) => (
          <Cell
            key={w.id}
            to={`/words/${w.id}`}
            tile={w.word[0]}
            tileTone={TONES[i % 4]}
            title={w.word}
            subtitle={sub(w)}
            badge={w.status === 'LEARNED' ? 'выучено' : (w.cefr ?? undefined)}
            badgeTone={w.status === 'LEARNED' ? 'good' : 'brand'}
          />
        ))}
        {words.data && items.length === 0 ? (
          <div
            style={{
              padding: '24px 16px',
              textAlign: 'center',
              color: 'var(--ink-2)',
              fontSize: 14,
            }}
          >
            Ничего не нашлось. Попробуй другое слово или добавь его в словарь.
          </div>
        ) : null}
      </ListGroup>
    </Screen>
  );
}
