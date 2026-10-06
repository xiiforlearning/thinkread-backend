import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { CardAnswer, CardView } from '../api/types';
import { keys } from '../app/hooks';
import { ErrorBox, Loading, Screen } from '../app/Shell';
import { useApi } from '../app/session';
import { STAGE_LABEL } from '../lib/labels';
import { haptic } from '../telegram/webapp';
import {
  Badge,
  Button,
  Callout,
  Card,
  Cell,
  LetterTile,
  ListGroup,
  TextField,
  type Tone,
} from '../ui/components';

const TONES: Tone[] = ['brand', 'rose', 'listen', 'cards'];

type Phase =
  | { kind: 'idle' }
  | { kind: 'card'; card: CardView }
  | { kind: 'result'; card: CardView; result: CardAnswer }
  | { kind: 'finished'; extra: boolean }
  | { kind: 'empty' };

/**
 * 02 · Карточки — one card at a time, no session. Stage 1: translation →
 * word; stage 2: gap in a sentence; stage 3: own sentence checked by AI.
 * After `norm` answered cards the day is done; "Ещё 5 слов" starts an extra
 * series that moves words along but is not part of the norm.
 */
export function CardsScreen() {
  const api = useApi();
  const qc = useQueryClient();
  const state = useQuery({ queryKey: ['cards', 'state'], queryFn: () => api.cards.state() });
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [answer, setAnswer] = useState('');
  const [extra, setExtra] = useState(false);
  const [extraDone, setExtraDone] = useState(0);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['cards'] });
    void qc.invalidateQueries({ queryKey: keys.progress });
    void qc.invalidateQueries({ queryKey: ['words'] });
  };

  const next = useMutation({
    mutationFn: () => api.cards.next(),
    onSuccess: ({ card, today }) => {
      setAnswer('');
      if (card) setPhase({ kind: 'card', card });
      else setPhase(today.done > 0 || extra ? { kind: 'finished', extra } : { kind: 'empty' });
    },
  });
  const grade = useMutation({
    mutationFn: (v: { card: CardView; answer: string | null }) =>
      v.answer === null
        ? api.cards.giveUp(v.card.attemptId)
        : api.cards.answer(v.card.attemptId, v.answer),
    onSuccess: (result, v) => {
      haptic(result.correct ? 'success' : 'error');
      if (extra) setExtraDone((n) => n + 1);
      setPhase({ kind: 'result', card: v.card, result });
      invalidate();
    },
  });
  const skip = useMutation({
    mutationFn: (card: CardView) => api.cards.skip(card.attemptId),
    onSuccess: () => {
      invalidate();
      next.mutate();
    },
  });

  // First card: resume the open one or take the queue head once the state is known.
  useEffect(() => {
    if (phase.kind !== 'idle' || !state.data) return;
    const today = state.data.today;
    if (state.data.current) setPhase({ kind: 'card', card: state.data.current });
    else if (today.done >= today.norm) setPhase({ kind: 'finished', extra: false });
    else if (state.data.queue.length === 0) setPhase({ kind: 'empty' });
    else next.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.data, phase.kind]);

  const today = (phase.kind === 'result'
    ? phase.result.today
    : phase.kind === 'card'
      ? phase.card.today
      : state.data?.today) ?? {
    done: 0,
    correct: 0,
    norm: 5,
  };
  const counterDone = extra ? extraDone : Math.min(today.done, today.norm);
  const busy = next.isPending || grade.isPending || skip.isPending;
  const error = next.error ?? grade.error ?? skip.error ?? state.error;

  const advance = () => {
    if (!extra && today.done >= today.norm) setPhase({ kind: 'finished', extra: false });
    else if (extra && extraDone >= today.norm) setPhase({ kind: 'finished', extra: true });
    else next.mutate();
  };
  const startExtra = () => {
    setExtra(true);
    setExtraDone(0);
    next.mutate();
  };

  const card = phase.kind === 'card' ? phase.card : phase.kind === 'result' ? phase.card : null;
  const result = phase.kind === 'result' ? phase.result : null;
  const stage = card?.stage ?? 1;

  return (
    <Screen tab="cards">
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <h1 className="tr-h1">Карточки</h1>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <span
            style={{
              fontSize: 13,
              color: extra ? 'var(--brand)' : 'var(--ink-2)',
              fontWeight: 500,
            }}
          >
            {extra
              ? `Дополнительно · ${extraDone}/${today.norm}`
              : `Сегодня ${counterDone}/${today.norm}`}
          </span>
          <div style={{ display: 'flex', gap: 5 }} aria-hidden="true">
            {Array.from({ length: today.norm }, (_, k) => (
              <span
                key={k}
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  background:
                    k < counterDone
                      ? extra
                        ? 'var(--brand)'
                        : 'var(--cards)'
                      : 'var(--line-strong)',
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {extra ? (
        <Callout tone="brand" icon="cards">
          Дополнительная серия: в норму дня не входит, но так же двигает слова по стадиям.
        </Callout>
      ) : null}
      {error ? <ErrorBox error={error} retry={() => next.mutate()} /> : null}
      {phase.kind === 'idle' ? <Loading /> : null}

      {phase.kind === 'empty' ? (
        <Card>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
              textAlign: 'center',
              padding: '12px 0 4px',
            }}
          >
            <LetterTile icon="check" size="md" tone="good" />
            <h2 className="tr-h1-sm">Повторять пока нечего</h2>
            <p className="tr-muted" style={{ margin: 0, fontSize: 14, lineHeight: '20px' }}>
              Все слова ждут своего дня. Новые появятся из отчётов, списков учителя — или добавь их
              сам.
            </p>
          </div>
          <Button variant="primary" size="lg" block icon="plus" to="/words/add">
            Добавить слова
          </Button>
        </Card>
      ) : null}

      {phase.kind === 'finished' ? (
        <Card>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
              textAlign: 'center',
              padding: '12px 0 4px',
            }}
          >
            <LetterTile icon="check" size="md" tone="good" />
            <h2 className="tr-h1-sm">
              {phase.extra ? 'Ещё пять позади' : 'На сегодня всё повторено'}
            </h2>
            <p className="tr-muted" style={{ margin: 0, fontSize: 14, lineHeight: '20px' }}>
              {phase.extra
                ? 'Дополнительная серия закончена. '
                : `Норма дня выполнена: ${today.norm} из ${today.norm}, верно ${today.correct}. `}
              {(state.data?.queue.length ?? 0) > 0
                ? 'Хочешь — возьми ещё пять слов, следующие плановые появятся завтра.'
                : 'Больше слов на сегодня нет — следующие появятся завтра.'}
            </p>
          </div>
          {(state.data?.queue.length ?? 0) > 0 ? (
            <Button
              variant="primary"
              size="lg"
              block
              icon="cards"
              onClick={startExtra}
              disabled={busy}
            >
              Ещё {today.norm} слов
            </Button>
          ) : null}
          <Button variant="ghost" size="md" block to="/">
            На сегодня хватит
          </Button>
        </Card>
      ) : null}

      {card ? (
        <>
          <Card>
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '4px 4px 0' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Badge tone="brand">
                  Стадия {stage} · {STAGE_LABEL[stage]}
                </Badge>
                <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>
                  {stage === 1
                    ? 'ввод с клавиатуры'
                    : stage === 2
                      ? 'подсказка ниже'
                      : 'проверяет AI'}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 17, lineHeight: '24px', color: 'var(--ink-2)' }}>
                  {card.question}
                </div>
                {card.shown ? <div className="tr-word-title">{card.shown}</div> : null}
                {card.hint ? (
                  <div style={{ fontSize: 15, color: 'var(--ink-2)' }}>{card.hint}</div>
                ) : null}
              </div>

              {phase.kind === 'card' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <TextField
                    label="Твой ответ"
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    placeholder={card.placeholder}
                    autoComplete="off"
                    autoCapitalize={stage === 3 ? 'sentences' : 'none'}
                    disabled={busy}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && answer.trim() && !busy)
                        grade.mutate({ card, answer: answer.trim() });
                    }}
                  />
                  {grade.isPending && stage === 3 ? (
                    <Callout tone="info" icon="spinner">
                      Смотрю, как ты употребил слово…
                    </Callout>
                  ) : null}
                  <Button
                    variant="primary"
                    size="lg"
                    block
                    disabled={!answer.trim() || busy}
                    onClick={() => grade.mutate({ card, answer: answer.trim() })}
                  >
                    Проверить
                  </Button>
                  {card.canGiveUp ? (
                    <Button
                      variant="ghost"
                      size="md"
                      block
                      disabled={busy}
                      onClick={() => grade.mutate({ card, answer: null })}
                    >
                      Не помню — покажи ответ
                    </Button>
                  ) : null}
                </div>
              ) : null}

              {result ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <Callout
                    tone={result.correct ? 'good' : 'info'}
                    icon={result.correct ? 'check' : 'info'}
                  >
                    {result.message}
                  </Callout>
                  {result.feedback ? (
                    <Callout
                      tone="info"
                      title={result.correct ? 'По грамматике, между делом' : undefined}
                    >
                      {result.feedback}
                    </Callout>
                  ) : null}
                </div>
              ) : null}
            </div>
          </Card>

          <div style={{ display: 'flex', gap: 12 }}>
            {phase.kind === 'card' ? (
              <Button
                variant="secondary"
                size="md"
                block
                style={{ flex: '1 1 0' }}
                disabled={busy}
                onClick={() => skip.mutate(card)}
              >
                Пропустить
              </Button>
            ) : (
              <Button
                variant="primary"
                size="md"
                block
                iconRight="chevron-right"
                style={{ flex: '1 1 0' }}
                disabled={busy}
                onClick={advance}
              >
                Дальше
              </Button>
            )}
          </div>
        </>
      ) : null}

      {state.data && state.data.queue.length > 0 ? (
        <ListGroup
          header={extra ? 'Дополнительная серия' : 'В очереди на сегодня'}
          footer="Порядок: просроченные → приоритетные → новые. Можно ответить на одну карточку и уйти — сессии нет. Ошибка не откатывает стадию, «Не помню» считается как ошибка: слово вернётся завтра."
        >
          {state.data.queue.slice(0, 3).map((w, k) => (
            <Cell
              key={w.id}
              to={`/words/${w.id}`}
              tile={w.word[0]}
              tileTone={TONES[k % TONES.length]}
              title={w.word}
              subtitle={`стадия ${w.stage} · ${STAGE_LABEL[w.stage]}${w.source === 'MANUAL' ? ' · добавил сам' : ''}`}
              badge={
                w.reason === 'OVERDUE'
                  ? 'просрочено'
                  : w.reason === 'PRIORITY'
                    ? 'приоритет'
                    : 'новое'
              }
              badgeTone={
                w.reason === 'OVERDUE' ? 'cards' : w.reason === 'PRIORITY' ? 'brand' : 'neutral'
              }
            />
          ))}
        </ListGroup>
      ) : null}
    </Screen>
  );
}
