import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, Callout, Card, Cell, Chip } from '../../ui/components';
import type { FlagKind, FlagStatus, FlagView } from '../api';
import {
  FLAG_SHORT,
  FLAG_STATUS_LABEL,
  FLAG_TITLE,
  fmtDay,
  groupsOf,
  HEALTH_TONE,
  reportMeta,
  reportText,
} from '../format';
import { Empty, ErrorBox, errorText, Loading, Shell } from '../Shell';
import { useAdminApi } from '../session';

type StatusFilter = 'NEW' | 'ALL';
type KindFilter = 'ALL' | FlagKind;
const KIND_CHIPS: KindFilter[] = [
  'ALL',
  'PCT_JUMP',
  'NORM_MISSED_WEEK',
  'TOO_POLISHED',
  'FORWARDED',
  'SPOT_CHECK_FAILED',
  'REPEATED_RETELLING',
  'STYLE_MISMATCH',
];

/** 13 · Флаги: inbox pane + the selected flag with its report and the previous ones. */
export function FlagsScreen() {
  const api = useAdminApi();
  const navigate = useNavigate();
  const { id } = useParams();
  const [status, setStatus] = useState<StatusFilter>('NEW');
  const [kind, setKind] = useState<KindFilter>('ALL');
  const list = useQuery({
    queryKey: ['flags', { status, kind }],
    queryFn: () =>
      api.flags.list({
        status: status === 'NEW' ? 'NEW' : undefined,
        kind: kind === 'ALL' ? undefined : kind,
      }),
  });
  const rows = list.data ?? [];
  const firstId = rows[0]?.id;
  useEffect(() => {
    if (!id && firstId) navigate(`/flags/${firstId}`, { replace: true });
  }, [id, firstId, navigate]);

  const pane = (
    <section className="ad-pane">
      <div className="ad-pane-head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <h1 className="ad-h2">Флаги · входящие</h1>
          <span className="ad-sub">Только пометки: отчёты засчитаны, студент ничего не видит</span>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Chip selected={status === 'NEW'} onClick={() => setStatus('NEW')}>
            Новые
          </Chip>
          <Chip selected={status === 'ALL'} onClick={() => setStatus('ALL')}>
            Все
          </Chip>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {KIND_CHIPS.map((k) => (
            <Chip key={k} selected={kind === k} onClick={() => setKind(k)}>
              {k === 'ALL' ? 'Все типы' : FLAG_SHORT[k]}
            </Chip>
          ))}
        </div>
      </div>
      <div className="ad-pane-list">
        {list.isLoading ? <Loading /> : null}
        {list.error ? <ErrorBox error={list.error} retry={() => list.refetch()} /> : null}
        {list.data && rows.length === 0 ? <Empty>Флагов нет — входящие пусты.</Empty> : null}
        {rows.map((f) => (
          <Cell
            key={f.id}
            to={`/flags/${f.id}`}
            current={f.id === id}
            avatar={f.student?.name ?? '?'}
            avatarTone={
              f.student && 'health' in f.student
                ? HEALTH_TONE[(f.student as { health: 'good' | 'warn' | 'bad' }).health]
                : 'neutral'
            }
            title={f.student?.name ?? 'Студент'}
            subtitle={
              f.reason
                ? f.reason.length > 70
                  ? `${f.reason.slice(0, 70)}…`
                  : f.reason
                : FLAG_TITLE[f.kind]
            }
            badge={FLAG_SHORT[f.kind]}
            badgeTone="code"
            className={f.status === 'NEW' ? undefined : 'ad-dim'}
          />
        ))}
      </div>
    </section>
  );

  return (
    <Shell pane={pane}>{id ? <FlagDetail id={id} /> : <Empty>Выберите флаг слева.</Empty>}</Shell>
  );
}

function FlagDetail({ id }: { id: string }) {
  const api = useAdminApi();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['flag', id], queryFn: () => api.flags.one(id) });
  const review = useMutation({
    mutationFn: (status: 'REVIEWED' | 'DISMISSED') => api.flags.review(id, status),
    onSuccess: (flag: FlagView) => {
      const cur = q.data;
      if (cur)
        qc.setQueryData(['flag', id], { ...cur, status: flag.status, reviewedAt: flag.reviewedAt });
      void qc.invalidateQueries({ queryKey: ['flags'] });
      void qc.invalidateQueries({ queryKey: ['nav-counts'] });
      void qc.invalidateQueries({ queryKey: ['overview'] });
    },
  });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} retry={() => q.refetch()} />;
  const f = q.data;
  if (!f) return null;
  const open = f.status === 'NEW';
  const when = fmtDay(f.createdAt, { weekday: true });
  const stateTone = (s: FlagStatus): 'bad' | 'good' | 'neutral' =>
    s === 'NEW' ? 'bad' : s === 'REVIEWED' ? 'good' : 'neutral';
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Badge tone="code">{f.kind}</Badge>
          <h2 className="ad-h2">{FLAG_TITLE[f.kind]}</h2>
        </div>
        <div
          style={{
            display: 'flex',
            gap: 12,
            alignItems: 'center',
            fontSize: 13,
            color: 'var(--ink-2)',
            flexWrap: 'wrap',
          }}
        >
          {f.student ? (
            <Link to={`/students/${f.student.id}`} style={{ fontWeight: 600 }}>
              {f.student.name}
            </Link>
          ) : null}
          {f.student ? <span>{groupsOf(f.student)}</span> : null}
          <span>{when}</span>
          <Badge tone={stateTone(f.status)}>{FLAG_STATUS_LABEL[f.status]}</Badge>
        </div>
        {open ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              variant="dark"
              size="md"
              icon="check"
              disabled={review.isPending}
              onClick={() => review.mutate('REVIEWED')}
            >
              Проверено
            </Button>
            <Button
              variant="secondary"
              size="md"
              disabled={review.isPending}
              onClick={() => review.mutate('DISMISSED')}
            >
              Ложная тревога
            </Button>
          </div>
        ) : null}
        {review.error ? <Callout tone="bad">{errorText(review.error)}</Callout> : null}
      </div>

      <Callout tone="bad" title="Почему флаг">
        {f.reason ?? 'Причина не записана.'}
      </Callout>

      <div className="ad-grid ad-grid-2">
        <Card
          desktop
          title="Отчёт с флагом"
          meta={f.report ? fmtDay(f.report.createdAt, { weekday: true }) : when}
        >
          {f.report ? (
            <>
              <p className="ad-box">{reportText(f.report)}</p>
              <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>
                Разобрано: {reportMeta(f.report)}
                {f.report.isForwarded ? ' · переслано' : ''}
              </span>
            </>
          ) : (
            <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>
              Флаг не привязан к отчёту{f.student ? ` — см. карточку студента` : ''}.
            </span>
          )}
        </Card>
        <Card desktop title="Предыдущие отчёты" meta="для сравнения">
          {f.previousReports.length === 0 ? (
            <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>
              Предыдущих отчётов этого типа нет.
            </span>
          ) : null}
          {f.previousReports.map((p) => (
            <div
              key={p.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                padding: '10px 12px',
                borderRadius: 12,
                background: 'var(--surface-2)',
              }}
            >
              <span style={{ fontSize: 11, color: 'var(--ink-2)' }}>
                {fmtDay(p.createdAt, { weekday: true })} · {reportMeta(p)}
              </span>
              <span style={{ fontSize: 13, lineHeight: '19px', whiteSpace: 'pre-line' }}>
                {reportText(p)}
              </span>
            </div>
          ))}
        </Card>
      </div>

      <Callout tone="info">
        Ваши отметки «проверено» и «ложная тревога» помогают настроить проверку. Финальный барьер —
        не алгоритм: флаг даёт повод спросить студента лично.
      </Callout>
    </>
  );
}
