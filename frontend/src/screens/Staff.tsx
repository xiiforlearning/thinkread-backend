import { Screen } from '../app/Shell';
import { openDashboard, useSession } from '../app/session';
import { Cell, LetterTile, ListGroup, MainButton } from '../ui/components';

/** Owner / teacher without a student account: the Mini App hands them to the dashboard. */
export function StaffScreen() {
  const { state, demo } = useSession();
  const roles = state.kind === 'ready' ? state.roles : [];
  const owner = roles.includes('OWNER');
  return (
    <Screen
      bottom={
        <MainButton icon="grid" onClick={() => openDashboard(roles, demo)}>
          Открыть дашборд
        </MainButton>
      }
    >
      <div className="tr-center">
        <LetterTile
          icon="grid"
          size="md"
          tone="brand"
          style={{ transform: 'scale(1.6)', margin: '16px 0' }}
        />
        <h1 className="tr-h1">{owner ? 'Вы владелец школы' : 'Вы учитель'}</h1>
        <p className="tr-body" style={{ margin: 0, color: 'var(--ink-2)' }}>
          Это приложение для студентов: отчёты, словарь, карточки. Ваш инструмент — дашборд: обзор
          недели, студенты, флаги, группы{owner ? ', настройки' : ''}.
        </p>
        <ListGroup style={{ width: '100%', textAlign: 'left' }}>
          <Cell
            tile="1"
            tileTone="brand"
            title="Кнопка внизу"
            subtitle="Вход через Telegram уже выполнен"
          />
          <Cell
            tile="2"
            tileTone="brand"
            title="На компьютере удобнее"
            subtitle="Тот же адрес + /admin.html"
          />
        </ListGroup>
        <span className="tr-muted" style={{ fontSize: 12, lineHeight: '16px' }}>
          Если вы ещё и учитесь в одной из групп, попросите владельца добавить вас как студента.
        </span>
      </div>
    </Screen>
  );
}
