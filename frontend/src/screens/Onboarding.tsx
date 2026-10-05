import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, ERR } from '../api/types';
import { useProfile } from '../app/hooks';
import { ErrorBox, Screen } from '../app/Shell';
import { useApi, useSession } from '../app/session';
import { levelLabel, METHOD_SHORT } from '../lib/labels';
import { haptic } from '../telegram/webapp';
import { Callout, Card, Cell, ListGroup, MainButton, TextField } from '../ui/components';

const NAME_RE = /^[\p{L}][\p{L}'’-]{1,}$/u;
const valid = (s: string) => NAME_RE.test(s.trim());

/** 00 · Первый вход — the group member says their real first and last name. */
export function OnboardingScreen() {
  const api = useApi();
  const { activate } = useSession();
  const navigate = useNavigate();
  const profile = useProfile();
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [touched, setTouched] = useState(false);

  const ok = valid(first) && valid(last);
  const invalid = touched && (first.trim().length > 1 || last.trim().length > 1) && !ok;

  const register = useMutation({
    mutationFn: () => api.me.register(first.trim(), last.trim()),
    onSuccess: () => {
      haptic('success');
      activate();
      navigate('/', { replace: true });
    },
    onError: () => haptic('error'),
  });

  const group = profile.data?.groups[0];
  const nameInvalidFromServer =
    register.error instanceof ApiError && register.error.errorCode === ERR.NAME_INVALID;

  return (
    <Screen
      bottom={
        <MainButton
          icon="check"
          disabled={!ok || register.isPending}
          onClick={() => register.mutate()}
        >
          {register.isPending ? 'Сохраняю…' : 'Начать'}
        </MainButton>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span className="tr-eyebrow tr-eyebrow-brand">Первый вход</span>
        <h1 className="tr-h1">Привет! Давай познакомимся</h1>
        <span className="tr-body" style={{ color: 'var(--ink-2)' }}>
          Мы нашли тебя в группе Рустама. Осталось сказать, как тебя зовут — так учитель увидит тебя
          в списке.
        </span>
      </div>

      <ListGroup header="Твоя группа">
        <Cell
          tileIcon="users"
          tileTone="brand"
          title={group?.title ?? profile.data?.groups.map((g) => g.title).join(', ') ?? 'Группа'}
          subtitle={
            profile.data
              ? `${levelLabel(profile.data.level)} · ${METHOD_SHORT[profile.data.listeningMethod]}`
              : '…'
          }
        />
      </ListGroup>

      <Card title="Имя и фамилия" meta="настоящие, не ник">
        <TextField
          label="Имя"
          value={first}
          onChange={(e) => {
            setFirst(e.target.value);
            setTouched(true);
          }}
          placeholder="Акмаль"
          autoComplete="given-name"
          autoCapitalize="words"
        />
        <TextField
          label="Фамилия"
          value={last}
          onChange={(e) => {
            setLast(e.target.value);
            setTouched(true);
          }}
          placeholder="Хадиев"
          autoComplete="family-name"
          autoCapitalize="words"
          hint={
            ok
              ? `Отлично, ${first.trim()} ${last.trim()}. Можно начинать.`
              : 'Как в паспорте или как тебя зовут на уроке'
          }
        />
        {invalid || nameInvalidFromServer ? (
          <Callout tone="warn" icon="info">
            Похоже, это не имя и фамилия. Нужны настоящие, только буквы и дефис.
          </Callout>
        ) : null}
        {register.error && !nameInvalidFromServer ? <ErrorBox error={register.error} /> : null}
      </Card>

      <ListGroup
        header="Как это работает"
        footer="Напоминания будут приходить сообщениями от бота — с кнопкой, которая открывает приложение."
      >
        <Cell
          tileIcon="book"
          tileTone="brand"
          tileSize="sm"
          title="3 отчёта о чтении в неделю"
          subtitle="Книга, страницы, о чём, новые слова"
        />
        <Cell
          tileIcon="headphones"
          tileTone="listen"
          tileSize="sm"
          title="3 отчёта об аудировании"
          subtitle="По методике своего уровня"
        />
        <Cell
          tileIcon="cards"
          tileTone="cards"
          tileSize="sm"
          title="5 карточек в день"
          subtitle="Слова из твоих отчётов и списков учителя"
        />
      </ListGroup>
    </Screen>
  );
}
