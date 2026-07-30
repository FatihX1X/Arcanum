'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  ArrowLeftRight,
  BookOpen,
  Bot,
  FileKey2,
  Github,
  HelpCircle,
  History,
  Info,
  Languages,
  Layers3,
  Menu,
  MessageCircle,
  Moon,
  ShieldCheck,
  Sun,
  UsersRound,
  Wallet,
  Wifi,
  X,
} from 'lucide-react';
import { arcanumMessengerAddress } from '../lib/contract';
import ArcanumBrand from './ArcanumBrand';
import { copy, type Language } from './arcanumCopy';
import { Badge, Button, IconButton, cx } from './ui';

export type AppView = 'dm' | 'groups' | 'bulk' | 'swap' | 'agents' | 'escrow' | 'history' | 'about' | 'faq';
export type ThemeMode = 'light' | 'dark';

type Copy = (typeof copy)[Language];

const xProfileUrl = 'https://x.com/0xFatih';
const githubRepoUrl = 'https://github.com/FatihX1X/Arcanum';

function short(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function AppHeader({
  t,
  language,
  isConnected,
  address,
  isCorrectChain,
  isConnectPending,
  isSwitchPending,
  menuOpen,
  connectorReady,
  onMenu,
  onLanguage,
  onConnect,
  onDisconnect,
  onSwitch,
}: {
  t: Copy;
  language: Language;
  isConnected: boolean;
  address?: `0x${string}`;
  isCorrectChain: boolean;
  isConnectPending: boolean;
  isSwitchPending: boolean;
  menuOpen: boolean;
  connectorReady: boolean;
  onMenu: () => void;
  onLanguage: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onSwitch: () => void;
}) {
  return (
    <header className="app-header surface">
      <div className="flex min-w-0 items-center gap-3">
        <IconButton label={menuOpen ? t.header.close : t.header.menu} onClick={onMenu} className="lg:hidden">
          {menuOpen ? <X size={18} /> : <Menu size={18} />}
        </IconButton>
        <ArcanumBrand />
        <span className="hidden h-6 w-px bg-zinc-800 xl:block" aria-hidden="true" />
        <p className="hidden truncate text-xs text-zinc-500 xl:block">{t.header.tagline}</p>
      </div>

      <div className="flex min-w-0 items-center gap-2">
        <Button variant="subtle" size="sm" onClick={onLanguage} title={language === 'en' ? 'Türkçe' : 'English'} className="px-2.5">
          <Languages size={14} />
          <span>{language.toUpperCase()}</span>
        </Button>

        {!isCorrectChain && isConnected ? (
          <>
            <Badge tone="warning" icon={<Wifi size={12} />}>{t.header.wrong}</Badge>
            <Button variant="secondary" size="sm" onClick={onSwitch} loading={isSwitchPending} className="hidden sm:inline-flex">
              {t.header.switch}
            </Button>
          </>
        ) : (
          <Badge tone={isConnected ? 'success' : 'neutral'} icon={<span className="h-1.5 w-1.5 rounded-full bg-current" />} className="hidden sm:inline-flex">
            {isConnected ? 'Arc Testnet' : t.common.disconnectedShort}
          </Badge>
        )}

        <Badge tone="neutral" className="hidden 2xl:inline-flex">
          {t.header.contract} {short(arcanumMessengerAddress)}
        </Badge>

        {isConnected && address ? (
          <Button
            variant="secondary"
            size="sm"
            aria-label={t.header.disconnect}
            onClick={onDisconnect}
            title={t.header.disconnect}
          >
            <Wallet size={14} />
            <span className="hidden sm:inline">{short(address)}</span>
          </Button>
        ) : (
          <Button
            variant="primary"
            size="sm"
            aria-label={isConnectPending ? t.header.connecting : t.header.connect}
            onClick={onConnect}
            disabled={!connectorReady}
            loading={isConnectPending}
          >
            <Wallet size={14} />
            <span className="hidden sm:inline">{t.header.connect}</span>
          </Button>
        )}
      </div>
    </header>
  );
}

export function AppFooter() {
  return (
    <footer className="app-footer">
      <p>Arcanum Private Messaging Protocol</p>
      <div className="flex items-center gap-1">
        <a href={xProfileUrl} target="_blank" rel="noreferrer" className="btn-subtle h-9 px-3 text-xs">
          <span className="font-semibold">X</span>
          0xFatih
        </a>
        <a href={githubRepoUrl} target="_blank" rel="noreferrer" className="btn-subtle h-9 px-3 text-xs">
          <Github size={14} />
          GitHub
        </a>
      </div>
    </footer>
  );
}

export function AppSidebar({
  t,
  language,
  view,
  isConnected,
  isCorrectChain,
  address,
  messageCount,
  hasOwnKey,
  hasLocalKey,
  localUnlocked,
  theme,
  onView,
  onKeyCenter,
  onTheme,
}: {
  t: Copy;
  language: Language;
  view: AppView;
  isConnected: boolean;
  isCorrectChain: boolean;
  address?: `0x${string}`;
  messageCount: number;
  hasOwnKey: boolean;
  hasLocalKey: boolean;
  localUnlocked: boolean;
  theme: ThemeMode;
  onView: (view: AppView) => void;
  onKeyCenter: () => void;
  onTheme: (theme: ThemeMode) => void;
}) {
  const groups: Array<{
    label: string;
    items: Array<{ view: AppView; label: string; icon: ReactNode }>;
  }> = [
    {
      label: language === 'tr' ? 'İletişim' : 'Communication',
      items: [
        { view: 'dm', label: t.nav.dm, icon: <MessageCircle size={16} /> },
        { view: 'groups', label: t.nav.groups, icon: <UsersRound size={16} /> },
        { view: 'agents', label: t.nav.agents, icon: <Bot size={16} /> },
      ],
    },
    {
      label: language === 'tr' ? 'İşlemler' : 'Transactions',
      items: [
        { view: 'bulk', label: t.nav.bulk, icon: <Layers3 size={16} /> },
        { view: 'swap', label: t.nav.swap, icon: <ArrowLeftRight size={16} /> },
        { view: 'escrow', label: t.nav.escrow, icon: <ShieldCheck size={16} /> },
      ],
    },
    {
      label: language === 'tr' ? 'Aktivite' : 'Activity',
      items: [{ view: 'history', label: t.nav.history, icon: <History size={16} /> }],
    },
    {
      label: language === 'tr' ? 'Yardım' : 'Help',
      items: [
        { view: 'about', label: t.nav.about, icon: <Info size={16} /> },
        { view: 'faq', label: t.nav.faq, icon: <HelpCircle size={16} /> },
      ],
    },
  ];

  return (
    <aside className="app-sidebar surface">
      <div className="sidebar-account">
        <div>
          <p className="eyebrow">{t.sidebar.protocol}</p>
          <p className="mt-2 truncate font-mono text-xs text-zinc-300">
            {isConnected && address ? short(address) : t.common.disconnectedShort}
          </p>
        </div>
        <Badge tone={isConnected && isCorrectChain ? 'success' : 'neutral'}>{messageCount} {t.sidebar.messages}</Badge>
      </div>

      <nav className="sidebar-nav" aria-label={language === 'tr' ? 'Ana navigasyon' : 'Primary navigation'}>
        {groups.map((group) => (
          <div key={group.label} className="sidebar-group">
            <p className="sidebar-group-label">{group.label}</p>
            <div className="grid gap-1">
              {group.items.map((item) => (
                <button
                  key={item.view}
                  type="button"
                  onClick={() => onView(item.view)}
                  className={cx('nav-item', view === item.view ? 'nav-item-active' : 'nav-item-idle')}
                  aria-current={view === item.view ? 'page' : undefined}
                >
                  {item.icon}
                  <span className="truncate">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
        <Link href="/how-it-works" className="nav-item nav-item-idle mt-1">
          <BookOpen size={16} />
          <span className="truncate">{t.nav.how}</span>
        </Link>
      </nav>

      <div className="sidebar-security">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="sidebar-group-label">{t.sidebar.security}</p>
            <p className="mt-1 text-sm font-semibold text-zinc-100">{t.sidebar.keyCenter}</p>
          </div>
          <Badge tone={hasOwnKey && hasLocalKey && localUnlocked ? 'success' : 'warning'}>
            {hasLocalKey ? (localUnlocked ? t.key.localReady : t.key.locked) : t.key.noLocal}
          </Badge>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={onKeyCenter}
          disabled={!isConnected || !isCorrectChain}
          className="mt-3 w-full"
        >
          <FileKey2 size={14} />
          {t.sidebar.openKeyCenter}
        </Button>
      </div>

      <div className="theme-control mt-auto">
        <p className="sidebar-group-label">{t.sidebar.theme}</p>
        <div className="theme-switch" role="group" aria-label={t.sidebar.theme}>
          <button
            type="button"
            onClick={() => onTheme('light')}
            className={cx('theme-option', theme === 'light' && 'theme-option-active')}
            aria-pressed={theme === 'light'}
          >
            <Sun size={15} />
            {t.sidebar.light}
          </button>
          <button
            type="button"
            onClick={() => onTheme('dark')}
            className={cx('theme-option', theme === 'dark' && 'theme-option-active')}
            aria-pressed={theme === 'dark'}
          >
            <Moon size={15} />
            {t.sidebar.dark}
          </button>
        </div>
      </div>
    </aside>
  );
}
