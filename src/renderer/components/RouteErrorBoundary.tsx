import React from "react";

interface RouteErrorBoundaryProps {
  children: React.ReactNode;
  routeName?: string;
}

interface RouteErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class RouteErrorBoundary extends React.Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
  constructor(props: RouteErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: "",
    };
  }

  static getDerivedStateFromError(error: Error): RouteErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || "Unknown runtime error",
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error("Route render failure:", {
      route: this.props.routeName || "unknown",
      message: error?.message,
      stack: error?.stack,
      componentStack: errorInfo?.componentStack,
    });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen w-full bg-background text-foreground flex items-center justify-center p-6">
        <div className="max-w-2xl w-full rounded-xl border border-border bg-card p-6 space-y-4 shadow-xl">
          <h2 className="text-xl font-bold">Page failed to render</h2>
          <p className="text-sm text-muted-foreground">
            Route: {this.props.routeName || "Unknown"}
          </p>
          <pre className="text-xs rounded-md bg-muted p-3 overflow-auto whitespace-pre-wrap break-words">
            {this.state.errorMessage}
          </pre>
          <button
            onClick={this.handleReload}
            className="inline-flex items-center rounded-md px-4 py-2 text-sm font-semibold bg-primary text-primary-foreground"
            type="button"
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }
}
