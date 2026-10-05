import { useMemo } from 'react';
import type { Report, Week } from '../api/types';
import { useProgress, useReports } from '../app/hooks';
import { ErrorBox, Loading, Screen } from '../app/Shell';
import { fmtDay, fmtWeek, words } from '../lib/dates';
import { Button, Cell, ListGroup, NormCell, SegmentedControl } from '../ui/components';

function subtitle(r: Report): string {
  const w = r.wordsAdded.length ? ` · +${words(r.wordsAdded.length)}` : '';
  if (r.type === 'READING') return `Чтение${r.pages ? ` · ${r.pages} стр.` : ''}${w}`;
  const pct =
    r.firstPassPct !== null
      ? `${r.firstPassPct}%${r.secondPassPct !== null ? ` → ${r.secondPassPct}%` : ''}`
      : '';
  const cnt = r.listenCount ? ` · ${r.listenCount} раз` : '';
  return `Аудирование${pct ? ` · ${pct}` : ''}${cnt}${w}`;
}

function WeekGroup({
  week,
  reports,
  header,
  footer,
}: {
  week: Week | null;
  reports: Report[];
  header: string;
  footer?: string;
}) {
  const r = week?.reading.done ?? reports.filter((x) => x.type === 'READING').length;
  const l = week?.listening.done ?? reports.filter((x) => x.type === 'LISTENING').length;
  return (
    <ListGroup header={header} footer={footer}>
      <div className="tr tr-cell tr-cell-static" style={{ gap: 16 }}>
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13,
            color: 'var(--ink-2)',
          }}
        >
          Чтение <NormCell value={r} max={week?.reading.norm ?? 3} />
        </span>
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13,
            color: 'var(--ink-2)',
          }}
        >
          Аудирование <NormCell value={l} max={week?.listening.norm ?? 3} />
        </span>
      </div>
      {reports.map((rep) =>
        rep.type === 'READING' ? (
          <Cell
            key={rep.id}
            cover={rep.sourceTitle ?? 'Книга'}
            title={rep.sourceTitle ?? 'Чтение'}
            subtitle={subtitle(rep)}
            date={fmtDay(rep.createdAt, { weekday: true })}
          />
        ) : (
          <Cell
            key={rep.id}
            podcast
            title={rep.sourceTitle ?? 'Аудирование'}
            subtitle={subtitle(rep)}
            date={fmtDay(rep.createdAt, { weekday: true })}
          />
        ),
      )}
    </ListGroup>
  );
}

/** 06 · Отчёты — history grouped by week. */
export function ReportsScreen() {
  const reports = useReports();
  const progress = useProgress();

  const groups = useMemo(() => {
    const map = new Map<string, Report[]>();
    for (const r of reports.data?.data ?? []) {
      const arr = map.get(r.weekStart) ?? [];
      arr.push(r);
      map.set(r.weekStart, arr);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [reports.data]);

  const thisWeek = progress.data?.week ?? null;
  const thisWeekKey = thisWeek?.weekStart;
  const hasThisWeek = groups.some(([k]) => k === thisWeekKey);
  const footer = thisWeek
    ? thisWeek.listening.done === 0
      ? 'Аудирования пока нет. Один подкаст — и будет 1/3.'
      : thisWeek.reading.done === 0
        ? 'Чтения пока нет. Десять страниц — и будет 1/3.'
        : undefined
    : undefined;

  return (
    <Screen
      tab="reports"
      head={
        <>
          <h1 className="tr-h1">Отчёты</h1>
          <SegmentedControl
            value="history"
            options={[
              { value: 'history', label: 'История', to: '/reports' },
              { value: 'method', label: 'Как слушать', to: '/reports/method' },
            ]}
            label="Раздел"
          />
        </>
      }
    >
      <Button variant="primary" size="lg" block icon="edit" to="/reports/new">
        Сдать отчёт
      </Button>

      {reports.error ? <ErrorBox error={reports.error} retry={() => reports.refetch()} /> : null}
      {reports.isLoading ? <Loading /> : null}

      {thisWeek && !hasThisWeek ? (
        <WeekGroup
          week={thisWeek}
          reports={[]}
          header={`Эта неделя · ${fmtWeek(thisWeek.weekStart)}`}
          footer={footer ?? 'Отчётов на этой неделе пока нет.'}
        />
      ) : null}
      {groups.map(([weekStart, list], i) => (
        <WeekGroup
          key={weekStart}
          week={weekStart === thisWeekKey ? thisWeek : null}
          reports={list}
          header={`${weekStart === thisWeekKey ? 'Эта неделя' : i === 0 || (i === 1 && hasThisWeek) ? 'Прошлая неделя' : 'Неделя'} · ${fmtWeek(weekStart)}`}
          footer={weekStart === thisWeekKey ? footer : undefined}
        />
      ))}
      {reports.data && reports.data.data.length === 0 && !thisWeek ? (
        <span className="tr-muted" style={{ textAlign: 'center' }}>
          Пока ни одного отчёта. Первый — выше.
        </span>
      ) : null}
    </Screen>
  );
}
