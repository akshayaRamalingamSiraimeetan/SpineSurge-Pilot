/* Top-level error boundary. Catches render-time errors so a single broken screen doesn't blank the
   whole app. Never logs PHI — just the error message + component stack. */
import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Icon } from '@/components/Icon';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('UI error boundary caught:', error.message, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="login-wrap">
          <div className="state-block">
            <span className="sb-ico">
              <Icon name="warning" size={24} />
            </span>
            <div className="sb-title">Something went wrong</div>
            <div className="sb-sub">{this.state.error.message}</div>
            <button className="btn btn-outline btn-sm" style={{ marginTop: 6 }} onClick={() => window.location.reload()}>
              <Icon name="refresh" size={15} /> Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
