import Image from 'next/image';
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
      <span className="arcanum-logo-frame" aria-hidden="true">
        <Image
          src="/arcanum-coin.png"
          alt=""
          width={32}
          height={32}
          unoptimized
          priority
          className="arcanum-logo-image"
        />
        <span className="arcanum-wordmark">Arcanum</span>
      </span>
    </span>
  );
}
