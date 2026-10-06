import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import type { ImportPreview, Word } from '../api/types';
import { useInvalidateWords } from '../app/hooks';
import { ErrorBox, Screen } from '../app/Shell';
import { useApi } from '../app/session';
import { words as wordsLabel } from '../lib/dates';
import { haptic } from '../telegram/webapp';
import { Button, Callout, Card, CheckRow, ListGroup, MainButton, TextArea } from '../ui/components';

type Step =
  | { kind: 'input' }
  | { kind: 'preview'; preview: ImportPreview; excluded: Set<string> }
  | { kind: 'done'; added: Word[] };

/**
 * 05 · Добавить слова — free text or a .txt/.csv file → preview with checkboxes
 * (duplicates greyed out) → confirm. Always goes through the import preview so
 * the student sees what will be added, whatever the size of the list.
 */
export function AddWordsScreen() {
  const api = useApi();
  const invalidate = useInvalidateWords();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [step, setStep] = useState<Step>({ kind: 'input' });

  const parse = useMutation({
    mutationFn: (t: string) => api.words.importText(t),
    onSuccess: (preview) => {
      haptic('light');
      setStep({ kind: 'preview', preview, excluded: new Set() });
    },
    onError: () => haptic('error'),
  });
  const confirm = useMutation({
    mutationFn: (v: { id: string; exclude: string[] }) => api.words.confirmImport(v.id, v.exclude),
    onSuccess: (r) => {
      haptic('success');
      invalidate();
      setStep({ kind: 'done', added: r.words });
    },
    onError: () => haptic('error'),
  });
  const cancel = useMutation({ mutationFn: (id: string) => api.words.cancelImport(id) });

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const content = await f.text();
    setText(content);
  };

  const title =
    step.kind === 'input'
      ? 'Добавить слова'
      : step.kind === 'preview'
        ? 'Проверь список'
        : 'Готово';
  const toAdd =
    step.kind === 'preview'
      ? step.preview.items.filter((i) => !i.duplicate && !step.excluded.has(i.word)).length
      : 0;

  const bottom =
    step.kind === 'input' ? (
      <MainButton disabled={!text.trim() || parse.isPending} onClick={() => parse.mutate(text)}>
        {parse.isPending ? 'Разбираю…' : 'Разобрать список'}
      </MainButton>
    ) : step.kind === 'preview' ? (
      <MainButton
        icon="plus"
        disabled={toAdd === 0 || confirm.isPending}
        onClick={() => confirm.mutate({ id: step.preview.importId, exclude: [...step.excluded] })}
      >
        {confirm.isPending ? 'Добавляю…' : `Добавить ${toAdd}`}
      </MainButton>
    ) : (
      <MainButton icon="book" to="/words">
        Открыть словарь
      </MainButton>
    );

  return (
    <Screen back="/words" bottom={bottom}>
      <h1 className="tr-h1-sm">{title}</h1>

      {step.kind === 'input' ? (
        <>
          {parse.error ? <ErrorBox error={parse.error} /> : null}
          <Card>
            <TextArea
              label="Список слов"
              rows={7}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={'resilient — стойкий\nstubborn\nto look forward to, cheat, nap…'}
              hint="Как угодно: через запятую, в столбик, с переводом или без. Перевод, пример и уровень подберёт AI, твой перевод — в приоритете."
            />
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.csv,text/plain,text/csv"
              style={{ display: 'none' }}
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
            <Button
              variant="secondary"
              size="md"
              block
              icon="upload"
              onClick={() => fileRef.current?.click()}
            >
              Или файл .txt / .csv
            </Button>
          </Card>
        </>
      ) : null}

      {step.kind === 'preview' ? (
        <>
          <Callout tone="brand" title={`Нашёл ${wordsLabel(step.preview.found)}`}>
            {step.preview.duplicates
              ? `${step.preview.duplicates} уже есть в словаре — их пропущу. `
              : ''}
            Сними галочку с лишних.
          </Callout>
          {confirm.error ? <ErrorBox error={confirm.error} /> : null}
          <ListGroup header="Новые слова">
            {step.preview.items.map((it) => (
              <CheckRow
                key={it.word}
                checked={!it.duplicate && !step.excluded.has(it.word)}
                disabled={it.duplicate}
                onChange={(v) => {
                  const excluded = new Set(step.excluded);
                  if (v) excluded.delete(it.word);
                  else excluded.add(it.word);
                  setStep({ ...step, excluded });
                }}
                title={it.word}
                subtitle={it.translation ?? 'перевод подберёт AI'}
                badge={it.duplicate ? 'уже есть' : undefined}
                badgeTone="neutral"
              />
            ))}
          </ListGroup>
          <Button
            variant="ghost"
            size="md"
            onClick={() => {
              cancel.mutate(step.preview.importId);
              setStep({ kind: 'input' });
            }}
          >
            Отмена
          </Button>
        </>
      ) : null}

      {step.kind === 'done' ? (
        <>
          <Callout tone="good" icon="check" title={`Добавлено ${wordsLabel(step.added.length)}`}>
            Все со статусом «изучается», стадия 1, с приоритетом. Завтра они начнут появляться в
            карточках.
          </Callout>
          <Button variant="secondary" size="md" block icon="cards" to="/cards">
            Повторить сейчас
          </Button>
        </>
      ) : null}
    </Screen>
  );
}
