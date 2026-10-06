import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Button,
  Card,
  Cell,
  HealthDot,
  ListGroup,
  SegmentedControl,
  StatTile,
} from '../../ui/components';
import type { Overview } from '../api';
import { delta, fmtWeek, groupsOf, HEALTH_TONE, num, pct, silence } from '../format';
import { ErrorBox, Loading, PageHead, Shell } from '../Shell';
import { useAdminApi } from '../session';

/** 11 · Обзор недели. */
export function OverviewScreen() {
  const api = useAdminApi();
  const [week, setWeek] = useState<'this' | 'last'>('this');
  const q = useQuery({ queryKey: ['overview', week], queryFn: () => api.overview(week) });
  const o = q.data;
  const updated = o
    ? new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(
        new Date(o.generatedAt),
      )
    : '';
  return (
    <Shell>
      <PageHead
        title="Обзор недели"
        subtitle={o ? `${fmtWeek(o.weekStart)} · обновлено сегодня в ${updated}` : '…'}
        aside={
          <SegmentedControl
            desktop
            value={week}
            onChange={setWeek}
            label="Период"
            options={[
              { value: 'this', label: 'Эта неделя' },
              { value: 'last', label: 'Прошлая' },
            ]}
          />
        }
      />
      {q.isLoading ? <Loading /> : null}
      {q.error ? <ErrorBox error={q.error} retry={() => q.refetch()} /> : null}
      {o ? <Body o={o} /> : null}
    </Shell>
  );
}

function Body({ o }: { o: Overview }) {
  const r = delta(o.stats.readingRateDelta);
  const l = delta(o.stats.listeningRateDelta);
  const perStudent =
    o.stats.activeStudents > 0 ? Math.round(o.stats.cardsThisWeek / o.stats.activeStudents) : 0;
  const [copied, setCopied] = useState(false);
  const topText = o.topReaders.map((t, i) => `${i + 1}. ${t.name} — ${t.pages} стр.`).join('\n');
  const copyTop = () => {
    void navigator.clipboard?.writeText(
      `Топ читателей недели (${fmtWeek(o.weekStart)}):\n${topText}`,
    );
    setCopied(true);
  };
  return (
    <>
      <div className="ad-grid ad-grid-5">
        <StatTile
          label="Активных студентов"
          value={num(o.stats.activeStudents)}
          note={`${o.stats.groups} групп · ${o.stats.archivedStudents} в архиве`}
        />
        <StatTile
          label="Норма по чтению"
          value={pct(o.stats.readingRate)}
          note={r.text}
          noteTone={r.tone}
        />
        <StatTile
          label="Норма по аудированию"
          value={pct(o.stats.listeningRate)}
          note={l.text}
          noteTone={l.tone}
        />
        <StatTile
          label="Карточек за неделю"
          value={num(o.stats.cardsThisWeek)}
          note={`≈ ${perStudent} на студента`}
        />
        <StatTile
          label="Новых флагов"
          value={o.stats.newFlags}
          tone={o.stats.newFlags > 0 ? 'bad' : undefined}
          note={<Link to="/flags">Открыть входящие</Link>}
        />
      </div>

      <div className="ad-grid ad-grid-2">
        <Card desktop title="Здоровье по группам">
          <div
            style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--ink-2)', marginTop: -8 }}
          >
            <HealthDot status="good" />
            <HealthDot status="warn" />
            <HealthDot status="bad" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {o.healthByGroup.map((g) => (
              <div
                key={g.chatId}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '110px minmax(0, 1fr) 84px',
                  gap: 12,
                  alignItems: 'center',
                }}
              >
                <Link
                  to={`/students?group=${g.chatId}`}
                  style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}
                >
                  {g.title}
                </Link>
                <div
                  style={{ display: 'flex', gap: 2, height: 12 }}
                  role="img"
                  aria-label={`${g.title}: активны ${g.good}, отстают ${g.warn}, проблема ${g.bad}`}
                >
                  {g.members === 0 ? (
                    <span style={{ flexGrow: 1, background: 'var(--line)', borderRadius: 3 }} />
                  ) : null}
                  <span
                    title={`Активны: ${g.good}`}
                    style={{
                      flexGrow: g.good,
                      flexBasis: 0,
                      background: 'var(--good)',
                      borderRadius: 3,
                    }}
                  />
                  <span
                    title={`Отстают: ${g.warn}`}
                    style={{
                      flexGrow: g.warn,
                      flexBasis: 0,
                      background: 'var(--warn)',
                      borderRadius: 3,
                    }}
                  />
                  <span
                    title={`Проблема: ${g.bad}`}
                    style={{
                      flexGrow: g.bad,
                      flexBasis: 0,
                      background: 'var(--bad)',
                      borderRadius: 3,
                    }}
                  />
                </div>
                <span
                  className="ad-num"
                  style={{ fontSize: 12, color: 'var(--ink-2)', textAlign: 'right' }}
                >
                  {g.good} · {g.warn} · {g.bad}
                </span>
              </div>
            ))}
          </div>
          <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>
            Итого: {o.healthTotals.good} активны · {o.healthTotals.warn} отстают ·{' '}
            {o.healthTotals.bad} проблемных
          </span>
        </Card>

        <Card desktop title="Выполнение норм, 8 недель">
          <div
            style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--ink-2)', marginTop: -8 }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span
                style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--chart-1)' }}
              />
              чтение
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span
                style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--chart-2)' }}
              />
              аудирование
            </span>
          </div>
          <HistoryChart history={o.history} />
          <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>
            Доля активных студентов, выполнивших норму недели.
          </span>
        </Card>
      </div>

      <div className="ad-grid ad-grid-2">
        <ListGroup
          desktop
          header="Топ-3 читателя недели"
          footer="Текст для поста в группу — публикуете сами."
        >
          {o.topReaders.length === 0 ? (
            <div className="tr-cell tr-cell-static">
              <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                Отчётов о чтении пока нет.
              </span>
            </div>
          ) : null}
          {o.topReaders.map((t, i) => (
            <Cell
              key={t.id}
              to={`/students/${t.id}`}
              tile={String(i + 1)}
              tileTone={i === 0 ? 'solid' : i === 1 ? 'brand' : 'neutral'}
              title={t.name}
              subtitle={groupsOf(t)}
              date={`${t.pages} стр.`}
            />
          ))}
          {o.topReaders.length > 0 ? (
            <div className="tr-cell tr-cell-static">
              <Button variant={copied ? 'good' : 'tonal'} size="sm" icon="copy" onClick={copyTop}>
                {copied ? 'Скопировано' : 'Скопировать для группы'}
              </Button>
            </div>
          ) : null}
        </ListGroup>

        <ListGroup desktop header="Нужно внимание · тишина и недели без нормы">
          {o.attention.length === 0 ? (
            <div className="tr-cell tr-cell-static">
              <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>Все студенты активны.</span>
            </div>
          ) : null}
          {o.attention.map((s) => (
            <Cell
              key={s.id}
              to={`/students/${s.id}`}
              avatar={s.name}
              avatarTone={HEALTH_TONE[s.health]}
              title={s.name}
              subtitle={`${groupsOf(s)} · ${s.noReportsForWeeks ? `${s.noReportsForWeeks} нед. без отчётов · ` : ''}${silence(s.silentDays, s.dmBlocked)}`}
              norms={`${s.week.reading}/${s.week.readingNorm} ${s.week.listening}/${s.week.listeningNorm}`}
              health={s.health}
              chevron
            />
          ))}
        </ListGroup>
      </div>
    </>
  );
}

/** "22–28" — day numbers of a Monday-based week for the chart axis. */
function weekDays(weekStart: string): string {
  const start = new Date(`${weekStart}T12:00:00`);
  const end = new Date(start.getTime() + 6 * 86_400_000);
  return `${start.getDate()}–${end.getDate()}`;
}

function HistoryChart({ history }: { history: Overview['history'] }) {
  const W = 560;
  const left = 36;
  const slot = (W - 10 - left) / Math.max(history.length, 1);
  const y = (v: number) => 190 - v * 180;
  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} 210`}
      height={150}
      role="img"
      aria-label="Доля студентов, выполнивших норму, по неделям: чтение и аудирование"
    >
      <g stroke="var(--line)" strokeWidth={1}>
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <line
            key={v}
            x1={left}
            y1={y(v)}
            x2={W - 10}
            y2={y(v)}
            stroke={v === 0 ? 'var(--line-strong)' : undefined}
          />
        ))}
      </g>
      <g fill="var(--ink-3)" fontSize={10} fontFamily="Onest, sans-serif" textAnchor="end">
        {[1, 0.75, 0.5, 0.25, 0].map((v) => (
          <text key={v} x={left - 6} y={y(v) + 4}>
            {v === 1 ? '100%' : Math.round(v * 100)}
          </text>
        ))}
      </g>
      {history.map((w, i) => {
        const xc = left + slot * i + slot / 2;
        const label = weekDays(w.weekStart);
        return (
          <g key={w.weekStart}>
            <rect
              x={xc - 23}
              y={y(w.reading)}
              width={22}
              height={190 - y(w.reading)}
              rx={3}
              fill="var(--chart-1)"
            >
              <title>{`Чтение, ${fmtWeek(w.weekStart)}: ${pct(w.reading)}`}</title>
            </rect>
            <rect
              x={xc + 1}
              y={y(w.listening)}
              width={22}
              height={190 - y(w.listening)}
              rx={3}
              fill="var(--chart-2)"
            >
              <title>{`Аудирование, ${fmtWeek(w.weekStart)}: ${pct(w.listening)}`}</title>
            </rect>
            <text
              x={xc}
              y={206}
              textAnchor="middle"
              fontSize={10}
              fill="var(--ink-3)"
              fontFamily="Onest, sans-serif"
            >
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
