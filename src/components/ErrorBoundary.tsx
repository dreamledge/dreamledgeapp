import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    const { children } = (this as any).props;
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-black flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-zinc-900 border-2 border-red-600 p-8 rounded-3xl text-center space-y-6 shadow-[0_0_50px_rgba(220,38,38,0.3)]">
            <div className="w-20 h-20 bg-red-600/10 rounded-full flex items-center justify-center mx-auto">
              <span className="text-4xl">⚠️</span>
            </div>
            <h2 className="text-2xl font-black uppercase tracking-tighter italic text-red-600">Arena Malfunction</h2>
            <p className="text-zinc-400 text-sm font-medium leading-relaxed">
              The arena encountered a critical error. Our engineers have been notified.
            </p>
            <div className="bg-black p-4 rounded-xl text-left overflow-x-auto">
              <code className="text-[10px] text-red-500 font-mono break-all">
                {this.state.error?.message}
              </code>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-4 bg-red-600 hover:bg-red-700 text-white font-black uppercase tracking-widest transition-all rounded-xl"
            >
              Restart Arena
            </button>
          </div>
        </div>
      );
    }

    return children;
  }
}
