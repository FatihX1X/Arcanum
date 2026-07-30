import { cx } from './ui';

export default function ArcanumBrand({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <span className={cx('arcanum-brand', compact && 'arcanum-brand-compact', className)} aria-label="Arcanum">
      <svg viewBox="0 0 36 44" aria-hidden="true" className="arcanum-mark">
        <path d="M4 40V18C4 10.268 10.268 4 18 4s14 6.268 14 14v22" />
        <path d="M18 28v12" />
        <circle cx="12" cy="22" r="1.5" />
        <circle cx="18" cy="22" r="1.5" />
        <circle cx="24" cy="22" r="1.5" />
      </svg>
      {!compact ? (
        <span className="arcanum-wordmark">
          <span className="arcanum-name">Arcanum</span>
          <span className="arcanum-tag">Private Messaging Protocol</span>
        </span>
      ) : null}
    </span>
  );
}
