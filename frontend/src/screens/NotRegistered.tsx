import { Screen } from '../app/Shell';
import { useSession } from '../app/session';
import { Cell, LetterTile, ListGroup, MainButton } from '../ui/components';

/** 10 · Нет доступа — not in any of the school's Telegram groups (or archived). */
export function NotRegisteredScreen({ archived }: { archived: boolean }) {
  const { refresh, state } = useSession();
  return (
    <Screen
      bottom={
        <MainButton icon="refresh" onClick={refresh} disabled={state.kind === 'loading'}>
          Проверить снова
        </MainButton>
      }
    >
      <div className="tr-center">
        <LetterTile
          icon="lock"
          size="md"
          tone="brand"
          style={{ transform: 'scale(1.6)', margin: '16px 0' }}
        />
        <h1 className="tr-h1">{archived ? 'Доступ закрыт' : 'Пока нет доступа'}</h1>
        <p className="tr-body" style={{ margin: 0, color: 'var(--ink-2)' }}>
          {archived
            ? 'Твой аккаунт в архиве: ты больше не состоишь ни в одной учебной группе. Если это ошибка — напиши Рустаму.'
            : 'ThinkRead работает для студентов групп Рустама. Мы не нашли тебя ни в одной учебной группе в Telegram.'}
        </p>
        {!archived ? (
          <ListGroup style={{ width: '100%', textAlign: 'left' }}>
            <Cell
              tile="1"
              tileTone="brand"
              title="Вступи в группу своего уровня"
              subtitle="Ссылку даёт Рустам"
            />
            <Cell
              tile="2"
              tileTone="brand"
              title="Нажми «Проверить снова»"
              subtitle="Мы сразу увидим тебя в группе"
            />
          </ListGroup>
        ) : null}
        <span className="tr-muted" style={{ fontSize: 12, lineHeight: '16px' }}>
          Если ты уже учишься у Рустама, а группы нет — напиши ему, он добавит тебя вручную.
        </span>
      </div>
    </Screen>
  );
}
