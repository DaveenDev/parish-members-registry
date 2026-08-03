import React from 'react';

/**
 * Catches render-time crashes so a bug in one page shows a recoverable message
 * instead of a blank white screen.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Unhandled UI error:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center p-6 font-sans bg-parish-bg">
        <div className="max-w-[440px] text-center">
          <div className="w-14 h-14 rounded-full bg-parish-errorBg text-parish-error flex items-center justify-center mx-auto mb-4 text-2xl font-bold">!</div>
          <h1 className="font-serif text-[28px] font-semibold text-parish-navy m-0 mb-2">Something went wrong</h1>
          <p className="text-[15px] leading-relaxed text-parish-text2 mb-6">
            The page ran into an unexpected error. Your saved records are safe — reloading usually clears it.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="appearance-none border-none cursor-pointer font-bold text-white bg-parish-blue rounded-xl px-6 py-3 text-[15px] shadow-btn"
          >
            Reload the page
          </button>
          {import.meta.env.DEV && (
            <pre className="mt-6 text-left text-[12px] text-parish-error bg-parish-errorBg border border-parish-errorBorder rounded-xl p-3 overflow-auto max-h-[200px]">
              {String(this.state.error?.stack || this.state.error)}
            </pre>
          )}
        </div>
      </div>
    );
  }
}
