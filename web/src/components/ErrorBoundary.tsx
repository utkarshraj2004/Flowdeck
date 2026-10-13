import { Component, type ReactNode } from 'react';

/**
 * Keeps one broken screen from blanking the whole app: shows what happened and two ways out.
 * Nothing is lost by reloading: every change is saved on the server when it is made.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page narrow" role="alert">
        <h1>Something went wrong on this screen</h1>
        <p>Flowdeck hit an unexpected error while showing this page. Your saved work is safe; changes are stored as soon as you make them.</p>
        <p className="muted small">Details: {this.state.error.message}</p>
        <div className="row">
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Reload the page
          </button>
          <a className="btn btn-light" href="/">
            Go to your boards
          </a>
        </div>
      </div>
    );
  }
}
