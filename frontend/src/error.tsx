import { Component, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { hasError: boolean; error?: Error };

export class VantageDevErrorBoundary extends Component<Props, State> {
    state: State = { hasError: false };

    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('ErrorBoundary caught:', error, info);
        if (info.componentStack) {
            console.error('Component stack trace:', info.componentStack);
        }
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="p-4 m-4 border border-red-300 bg-red-50 text-red-700 rounded">
                    <h2 className="text-lg font-semibold">Something went wrong.</h2>
                    <pre className="text-sm whitespace-pre-wrap mt-2">{this.state.error?.message}</pre>
                    {this.state.error?.stack && (
                        <div className="mt-2">
                            <summary className="cursor-pointer text-xs text-red-600">Stack trace</summary>
                            <pre className="text-xs whitespace-pre-wrap mt-1">{this.state.error.stack}</pre>
                        </div>
                    )}
                </div>
            );
        }

        return this.props.children;
    }
}
