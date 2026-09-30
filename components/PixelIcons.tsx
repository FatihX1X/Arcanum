import { forwardRef, type SVGProps } from 'react';

export type PixelIconProps = SVGProps<SVGSVGElement> & { size?: number | string };

/** Integer-grid silhouettes with square terminals; no font or remote sprite dependency. */
function icon(name: string, paths: readonly string[]) {
  const Icon = forwardRef<SVGSVGElement, PixelIconProps>(function PixelIcon(
    { size = 24, className, children, ...props }, ref,
  ) {
    const labelled = Boolean(props['aria-label'] || props['aria-labelledby'] || children);
    return (
      <svg
        ref={ref}
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="square"
        strokeLinejoin="miter"
        className={['pixel-icon', className].filter(Boolean).join(' ')}
        aria-hidden={labelled ? undefined : true}
        role={labelled ? 'img' : undefined}
        focusable="false"
        {...props}
      >
        {paths.map((d, index) => <path key={index} d={d} />)}
        {children}
      </svg>
    );
  });
  Icon.displayName = name;
  return Icon;
}

const square = 'M6 3H18V5H21V19H18V21H6V19H3V5H6Z';
const check = 'M7 12V15H10V17H12V14H15V11H18V8';
const shield = 'M4 4H8V2H16V4H20V14H18V18H15V20H12V22H9V20H6V18H4Z';
const lock = 'M5 11H19V21H5ZM8 11V5H10V3H14V5H16V11M12 15V17';
const file = 'M5 2H15V5H18V8H20V22H5ZM15 2V8H20';
const person = 'M9 3H15V9H9ZM5 21V15H7V13H17V15H19V21Z';
const arrowRight = 'M3 12H21M15 6H17V8H19V10H21V14H19V16H17V18H15';
const arrowLeft = 'M21 12H3M9 6H7V8H5V10H3V14H5V16H7V18H9';
const upload = 'M12 16V3M6 9H8V7H10V5H14V7H16V9H18M3 16V21H21V16';
const key = 'M3 3H11V11H3ZM11 11H14V14H17V17H21V21H17V17M6 6H8V8H6Z';
const wallet = 'M3 6V3H18V6M3 6H21V21H3ZM21 11H15V16H21M17 13H18';

export const AlertTriangle = icon('AlertTriangle', ['M10 2H14V5H16V9H18V13H20V17H22V21H2V17H4V13H6V9H8V5H10Z', 'M12 8V13M12 17V18']);
export const Archive = icon('Archive', ['M3 3H21V8H3ZM5 8V21H19V8M9 12H15']);
export const ArrowLeft = icon('ArrowLeft', [arrowLeft]);
export const ArrowRight = icon('ArrowRight', [arrowRight]);
export const ArrowLeftRight = icon('ArrowLeftRight', ['M3 7H21M17 3V5H19V9H17V11M21 17H3M7 13V15H5V19H7V21']);
export const ArrowDownUp = icon('ArrowDownUp', ['M7 3V21M3 15H5V17H9V15H11M17 21V3M13 9H15V7H19V9H21']);
export const ArrowUpRight = icon('ArrowUpRight', ['M5 19V16H8V13H11V10H14V7H17V4M9 4H20V15']);
export const ArrowDownLeft = icon('ArrowDownLeft', ['M19 5V8H16V11H13V14H10V17H7V20M4 9V20H15']);
export const BookOpen = icon('BookOpen', ['M12 5H9V3H3V19H9V21H12V5H15V3H21V19H15V21H12M6 7H9M15 7H18']);
export const Bot = icon('Bot', ['M12 2V5M6 5H18V7H20V19H4V7H6ZM2 10V15M22 10V15M8 10V12M16 10V12M9 16H15']);
export const BriefcaseBusiness = icon('BriefcaseBusiness', ['M3 7H21V21H3ZM8 7V3H16V7M3 12H21M10 11V15H14V11']);
export const Check = icon('Check', [check]);
export const CheckCircle2 = icon('CheckCircle2', [square, check]);
export const ChevronDown = icon('ChevronDown', ['M5 8H7V10H9V12H11V14H13V12H15V10H17V8H19']);
export const ChevronUp = icon('ChevronUp', ['M5 16H7V14H9V12H11V10H13V12H15V14H17V16H19']);
export const CircleDollarSign = icon('CircleDollarSign', [square, 'M16 7H9V12H15V17H8M12 5V19']);
export const Clock3 = icon('Clock3', [square, 'M12 6V12H17']);
export const Coins = icon('Coins', ['M5 3H13V5H16V13H13V16H5V13H2V5H5ZM8 6V12M16 9H19V11H22V19H19V22H11V19H8']);
export const CreditCard = icon('CreditCard', ['M3 4H21V20H3ZM3 9H21M6 15H10']);
export const Download = icon('Download', ['M12 3V16M6 10H8V12H10V14H14V12H16V10H18M3 16V21H21V16']);
export const ExternalLink = icon('ExternalLink', ['M14 3H21V10M21 3H18V6H15V9H12M10 4H3V21H20V14']);
export const FileCheck2 = icon('FileCheck2', [file, 'M8 14V17H11V19H13V16H16V13']);
export const FileKey2 = icon('FileKey2', [file, 'M8 11H13V16H8ZM13 16H16V19']);
export const FileUp = icon('FileUp', [file, 'M12 19V11M8 15H10V13H14V15H16']);
export const Filter = icon('Filter', ['M3 3H21V7H18V10H15V21H9V10H6V7H3Z']);
export const Gavel = icon('Gavel', ['M5 3H14V7H18V16H14V12H5ZM10 12V15H7V18H4M11 21H22']);
export const HelpCircle = icon('HelpCircle', [square, 'M8 8V6H16V11H14V13H12V15M12 18V19']);
export const History = icon('History', ['M3 9V3M3 9H9M3 9H5V5H8V3H17V5H20V8H22V16H20V19H17V21H8V19H5', 'M12 7V12H16']);
export const Inbox = icon('Inbox', ['M6 3H18V7H20V11H22V21H2V11H4V7H6ZM2 13H8V16H16V13H22']);
export const Info = icon('Info', [square, 'M12 6V7M10 11H12V17M10 17H14']);
export const KeyRound = icon('KeyRound', [key]);
export const Languages = icon('Languages', ['M2 5H13M7 2V5M4 8V10H6V12H8V14H11M11 5V8H9V11H7V14H3', 'M13 21V16H15V11H18V16H20V21M14 18H19']);
export const Layers3 = icon('Layers3', ['M12 2H15V4H18V6H21V8H18V10H15V12H9V10H6V8H3V6H6V4H9V2Z', 'M3 12H6V14H9V16H15V14H18V12H21M3 18H6V20H9V22H15V20H18V18H21']);
export const Loader2 = icon('Loader2', ['M12 3H18V6H21V12M21 16V18H18V21H12M8 21H6V18H3V12M3 8V6H6V3H8']);
export const Lock = icon('Lock', [lock]);
export const LockKeyhole = icon('LockKeyhole', [lock, 'M11 14H13V16H11Z']);
export const Menu = icon('Menu', ['M3 5H21M3 12H21M3 19H21']);
export const MessageCircle = icon('MessageCircle', ['M5 3H19V5H21V17H19V19H9V21H3V5H5ZM7 9H8M11 9H12M15 9H16']);
export const Milestone = icon('Milestone', ['M12 2V22M4 5H17V7H20V9H17V11H4ZM20 14H7V16H4V18H7V20H20Z']);
export const Plus = icon('Plus', ['M12 4V20M4 12H20']);
export const RefreshCw = icon('RefreshCw', ['M3 10V7H6V4H15V6H18V9H21M21 3V9H15M21 14V17H18V20H9V18H6V15H3M3 21V15H9']);
export const Route = icon('Route', ['M3 3H8V8H3ZM16 16H21V21H16ZM8 5H19V11H5V18H16']);
export const Search = icon('Search', ['M5 3H13V5H15V13H13V15H5V13H3V5H5ZM15 15H17V17H19V19H21V21']);
export const Send = icon('Send', ['M3 3H6V5H10V7H14V9H18V11H21V13H18V15H14V17H10V19H6V21H3V15H7V9H3ZM7 12H21']);
export const Settings2 = icon('Settings2', ['M3 6H8M14 6H21M8 3H14V9H8ZM3 18H14M20 18H21M14 15H20V21H14Z']);
export const Shield = icon('Shield', [shield]);
export const ShieldCheck = icon('ShieldCheck', [shield, 'M8 11V14H11V16H13V13H16V10']);
export const Trash2 = icon('Trash2', ['M3 6H21M8 6V3H16V6M5 6V21H19V6M9 10V17M15 10V17']);
export const Undo2 = icon('Undo2', ['M3 10V4M3 10H9M3 10H16V12H20V19H10']);
export const Upload = icon('Upload', [upload]);
export const UserPlus = icon('UserPlus', [person, 'M20 3V9M17 6H23']);
export const UsersRound = icon('UsersRound', ['M7 3H13V9H7ZM3 21V15H5V13H15V15H17V21M17 3H21V9H17M20 13H22V21']);
export const Wallet = icon('Wallet', [wallet]);
export const WalletCards = icon('WalletCards', [wallet, 'M6 9H10']);
export const Wifi = icon('Wifi', ['M2 7V5H5V3H19V5H22V7M6 11V9H9V7H15V9H18V11M9 15V13H15V15M11 19H13V21H11Z']);
export const X = icon('X', ['M4 4H6V6H8V8H10V10H14V8H16V6H18V4H20M4 20H6V18H8V16H10V14H14V16H16V18H18V20H20', 'M10 10H14V14H10Z']);
