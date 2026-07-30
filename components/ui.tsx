'use client';

import {
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
  useEffect,
  useRef,
} from 'react';
import { Loader2 } from 'lucide-react';

export type UiTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';
export type UiSize = 'sm' | 'md' | 'lg';

export function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

const buttonVariant = {
  primary: 'btn-primary',
  secondary: 'btn-ghost',
  subtle: 'btn-subtle',
} as const;

const buttonSize = {
  sm: 'h-9 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-11 px-5 text-sm',
} as const;

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof buttonVariant;
  size?: UiSize;
  loading?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={cx(buttonVariant[variant], buttonSize[size], className)}
    >
      {loading ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  size = 'md',
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  size?: UiSize;
}) {
  const dimensions = size === 'sm' ? 'h-9 w-9' : size === 'lg' ? 'h-11 w-11' : 'h-10 w-10';

  return (
    <button {...props} aria-label={label} title={props.title ?? label} className={cx('btn-ghost shrink-0', dimensions, className)}>
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  error,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input {...props} className={cx('input', error && 'input-error', className)} aria-invalid={Boolean(error)} />
      {error || hint ? <span className={cx('field-hint', error && 'text-red-300')}>{error ?? hint}</span> : null}
    </label>
  );
}

export function Textarea({
  label,
  hint,
  error,
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  hint?: string;
  error?: string;
}) {
  const control = <textarea {...props} className={cx('input resize-none py-3 leading-6', error && 'input-error', className)} aria-invalid={Boolean(error)} />;

  if (!label) {
    return control;
  }

  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {control}
      {error || hint ? <span className={cx('field-hint', error && 'text-red-300')}>{error ?? hint}</span> : null}
    </label>
  );
}

export function SegmentedControl({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <div className={cx('segmented-control', className)} role="group" aria-label={label}>
      {children}
    </div>
  );
}

const toneClass: Record<UiTone, string> = {
  neutral: 'badge-neutral',
  accent: 'badge-accent',
  success: 'badge-success',
  warning: 'badge-warning',
  danger: 'badge-danger',
  info: 'badge-info',
};

export function Badge({
  tone = 'neutral',
  icon,
  children,
  className,
}: {
  tone?: UiTone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cx('badge', toneClass[tone], className)}>
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}

export function StatusBanner({
  tone = 'info',
  icon,
  title,
  children,
  action,
  className,
  role,
}: {
  tone?: Exclude<UiTone, 'accent'>;
  icon?: ReactNode;
  title?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
  role?: HTMLAttributes<HTMLDivElement>['role'];
}) {
  return (
    <div className={cx('status-banner', `status-${tone}`, className)} role={role ?? (tone === 'danger' ? 'alert' : 'status')}>
      {icon ? <span className="status-icon">{icon}</span> : null}
      <div className="min-w-0 flex-1">
        {title ? <p className="text-sm font-semibold text-zinc-100">{title}</p> : null}
        <div className="break-words text-sm leading-5">{children}</div>
      </div>
      {action}
    </div>
  );
}

export function Panel({
  as: Tag = 'section',
  className,
  children,
  ...props
}: HTMLAttributes<HTMLElement> & {
  as?: 'section' | 'aside' | 'article' | 'div';
}) {
  return (
    <Tag {...props} className={cx('panel', className)}>
      {children}
    </Tag>
  );
}

export function Modal({
  label,
  children,
  onClose,
  closeDisabled = false,
}: {
  label: string;
  children: ReactNode;
  onClose: () => void;
  closeDisabled?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const closeDisabledRef = useRef(closeDisabled);
  closeRef.current = onClose;
  closeDisabledRef.current = closeDisabled;

  useEffect(() => {
    const root = rootRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!root) return;

    const focusableSelector = 'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusables = Array.from(root.querySelectorAll<HTMLElement>(focusableSelector));
    focusables[0]?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !closeDisabledRef.current) {
        event.preventDefault();
        closeRef.current();
        return;
      }

      if (event.key !== 'Tab') return;
      const current = Array.from(root?.querySelectorAll<HTMLElement>(focusableSelector) ?? []);
      if (current.length === 0) {
        event.preventDefault();
        return;
      }

      const first = current[0];
      const last = current[current.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus();
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !closeDisabled) onClose();
      }}
    >
      {children}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  icon,
  action,
  className,
}: {
  title: string;
  body: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('empty-state', className)}>
      {icon ? <div className="empty-state-icon">{icon}</div> : null}
      <div className="min-w-0">
        <p className="text-sm font-semibold text-zinc-100">{title}</p>
        <p className="mt-1 break-words text-sm leading-5 text-zinc-500">{body}</p>
      </div>
      {action}
    </div>
  );
}

export function AppShell({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('app-shell', className)}>{children}</div>;
}
