import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { keys, useProfile, useProgress, useRecommendations, useSpotCheck } from '../app/hooks';
import { ErrorBox, Loading, Screen } from '../app/Shell';
import { useApi } from '../app/session';
import { daysLeftInWeek, days, fmtToday, fmtWeek, words } from '../lib/dates';
import { levelLabel, METHOD_SHORT } from '../lib/labels';
import { haptic } from '../telegram/webapp';
import {
  Avatar,
  Button,
  Callout,
  Card,
  Cell,
  ListGroup,
  ProgressRing,
  TextField,
} from '../ui/components';
import { Link } from 'react-router-dom';

function weekHint(reading: number, listening: number, method: string): string {
  if (reading >= 3 && listening >= 3) return 'Норма недели выполнена. Всё, что сверх — в плюс.';
  if (listening === 0 && reading > 0)
    return `Один ${method === 'SERIES' ? 'эпизод' : 'подкаст на 6 минут'} — и аудирование будет 1/3.`;
  if (reading === 0 && listening > 0) return 'Десять страниц книги — и чтение будет 1/3.';
  if (reading === 0 && listening === 0)
    return 'Неделя только началась: один отчёт сегодня — и уже не ноль.';
  return `Осталось ${3 - Math.min(reading, 3)} по чтению и ${3 - Math.min(listening, 3)} по аудированию.`;
}

/** 01 · Главная */
export function MainScreen() {
  const api = useApi();
  const qc = useQueryClient();
  const profile = useProfile();
  const progress = useProgress();
  const recs = useRecommendations();
  const spot = useSpotCheck();
  const [spotAnswer, setSpotAnswer] = useState('');
  const [spotDone, setSpotDone] = useState(false);

  const answer = useMutation({
    mutationFn: (text: string | null) => api.me.answerSpotCheck(text),
    onSuccess: () => {
      haptic('success');
      setSpotDone(true);
      qc.setQueryData(keys.spotCheck, null);
    },
  });

  const p = profile.data;
  const week = progress.data?.week;
  const cards = progress.data?.cards;
  const wordsStat = progress.data?.words;
  const teacher = recs.data?.[0];
  const missing = recs.data?.reduce((n, r) => n + r.items.length, 0) ?? 0;
  const normDone = !!cards?.available && cards.done >= cards.norm;

  return (
    <Screen tab="home">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="tr-eyebrow tr-eyebrow-brand">{fmtToday()}</span>
          <h1 className="tr-h1">Привет{p?.firstName ? `, ${p.firstName}` : ''}</h1>
          <span className="tr-muted">
            {p
              ? `${p.groups.map((g) => g.title).join(', ') || 'Без группы'} · ${levelLabel(p.level)}`
              : ' '}
          </span>
        </div>
        <Link to="/profile" aria-label="Профиль" style={{ display: 'flex' }}>
          <Avatar name={p?.displayName ?? '?'} size="md" />
        </Link>
      </div>

      {progress.error ? <ErrorBox error={progress.error} retry={() => progress.refetch()} /> : null}

      <Card
        title="Эта неделя"
        meta={week ? `${fmtWeek(week.weekStart)} · осталось ${days(daysLeftInWeek())}` : undefined}
      >
        {week ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-around', padding: '4px 0' }}>
              <ProgressRing value={week.reading.done} max={week.reading.norm} label="Чтение" />
              <ProgressRing
                value={week.listening.done}
                max={week.listening.norm}
                label="Аудирование"
                tone="listen"
              />
              <ProgressRing
                value={cards?.done ?? 0}
                max={cards?.norm ?? 5}
                label="Карточки"
                tone="cards"
              />
            </div>
            <Callout tone="info" icon="headphones">
              {weekHint(week.reading.done, week.listening.done, p?.listeningMethod ?? '')}
            </Callout>
          </>
        ) : (
          <Loading />
        )}
      </Card>

      {spot.data && !spotDone ? (
        <Card
          tone="wash-listen"
          title={`Кстати, про «${spot.data.sourceTitle ?? 'недавний подкаст'}»`}
          meta="ты слушал недавно"
        >
          <span className="tr-body">{spot.data.question}</span>
          <div className="tr-field-row">
            <TextField
              label="Пара слов по памяти"
              value={spotAnswer}
              onChange={(e) => setSpotAnswer(e.target.value)}
              placeholder="They said…"
            />
            <Button
              variant="primary"
              size="md"
              icon="send"
              disabled={!spotAnswer.trim() || answer.isPending}
              onClick={() => answer.mutate(spotAnswer.trim())}
            >
              Ответить
            </Button>
          </div>
          <div>
            <Button
              variant="ghost"
              size="sm"
              disabled={answer.isPending}
              onClick={() => answer.mutate(null)}
            >
              Не помню
            </Button>
          </div>
          {answer.error ? <ErrorBox error={answer.error} /> : null}
        </Card>
      ) : null}
      {spotDone ? (
        <Callout tone="good" icon="check">
          Спасибо, записал. Хорошей недели!
        </Callout>
      ) : null}

      {normDone ? (
        <Card title="Карточки на сегодня сделаны" meta={`${cards?.done} из ${cards?.norm}`}>
          <span className="tr-muted">
            Плановые слова появятся завтра. Можно взять ещё пять вне нормы.
          </span>
          <Button variant="tonal" size="md" block icon="cards" to="/cards">
            Повторить ещё
          </Button>
        </Card>
      ) : (
        <Button variant="primary" size="lg" block icon="cards" to="/cards">
          {cards?.available
            ? `Повторить ${words(Math.max(cards.norm - cards.done, 1))}`
            : 'Повторить слова'}
        </Button>
      )}

      <ListGroup header="Действия">
        <Cell
          to="/reports/new"
          tileIcon="edit"
          tileTone="listen"
          title="Сдать отчёт"
          subtitle="Чтение или аудирование"
          chevron
        />
        <Cell
          to="/words"
          tileIcon="book"
          tileTone="cards"
          title="Словарь"
          subtitle={wordsStat ? `${words(wordsStat.total)} · ${wordsStat.learned} выучено` : '…'}
          chevron
        />
        {teacher ? (
          <Cell
            to="/words/teacher"
            tileIcon="list"
            tileTone="brand"
            title="Слова от учителя"
            subtitle={`${teacher.list.title} · ${words(missing)}, которых у тебя нет`}
            badge="новое"
            badgeTone="brand"
            chevron
          />
        ) : null}
        <Cell
          to="/reports/method"
          tileIcon="headphones"
          tileTone="brand"
          title="Как слушать"
          subtitle={p ? `Методика: ${METHOD_SHORT[p.listeningMethod]} · 6 шагов` : '…'}
          chevron
        />
      </ListGroup>
    </Screen>
  );
}
