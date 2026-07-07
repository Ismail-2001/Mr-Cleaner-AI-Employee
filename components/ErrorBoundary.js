'use client';

import { Component } from 'react';

/**
 * React Error Boundary — catches render errors and shows a fallback UI
 * instead of a blank white page.
 *
 * WHY THIS EXISTS:
 * If any child component throws during render (e.g., Supabase is down,
 * malformed data, network error), the entire app unmounts and the user
 * sees a blank page with no explanation. This boundary catches the error
 * and shows a recoverable UI with a retry button.
 *
 * LIMITATION: Error boundaries don't catch errors in event handlers,
 * async code, or server-side rendering. They only catch render errors.
 */
export default class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('ErrorBoundary caught:', error, errorInfo);
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null });
    };

    handleReload = () => {
        window.location.reload();
    };

    render() {
        if (this.state.hasError) {
            const fallback = this.props.fallback;
            if (fallback) return fallback;

            return (
                <div style={{
                    padding: '40px',
                    textAlign: 'center',
                    background: '#1a1a2e',
                    color: '#e0e0e0',
                    borderRadius: '16px',
                    border: '1px solid rgba(255,255,255,0.1)',
                    maxWidth: '500px',
                    margin: '40px auto',
                }}>
                    <h2 style={{ fontSize: '1.5rem', marginBottom: '12px', color: '#fff' }}>
                        Something went wrong
                    </h2>
                    <p style={{ opacity: 0.7, marginBottom: '24px', lineHeight: 1.6 }}>
                        {this.state.error?.message || 'An unexpected error occurred.'}
                    </p>
                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                        <button
                            onClick={this.handleRetry}
                            style={{
                                padding: '12px 24px',
                                background: '#d4af37',
                                color: '#000',
                                border: 'none',
                                borderRadius: '8px',
                                fontWeight: 700,
                                cursor: 'pointer',
                            }}
                        >
                            Try Again
                        </button>
                        <button
                            onClick={this.handleReload}
                            style={{
                                padding: '12px 24px',
                                background: 'transparent',
                                color: '#d4af37',
                                border: '1px solid #d4af37',
                                borderRadius: '8px',
                                fontWeight: 700,
                                cursor: 'pointer',
                            }}
                        >
                            Reload Page
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
