/**
 * ThinkRead Design System — React port of `components/bundle.js` from the
 * "ThinkRead Design System" artifact. Class names and props mirror the bundle
 * so screens can be transcribed from the design artboards one to one.
 * Every visual value comes from tokens.css; this file only arranges markup.
 */
import {
  type ButtonHTMLAttributes,
  type CSSProperties,
  type InputHTMLAttributes,
  type MouseEvent,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useId,
} from 'react';
import { Link } from 'react-router-dom';

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/* ---------- Icon ---------- */

const PATHS = {
  home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  cards: 'M6 5h12a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3zM7 9h6M7 13h10',
  book: 'M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4zM20 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  headphones:
    'M3 18v-6a9 9 0 0 1 18 0v6M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  plus: 'M12 5v14M5 12h14',
  check: 'M20 6L9 17l-5-5',
  'chevron-right': 'M9 6l6 6-6 6',
  'chevron-left': 'M15 6l-6 6 6 6',
  'chevron-down': 'M6 9l6 6 6-6',
  search: 'M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM20 20l-3.5-3.5',
  download: 'M12 3v12M6 9l6 6 6-6M4 17v3h16v-3',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  flag: 'M4 22V4a1 1 0 0 1 1-1h13l-2 5 2 5H5',
  users:
    'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  chat: 'M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12z',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8v5M12 16h.01',
  dots: 'M4.5 12h1.2M11.4 12h1.2M18.3 12h1.2',
  close: 'M6 6l12 12M18 6L6 18',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  alert: 'M12 3l10 18H2zM12 10v4M12 17h.01',
  spinner: 'M12 3a9 9 0 1 0 9 9',
  lock: 'M6 10h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2zM8 10V7a4 4 0 0 1 8 0v3',
  refresh: 'M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6',
  star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z',
  send: 'M22 2L11 13M22 2l-7 20-4-9-9-4z',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size,
  className,
  label,
  style,
}: {
  name: IconName;
  size?: 'lg';
  className?: string;
  label?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      className={cx(
        'tr-icon',
        size === 'lg' && 'tr-icon-lg',
        name === 'spinner' && 'tr-spin',
        className,
      )}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
      style={style}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/* ---------- Link-or-button helper ---------- */

type Clickable = {
  /** In-app route (React Router) */
  to?: string;
  /** External URL */
  href?: string;
  onClick?: (e: MouseEvent<HTMLElement>) => void;
};

/* ---------- Button ---------- */

export type ButtonVariant =
  'primary' | 'secondary' | 'tonal' | 'ghost' | 'dark' | 'danger' | 'good';
export type ButtonSize = 'lg' | 'md' | 'sm';

export interface ButtonProps extends Clickable {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconRight?: IconName;
  block?: boolean;
  disabled?: boolean;
  type?: 'button' | 'submit';
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  iconRight,
  block,
  disabled,
  type = 'button',
  className,
  style,
  to,
  href,
  onClick,
  children,
}: ButtonProps) {
  const cls = cx(
    'tr',
    'tr-btn',
    `tr-btn-${variant}`,
    `tr-btn-${size}`,
    block && 'tr-btn-block',
    className,
  );
  const inner = (
    <>
      {icon ? <Icon name={icon} /> : null}
      {children}
      {iconRight ? <Icon name={iconRight} /> : null}
    </>
  );
  if (to && !disabled)
    return (
      <Link to={to} className={cls} style={style} onClick={onClick}>
        {inner}
      </Link>
    );
  if (href && !disabled)
    return (
      <a
        href={href}
        className={cls}
        style={style}
        onClick={onClick}
        target="_blank"
        rel="noreferrer"
      >
        {inner}
      </a>
    );
  return (
    <button type={type} className={cls} style={style} disabled={disabled} onClick={onClick}>
      {inner}
    </button>
  );
}

export function IconButton({
  icon,
  label,
  size = 'md',
  quiet,
  className,
  to,
  onClick,
  disabled,
}: Clickable & {
  icon: IconName;
  label: string;
  size?: 'md' | 'sm';
  quiet?: boolean;
  className?: string;
  disabled?: boolean;
}) {
  const cls = cx('tr', 'tr-iconbtn', `tr-iconbtn-${size}`, quiet && 'tr-iconbtn-quiet', className);
  if (to)
    return (
      <Link to={to} className={cls} aria-label={label} title={label} onClick={onClick}>
        <Icon name={icon} />
      </Link>
    );
  return (
    <button
      type="button"
      className={cls}
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon name={icon} />
    </button>
  );
}

export function Chip({
  selected,
  icon,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean; icon?: IconName }) {
  return (
    <button
      type="button"
      className={cx('tr', 'tr-chip', className)}
      aria-pressed={selected ? 'true' : 'false'}
      {...rest}
    >
      {icon ? <Icon name={icon} style={{ width: 16, height: 16 }} /> : null}
      {children}
    </button>
  );
}

export type BadgeTone =
  'brand' | 'listen' | 'cards' | 'rose' | 'good' | 'warn' | 'bad' | 'neutral' | 'code' | 'count';

export function Badge({
  tone = 'neutral',
  className,
  title,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <span className={cx('tr', 'tr-badge', `tr-badge-${tone}`, className)} title={title}>
      {children}
    </span>
  );
}

/* ---------- Avatar, tiles ---------- */

export type Tone =
  'brand' | 'listen' | 'cards' | 'rose' | 'good' | 'bad' | 'neutral' | 'solid' | 'white';

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

export function Avatar({
  name,
  size = 'md',
  tone = 'solid',
  className,
}: {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cx('tr', 'tr-avatar', `tr-avatar-${size}`, `tr-tone-${tone}`, className)}
      role="img"
      aria-label={name}
    >
      {initialsOf(name)}
    </span>
  );
}

export function LetterTile({
  letter,
  icon,
  size = 'sm',
  tone = 'brand',
  className,
  style,
}: {
  letter?: string;
  icon?: IconName;
  size?: 'sm' | 'md';
  tone?: Tone;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={cx('tr', 'tr-tile', `tr-tile-${size}`, `tr-tone-${tone}`, className)}
      aria-hidden="true"
      style={style}
    >
      {icon ? (
        <Icon name={icon} size={size === 'md' ? 'lg' : undefined} />
      ) : (
        (letter ?? '').slice(0, 1).toUpperCase()
      )}
    </span>
  );
}

export function BookCover({
  title,
  tone = 'brand',
}: {
  title: string;
  tone?: 'brand' | 'ink' | 'listen' | 'cards' | 'rose';
}) {
  return (
    <span
      className={cx('tr', 'tr-cover', `tr-cover-${tone}`)}
      role="img"
      aria-label={`Обложка: ${title}`}
    >
      <span className="tr-cover-rule" />
      <span>{title}</span>
    </span>
  );
}

export function PodcastTile({
  label = 'Подкаст',
  bars = [10, 20, 14, 24, 12],
}: {
  label?: string;
  bars?: number[];
}) {
  return (
    <span className="tr tr-podcast" role="img" aria-label={label}>
      {bars.map((b, i) => (
        <span key={i} style={{ height: b }} />
      ))}
    </span>
  );
}

/* ---------- Cell, ListGroup ---------- */

export interface CellProps extends Clickable {
  title: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  chevron?: boolean;
  current?: boolean;
  className?: string;
  children?: ReactNode;
  avatar?: string;
  cover?: string;
  coverTone?: 'brand' | 'ink' | 'listen' | 'cards' | 'rose';
  podcast?: boolean | string;
  tile?: string;
  tileIcon?: IconName;
  tileTone?: Tone;
  tileSize?: 'sm' | 'md';
  badge?: ReactNode;
  badgeTone?: BadgeTone;
  date?: ReactNode;
  norms?: string;
  toggle?: boolean;
  onToggle?: (checked: boolean) => void;
  disabled?: boolean;
}

export function Cell(p: CellProps) {
  let leading = p.leading;
  if (!leading) {
    if (p.avatar) leading = <Avatar name={p.avatar} size="sm" />;
    else if (p.cover) leading = <BookCover title={p.cover} tone={p.coverTone} />;
    else if (p.podcast)
      leading = <PodcastTile label={typeof p.podcast === 'string' ? p.podcast : undefined} />;
    else if (p.tileIcon)
      leading = (
        <LetterTile icon={p.tileIcon} size={p.tileSize ?? 'md'} tone={p.tileTone ?? 'brand'} />
      );
    else if (p.tile)
      leading = (
        <LetterTile letter={p.tile} size={p.tileSize ?? 'sm'} tone={p.tileTone ?? 'brand'} />
      );
  }
  let trailing = p.trailing;
  if (!trailing && (p.badge || p.date || p.norms || p.toggle !== undefined)) {
    trailing = (
      <>
        {p.date ? <span>{p.date}</span> : null}
        {p.norms
          ? p.norms.split(/\s+/).map((n, i) => {
              const [v, m] = n.split('/');
              return <NormCell key={i} value={Number(v)} max={Number(m) || 3} />;
            })
          : null}
        {p.badge ? <Badge tone={p.badgeTone ?? 'brand'}>{p.badge}</Badge> : null}
        {p.toggle !== undefined ? (
          <Switch
            checked={p.toggle}
            onChange={p.onToggle}
            disabled={p.disabled}
            label={typeof p.title === 'string' ? p.title : 'Переключатель'}
            labelHidden
          />
        ) : null}
      </>
    );
  }
  const body = (
    <>
      {leading ?? null}
      <span className="tr-cell-text">
        <span className="tr-cell-title">{p.title}</span>
        {p.subtitle ? <span className="tr-cell-sub">{p.subtitle}</span> : null}
        {p.children ?? null}
      </span>
      {trailing || p.chevron ? (
        <span className="tr-cell-trailing">
          {trailing ?? null}
          {p.chevron ? <Icon name="chevron-right" className="tr-cell-chevron" /> : null}
        </span>
      ) : null}
    </>
  );
  const current = p.current ? 'true' : undefined;
  if (p.to)
    return (
      <Link
        to={p.to}
        className={cx('tr', 'tr-cell', p.className)}
        aria-current={current}
        onClick={p.onClick}
      >
        {body}
      </Link>
    );
  if (p.href)
    return (
      <a
        href={p.href}
        className={cx('tr', 'tr-cell', p.className)}
        aria-current={current}
        target="_blank"
        rel="noreferrer"
      >
        {body}
      </a>
    );
  if (p.onClick)
    return (
      <button
        type="button"
        className={cx('tr', 'tr-cell', p.className)}
        aria-current={current}
        onClick={p.onClick}
        disabled={p.disabled}
      >
        {body}
      </button>
    );
  return (
    <div className={cx('tr', 'tr-cell', 'tr-cell-static', p.className)} aria-current={current}>
      {body}
    </div>
  );
}

export function ListGroup({
  header,
  footer,
  className,
  style,
  children,
}: {
  header?: ReactNode;
  footer?: ReactNode;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div className={cx('tr', 'tr-col', className)} style={{ gap: 0, ...style }}>
      {header ? <div className="tr-group-header">{header}</div> : null}
      <div className="tr-group">{children}</div>
      {footer ? <div className="tr-group-footer">{footer}</div> : null}
    </div>
  );
}

/* ---------- Card, StatTile ---------- */

export type CardTone = 'surface' | 'hero' | 'brand' | 'wash-brand' | 'wash-listen' | 'wash-cards';

export function Card({
  tone = 'surface',
  title,
  meta,
  className,
  style,
  to,
  children,
}: {
  tone?: CardTone;
  title?: ReactNode;
  meta?: ReactNode;
  className?: string;
  style?: CSSProperties;
  to?: string;
  children?: ReactNode;
}) {
  const cls = cx(
    'tr',
    'tr-card',
    tone === 'hero' && 'tr-card-hero',
    tone === 'brand' && 'tr-card-brand',
    tone.startsWith('wash-') && `tr-card-${tone}`,
    className,
  );
  const head =
    title || meta ? (
      <div className="tr-card-head">
        {title ? <h3 className="tr-card-title">{title}</h3> : <span />}
        {meta ? <span className="tr-card-meta">{meta}</span> : null}
      </div>
    ) : null;
  if (to)
    return (
      <Link to={to} className={cls} style={{ color: 'inherit', ...style }}>
        {head}
        {children}
      </Link>
    );
  return (
    <div className={cls} style={style}>
      {head}
      {children}
    </div>
  );
}

export function StatTile({
  label,
  value,
  note,
  tone,
  wash,
  noteTone,
}: {
  label: ReactNode;
  value: ReactNode;
  note?: ReactNode;
  tone?: 'good' | 'bad';
  wash?: 'good' | 'warn' | 'bad';
  noteTone?: 'good' | 'bad';
}) {
  return (
    <div className={cx('tr', 'tr-stat', tone && `tr-stat-${tone}`, wash && `tr-stat-wash-${wash}`)}>
      <span className="tr-stat-label">{label}</span>
      <span className="tr-stat-value">{value}</span>
      {note ? (
        <span className={cx('tr-stat-note', noteTone && `tr-stat-note-${noteTone}`)}>{note}</span>
      ) : null}
    </div>
  );
}

/* ---------- ProgressRing, NormCell, DayCell ---------- */

export function ProgressRing({
  value,
  max = 1,
  label,
  tone = 'brand',
  size = 72,
  stroke = 8,
  text,
  onHero,
}: {
  value: number;
  max?: number;
  label?: string;
  tone?: 'brand' | 'listen' | 'cards';
  size?: number;
  stroke?: number;
  text?: string;
  onHero?: boolean;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const val = Math.max(0, Math.min(value, max));
  const dash = c * (val / max);
  const t = text ?? `${value}/${max}`;
  return (
    <span className={cx('tr', 'tr-ring', `tr-ring-${tone}`, onHero && 'tr-ring-on-hero')}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={(label ? `${label}: ` : '') + t}
      >
        <circle
          className="tr-ring-track"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
        />
        {val > 0 ? (
          <circle
            className="tr-ring-bar"
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
        <text className="tr-ring-value" x={size / 2} y={size / 2 + 5} textAnchor="middle">
          {t}
        </text>
      </svg>
      {label ? <span className="tr-ring-label">{label}</span> : null}
    </span>
  );
}

export function NormCell({
  value,
  max = 3,
  title,
}: {
  value: number;
  max?: number;
  title?: string;
}) {
  const state = value >= max ? 'met' : value > 0 ? 'partial' : 'missed';
  return (
    <span className={cx('tr', 'tr-norm', `tr-norm-${state}`)} title={title}>
      {value}/{max}
    </span>
  );
}

export function DayCell({ level = 0, title }: { level?: number; title?: string }) {
  return (
    <span
      className={cx('tr', 'tr-day', level > 0 && `tr-day-${Math.min(level, 2)}`)}
      title={title}
      aria-label={title}
      role={title ? 'img' : undefined}
    />
  );
}

/* ---------- Inputs ---------- */

export function TextField({
  label,
  hint,
  className,
  style,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode; hint?: ReactNode }) {
  const id = useId();
  return (
    <label className={cx('tr', 'tr-field', className)} htmlFor={id} style={style}>
      {label ? <span className="tr-field-label">{label}</span> : null}
      <input id={id} className="tr-input" {...rest} />
      {hint ? <span className="tr-field-hint">{hint}</span> : null}
    </label>
  );
}

export function TextArea({
  label,
  hint,
  className,
  rows = 4,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: ReactNode; hint?: ReactNode }) {
  const id = useId();
  return (
    <label className={cx('tr', 'tr-field', className)} htmlFor={id}>
      {label ? <span className="tr-field-label">{label}</span> : null}
      <textarea id={id} className="tr-textarea" rows={rows} {...rest} />
      {hint ? <span className="tr-field-hint">{hint}</span> : null}
    </label>
  );
}

export function SearchField({
  label = 'Поиск',
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return (
    <label className={cx('tr', 'tr-search', className)}>
      <Icon name="search" style={{ width: 18, height: 18 }} />
      <span className="tr-visually-hidden">{label}</span>
      <input type="search" {...rest} />
    </label>
  );
}

export function Checkbox({
  children,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { children?: ReactNode }) {
  return (
    <label className={cx('tr', 'tr-check', className)}>
      <input type="checkbox" {...rest} />
      <span>{children}</span>
    </label>
  );
}

export function Select({
  label,
  hint,
  options,
  size,
  className,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label?: ReactNode;
  hint?: ReactNode;
  options: Array<{ value: string; label: string }>;
  size?: 'sm';
}) {
  const id = useId();
  return (
    <label className={cx('tr', 'tr-field', className)} htmlFor={id}>
      {label ? <span className="tr-field-label">{label}</span> : null}
      <span className="tr-select-wrap">
        <select id={id} className={cx('tr-select', size === 'sm' && 'tr-select-sm')} {...rest}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <Icon name="chevron-down" className="tr-select-icon" />
      </span>
      {hint ? <span className="tr-field-hint">{hint}</span> : null}
    </label>
  );
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: string; to?: string }>;
  onChange?: (v: T) => void;
  label?: string;
}) {
  return (
    <div className="tr tr-seg" role="group" aria-label={label}>
      {options.map((o) =>
        o.to ? (
          <Link key={o.value} to={o.to} aria-current={o.value === value ? 'true' : undefined}>
            {o.label}
          </Link>
        ) : (
          <button
            key={o.value}
            type="button"
            aria-pressed={o.value === value ? 'true' : 'false'}
            onClick={() => onChange?.(o.value)}
          >
            {o.label}
          </button>
        ),
      )}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  disabled,
  label,
  labelHidden,
  hint,
}: {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
  labelHidden?: boolean;
  hint?: string;
}) {
  const id = useId();
  return (
    <label className={cx('tr', 'tr-switch', disabled && 'tr-switch-disabled')} htmlFor={id}>
      {!labelHidden ? (
        <span className="tr-switch-text">
          <span className="tr-switch-label">{label}</span>
          {hint ? <span className="tr-switch-hint">{hint}</span> : null}
        </span>
      ) : null}
      <input
        id={id}
        type="checkbox"
        role="switch"
        className="tr-switch-input"
        aria-label={labelHidden ? label : undefined}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
      />
      <span className="tr-switch-track" aria-hidden="true">
        <span className="tr-switch-thumb" />
      </span>
    </label>
  );
}

/* ---------- TabBar ---------- */

export type TabKey = 'home' | 'cards' | 'dict' | 'reports';

const TABS: Array<{ key: TabKey; label: string; icon: IconName; to: string }> = [
  { key: 'home', label: 'Главная', icon: 'home', to: '/' },
  { key: 'cards', label: 'Карточки', icon: 'cards', to: '/cards' },
  { key: 'dict', label: 'Словарь', icon: 'book', to: '/words' },
  { key: 'reports', label: 'Отчёты', icon: 'list', to: '/reports' },
];

export function TabBar({ active }: { active: TabKey }) {
  return (
    <nav className="tr tr-tabbar" aria-label="Разделы">
      {TABS.map((it) => (
        <Link
          key={it.key}
          to={it.to}
          className="tr-tab"
          aria-current={it.key === active ? 'page' : undefined}
        >
          <span className="tr-tab-icon">
            <Icon name={it.icon} size="lg" />
          </span>
          {it.label}
        </Link>
      ))}
    </nav>
  );
}

/* ---------- Callout, header, main button, section ---------- */

export type CalloutTone = 'info' | 'brand' | 'good' | 'warn' | 'bad' | 'hero';
const CALLOUT_ICON: Record<CalloutTone, IconName> = {
  info: 'info',
  brand: 'info',
  good: 'check',
  warn: 'alert',
  bad: 'alert',
  hero: 'headphones',
};

export function Callout({
  tone = 'info',
  icon,
  title,
  className,
  children,
}: {
  tone?: CalloutTone;
  icon?: IconName | false;
  title?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cx('tr', 'tr-callout', `tr-callout-${tone}`, className)}
      role={tone === 'bad' ? 'alert' : undefined}
    >
      {icon === false ? null : <Icon name={icon ?? CALLOUT_ICON[tone]} />}
      <span>
        {title ? <span className="tr-callout-title">{title}</span> : null}
        {children}
      </span>
    </div>
  );
}

/**
 * Telegram draws its own header above the Mini App; this bar is the in-app
 * title row from the design (back button on inner screens). Inside Telegram
 * the real BackButton is also wired by the screen through `useBackButton`.
 */
export function TelegramHeader({
  title = 'ThinkRead',
  subtitle = 'мини-приложение',
  back,
  onBack,
}: {
  title?: string;
  subtitle?: string;
  back?: boolean;
  onBack?: () => void;
}) {
  return (
    <header className="tr tr-tgheader">
      {back ? (
        <IconButton icon="chevron-left" quiet label="Назад" onClick={onBack} />
      ) : (
        <span style={{ width: 40 }} />
      )}
      <div className="tr-tgheader-title">
        <b>{title}</b>
        <span>{subtitle}</span>
      </div>
      <span style={{ width: 40 }} />
    </header>
  );
}

export function MainButton(props: ButtonProps) {
  return (
    <div className="tr tr-mainbar">
      <Button variant="primary" size="lg" block {...props} />
    </div>
  );
}

export function SectionHeader({
  title,
  meta,
  action,
  onAction,
  size,
}: {
  title: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  onAction?: () => void;
  size?: 'lg';
}) {
  return (
    <div className="tr tr-section">
      <h2 className={cx('tr-section-title', size === 'lg' && 'tr-section-title-lg')}>{title}</h2>
      {action ? (
        <button
          type="button"
          className="tr-section-action"
          onClick={onAction}
          style={{ background: 'none', border: 0, cursor: 'pointer' }}
        >
          {action}
        </button>
      ) : meta ? (
        <span className="tr-card-meta">{meta}</span>
      ) : null}
    </div>
  );
}

/** Checkbox row used by word pickers (AddWords, TeacherWords). */
export function CheckRow({
  checked,
  onChange,
  disabled,
  title,
  subtitle,
  badge,
  badgeTone = 'brand',
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  title: string;
  subtitle?: string | null;
  badge?: ReactNode;
  badgeTone?: BadgeTone;
}) {
  return (
    <label
      className="tr tr-cell tr-cell-static tr-check-row"
      style={{ opacity: disabled ? 0.55 : 1, cursor: disabled ? 'default' : 'pointer' }}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={title}
      />
      <span className="tr-cell-text">
        <span className="tr-cell-title">{title}</span>
        {subtitle ? <span className="tr-cell-sub">{subtitle}</span> : null}
      </span>
      {badge ? (
        <span className="tr-cell-trailing">
          <Badge tone={badgeTone}>{badge}</Badge>
        </span>
      ) : null}
    </label>
  );
}
