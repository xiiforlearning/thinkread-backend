import { useMemo, useState } from 'react';
import type { Word } from '../api/types';
import { useProgress, useWords } from '../app/hooks';
import { Loading, Screen } from '../app/Shell';
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

const NORM = 5;
const TONES: Tone[] = ['brand', 'rose', 'listen', 'cards'];

type Phase = 'ask' | 'checking' | 'right' | 'wrong' | 'finished';

function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[.!?,]/g, '');
}

/** Queue order from the customer decisions: overdue → priority → new; stage 3 at most two in a row. */
function buildQueue(words: Word[]): Word[] {
  const now = Date.now();
  const learning = words.filter((w) => w.status !== 'LEARNED');
  const overdue = learning.filter((w) => w.nextDueAt && new Date(w.nextDueAt).getTime() <= now);
  const rest = learning.filter((w) => !overdue.includes(w));
  const prio = rest.filter((w) => w.priority === 'HIGH');
  const fresh = rest.filter((w) => w.priority !== 'HIGH');
  const ordered = [...overdue, ...prio, ...fresh];
  const out: Word[] = [];
  let s3 = 0;
  const deferred: Word[] = [];
  for (const w of ordered) {
    if (w.stage === 3) {
      if (s3 >= 2) {
        deferred.push(w);
        continue;
      }
      s3 += 1;
    } else s3 = 0;
    out.push(w);
  }
  return [...out, ...deferred];
}

/** Masks the word inside its example for the stage-2 gap task. */
function gap(w: Word): string | null {
  if (!w.example) return null;
  const re = new RegExp(`\\b${w.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\w*`, 'i');
  if (!re.test(w.example)) return null;
  return w.example.replace(re, '___');
}

/**
 * 02 · Карточки. The card engine (stage 7) is not on the backend yet, so this
 * screen runs the three stages locally on the real queue: translation (typed),
 * gap in the example, own sentence. Progress is not saved yet — the callout
 * says so until the cards API lands.
 */
export function CardsScreen() {
  const progress = useProgress();
  const all = useWords({ status: 'LEARNING', limit: 100 });
  const queue = useMemo(() => buildQueue(all.data ?? []), [all.data]);

  const [i, setI] = useState(0);
  const [answer, setAnswer] = useState('');
  const [phase, setPhase] = useState<Phase>('ask');
  const [done, setDone] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [extra, setExtra] = useState(false);

  const card = queue.length ? queue[i % queue.length] : null;
  const stage = card?.stage ?? 1;
  const gapText = card ? gap(card) : null;
  const effectiveStage = stage === 2 && !gapText ? 1 : stage;

  const settle = (ok: boolean) => {
    haptic(ok ? 'success' : 'error');
    setPhase(ok ? 'right' : 'wrong');
    setDone((d) => Math.min(NORM, d + 1));
    if (ok) setCorrect((c) => c + 1);
  };

  const check = () => {
    if (!card) return;
    if (effectiveStage === 3) {
      setPhase('checking');
      setTimeout(
        () =>
          settle(
            normalize(answer).includes(normalize(card.word).split(' ')[0]) &&
              answer.trim().split(/\s+/).length >= 4,
          ),
        1200,
      );
      return;
    }
    const expected = normalize(card.word);
    const given = normalize(answer).replace(/^to\s+/, '');
    settle(given === expected.replace(/^to\s+/, ''));
  };

  const advance = () => {
    if (done >= NORM) {
      setPhase('finished');
      setAnswer('');
      return;
    }
    setI((n) => n + 1);
    setAnswer('');
    setPhase('ask');
  };

  const startExtra = () => {
    setExtra(true);
    setDone(0);
    setCorrect(0);
    setI((n) => n + 1);
    setAnswer('');
    setPhase('ask');
  };

  const prompt =
    effectiveStage === 1
      ? 'Переведи на английский'
      : effectiveStage === 2
        ? gapText
        : 'Составь предложение со словом';
  const big =
    effectiveStage === 1
      ? (card?.translation ?? card?.word)
      : effectiveStage === 3
        ? card?.word
        : '';
  const hint = effectiveStage === 2 ? `(${card?.translation ?? '…'})` : '';
  const placeholder =
    effectiveStage === 1
      ? 'Напиши по-английски'
      : effectiveStage === 2
        ? 'Впиши слово'
        : 'Напиши предложение';
  const praise =
    effectiveStage === 1
      ? `Точно, ${card?.word}. Слово переходит на стадию 2 — завтра встретимся с ним в предложении.`
      : effectiveStage === 2
        ? `Да, ${card?.word}. Слово сидит — через 3 дня попросим составить с ним своё предложение.`
        : `Отлично, слово употреблено по смыслу — ${card?.word} уходит в выученные.`;
  const wrong =
    effectiveStage === 3
      ? `Похоже, слово употреблено не совсем по смыслу. ${card?.word} — «${card?.translation ?? '…'}»${card?.example ? `: “${card.example}”` : ''}. Попробуем в другой раз.`
      : `Правильный ответ: ${card?.word}. Ничего страшного, вернёмся к нему завтра.`;

  const finished = phase === 'finished';
  const cardsApi = progress.data?.cards.available ?? false;

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
            {extra ? `Дополнительно · ${done}/${NORM}` : `Сегодня ${done}/${NORM}`}
          </span>
          <div style={{ display: 'flex', gap: 5 }} aria-hidden="true">
            {Array.from({ length: NORM }, (_, k) => (
              <span
                key={k}
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  background:
                    k < done ? (extra ? 'var(--brand)' : 'var(--cards)') : 'var(--line-strong)',
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {!cardsApi ? (
        <Callout tone="warn" icon="info">
          Прогресс карточек пока не сохраняется: эта часть сервера появится следующей. Можно
          тренироваться — стадии пока не меняются.
        </Callout>
      ) : null}
      {extra ? (
        <Callout tone="brand" icon="cards">
          Дополнительная серия: в норму дня не входит, но так же двигает слова по стадиям.
        </Callout>
      ) : null}

      {all.isLoading ? <Loading /> : null}
      {all.data && queue.length === 0 ? (
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
              Слова появятся из отчётов, списков учителя или добавь их сам.
            </p>
          </div>
          <Button variant="primary" size="lg" block icon="plus" to="/words/add">
            Добавить слова
          </Button>
        </Card>
      ) : null}

      {finished ? (
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
            <h2 className="tr-h1-sm">{extra ? 'Ещё пять позади' : 'На сегодня всё повторено'}</h2>
            <p className="tr-muted" style={{ margin: 0, fontSize: 14, lineHeight: '20px' }}>
              {extra
                ? 'Дополнительная серия закончена. '
                : `Норма дня выполнена: ${NORM} из ${NORM}, верно ${correct}. `}
              Хочешь — возьми ещё пять слов, следующие плановые появятся завтра.
            </p>
          </div>
          <Button variant="primary" size="lg" block icon="cards" onClick={startExtra}>
            Ещё 5 слов
          </Button>
          <Button variant="ghost" size="md" block to="/">
            На сегодня хватит
          </Button>
        </Card>
      ) : null}

      {card && !finished ? (
        <>
          <Card>
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '4px 4px 0' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Badge tone="brand">
                  Стадия {effectiveStage} · {STAGE_LABEL[effectiveStage as 1 | 2 | 3]}
                </Badge>
                <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>
                  {effectiveStage === 1
                    ? 'ввод с клавиатуры'
                    : effectiveStage === 2
                      ? 'подсказка ниже'
                      : 'проверяет AI'}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 17, lineHeight: '24px', color: 'var(--ink-2)' }}>
                  {prompt}
                </div>
                {big ? <div className="tr-word-title">{big}</div> : null}
                {hint ? <div style={{ fontSize: 15, color: 'var(--ink-2)' }}>{hint}</div> : null}
              </div>

              {phase === 'ask' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <TextField
                    label="Твой ответ"
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    placeholder={placeholder}
                    autoComplete="off"
                    autoCapitalize="none"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && answer.trim()) check();
                    }}
                  />
                  <Button
                    variant="primary"
                    size="lg"
                    block
                    disabled={!answer.trim()}
                    onClick={check}
                  >
                    Проверить
                  </Button>
                  {effectiveStage !== 3 ? (
                    <Button variant="ghost" size="md" block onClick={() => settle(false)}>
                      Не помню — покажи ответ
                    </Button>
                  ) : null}
                </div>
              ) : null}

              {phase === 'checking' ? (
                <Callout tone="info" icon="spinner">
                  Смотрю, как ты употребил слово…
                </Callout>
              ) : null}
              {phase === 'right' ? (
                <Callout tone="good" icon="check">
                  {praise}
                </Callout>
              ) : null}
              {phase === 'wrong' ? (
                <Callout tone="info" icon="info">
                  {wrong}
                </Callout>
              ) : null}
            </div>
          </Card>

          <div style={{ display: 'flex', gap: 12 }}>
            <Button variant="secondary" size="md" block style={{ flex: '1 1 0' }} onClick={advance}>
              Пропустить
            </Button>
            {phase === 'right' || phase === 'wrong' ? (
              <Button
                variant="primary"
                size="md"
                block
                iconRight="chevron-right"
                style={{ flex: '1 1 0' }}
                onClick={advance}
              >
                Дальше
              </Button>
            ) : null}
          </div>
        </>
      ) : null}

      {queue.length ? (
        <ListGroup
          header={extra ? 'Дополнительная серия' : 'В очереди на сегодня'}
          footer="Порядок: просроченные → приоритетные → новые. Можно ответить на одну карточку и уйти — сессии нет. Ошибка не откатывает стадию, «Не помню» считается как ошибка: слово вернётся завтра."
        >
          {queue.slice(i % queue.length, (i % queue.length) + 3).map((w, k) => {
            const overdue = w.nextDueAt && new Date(w.nextDueAt).getTime() <= Date.now();
            return (
              <Cell
                key={w.id}
                to={`/words/${w.id}`}
                tile={w.word[0]}
                tileTone={TONES[k % TONES.length]}
                title={w.word}
                subtitle={`стадия ${w.stage} · ${STAGE_LABEL[w.stage]}${w.source === 'MANUAL' ? ' · добавил сам' : ''}`}
                badge={overdue ? 'просрочено' : w.priority === 'HIGH' ? 'приоритет' : 'новое'}
                badgeTone={overdue ? 'cards' : w.priority === 'HIGH' ? 'brand' : 'neutral'}
              />
            );
          })}
        </ListGroup>
      ) : null}
    </Screen>
  );
}
