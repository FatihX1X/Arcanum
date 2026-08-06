'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

import type { Language } from './arcanumCopy';

type Props = {
  children: ReactNode;
  language: Language;
};

type State = {
  failed: boolean;
};

export default class BridgeErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[CircleBridge] Render failed', error, info);
  }

  render() {
    if (!this.state.failed) return this.props.children;

    const isTurkish = this.props.language === 'tr';
    return (
      <section className="panel flex min-h-[680px] items-center justify-center p-6">
        <div className="surface max-w-lg p-6 text-center">
          <AlertTriangle size={28} className="mx-auto text-amber-300" />
          <h2 className="mt-4 text-lg font-semibold text-zinc-100">
            {isTurkish ? 'Bridge görünümü yüklenemedi' : 'Bridge view could not load'}
          </h2>
          <p className="mt-2 text-sm leading-6 text-zinc-500">
            {isTurkish
              ? 'Beklenmeyen istemci hatası yalnız Bridge alanında durduruldu. Yeniden deneyebilirsiniz.'
              : 'An unexpected client error was contained to Bridge. You can try loading it again.'}
          </p>
          <button
            type="button"
            className="btn-ghost mx-auto mt-5 h-10 px-4"
            onClick={() => this.setState({ failed: false })}
          >
            <RefreshCw size={15} />
            {isTurkish ? 'Tekrar dene' : 'Try again'}
          </button>
        </div>
      </section>
    );
  }
}
