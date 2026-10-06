import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import type { GroupLevel } from '../../api/types';
import { LEVEL_LABEL } from '../../lib/labels';
import {
  Badge,
  Button,
  Callout,
  Card,
  ListGroup,
  Select,
  TextArea,
  TextField,
} from '../../ui/components';
import type { GroupView, WordListView } from '../api';
import { fmtDay, levelOf, pct } from '../format';
import { ErrorBox, errorText, Loading, PageHead, Shell } from '../Shell';
import { useAdminApi, useIsOwner } from '../session';

const LEVELS = Object.keys(LEVEL_LABEL) as GroupLevel[];
const COLS = 'minmax(0, 1.2fr) 190px 90px 190px 110px';
const LIST_COLS = 'minmax(0, 1.4fr) 104px 40px 60px 56px 48px 76px';

/** 14 · Группы: levels, membership checks, teacher word lists. */
export function GroupsScreen() {
  const api = useAdminApi();
  const owner = useIsOwner();
  const qc = useQueryClient();
  const groups = useQuery({ queryKey: ['groups'], queryFn: () => api.groups.list() });
  const checks = useQuery({
    queryKey: ['membership-checks'],
    queryFn: () => api.groups.membershipChecks(),
    refetchInterval: 15_000,
  });
  const lists = useQuery({ queryKey: ['word-lists'], queryFn: () => api.wordLists.list() });
  const setLevel = useMutation({
    mutationFn: (v: { chatId: number; level: GroupLevel }) =>
      api.groups.setLevel(v.chatId, v.level),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['groups'] }),
  });
  const run = useMutation({
    mutationFn: () => api.groups.runCheck(),
    onSuccess: () =>
      setTimeout(() => void qc.invalidateQueries({ queryKey: ['membership-checks'] }), 3000),
  });
  const toggle = useMutation({
    mutationFn: (l: WordListView) =>
      api.wordLists.patch(l.id, { status: l.status === 'ACTIVE' ? 'CLOSED' : 'ACTIVE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['word-lists'] }),
  });
  const byChat = new Map((groups.data ?? []).map((g) => [g.chatId, g.title]));
  return (
    <Shell>
      <PageHead
        title="Группы"
        subtitle="Уровень хранится по ID группы — название в Telegram может меняться. Новая группа появится сама, когда добавите бота админом."
      />
      {groups.isLoading ? <Loading /> : null}
      {groups.error ? <ErrorBox error={groups.error} retry={() => groups.refetch()} /> : null}
      {setLevel.error ? <Callout tone="bad">{errorText(setLevel.error)}</Callout> : null}
      {groups.data ? (
        <ListGroup desktop>
          <div className="tr-cell tr-cell-static" style={{ paddingTop: 10, paddingBottom: 10 }}>
            <div
              className="ad-table ad-table-head"
              style={{ gridTemplateColumns: COLS, width: '100%', border: 0, padding: 0 }}
            >
              <span>Группа</span>
              <span>Уровень</span>
              <span>Студентов</span>
              <span>Норма за неделю</span>
              <span>Статус</span>
            </div>
          </div>
          {groups.data.length === 0 ? (
            <div className="tr-cell tr-cell-static">
              <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                Групп пока нет — добавьте бота админом в группу Telegram.
              </span>
            </div>
          ) : null}
          {groups.data.map((g) => (
            <GroupRow
              key={g.chatId}
              g={g}
              owner={owner}
              busy={setLevel.isPending}
              onLevel={(level) => setLevel.mutate({ chatId: g.chatId, level })}
            />
          ))}
        </ListGroup>
      ) : null}

      <div className="ad-grid ad-grid-wide">
        <Card desktop title="Сверка членства" meta="1-го числа в 10:00">
          <div
            className="ad-table ad-table-head"
            style={{ gridTemplateColumns: '110px minmax(0, 1fr) 72px 96px 84px' }}
          >
            <span>Дата</span>
            <span>Итог</span>
            <span>В архив</span>
            <span>Вернулись</span>
            <span>Уровень</span>
          </div>
          {checks.data?.length === 0 ? (
            <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>Сверок ещё не было.</span>
          ) : null}
          {(checks.data ?? []).map((c) => (
            <div
              key={c.id}
              className="ad-table"
              style={{
                gridTemplateColumns: '110px minmax(0, 1fr) 72px 96px 84px',
                padding: '6px 0',
              }}
            >
              <span style={{ color: 'var(--ink-2)' }}>{fmtDay(c.startedAt)}</span>
              <span>
                {c.finishedAt ? `${c.checked} проверено` : 'идёт…'}
                {c.failedGroups.length
                  ? ` · ошибка API: ${c.failedGroups.map((id) => byChat.get(id) ?? id).join(', ')}`
                  : ''}
              </span>
              <span>{c.archived}</span>
              <span>{c.restored}</span>
              <span>{c.levelChanged}</span>
            </div>
          ))}
          {owner ? (
            <div>
              <Button
                variant={run.data?.started ? 'good' : 'dark'}
                size="sm"
                icon="refresh"
                disabled={run.isPending}
                onClick={() => run.mutate()}
              >
                {run.data?.alreadyRunning
                  ? 'Сверка уже идёт'
                  : run.data?.started
                    ? 'Сверка запущена · итог придёт в Telegram'
                    : 'Запустить сейчас'}
              </Button>
            </div>
          ) : null}
          {run.error ? <Callout tone="bad">{errorText(run.error)}</Callout> : null}
        </Card>

        <Card desktop title="Как попадают студенты">
          <span style={{ fontSize: 13, lineHeight: '18px', color: 'var(--ink-2)' }}>
            Бот — админ учебной группы в Telegram. Участник группы открывает Mini App, вводит имя и
            становится студентом с уровнем группы. Раз в месяц бот сверяет членство: ушедшие уходят
            в архив, вернувшиеся восстанавливаются, уровень следует за группой. Учитель — админ
            группы с подписью «teacher».
          </span>
        </Card>
      </div>

      <div className="ad-grid ad-grid-wide">
        <Card
          desktop
          title="Списки слов от учителя"
          meta="предложение, а не импорт: студент видит слова, которых у него нет, и решает сам"
        >
          <div className="ad-table ad-table-head" style={{ gridTemplateColumns: LIST_COLS }}>
            <span>Список</span>
            <span>Для кого</span>
            <span>Слов</span>
            <span>Добавили</span>
            <span>Выучили</span>
            <span>Скрыли</span>
            <span />
          </div>
          {lists.isLoading ? <Loading /> : null}
          {lists.data?.length === 0 ? (
            <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>Списков пока нет.</span>
          ) : null}
          {(lists.data ?? []).map((l) => (
            <ListRow key={l.id} l={l} busy={toggle.isPending} onToggle={() => toggle.mutate(l)} />
          ))}
          <span style={{ fontSize: 12, lineHeight: '16px', color: 'var(--ink-2)' }}>
            «Добавили» — студентов из «для кого», добавивших хотя бы одно слово. Добавленные слова
            получают у студента приоритет и источник «учитель». Отредактированный список снова
            предложит только новые слова.
          </span>
        </Card>
        <NewListCard groups={groups.data ?? []} owner={owner} />
      </div>
    </Shell>
  );
}

function GroupRow({
  g,
  owner,
  busy,
  onLevel,
}: {
  g: GroupView;
  owner: boolean;
  busy: boolean;
  onLevel: (l: GroupLevel) => void;
}) {
  const rate = g.week ? (g.week.reading + g.week.listening) / 2 : 0;
  const teachers =
    g.teachers.map((t) => t.name ?? `id ${t.telegramUserId}`).join(' · ') || 'учитель не назначен';
  return (
    <div className="tr-cell tr-cell-static" style={{ paddingTop: 8, paddingBottom: 8 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: COLS,
          gap: 12,
          width: '100%',
          alignItems: 'center',
          fontSize: 14,
        }}
      >
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <span style={{ fontWeight: 600 }}>{g.title}</span>
          <span
            style={{
              fontSize: 12,
              color: 'var(--ink-2)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {teachers}
          </span>
        </span>
        {owner ? (
          <Select
            size="sm"
            aria-label={`Уровень группы ${g.title}`}
            value={g.level ?? ''}
            disabled={busy}
            onChange={(e) => onLevel(e.target.value as GroupLevel)}
            options={[
              ...(g.level ? [] : [{ value: '', label: 'не задан' }]),
              ...LEVELS.map((l) => ({ value: l, label: LEVEL_LABEL[l] })),
            ]}
          />
        ) : (
          <span>{levelOf(g.level)}</span>
        )}
        <span className="ad-num">{g.members}</span>
        <span
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          title={
            g.week
              ? `чтение ${pct(g.week.reading)} · аудирование ${pct(g.week.listening)}`
              : undefined
          }
        >
          <span className="ad-bar">
            <span style={{ width: pct(rate) }} />
          </span>
          <span className="ad-num" style={{ fontSize: 13, width: 36 }}>
            {pct(rate)}
          </span>
        </span>
        <Badge tone={g.isActive ? 'good' : 'warn'}>{g.isActive ? 'активна' : 'неактивна'}</Badge>
      </div>
    </div>
  );
}

function scopeLabel(l: WordListView): string {
  if (l.scope === 'ALL') return 'Все студенты';
  if (l.scope === 'LEVEL') return `Уровень ${levelOf(l.level)}`;
  return l.group?.title ?? 'Группа';
}

function ListRow({ l, busy, onToggle }: { l: WordListView; busy: boolean; onToggle: () => void }) {
  const c = l.coverage;
  const closed = l.status === 'CLOSED';
  const addedW =
    c && c.studentsAddressed > 0 ? Math.round((c.studentsAdded / c.studentsAddressed) * 100) : 0;
  return (
    <div className="ad-table" style={{ gridTemplateColumns: LIST_COLS, opacity: closed ? 0.6 : 1 }}>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span
          style={{
            fontWeight: 600,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {l.title}
        </span>
        <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{closed ? 'закрыт' : 'активен'}</span>
      </span>
      <span style={{ color: 'var(--ink-2)' }}>{scopeLabel(l)}</span>
      <span className="ad-num">{c?.words ?? '—'}</span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span className="ad-num">{c ? `${c.studentsAdded}/${c.studentsAddressed}` : '—'}</span>
        <span className="ad-bar" style={{ height: 4 }}>
          <span style={{ width: `${addedW}%` }} />
        </span>
      </span>
      <span className="ad-num" style={{ color: 'var(--good)' }}>
        {c?.wordsLearned ?? '—'}
      </span>
      <span className="ad-num" style={{ color: 'var(--ink-2)' }}>
        {c?.studentsHidden ?? '—'}
      </span>
      <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <Button variant="ghost" size="sm" disabled={busy} onClick={onToggle}>
          {closed ? 'Открыть' : 'Закрыть'}
        </Button>
      </span>
    </div>
  );
}

function NewListCard({ groups, owner }: { groups: GroupView[]; owner: boolean }) {
  const api = useAdminApi();
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [scope, setScope] = useState(groups[0] ? `G:${groups[0].chatId}` : 'ALL');
  const [text, setText] = useState('');
  const [created, setCreated] = useState<WordListView | null>(null);
  const create = useMutation({
    mutationFn: () => {
      const [kind, value] = scope.split(':');
      return api.wordLists.create({
        title: title.trim(),
        scope: kind === 'G' ? 'GROUP' : kind === 'L' ? 'LEVEL' : 'ALL',
        groupChatId: kind === 'G' ? Number(value) : undefined,
        level: kind === 'L' ? (value as GroupLevel) : undefined,
        text,
      });
    },
    onSuccess: (l) => {
      setCreated(l);
      setTitle('');
      setText('');
      void qc.invalidateQueries({ queryKey: ['word-lists'] });
    },
  });
  const options = [
    ...groups.map((g) => ({ value: `G:${g.chatId}`, label: `Группа: ${g.title}` })),
    ...(owner ? LEVELS.map((l) => ({ value: `L:${l}`, label: `Уровень: ${LEVEL_LABEL[l]}` })) : []),
    ...(owner ? [{ value: 'ALL', label: 'Все студенты' }] : []),
  ];
  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };
  return (
    <Card desktop title="Новый список">
      {created ? (
        <Callout tone="good" icon="check" title="Список создан">
          «{created.title}»: {created.coverage?.words ?? created.items?.length ?? 0} слов предложено{' '}
          {scopeLabel(created).toLowerCase()}. Покрытие появится в таблице по мере ответов.
        </Callout>
      ) : null}
      {create.error ? <Callout tone="bad">{errorText(create.error)}</Callout> : null}
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <TextField
          label="Название"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Unit 6 — Food"
          required
          minLength={2}
        />
        <Select
          label="Для кого"
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          options={options}
        />
        <TextArea
          label="Слова"
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'itinerary — маршрут\nlayover\nboarding pass'}
          hint="С переводом или без: перевод, пример и уровень подберёт AI один раз на всю школу."
          required
        />
        <Button
          variant="primary"
          size="md"
          block
          icon="list"
          type="submit"
          disabled={create.isPending || !title.trim() || !text.trim()}
        >
          {create.isPending ? 'Создаю…' : 'Создать список'}
        </Button>
      </form>
    </Card>
  );
}
