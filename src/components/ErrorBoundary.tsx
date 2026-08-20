import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[Trading Flow UI Crash Intercepted]:", error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full w-full min-h-[160px] flex-col items-center justify-center rounded-lg border border-red-500/40 bg-red-950/30 p-6 text-center font-mono">
          <div className="mb-2 text-2xl">⚠️</div>
          <h3 className="mb-1 text-sm font-bold text-red-200">
            {this.props.fallbackTitle || "Component Calculation Fault"}
          </h3>
          <p className="mb-4 max-w-md text-xs text-red-400">
            {this.state.error?.message || "An unexpected rendering fault occurred. State protected."}
          </p>
          <button
            onClick={this.handleReset}
            className="rounded bg-red-600 px-4 py-1.5 text-xs font-bold text-white transition-colors hover:bg-red-500"
          >
            ↺ Reload Platform
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
