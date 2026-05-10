import React from 'react';

interface Props { children: React.ReactNode; label?: string }
interface State { error: Error | null }

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', this.props.label || '', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="container mx-auto px-4 py-10 max-w-md text-center">
          <p className="text-5xl mb-3">💥</p>
          <h1 className="text-2xl font-display gold-text mb-2">Oups, quelque chose a planté</h1>
          <p className="text-sm text-muted-foreground mb-4">
            {this.state.error.message || 'Erreur inconnue'}
          </p>
          <button
            onClick={() => { this.setState({ error: null }); window.location.reload(); }}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold"
          >
            Recharger la page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;