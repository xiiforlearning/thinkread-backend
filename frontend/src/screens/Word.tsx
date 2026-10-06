import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { usePatchWord, useWord, useWordPriority } from '../app/hooks';
import { ErrorBox, Loading, Screen } from '../app/Shell';
import { fmtDay } from '../lib/dates';
import { SOURCE_LABEL } from '../lib/labels';
import { haptic } from '../telegram/webapp';
import {
  Badge,
  Button,
  Card,
  Cell,
  Chip,
  IconButton,
  ListGroup,
  MainButton,
  TextField,
} from '../ui/components';

const STAGE_NOTE: Record<1 | 2 | 3, string> = {
  1: 'Один верный ответ на стадии 1 — и слово встретится в предложении. Ошибка ничего не откатывает.',
  2: 'Один верный ответ на стадии 2 — и слово перейдёт к своему предложению. Ошибка ничего не откатывает.',
  3: 'Составь с ним своё предложение — и слово уйдёт в выученные.',
};

/** 04 · Слово */
export function WordScreen() {
  const { id = '' } = useParams();
  const word = useWord(id);
  const patch = usePatchWord(id);
  const priority = useWordPriority(id);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const w = word.data;
  if (word.isLoading)
    return (
      <Screen back="/words">
        <Loading />
      </Screen>
    );
  if (!w)
    return (
      <Screen back="/words">
        <ErrorBox
          error={word.error ?? new Error('Слово не найдено')}
          retry={() => word.refetch()}
        />
      </Screen>
    );

  const learned = w.status === 'LEARNED';
  const prio = w.priority === 'HIGH' && !learned;
  const source = SOURCE_LABEL[w.source];
  const sourceSub = `${fmtDay(w.createdAt)}${w.source === 'MANUAL' || w.source === 'IMPORT' || w.source === 'TEACHER' ? ' · такие слова сразу получают приоритет' : ' · слова из отчётов идут в обычную очередь'}`;

  return (
    <Screen
      back="/words"
      bottom={
        learned ? (
          <div className="tr tr-mainbar">
            <Button
              variant="secondary"
              size="lg"
              block
              icon="refresh"
              disabled={patch.isPending}
              onClick={() => patch.mutate({ status: 'LEARNING' })}
            >
              Вернуть в повторение
            </Button>
          </div>
        ) : (
          <MainButton
            icon="check"
            disabled={patch.isPending}
            onClick={() => {
              haptic('success');
              patch.mutate({ status: 'LEARNED' });
            }}
          >
            Это я уже знаю — выучено
          </MainButton>
        )
      }
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <h1 className="tr-word-title">{w.word}</h1>
          {!editing ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 17, lineHeight: '24px', color: 'var(--ink-2)' }}>
                {w.translation ?? 'перевод подбирается…'}
              </span>
              <IconButton
                icon="edit"
                label="Изменить перевод"
                size="sm"
                quiet
                onClick={() => {
                  setDraft(w.translation ?? '');
                  setEditing(true);
                }}
              />
            </div>
          ) : (
            <div className="tr-field-row">
              <TextField
                label="Перевод"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                autoFocus
              />
              <Button
                variant="primary"
                size="md"
                disabled={patch.isPending}
                onClick={() => {
                  const t = draft.trim();
                  if (t && t !== w.translation) patch.mutate({ translation: t });
                  setEditing(false);
                }}
              >
                Готово
              </Button>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <Badge tone={learned ? 'good' : 'brand'}>
            {learned ? 'выучено' : (w.cefr ?? 'уровень?')}
          </Badge>
          {prio ? <Badge tone="cards">приоритет</Badge> : null}
        </div>
      </div>

      {patch.error ? <ErrorBox error={patch.error} /> : null}
      {priority.error ? <ErrorBox error={priority.error} /> : null}

      {!learned ? (
        <Card title="Повторение" meta={prio ? 'приоритет включён' : 'обычная очередь'}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="tr-muted" style={{ flexGrow: 1 }}>
              Приоритетные слова идут в очереди карточек сразу после просроченных — не потеряются в
              большом словаре. Интервалы 1 / 3 / 7 дней не меняются.
            </span>
            <Chip
              selected={prio}
              icon={prio ? 'check' : 'plus'}
              disabled={priority.isPending}
              onClick={() => priority.mutate(prio ? 'NORMAL' : 'HIGH')}
            >
              {prio ? 'В приоритете' : 'Повторять чаще'}
            </Chip>
          </div>
        </Card>
      ) : null}

      <ListGroup header="Источник">
        <Cell
          tileIcon={
            w.source === 'MANUAL'
              ? 'plus'
              : w.source === 'TEACHER'
                ? 'list'
                : w.source === 'READING'
                  ? 'book'
                  : w.source === 'IMPORT'
                    ? 'upload'
                    : 'headphones'
          }
          tileTone="brand"
          title={source}
          subtitle={sourceSub}
        />
      </ListGroup>

      {w.example ? (
        <Card title="Пример">
          <p style={{ margin: 0, fontSize: 16, lineHeight: '24px' }}>{w.example}</p>
        </Card>
      ) : null}

      <Card title="Стадия карточек" meta={learned ? 'пройдено' : `${w.stage} из 3`}>
        <div style={{ display: 'flex', gap: 6 }}>
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`tr-stage-bar${learned || s <= w.stage ? ' tr-stage-bar-on' : ''}`}
            />
          ))}
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 11,
            color: 'var(--ink-2)',
          }}
        >
          <span>Перевод</span>
          <span>В предложении</span>
          <span>Своё предложение</span>
        </div>
        <span className="tr-muted">
          {learned
            ? 'Слово выучено: стадии пройдены, в карточки больше не попадает.'
            : STAGE_NOTE[w.stage]}
        </span>
        {!learned ? (
          <div>
            <Button variant="tonal" size="sm" icon="cards" to="/cards">
              Потренировать это слово
            </Button>
          </div>
        ) : null}
      </Card>

      <span className="tr-muted" style={{ fontSize: 12, lineHeight: '16px', textAlign: 'center' }}>
        Выученные слова не удаляются и не попадают в карточки. Стадия сохраняется.
      </span>
    </Screen>
  );
}
