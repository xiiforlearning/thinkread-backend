import { useProfile } from '../app/hooks';
import { Loading, Screen } from '../app/Shell';
import { levelLabel, METHOD_EXAMPLE, METHOD_LABEL, METHOD_STEPS } from '../lib/labels';
import { Button, Card, Cell, ListGroup, SegmentedControl } from '../ui/components';

/** 08 · Как слушать — the listening method for the student's level, 6 steps + sample report. */
export function MethodScreen() {
  const profile = useProfile();
  const p = profile.data;
  const method = p?.listeningMethod ?? 'PODCAST_NO_TRANSCRIPT';
  return (
    <Screen
      tab="reports"
      head={
        <>
          <h1 className="tr-h1">Отчёты</h1>
          <SegmentedControl
            value="method"
            options={[
              { value: 'history', label: 'История', to: '/reports' },
              { value: 'method', label: 'Как слушать', to: '/reports/method' },
            ]}
            label="Раздел"
          />
        </>
      }
    >
      {!p ? <Loading /> : null}
      <Card title={METHOD_LABEL[method]} meta={levelLabel(p?.level ?? null)}>
        <span className="tr-muted">
          Уровень берётся из твоей группы.{' '}
          {p?.retellingRequired
            ? 'Пересказ в отчёте обязателен — это главная часть работы.'
            : 'Главное в отчёте — честный процент понимания с первого раза.'}
        </span>
      </Card>

      <ListGroup header="Шесть шагов">
        {METHOD_STEPS[method].map((s, i) => (
          <Cell
            key={i}
            tile={String(i + 1)}
            tileTone={i === 5 ? 'listen' : 'brand'}
            title={s.title}
            subtitle={s.subtitle}
          />
        ))}
      </ListGroup>

      <Card title="Пример отчёта" meta="формат свободный">
        <pre className="tr-pre">{METHOD_EXAMPLE[method]}</pre>
      </Card>

      <Button variant="primary" size="lg" block icon="edit" to="/reports/new?type=LISTENING">
        Сдать отчёт об аудировании
      </Button>
    </Screen>
  );
}
