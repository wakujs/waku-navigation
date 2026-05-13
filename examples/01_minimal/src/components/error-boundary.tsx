import { Component, type ReactNode } from 'react';

// Tiny ErrorBoundary used by the example to catch errors propagated from
// waku-navigation's <Router> (e.g. non-404 refetch failures). The fallback
// returns the full <html>/<body> structure because we hydrateRoot(document).
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: unknown }
> {
  state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <html lang="en">
          <body>
            <div data-testid="error-fallback">
              Caught an error: {String(this.state.error)}
            </div>
          </body>
        </html>
      );
    }
    return this.props.children;
  }
}
