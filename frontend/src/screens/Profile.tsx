import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { keys, useCalendar, useProfile, useSummary } from '../app/hooks';
import { ErrorBox, Loading, Screen } from '../app/Shell';
import { openDashboard, useApi, useSession } from '../app/session';
import { fmtLong, fmtWeek } from '../lib/dates';
import { levelLabel } from '../lib/labels';
import { haptic } from '../telegram/webapp';
import {
  Avatar,
  Button,
  Card,
  Cell,
  DayCell,
  ListGroup,
  NormCell,
  TextField,
} from '../ui/components';

const DAY_NAMES = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

/** 09 · Профиль */
export function ProfileScreen() {
  const api = useApi();
  const { state, demo } = useSession();
  const roles = state.kind === 'ready' ? state.roles : [];
  const staff = roles.includes('OWNER') || roles.includes('TEACHER');
  const qc = useQueryClient();
  const profile = useProfile();
  const summary = useSummary();
  const calendar = useCalendar(6);
  const [draft, setDraft] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (profile.data) setDraft(profile.data.displayName);
  }, [profile.data]);

  const rename = useMutation({
    mutationFn: () => {
      const [first, ...rest] = draft.trim().split(/\s+/);
      return api.me.rename(first ?? '', rest.join(' '));
    },
    onSuccess: (p) => {
      qc.setQueryData(keys.profile, p);
      setSaved(true);
      haptic('success');
    },
    onError: () => haptic('error'),
  });

  const calm = useMutation({
    mutationFn: (on: boolean) => api.me.calmMode(on),
    onSuccess: (p) => {
      qc.setQueryData(keys.profile, p);
      haptic('light');
    },
  });

  const p = profile.data;
  const dirty = !!p && draft.trim() !== p.displayName;

  return (
    <Screen back="/">
      {p ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Avatar name={p.displayName} size="lg" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <h1 className="tr-h1-sm">{p.displayName}</h1>
            <span className="tr-muted">
              {p.username ? `@${p.username}` : 'без username'}
              {p.registeredAt ? ` · с ${fmtLong(p.registeredAt)}` : ''}
            </span>
          </div>
        </div>
      ) : (
        <Loading />
      )}

      <ListGroup header="Данные" footer="Имя и фамилия видны учителю в списке студентов.">
        <div className="tr tr-cell tr-cell-static tr-field-row">
          <TextField
            label="Имя и фамилия"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setSaved(false);
            }}
          />
          <Button
            variant={saved ? 'good' : 'dark'}
            size="md"
            disabled={!dirty || rename.isPending}
            onClick={() => rename.mutate()}
          >
            {saved && !dirty ? 'Сохранено' : 'Сохранить'}
          </Button>
        </div>
        {rename.error ? (
          <div style={{ padding: '0 16px 12px' }}>
            <ErrorBox error={rename.error} />
          </div>
        ) : null}
        <Cell title="Группа" date={p?.groups.map((g) => g.title).join(', ') || '—'} />
        <Cell title="Уровень" subtitle="Определяется группой" date={levelLabel(p?.level ?? null)} />
        <Cell
          title="Слов выучено"
          date={summary.data ? `${summary.data.learned} из ${summary.data.total}` : '…'}
        />
        {staff ? (
          <Cell
            tileIcon="grid"
            tileTone="brand"
            title="Дашборд учителя"
            subtitle="Обзор, студенты, флаги"
            chevron
            onClick={() => openDashboard(roles, demo)}
          />
        ) : null}
      </ListGroup>

      <Card title="История недель" meta="норма 3 + 3">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '64px 44px 44px minmax(0, 1fr)',
            gap: '6px 8px',
            fontSize: 11,
            color: 'var(--ink-2)',
          }}
        >
          <span />
          <span style={{ textAlign: 'center' }}>Чтение</span>
          <span style={{ textAlign: 'center' }}>Аудир.</span>
          <span>Норма по дням</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(calendar.data ?? []).map((wk) => {
            const total = wk.reading.done + wk.listening.done;
            return (
              <div
                key={wk.weekStart}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '64px 44px 44px minmax(0, 1fr)',
                  gap: 8,
                  alignItems: 'center',
                }}
              >
                <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{fmtWeek(wk.weekStart)}</span>
                <NormCell value={wk.reading.done} max={wk.reading.norm} />
                <NormCell value={wk.listening.done} max={wk.listening.norm} />
                <span
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                    gap: 3,
                  }}
                >
                  {DAY_NAMES.map((d, i) => (
                    // The API counts per week, not per day: light up as many days as there were reports.
                    <DayCell
                      key={d}
                      level={i < total ? (i % 2 === 0 ? 2 : 1) : 0}
                      title={`${d}: ${i < total ? 'отчёт' : 'нет отчёта'}`}
                    />
                  ))}
                </span>
              </div>
            );
          })}
          {calendar.isLoading ? <Loading /> : null}
        </div>
        <div className="tr-legend">
          <span>
            <i style={{ background: 'var(--good-wash)' }} />
            норма выполнена
          </span>
          <span>
            <i style={{ background: 'var(--warn-wash)' }} />
            частично
          </span>
          <span>
            <i style={{ background: 'var(--bad-wash)' }} />
            не выполнена
          </span>
        </div>
      </Card>

      <ListGroup
        header="Напоминания"
        footer="Напоминания приходят сообщениями от бота с кнопкой «Открыть». Норма от режима не меняется."
      >
        <Cell
          tileIcon="bell"
          tileTone="brand"
          title="Спокойный режим"
          subtitle={
            p?.calmMode && p.calmUntil
              ? `Включён до ${fmtLong(p.calmUntil)}: напоминания реже и мягче`
              : 'Устал или загружен — напоминания реже на 3 дня'
          }
          onClick={() => calm.mutate(!p?.calmMode)}
          disabled={calm.isPending || !p}
          badge={p?.calmMode ? 'вкл' : 'выкл'}
          badgeTone={p?.calmMode ? 'good' : 'neutral'}
        />
      </ListGroup>
    </Screen>
  );
}
