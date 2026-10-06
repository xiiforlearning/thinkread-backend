import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ApiError,
  ERR,
  type IntakeResult,
  type Report,
  type ReportPatch,
  type ReportType,
} from '../api/types';
import { useInvalidateReports, useProfile, useProgress, useToday } from '../app/hooks';
import { ErrorBox, Screen } from '../app/Shell';
import { useApi } from '../app/session';
import { words } from '../lib/dates';
import { CLARIFY_FIELD_LABEL, METHOD_SHORT } from '../lib/labels';
import { haptic } from '../telegram/webapp';
import {
  Badge,
  Button,
  Callout,
  Card,
  Cell,
  ListGroup,
  MainButton,
  TextArea,
  TextField,
} from '../ui/components';

type Step =
  | { kind: 'type' }
  | { kind: 'text'; type: ReportType }
  | { kind: 'clarify'; type: ReportType; draftId: string; question: string; fields: string[] }
  | { kind: 'result'; type: ReportType; result: Extract<IntakeResult, { status: 'SAVED' }> };

const HINT: Record<ReportType, string> = {
  READING:
    'Книга (если та же — можно не писать), сколько страниц, о чём было, новые слова. Формат свободный.',
  LISTENING:
    'Название подкаста, % понимания с первого раза, сколько раз слушал, пересказ в 2–3 предложениях, новые слова. Формат свободный.',
};
const PLACEHOLDER: Record<ReportType, string> = {
  READING:
    'прочитал 15 страниц Гарри Поттера, про то как он узнал, что волшебник, новые слова: wand, muggle, enchanted',
  LISTENING:
    'слушал 6 Minute English про сон, с первого раза примерно 70%, слушал 3 раза, слова: drowsy, nap',
};

/** 07 · Сдать отчёт — type → free text → (one clarification) → parsed result the student can correct. */
export function SubmitReportScreen() {
  const api = useApi();
  const [params] = useSearchParams();
  const profile = useProfile();
  const today = useToday();
  const progress = useProgress();
  const invalidate = useInvalidateReports();
  const [step, setStep] = useState<Step>({ kind: 'type' });
  const [text, setText] = useState('');
  const [retell, setRetell] = useState('');
  const [edit, setEdit] = useState<ReportPatch>({});

  useEffect(() => {
    const t = params.get('type');
    if ((t === 'READING' || t === 'LISTENING') && step.kind === 'type')
      setStep({ kind: 'text', type: t });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onResult = (type: ReportType) => (r: IntakeResult) => {
    if (r.status === 'CLARIFY') {
      haptic('light');
      setStep({
        kind: 'clarify',
        type,
        draftId: r.draftId,
        question: r.question,
        fields: r.missingFields,
      });
    } else {
      haptic('success');
      invalidate();
      setEdit({});
      setStep({ kind: 'result', type, result: r });
    }
  };

  const submit = useMutation({
    mutationFn: (v: { type: ReportType; text: string }) => api.reports.submit(v.type, v.text),
    onSuccess: (r, v) => onResult(v.type)(r),
    onError: () => haptic('error'),
  });
  const clarify = useMutation({
    mutationFn: (v: { type: ReportType; draftId: string; text: string }) =>
      api.reports.clarify(v.draftId, v.text),
    onSuccess: (r, v) => onResult(v.type)(r),
    onError: () => haptic('error'),
  });
  const patch = useMutation({
    mutationFn: (v: { id: string; patch: ReportPatch }) => api.reports.patch(v.id, v.patch),
    onSuccess: () => {
      haptic('success');
      invalidate();
    },
  });

  const busy = submit.isPending || clarify.isPending;
  const error = submit.error ?? clarify.error;
  const dailyLimit = error instanceof ApiError && error.errorCode === ERR.DAILY_LIMIT;
  const week = progress.data?.week;
  const method = profile.data ? METHOD_SHORT[profile.data.listeningMethod] : '';

  const title =
    step.kind === 'type'
      ? 'Сдать отчёт'
      : step.kind === 'text'
        ? step.type === 'READING'
          ? 'Чтение'
          : 'Аудирование'
        : step.kind === 'clarify'
          ? 'Один вопрос'
          : 'Засчитано';

  const bottom =
    step.kind === 'text' ? (
      <MainButton
        disabled={text.trim().length < 5 || busy}
        onClick={() => submit.mutate({ type: step.type, text: text.trim() })}
      >
        {busy ? 'Разбираю…' : 'Отправить'}
      </MainButton>
    ) : step.kind === 'clarify' ? (
      <MainButton
        disabled={retell.trim().length < 1 || busy}
        onClick={() =>
          clarify.mutate({ type: step.type, draftId: step.draftId, text: retell.trim() })
        }
      >
        {busy ? 'Разбираю…' : 'Отправить ответ'}
      </MainButton>
    ) : step.kind === 'result' ? (
      <MainButton icon="check" to="/reports" onClick={() => savePatch(step.result.report)}>
        Всё верно
      </MainButton>
    ) : null;

  function savePatch(report: Report) {
    const changed = Object.fromEntries(
      Object.entries(edit).filter(
        ([k, v]) =>
          v !== undefined && v !== '' && v !== (report as unknown as Record<string, unknown>)[k],
      ),
    ) as ReportPatch;
    if (Object.keys(changed).length) patch.mutate({ id: report.id, patch: changed });
  }

  return (
    <Screen
      back={step.kind === 'type' || step.kind === 'result' ? '/reports' : undefined}
      bottom={bottom}
    >
      <h1 className="tr-h1-sm">{title}</h1>

      {step.kind === 'type' ? (
        <>
          <ListGroup
            header="Что сдаём"
            footer="Не больше одного отчёта каждого типа в день. Пиши свободно — разбор сделает AI, а ты поправишь, если что-то не так."
          >
            <Cell
              tileIcon="book"
              tileTone="brand"
              title="Чтение"
              subtitle={
                today.data?.READING
                  ? 'Сегодня уже сдано · следующий завтра'
                  : 'Книга, страницы, о чём, слова'
              }
              badge={today.data?.READING ? 'сдано' : undefined}
              badgeTone="good"
              norms={
                !today.data?.READING && week
                  ? `${week.reading.done}/${week.reading.norm}`
                  : undefined
              }
              chevron={!today.data?.READING}
              onClick={
                today.data?.READING ? undefined : () => setStep({ kind: 'text', type: 'READING' })
              }
            />
            <Cell
              tileIcon="headphones"
              tileTone="listen"
              title="Аудирование"
              subtitle={
                today.data?.LISTENING
                  ? 'Сегодня уже сдано · следующий завтра'
                  : `${method ? method.charAt(0).toUpperCase() + method.slice(1) : 'По методике уровня'}`
              }
              badge={today.data?.LISTENING ? 'сдано' : undefined}
              badgeTone="good"
              norms={
                !today.data?.LISTENING && week
                  ? `${week.listening.done}/${week.listening.norm}`
                  : undefined
              }
              chevron={!today.data?.LISTENING}
              onClick={
                today.data?.LISTENING
                  ? undefined
                  : () => setStep({ kind: 'text', type: 'LISTENING' })
              }
            />
          </ListGroup>
          <ListGroup header="Что засчитывается">
            <Cell
              tileIcon="check"
              tileTone="good"
              tileSize="sm"
              title="Описание и страницы"
              subtitle="Если чего-то нет, появится один вопрос"
            />
            <Cell
              tileIcon="plus"
              tileTone="cards"
              tileSize="sm"
              title="Новые слова"
              subtitle="Сразу попадают в словарь с переводом"
            />
            <Cell
              tileIcon="edit"
              tileTone="brand"
              tileSize="sm"
              title="Разбор можно поправить"
              subtitle="На следующем экране"
            />
          </ListGroup>
        </>
      ) : null}

      {step.kind === 'text' ? (
        <>
          {busy ? (
            <Callout tone="info" icon="spinner" title="Разбираю отчёт">
              Обычно 1–3 секунды.
            </Callout>
          ) : null}
          {dailyLimit ? (
            <Callout tone="warn" title="Сегодня уже сдано">
              Один отчёт каждого типа в день. Следующий можно сдать завтра.
            </Callout>
          ) : error ? (
            <ErrorBox error={error} />
          ) : null}
          <Card>
            <TextArea
              label={step.type === 'LISTENING' ? 'Что слушал и как прошло' : 'Что прочитал'}
              rows={8}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={PLACEHOLDER[step.type]}
              hint={HINT[step.type]}
              disabled={busy}
            />
            {step.type === 'LISTENING' ? (
              <div>
                <Button variant="ghost" size="sm" icon="headphones" to="/reports/method">
                  Напомнить методику и пример
                </Button>
              </div>
            ) : null}
          </Card>
          <Button
            variant="ghost"
            size="md"
            disabled={busy}
            onClick={() => setStep({ kind: 'type' })}
          >
            Назад к выбору
          </Button>
        </>
      ) : null}

      {step.kind === 'clarify' ? (
        <>
          {busy ? (
            <Callout tone="info" icon="spinner" title="Разбираю отчёт">
              Обычно 1–3 секунды.
            </Callout>
          ) : null}
          <Callout tone="brand" icon="chat">
            {step.question}
          </Callout>
          {error && !busy ? <ErrorBox error={error} /> : null}
          <Card>
            <TextArea
              label={step.fields.map((f) => CLARIFY_FIELD_LABEL[f] ?? f).join(', ') || 'Ответ'}
              rows={5}
              value={retell}
              onChange={(e) => setRetell(e.target.value)}
              placeholder={
                step.fields.includes('retelling')
                  ? 'The episode was about… The hosts said that…'
                  : 'Напиши ответ'
              }
              disabled={busy}
            />
          </Card>
        </>
      ) : null}

      {step.kind === 'result' ? (
        <ResultView result={step.result} edit={edit} setEdit={setEdit} />
      ) : null}
    </Screen>
  );
}

function ResultView({
  result,
  edit,
  setEdit,
}: {
  result: Extract<IntakeResult, { status: 'SAVED' }>;
  edit: ReportPatch;
  setEdit: (p: ReportPatch) => void;
}) {
  const r = result.report;
  const listening = r.type === 'LISTENING';
  const w = result.weekProgress;
  const head = listening
    ? `Аудирование ${w.listening.done}/${w.listening.norm} на этой неделе${result.words.added ? `, +${words(result.words.added)}` : ''}`
    : `Чтение ${w.reading.done}/${w.reading.norm} на этой неделе${result.words.added ? `, +${words(result.words.added)}` : ''}`;
  const num = (v: string): number | undefined => (v === '' ? undefined : Number(v));
  return (
    <>
      <Callout tone="good" icon="check" title={head}>
        Разбор ниже — поправь, если что-то не так.
      </Callout>
      <Card title="Что засчитано">
        <TextField
          label={listening ? 'Источник' : 'Книга'}
          value={edit.sourceTitle ?? r.sourceTitle ?? ''}
          onChange={(e) => setEdit({ ...edit, sourceTitle: e.target.value })}
        />
        <div style={{ display: 'flex', gap: 12 }}>
          {listening ? (
            <>
              <TextField
                label="Понимание, %"
                type="number"
                inputMode="numeric"
                value={edit.firstPassPct ?? r.firstPassPct ?? ''}
                onChange={(e) => setEdit({ ...edit, firstPassPct: num(e.target.value) })}
                style={{ flex: '1 1 0' }}
              />
              <TextField
                label="Прослушиваний"
                type="number"
                inputMode="numeric"
                value={edit.listenCount ?? r.listenCount ?? ''}
                onChange={(e) => setEdit({ ...edit, listenCount: num(e.target.value) })}
                style={{ flex: '1 1 0' }}
              />
            </>
          ) : (
            <>
              <TextField
                label="Страниц"
                type="number"
                inputMode="numeric"
                value={edit.pages ?? r.pages ?? ''}
                onChange={(e) => setEdit({ ...edit, pages: num(e.target.value) })}
                style={{ flex: '1 1 0' }}
              />
              <TextField
                label="О чём"
                value={edit.summary ?? r.summary ?? ''}
                onChange={(e) => setEdit({ ...edit, summary: e.target.value })}
                style={{ flex: '2 1 0' }}
              />
            </>
          )}
        </div>
        <span className="tr-field-label">
          {r.wordsAdded.length ? 'Новые слова · попали в словарь' : 'Новых слов в отчёте не было'}
        </span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {r.wordsAdded.map((x) => (
            <Badge key={x} tone="brand">
              {x}
            </Badge>
          ))}
        </div>
      </Card>
      <Button variant="secondary" size="md" block icon="book" to="/words">
        Посмотреть новые слова
      </Button>
    </>
  );
}
