import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { Report, Word } from '../../api/types';
import { fmtRelative } from '../../lib/dates';
import {
  Avatar,
  Badge,
  Button,
  Callout,
  Card,
  Cell,
  ChatMessage,
  Chip,
  Composer,
  DayCell,
  HealthDot,
  IconButton,
  ListGroup,
  NormCell,
  SearchField,
  Select,
  StatTile,
  TextField,
} from '../../ui/components';
import type { ChatReply, FlagView, Health, StudentCard, StudentRow } from '../api';
import {
  FLAG_STATUS_LABEL,
  fmtDay,
  fmtWeek,
  groupsOf,
  HEALTH_TONE,
  levelOf,
  reportMeta,
  reportText,
  silence,
} from '../format';
import { Empty, ErrorBox, errorText, Loading, Shell, SoonBadge } from '../Shell';
import { useAdminApi, useIsOwner } from '../session';

type HealthFilter = 'all' | Health;

/** 12 · Студенты: list pane (search, health chips, group) + the selected student's card. */
export function StudentsScreen() {
  const api = useAdminApi();
  const navigate = useNavigate();
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [health, setHealth] = useState<HealthFilter>(
    (params.get('health') as HealthFilter) ?? 'all',
  );
  const group = params.get('group') ?? '';

  const groups = useQuery({ queryKey: ['groups'], queryFn: () => api.groups.list() });
  const list = useQuery({
    queryKey: ['students', { q, health, group }],
    queryFn: () =>
      api.students.list({
        q: q || undefined,
        health: health === 'all' ? undefined : health,
        groupChatId: group ? Number(group) : undefined,
      }),
  });
  const rows = list.data ?? [];
  const firstId = rows[0]?.id;

  // Without an id the first row (most problematic) is selected, like the artboard.
  useEffect(() => {
    if (!id && firstId) navigate(`/students/${firstId}`, { replace: true });
  }, [id, firstId, navigate]);

  const chips: Array<[HealthFilter, string]> = [
    ['all', 'Все'],
    ['bad', 'Проблема'],
    ['warn', 'Отстаёт'],
    ['good', 'Активен'],
  ];
  const pane = (
    <section className="ad-pane">
      <div className="ad-pane-head">
        <h1 className="ad-h2">Студенты</h1>
        <SearchField
          placeholder="Поиск по имени"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {chips.map(([key, label]) => (
            <Chip key={key} selected={health === key} onClick={() => setHealth(key)}>
              {label}
            </Chip>
          ))}
        </div>
        <Select
          size="sm"
          label="Группа"
          value={group}
          onChange={(e) => {
            const next = new URLSearchParams(params);
            if (e.target.value) next.set('group', e.target.value);
            else next.delete('group');
            setParams(next, { replace: true });
          }}
          options={[
            { value: '', label: 'Группа: все' },
            ...(groups.data ?? []).map((g) => ({ value: String(g.chatId), label: g.title })),
          ]}
        />
        <span className="tr-eyebrow">
          Проблемные наверху · {rows.length}
          {list.data ? '' : '…'}
        </span>
      </div>
      <div className="ad-pane-list">
        {list.isLoading ? <Loading /> : null}
        {list.error ? <ErrorBox error={list.error} retry={() => list.refetch()} /> : null}
        {list.data && rows.length === 0 ? <Empty>Никого не нашлось.</Empty> : null}
        {rows.map((s) => (
          <StudentCell key={s.id} s={s} current={s.id === id} />
        ))}
      </div>
    </section>
  );

  return (
    <Shell pane={pane}>
      {id ? <StudentDetail id={id} /> : <Empty>Выберите студента слева.</Empty>}
    </Shell>
  );
}

function StudentCell({ s, current }: { s: StudentRow; current: boolean }) {
  return (
    <Cell
      to={`/students/${s.id}`}
      current={current}
      avatar={s.name}
      avatarTone={HEALTH_TONE[s.health]}
      title={s.name}
      subtitle={`${silence(s.silentDays, s.dmBlocked)} · ${groupsOf(s)}`}
      norms={`${s.week.reading}/${s.week.readingNorm} ${s.week.listening}/${s.week.listeningNorm}`}
      health={s.health}
      flag={s.newFlags > 0}
    />
  );
}

function wash(done: number, norm: number): 'good' | 'warn' | 'bad' {
  return done >= norm ? 'good' : done > 0 ? 'warn' : 'bad';
}

function StudentDetail({ id }: { id: string }) {
  const api = useAdminApi();
  const owner = useIsOwner();
  const qc = useQueryClient();
  const card = useQuery({ queryKey: ['student', id], queryFn: () => api.students.one(id) });
  const reports = useQuery({
    queryKey: ['student-reports', id],
    queryFn: () => api.students.reports(id, 50),
  });
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState('');
  const [showWords, setShowWords] = useState(false);
  const [parent, setParent] = useState<ChatReply | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setRenaming(false);
    setShowWords(false);
    setParent(null);
    setNotice(null);
  }, [id]);

  const apply = (next: StudentCard) => {
    qc.setQueryData(['student', id], next);
    void qc.invalidateQueries({ queryKey: ['students'] });
    void qc.invalidateQueries({ queryKey: ['overview'] });
  };
  const rename = useMutation({
    mutationFn: (name: string | null) => api.students.rename(id, name),
    onSuccess: (next) => {
      apply(next);
      setRenaming(false);
    },
  });
  const archive = useMutation({
    mutationFn: (restore: boolean) =>
      restore ? api.students.restore(id) : api.students.archive(id),
    onSuccess: apply,
  });
  const recheck = useMutation({
    mutationFn: () => api.students.recheck(id),
    onSuccess: (res) => {
      apply(res);
      setNotice(
        res.action === 'NONE' || res.action === 'KEEP'
          ? 'Членство подтверждено, ничего не изменилось.'
          : `Результат сверки: ${res.action}${res.levelChanged ? ', уровень обновлён' : ''}.`,
      );
    },
  });
  const review = useMutation({
    mutationFn: (v: { flagId: string; status: 'REVIEWED' | 'DISMISSED' }) =>
      api.flags.review(v.flagId, v.status),
    onSuccess: (flag) => {
      const cur = qc.getQueryData<StudentCard>(['student', id]);
      if (cur)
        apply({
          ...cur,
          flags: cur.flags.map((f) =>
            f.id === flag.id ? { ...f, ...flag, student: f.student } : f,
          ),
        });
      void qc.invalidateQueries({ queryKey: ['flags'] });
      void qc.invalidateQueries({ queryKey: ['nav-counts'] });
    },
  });
  const parentReport = useMutation({
    mutationFn: () => api.ai.parentReport(id),
    onSuccess: setParent,
  });

  if (card.isLoading) return <Loading />;
  if (card.error) return <ErrorBox error={card.error} retry={() => card.refetch()} />;
  if (!card.data) return null;
  const { student: s, calendar, words, flags, canEdit } = card.data;
  const archived = s.status === 'ARCHIVED';
  const thisWeek = calendar[0];
  const activityDays = new Set((reports.data?.data ?? []).map((r) => r.createdAt.slice(0, 10)));
  const mutationError = [rename, archive, recheck, review, parentReport].find(
    (m) => m.error,
  )?.error;

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Avatar name={s.name} size="lg" tone={HEALTH_TONE[s.health]} />
          <div
            style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}
          >
            {renaming ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  rename.mutate(draft.trim() || null);
                }}
                style={{ display: 'flex', gap: 8, maxWidth: 420, alignItems: 'flex-end' }}
              >
                <TextField
                  label="Отображаемое имя (пусто — настоящее)"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  style={{ flexGrow: 1 }}
                  autoFocus
                />
                <Button variant="primary" size="md" type="submit" disabled={rename.isPending}>
                  Сохранить
                </Button>
                <Button variant="ghost" size="md" onClick={() => setRenaming(false)}>
                  Отмена
                </Button>
              </form>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 className="ad-h2" style={{ whiteSpace: 'nowrap' }}>
                  {s.name}
                </h2>
                {canEdit ? (
                  <IconButton
                    icon="edit"
                    label="Переименовать"
                    size="sm"
                    quiet
                    onClick={() => {
                      setDraft(s.displayName ?? '');
                      setRenaming(true);
                    }}
                  />
                ) : null}
              </div>
            )}
            <div
              style={{
                display: 'flex',
                gap: 12,
                fontSize: 13,
                color: 'var(--ink-2)',
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <HealthDot status={s.health} />
              <Badge tone={archived ? 'neutral' : s.dmBlocked ? 'bad' : 'good'}>
                {archived ? 'В архиве' : s.dmBlocked ? 'Бот заблокирован' : 'Доступ активен'}
              </Badge>
              <span>
                {groupsOf(s)} · {levelOf(s.level)}
              </span>
              {s.username ? <span>@{s.username}</span> : null}
              <span>Активность: {s.lastActivityAt ? fmtRelative(s.lastActivityAt) : '—'}</span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Button
            variant="dark"
            size="sm"
            icon="copy"
            disabled={!api.features.parentReport || parentReport.isPending}
            onClick={() => (parent ? setParent(null) : parentReport.mutate())}
          >
            {parentReport.isPending ? 'Собираю факты…' : 'Отчёт родителям'}
          </Button>
          {!api.features.parentReport ? <SoonBadge /> : null}
          {owner ? (
            <Button
              variant="secondary"
              size="sm"
              disabled={archive.isPending}
              onClick={() => {
                if (
                  archived ||
                  window.confirm(`Архивировать ${s.name}? История сохранится, доступ закроется.`)
                )
                  archive.mutate(archived);
              }}
            >
              {archived ? 'Восстановить' : 'Архивировать'}
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            icon="refresh"
            disabled={recheck.isPending}
            onClick={() => recheck.mutate()}
          >
            {recheck.isPending ? 'Сверяю…' : 'Проверить членство'}
          </Button>
        </div>
      </div>

      {notice ? <Callout tone="info">{notice}</Callout> : null}
      {mutationError ? <Callout tone="bad">{errorText(mutationError)}</Callout> : null}

      {parent ? (
        <Card desktop title="Отчёт для родителей" meta="текущий месяц">
          <p className="ad-box">{parent.text}</p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <CopyButton text={parent.text} />
            <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>
              Текст на русском, собран AI из фактов за период. Проверьте и перешлите сами.
            </span>
          </div>
        </Card>
      ) : null}

      <div className="ad-grid ad-grid-4" style={{ gap: 12 }}>
        <StatTile label="Слов" value={words.total} />
        <StatTile label="Выучено" value={words.learned} tone="good" />
        <StatTile
          label="Чтение, неделя"
          value={thisWeek ? `${thisWeek.reading.done}/${thisWeek.reading.norm}` : '—'}
          wash={thisWeek ? wash(thisWeek.reading.done, thisWeek.reading.norm) : undefined}
        />
        <StatTile
          label="Аудирование, неделя"
          value={thisWeek ? `${thisWeek.listening.done}/${thisWeek.listening.norm}` : '—'}
          wash={thisWeek ? wash(thisWeek.listening.done, thisWeek.listening.norm) : undefined}
        />
      </div>

      <Card
        desktop
        title="Тихие флаги"
        meta={
          flags.filter((f) => f.status === 'NEW').length
            ? `${flags.filter((f) => f.status === 'NEW').length} новых`
            : 'нет новых'
        }
      >
        {flags.length === 0 ? (
          <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>
            Флагов нет — всё согласуется с историей.
          </span>
        ) : null}
        {flags.map((f) => (
          <FlagRow
            key={f.id}
            f={f}
            busy={review.isPending}
            onReview={(status) => review.mutate({ flagId: f.id, status })}
          />
        ))}
      </Card>

      <TeacherChat id={id} name={s.name} />

      <Card desktop title="Нормы по неделям" meta="чтение · аудирование · дни с отчётами">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {calendar.map((w) => (
            <div
              key={w.weekStart}
              style={{
                display: 'grid',
                gridTemplateColumns: '88px 44px 44px minmax(0, 1fr)',
                gap: 8,
                alignItems: 'center',
              }}
            >
              <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{fmtWeek(w.weekStart)}</span>
              <NormCell value={w.reading.done} max={w.reading.norm} title="чтение" />
              <NormCell value={w.listening.done} max={w.listening.norm} title="аудирование" />
              <span
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                  gap: 3,
                }}
              >
                {Array.from({ length: 7 }, (_, i) => {
                  const d = new Date(`${w.weekStart}T12:00:00`);
                  d.setDate(d.getDate() + i);
                  const key = d.toISOString().slice(0, 10);
                  const has = activityDays.has(key);
                  return (
                    <DayCell
                      key={key}
                      level={has ? 2 : 0}
                      title={`${fmtDay(d, { weekday: true })}: ${has ? 'отчёт' : 'нет отчётов'}`}
                    />
                  );
                })}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <ListGroup desktop header="Лента отчётов · исходный текст и разбор">
        {reports.isLoading ? <Loading /> : null}
        {reports.data && reports.data.data.length === 0 ? (
          <div className="tr-cell tr-cell-static">
            <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>Отчётов пока нет.</span>
          </div>
        ) : null}
        {(reports.data?.data ?? []).slice(0, 12).map((r) => (
          <ReportCell key={r.id} r={r} />
        ))}
        <div className="tr-cell tr-cell-static">
          <Button variant="ghost" size="sm" icon="book" onClick={() => setShowWords((v) => !v)}>
            {showWords ? 'Скрыть словарь' : `Показать словарь студента (${words.total})`}
          </Button>
        </div>
      </ListGroup>
      {showWords ? <WordsCard id={id} /> : null}
    </>
  );
}

function FlagRow({
  f,
  busy,
  onReview,
}: {
  f: FlagView;
  busy: boolean;
  onReview: (s: 'REVIEWED' | 'DISMISSED') => void;
}) {
  const open = f.status === 'NEW';
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: '12px 14px',
        borderRadius: 12,
        background: open ? 'var(--bad-wash)' : 'var(--surface-2)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Badge tone="code">{f.kind}</Badge>
        <span style={{ fontSize: 12, color: 'var(--ink-2)', flexGrow: 1 }}>
          {fmtDay(f.createdAt, { weekday: true })}
        </span>
        <Badge tone={open ? 'bad' : 'neutral'}>{FLAG_STATUS_LABEL[f.status]}</Badge>
      </div>
      <span style={{ fontSize: 13, lineHeight: '18px' }}>{f.reason ?? '—'}</span>
      {open ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <Button variant="dark" size="sm" disabled={busy} onClick={() => onReview('REVIEWED')}>
            Проверено
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => onReview('DISMISSED')}
          >
            Ложная тревога
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function ReportCell({ r }: { r: Report & { rawText?: string } }) {
  const text = reportText(r);
  return (
    <Cell
      cover={r.type === 'READING' ? (r.sourceTitle ?? 'Книга') : undefined}
      podcast={r.type === 'LISTENING'}
      title={
        <span style={{ fontWeight: 400 }}>
          «{text.length > 160 ? `${text.slice(0, 160)}…` : text}»
        </span>
      }
      subtitle={reportMeta(r)}
      date={fmtDay(r.createdAt, { weekday: true })}
    />
  );
}

function WordsCard({ id }: { id: string }) {
  const api = useAdminApi();
  const q = useQuery({ queryKey: ['student-words', id], queryFn: () => api.students.words(id) });
  return (
    <Card desktop title="Словарь студента" meta="последние 100">
      {q.isLoading ? <Loading /> : null}
      {q.error ? <ErrorBox error={q.error} /> : null}
      {q.data ? <WordsTable words={q.data} /> : null}
    </Card>
  );
}

function WordsTable({ words }: { words: Word[] }) {
  if (words.length === 0)
    return <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>Словарь пуст.</span>;
  return (
    <div>
      <div
        className="ad-table ad-table-head"
        style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) 70px 80px 90px' }}
      >
        <span>Слово</span>
        <span>Перевод</span>
        <span>CEFR</span>
        <span>Стадия</span>
        <span>Статус</span>
      </div>
      {words.map((w) => (
        <div
          key={w.id}
          className="ad-table"
          style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) 70px 80px 90px' }}
        >
          <span style={{ fontWeight: 600 }}>{w.word}</span>
          <span style={{ color: 'var(--ink-2)' }}>{w.translation ?? '—'}</span>
          <span>{w.cefr ?? '—'}</span>
          <span>{w.status === 'LEARNED' ? '—' : `${w.stage} из 3`}</span>
          <span>
            {w.status === 'LEARNED' ? (
              <Badge tone="good">выучено</Badge>
            ) : (
              <Badge tone="neutral">учится</Badge>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

export function CopyButton({ text, label = 'Скопировать' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant={copied ? 'good' : 'tonal'}
      size="sm"
      icon="copy"
      onClick={() => {
        void navigator.clipboard?.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? 'Скопировано' : label}
    </Button>
  );
}

interface Msg {
  from: 'me' | 'ai';
  text: string;
  copyable?: boolean;
}

/** "Спросить AI" — the teacher's per-student chat (AiPurpose.TEACHER_CHAT, stage 8). */
function TeacherChat({ id, name }: { id: string; name: string }) {
  const api = useAdminApi();
  const [chat, setChat] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  useEffect(() => {
    setChat([]);
    setDraft('');
  }, [id]);
  const ask = useMutation({
    mutationFn: (question: string) =>
      api.ai.ask(
        id,
        question,
        chat.map((m) => ({ role: m.from === 'me' ? 'teacher' : 'ai', text: m.text })),
      ),
    onSuccess: (reply) =>
      setChat((c) => [...c, { from: 'ai', text: reply.text, copyable: reply.copyable }]),
  });
  const send = (question: string) => {
    setChat((c) => [...c, { from: 'me', text: question }]);
    setDraft('');
    ask.mutate(question);
  };
  const first = useMemo(() => name.split(' ')[0], [name]);
  const prompts = [
    'Как дела за месяц?',
    'Что даётся хуже?',
    'Застрявшие слова',
    'Черновик обратной связи',
  ];
  return (
    <Card desktop title="Спросить AI" meta="по фактам студента · студент ничего не видит">
      {!api.features.teacherChat ? (
        <Callout tone="info" title="Появится на следующем этапе">
          Чат учителя с AI по данным студента (отчёты, словарь, карточки, флаги) подключается в
          этапе 8. В демо-режиме его можно попробовать уже сейчас.
        </Callout>
      ) : null}
      <div className="ad-chat">
        {chat.map((m, i) => (
          <ChatMessage
            key={i}
            from={m.from}
            who={m.from === 'me' ? 'Вы' : `AI · по данным ${first}`}
            actions={
              m.copyable ? <CopyButton text={m.text} label="Скопировать черновик" /> : undefined
            }
          >
            <span style={{ whiteSpace: 'pre-line' }}>{m.text}</span>
          </ChatMessage>
        ))}
      </div>
      {ask.isPending ? (
        <Callout tone="info" icon="spinner">
          Собираю факты за период…
        </Callout>
      ) : null}
      {ask.error ? <Callout tone="bad">{errorText(ask.error)}</Callout> : null}
      <Composer
        value={draft}
        onChange={setDraft}
        onSend={send}
        placeholder="Например: что ему даётся хуже?"
        sendLabel="Спросить"
        disabled={!api.features.teacherChat || ask.isPending}
        hint={
          chat.length === 0 && !ask.isPending
            ? 'Ответы по отчётам, словарю, карточкам и флагам. Цифры считает система, AI только объясняет.'
            : undefined
        }
      >
        {prompts.map((p) => (
          <Chip
            key={p}
            disabled={!api.features.teacherChat || ask.isPending}
            onClick={() => send(p)}
          >
            {p}
          </Chip>
        ))}
      </Composer>
    </Card>
  );
}
