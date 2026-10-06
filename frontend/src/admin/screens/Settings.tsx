import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Callout,
  Card,
  Cell,
  HealthDot,
  ListGroup,
  TextField,
} from '../../ui/components';
import { money, monthLabel, num, tokensShort } from '../format';
import { ErrorBox, errorText, Loading, PageHead, Shell } from '../Shell';
import { useAdminApi } from '../session';

const PURPOSE_LABEL: Record<string, string> = {
  DIALOG: 'разбор отчётов и диалог',
  ENRICH_WORDS: 'обогащение слов',
  AUTHENTICITY: 'подлинность и точечные вопросы',
  SENTENCE_CHECK: 'проверка предложений (карточки)',
  PARENT_REPORT: 'отчёты родителям',
  TEACHER_CHAT: 'чат учителя',
};

/** 15 · Настройки (owner): norms, reminders, health thresholds, staff, AI spend. */
export function SettingsScreen() {
  const api = useAdminApi();
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api.settings.get() });
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (settings.data) {
      setDraft(Object.fromEntries(settings.data.settings.map((s) => [s.key, String(s.value)])));
      setSaved(false);
    }
  }, [settings.data]);
  const save = useMutation({
    mutationFn: (values: Record<string, unknown>) => api.settings.update(values),
    onSuccess: (res) => {
      qc.setQueryData(['settings'], { keys: settings.data?.keys ?? [], settings: res.settings });
      setSaved(true);
    },
  });
  const reset = useMutation({
    mutationFn: (key: string) => api.settings.reset(key),
    onSuccess: (res) =>
      qc.setQueryData(['settings'], { keys: settings.data?.keys ?? [], settings: res.settings }),
  });

  const byKey = new Map((settings.data?.settings ?? []).map((s) => [s.key, s]));
  const changed = (): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(draft)) {
      const s = byKey.get(key);
      if (!s || raw === String(s.value)) continue;
      out[key] = typeof s.default === 'number' ? Number(raw.replace(',', '.')) : raw.trim();
    }
    return out;
  };
  const dirty = Object.keys(changed()).length > 0;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (dirty) save.mutate(changed());
  };
  const field = (
    key: string,
    label: string,
    extra?: { type?: 'time' | 'number'; step?: string },
  ) => {
    const s = byKey.get(key);
    return (
      <TextField
        label={
          <>
            {label}
            {s?.overridden ? (
              <>
                {' '}
                <button
                  type="button"
                  className="ad-link"
                  onClick={() => reset.mutate(key)}
                  title={`Вернуть ${String(s.default)}`}
                >
                  сбросить
                </button>
              </>
            ) : null}
          </>
        }
        value={draft[key] ?? ''}
        onChange={(e) => {
          setDraft((d) => ({ ...d, [key]: e.target.value }));
          setSaved(false);
        }}
        type={extra?.type ?? 'number'}
        step={extra?.step ?? (extra?.type === 'time' ? undefined : '1')}
        inputMode={extra?.type === 'time' ? undefined : 'decimal'}
        disabled={!s}
      />
    );
  };

  return (
    <Shell>
      <form onSubmit={submit} style={{ display: 'contents' }}>
        <PageHead
          title="Настройки"
          subtitle="Только OWNER · применяются сразу для всех групп"
          aside={
            <Button
              variant={saved ? 'good' : 'dark'}
              size="md"
              icon="check"
              type="submit"
              disabled={!dirty || save.isPending}
            >
              {save.isPending ? 'Сохраняю…' : saved ? 'Сохранено' : 'Сохранить изменения'}
            </Button>
          }
        />
        {settings.isLoading ? <Loading /> : null}
        {settings.error ? (
          <ErrorBox error={settings.error} retry={() => settings.refetch()} />
        ) : null}
        {save.error ? <Callout tone="bad">{errorText(save.error)}</Callout> : null}
        {reset.error ? <Callout tone="bad">{errorText(reset.error)}</Callout> : null}

        <div className="ad-grid ad-grid-2">
          <Card desktop title="Нормы" meta="неделя пн–вс, Asia/Tashkent">
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: 12,
                alignItems: 'end',
              }}
            >
              {field('norms.readingPerWeek', 'Чтение, отчётов в неделю')}
              {field('norms.listeningPerWeek', 'Аудирование, в неделю')}
              {field('norms.cardsPerDay', 'Карточек в день')}
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: 12,
                alignItems: 'end',
              }}
            >
              {field('cards.correctToAdvance', 'Верных ответов до новой стадии')}
              {field('cards.stage3ToLearned', 'Успехов на стадии 3 до «выучено»')}
            </div>
            <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>
              Нормы чтения и аудирования считаются раздельно; один отчёт типа в день.
            </span>
          </Card>

          <Card desktop title="Напоминания и AI">
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: 12,
                alignItems: 'end',
              }}
            >
              {field('reminders.cardsTime', 'Карточки, утром', { type: 'time' })}
              {field('reminders.reportsTime', 'Отчёты, вечером', { type: 'time' })}
              {field('reminders.tiredDays', '«Устал» действует, дней')}
              {field('ai.spotCheckProbability', 'Точечные проверки, доля отчётов', {
                step: '0.05',
              })}
              {field('ai.dailyTokenLimitPerStudent', 'Лимит AI на студента в день, токенов', {
                step: '1000',
              })}
            </div>
            <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>
              Напоминания не приходят, если норма уже выполнена, и не дублируются в один день.
            </span>
          </Card>
        </div>

        <div className="ad-grid ad-grid-2">
          <Card
            desktop
            title="Пороги «здоровья»"
            meta="одна функция для дашборда, Mini App и сводки"
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: 12,
                alignItems: 'end',
              }}
            >
              <div className="tr-field">
                <HealthDot status="good">Активен, до дн.</HealthDot>
                <span
                  className="tr-input"
                  style={{ display: 'flex', alignItems: 'center', color: 'var(--ink-2)' }}
                >
                  {Math.max(0, Number(draft['health.yellowInactiveDays'] ?? 0) - 1)}
                </span>
              </div>
              <div className="tr-field">
                <HealthDot status="warn">Отстаёт, от дн.</HealthDot>
                {field('health.yellowInactiveDays', '')}
              </div>
              <div className="tr-field">
                <HealthDot status="bad">Проблема, от дн.</HealthDot>
                {field('health.redInactiveDays', '')}
              </div>
            </div>
            <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>
              Заблокировавший бота студент — всегда «проблема».
            </span>
            <StaffCard />
          </Card>
          <UsageCard />
        </div>
      </form>
      <OpsCard />
    </Shell>
  );
}

/** Scheduled jobs on demand — for checking the texts and for the demo in Telegram. */
function OpsCard() {
  const api = useAdminApi();
  const [log, setLog] = useState<string[]>([]);
  const note = (line: string) => setLog((l) => [line, ...l].slice(0, 6));
  const reminders = useMutation({
    mutationFn: (kind: 'CARDS' | 'REPORTS') => api.ops.runReminders(kind),
    onSuccess: (r) =>
      note(
        `${r.kind === 'CARDS' ? 'Карточки' : 'Отчёты'} · ${r.day}: отправлено ${r.sent} из ${r.candidates} (норма выполнена ${r.skipped.done}, уже напомнили ${r.skipped.reminded}, «устал» ${r.skipped.calm}, не доставлено ${r.skipped.failed})`,
      ),
    onError: (e) => note(errorText(e)),
  });
  const summary = useMutation({
    mutationFn: () => api.ops.runWeeklySummary(),
    onSuccess: (r) =>
      note(
        `Сводка «${r.summary.weekLabel}» отправлена ${r.sentTo.length} получателям, новых флагов NORM_MISSED_WEEK: ${r.flagged}`,
      ),
    onError: (e) => note(errorText(e)),
  });
  const preview = useQuery({
    queryKey: ['weekly-summary'],
    queryFn: () => api.ops.weeklySummary('last'),
    enabled: false,
  });
  const busy = reminders.isPending || summary.isPending || preview.isFetching;
  return (
    <Card desktop title="Рассылки" meta="по расписанию они уходят сами; здесь — запустить сейчас">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button
          variant="secondary"
          size="sm"
          icon="bell"
          disabled={busy}
          onClick={() => reminders.mutate('CARDS')}
        >
          Напомнить о карточках
        </Button>
        <Button
          variant="secondary"
          size="sm"
          icon="bell"
          disabled={busy}
          onClick={() => reminders.mutate('REPORTS')}
        >
          Напомнить об отчётах
        </Button>
        <Button
          variant="secondary"
          size="sm"
          icon="list"
          disabled={busy}
          onClick={() => preview.refetch()}
        >
          Показать сводку недели
        </Button>
        <Button
          variant="dark"
          size="sm"
          icon="send"
          disabled={busy}
          onClick={() => summary.mutate()}
        >
          Отправить сводку недели
        </Button>
      </div>
      {preview.data ? <p className="ad-box">{preview.data.text}</p> : null}
      {log.length > 0 ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            fontSize: 12,
            color: 'var(--ink-2)',
          }}
        >
          {log.map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </div>
      ) : null}
      <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>
        Напоминания уходят только тем, у кого норма не выполнена, не чаще раза в день и не в режиме
        «устал». Сводка идёт владельцу и учителям по их группам и ставит тихий флаг за неделю без
        отчётов.
      </span>
    </Card>
  );
}

function StaffCard() {
  const api = useAdminApi();
  const qc = useQueryClient();
  const staff = useQuery({ queryKey: ['staff'], queryFn: () => api.staff.list() });
  const [adding, setAdding] = useState(false);
  const [tgId, setTgId] = useState('');
  const [name, setName] = useState('');
  const grant = useMutation({
    mutationFn: () =>
      api.staff.grant({ telegramUserId: Number(tgId), role: 'TEACHER', name: name.trim() || null }),
    onSuccess: (list) => {
      qc.setQueryData(['staff'], list);
      setAdding(false);
      setTgId('');
      setName('');
    },
  });
  const revoke = useMutation({
    mutationFn: (id: number) => api.staff.revoke(id),
    onSuccess: (list) => qc.setQueryData(['staff'], list),
  });
  return (
    <ListGroup desktop header="Учителя">
      {staff.isLoading ? <Loading /> : null}
      {(staff.data ?? []).map((s) => (
        <Cell
          key={s.telegramUserId}
          avatar={s.name ?? `id ${s.telegramUserId}`}
          avatarTone={s.role === 'OWNER' ? 'solid' : 'listen'}
          title={s.name ?? `Telegram id ${s.telegramUserId}`}
          subtitle={
            s.groups.map((g) => g.title).join(', ') ||
            (s.role === 'OWNER' ? 'все группы' : 'группы не найдены')
          }
          badge={s.role}
          badgeTone={s.role === 'OWNER' ? 'count' : 'brand'}
          trailing={
            s.role === 'TEACHER' && s.granted ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={revoke.isPending}
                onClick={() => revoke.mutate(s.telegramUserId)}
              >
                Снять
              </Button>
            ) : undefined
          }
        />
      ))}
      {adding ? (
        <div
          className="tr-cell tr-cell-static"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr auto',
            gap: 8,
            alignItems: 'end',
          }}
        >
          <TextField
            label="Telegram id"
            value={tgId}
            onChange={(e) => setTgId(e.target.value)}
            inputMode="numeric"
            placeholder="123456789"
          />
          <TextField
            label="Имя"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Дилшод"
          />
          <Button
            variant="primary"
            size="md"
            disabled={!/^\d+$/.test(tgId) || grant.isPending}
            onClick={() => grant.mutate()}
          >
            Назначить
          </Button>
        </div>
      ) : (
        <div className="tr-cell tr-cell-static">
          <Button variant="ghost" size="sm" icon="plus" onClick={() => setAdding(true)}>
            Назначить учителя
          </Button>
        </div>
      )}
      {grant.error ? <Callout tone="bad">{errorText(grant.error)}</Callout> : null}
      {(staff.data ?? []).length === 0 && staff.data ? (
        <div className="tr-cell tr-cell-static">
          <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>
            Учителя определяются по подписи «teacher» у админа группы; здесь можно назначить
            вручную.
          </span>
        </div>
      ) : null}
    </ListGroup>
  );
}

function UsageCard() {
  const api = useAdminApi();
  const q = useQuery({ queryKey: ['ai-usage'], queryFn: () => api.aiUsage() });
  const u = q.data;
  const max = Math.max(1, ...(u?.topStudents.map((s) => s.tokens) ?? [1]));
  return (
    <Card
      desktop
      title={`Расход на AI · ${u ? monthLabel(u.month) : '…'}`}
      meta={u ? `${num(u.calls)} вызовов` : undefined}
    >
      {q.isLoading ? <Loading /> : null}
      {q.error ? <ErrorBox error={q.error} /> : null}
      {u ? (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span
              style={{
                fontSize: 32,
                lineHeight: '36px',
                fontWeight: 700,
                letterSpacing: '-0.02em',
              }}
            >
              {money(u.costUsd)}
            </span>
            <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>
              ≈ {tokensShort(u.tokens)} токенов · {money(u.perActiveStudentUsd)} на студента
            </span>
          </div>
          <span className="tr-eyebrow">По назначению</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {u.byPurpose.map((p) => (
              <Badge
                key={p.purpose}
                tone="neutral"
                title={`${num(p.calls)} вызовов · ${tokensShort(p.tokens)} токенов`}
              >
                {PURPOSE_LABEL[p.purpose] ?? p.purpose}: {money(p.costUsd)}
              </Badge>
            ))}
            {u.byPurpose.length === 0 ? (
              <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                В этом месяце вызовов не было.
              </span>
            ) : null}
          </div>
          <span className="tr-eyebrow">Топ студентов по токенам</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {u.topStudents.map((s) => (
              <div
                key={s.studentId}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '150px minmax(0, 1fr) 70px',
                  gap: 10,
                  alignItems: 'center',
                  fontSize: 13,
                }}
              >
                <span
                  style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                >
                  {s.name ?? s.studentId.slice(0, 8)}
                </span>
                <span className="ad-bar">
                  <span
                    title={`${s.name ?? ''}: ${tokensShort(s.tokens)} токенов`}
                    style={{ width: `${Math.round((s.tokens / max) * 100)}%` }}
                  />
                </span>
                <span className="ad-num" style={{ textAlign: 'right', color: 'var(--ink-2)' }}>
                  {tokensShort(s.tokens)}
                </span>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </Card>
  );
}
