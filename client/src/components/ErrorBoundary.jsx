import React from 'react';
import { isChunkLoadError, reloadForNewCode } from '../lib/chunkReload.js';

// The message in the visitor's language: Cebuano on the website, the
// registration form and the census portal; English in the staff admin.
const TEXT = {
  ceb: {
    title: 'Adunay sayop',
    body: 'Wala ma-abli ang panid. Basin nawala ang signal, o bag-o lang na-update ang website. Kasagaran, ma-ayo kini kung i-reload.',
    chunk: 'Wala ma-download ang panid. Susiha ang inyong koneksyon, unya i-reload.',
    button: 'I-reload ang panid',
  },
  en: {
    title: 'Something went wrong',
    body: 'The page ran into an unexpected error. Your saved records are safe — reloading usually clears it.',
    chunk: "The page couldn't be downloaded. Check the connection, then reload.",
    button: 'Reload the page',
  },
};

/**
 * Catches render-time crashes so a bug in one page shows a recoverable message
 * instead of a blank white screen. A page whose code failed to download (a
 * weak signal, or a deploy while the site was open) reloads once by itself.
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
    if (isChunkLoadError(error) && reloadForNewCode()) return;
    console.error('Unhandled UI error:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const t = TEXT[typeof window !== 'undefined' && window.location.pathname.startsWith('/admin') ? 'en' : 'ceb'];
    const chunk = isChunkLoadError(this.state.error);

    return (
      <div className="min-h-screen flex items-center justify-center p-6 font-sans bg-parish-bg">
        <div className="max-w-[440px] w-full min-w-0 text-center">
          <div className="w-14 h-14 rounded-full bg-parish-errorBg text-parish-error flex items-center justify-center mx-auto mb-4 text-2xl font-bold">!</div>
          <h1 className="font-serif text-[28px] font-semibold text-parish-navy m-0 mb-2">{t.title}</h1>
          <p className="text-[15px] leading-relaxed text-parish-text2 mb-6">{chunk ? t.chunk : t.body}</p>
          <button
            onClick={() => window.location.reload()}
            className="appearance-none border-none cursor-pointer font-bold text-white bg-parish-fill rounded-xl px-6 py-3 text-[15px] shadow-btn"
          >
            {t.button}
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
