import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { Word } from '../api/types';
import { useInvalidateWords, useProfile, useRecommendations } from '../app/hooks';
import { ErrorBox, Loading, Screen } from '../app/Shell';
import { useApi } from '../app/session';
import { words as wordsLabel } from '../lib/dates';
import { haptic } from '../telegram/webapp';
import { Button, Callout, CheckRow, ListGroup, MainButton } from '../ui/components';

type Step = { kind: 'list' } | { kind: 'done'; added: Word[] } | { kind: 'hidden' };

/** 05b · Слова от учителя — recommended list words the student does not have yet. */
export function TeacherWordsScreen() {
  const api = useApi();
  const invalidate = useInvalidateWords();
  const recs = useRecommendations();
  const profile = useProfile();
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [step, setStep] = useState<Step>({ kind: 'list' });

  const rec = recs.data?.[0] ?? null;
  const items = rec?.items ?? [];

  useEffect(() => {
    if (rec && step.kind === 'list') setChecked(new Set(rec.items.map((i) => i.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec?.list.id]);

  const accept = useMutation({
    mutationFn: (ids: string[]) => api.me.acceptRecommendations(ids),
    onSuccess: (r) => {
      haptic('success');
      invalidate();
      setStep({ kind: 'done', added: r.added });
    },
    onError: () => haptic('error'),
  });
  const dismiss = useMutation({
    mutationFn: () => api.me.dismissRecommendations('all'),
    onSuccess: () => {
      invalidate();
      setStep({ kind: 'hidden' });
    },
  });

  const count = checked.size;
  const bottom =
    step.kind === 'list' && rec ? (
      <MainButton
        icon="plus"
        disabled={count === 0 || accept.isPending}
        onClick={() => accept.mutate([...checked])}
      >
        {accept.isPending ? 'Добавляю…' : `Добавить ${count}`}
      </MainButton>
    ) : (
      <MainButton icon="book" to="/words">
        {step.kind === 'hidden' ? 'В словарь' : 'Открыть словарь'}
      </MainButton>
    );

  return (
    <Screen back="/words" bottom={bottom}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span className="tr-eyebrow tr-eyebrow-brand">Рекомендовано учителем</span>
        <h1 className="tr-h1-sm">{rec?.list.title ?? 'Слова от учителя'}</h1>
        <span className="tr-muted">
          Рустам{profile.data?.groups[0] ? ` · для группы ${profile.data.groups[0].title}` : ''}
          {rec ? ` · ${wordsLabel(items.length)}, которых у тебя нет` : ''}
        </span>
      </div>

      {recs.isLoading ? <Loading /> : null}
      {recs.error ? <ErrorBox error={recs.error} retry={() => recs.refetch()} /> : null}

      {step.kind === 'list' && recs.data && !rec ? (
        <Callout tone="info" icon="info" title="Новых слов нет">
          Все слова из списков учителя уже в твоём словаре — или списков пока нет.
        </Callout>
      ) : null}

      {step.kind === 'list' && rec ? (
        <>
          <Callout
            tone="brand"
            icon="list"
            title={`${wordsLabel(items.length)}, которых у тебя нет`}
          >
            Это не обязательный импорт: ты сам решаешь, что добавить. Добавленные слова получат
            приоритет и пойдут в карточки сразу после просроченных.
          </Callout>
          {accept.error ? <ErrorBox error={accept.error} /> : null}
          <ListGroup
            header={`Нет в твоём словаре · ${items.length}`}
            footer="Слова из списка, которые у тебя уже есть, не трогаем — стадии сохраняются."
          >
            {items.map((it) => (
              <CheckRow
                key={it.id}
                checked={checked.has(it.id)}
                onChange={(v) => {
                  const next = new Set(checked);
                  if (v) next.add(it.id);
                  else next.delete(it.id);
                  setChecked(next);
                }}
                title={it.word}
                subtitle={it.translation ?? 'перевод подберёт AI'}
              />
            ))}
          </ListGroup>
          <Button
            variant="ghost"
            size="md"
            disabled={dismiss.isPending}
            onClick={() => dismiss.mutate()}
          >
            Скрыть этот список
          </Button>
        </>
      ) : null}

      {step.kind === 'done' ? (
        <>
          <Callout tone="good" icon="check" title={`Добавлено ${wordsLabel(step.added.length)}`}>
            Все со статусом «изучается», стадия 1, с приоритетом. Первые появятся в карточках уже
            сегодня.
          </Callout>
          <Button variant="secondary" size="md" block icon="cards" to="/cards">
            Повторить сейчас
          </Button>
        </>
      ) : null}

      {step.kind === 'hidden' ? (
        <Callout tone="info" icon="info" title="Список скрыт">
          Больше не будем его предлагать. Рустам увидит, что ты его не добавил. Слова всегда можно
          добавить вручную в словаре.
        </Callout>
      ) : null}
    </Screen>
  );
}
