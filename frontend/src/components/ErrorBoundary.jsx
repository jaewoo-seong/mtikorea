import { Component } from 'react';

/** Top-level guard so a single render throw doesn't white-screen the whole app. */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('Render error caught by boundary:', error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen grid place-items-center px-4">
          <div className="card max-w-lg w-full p-8 space-y-4 border border-red-200">
            <h1 className="font-display text-2xl font-semibold text-danger">Something broke</h1>
            <p className="text-sm text-muted">
              The page hit an unexpected error and stopped rendering. Your data is safe — this is a
              display issue.
            </p>
            <pre className="text-[11px] bg-slate-50 p-3 rounded max-h-40 overflow-auto text-muted whitespace-pre-wrap">
              {String(this.state.error?.message || this.state.error)}
            </pre>
            <div className="flex gap-2">
              <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
                Reload page
              </button>
              <button type="button" className="btn-ghost" onClick={this.reset}>
                Try again
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
