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
          src="/arcanum-logo.png"
          alt=""
          width={320}
          height={88}
          priority
          className="arcanum-logo-image"
        />
      </span>
    </span>
  );
}
