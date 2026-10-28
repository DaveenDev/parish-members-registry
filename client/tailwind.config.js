const tok = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Emoji: the device's own emoji font, then Noto Color Emoji (index.html)
        // for ones it doesn't have, e.g. 🩵 on Windows 10.
        serif: ["'Cormorant Garamond'", "'Apple Color Emoji'", "'Segoe UI Emoji'", "'Noto Color Emoji'", 'serif'],
        sans: ["'Source Sans 3'", 'system-ui', "'Apple Color Emoji'", "'Segoe UI Emoji'", "'Noto Color Emoji'", 'sans-serif'],
      },
      colors: {
        // Neutral and status colors are CSS variables holding "r g b"
        // channels (index.css), so opacity modifiers like /45 work and the
        // admin panel's dark mode can swap them. Light values are the
        // original parchment palette.
        parish: {
          bg: tok('bg'),
          card: tok('card'),
          surface: tok('surface'),
          field: tok('field'),
          sunk: tok('sunk'),
          hover: tok('hover'),
          track: tok('track'),
          line: tok('line'),
          line2: tok('line2'),
          edge: tok('edge'),
          border: tok('border'),
          borderSoft: tok('border-soft'),
          borderStrong: tok('border-strong'),
          ink: tok('ink'),
          text3: tok('text3'),
          text2: tok('text2'),
          muted: tok('muted'),
          faint: tok('faint'),
          icon: tok('icon'),
          scrim: tok('scrim'),
          warn: tok('warn'),
          warnStrong: tok('warn-strong'),
          warnBg: tok('warn-bg'),
          warnTint: tok('warn-tint'),
          warnBorder: tok('warn-border'),
          info: tok('info'),
          infoBorder: tok('info-border'),
          focusLine: tok('focus-line'),
          blueSoft: tok('blue-soft'),
          chip: tok('chip'),
          navy: 'var(--p-navy)',
          blue: 'var(--p-blue)',
          // Solid accent behind white text (buttons, active chips).
          fill: 'var(--p-fill)',
          blueDeep: 'var(--p-blue-deep)',
          blueDark: 'var(--p-sidebar-b)',
          gold: 'var(--p-gold)',
          goldLight: 'var(--p-gold-light)',
          error: tok('error'),
          errorBg: tok('error-bg'),
          errorBorder: tok('error-border'),
          ok: tok('ok'),
          okText: tok('ok-text'),
          okBg: tok('ok-bg'),
          okTint: tok('ok-tint'),
          okBorder: tok('ok-border'),
        },
      },
      boxShadow: {
        card: '0 12px 34px -22px rgba(23,38,63,.35)',
        cardSm: '0 10px 26px -20px rgba(23,38,63,.4)',
        btn: '0 10px 22px -10px rgba(52,88,156,.6)',
      },
      keyframes: {
        fadeUp: { from: { opacity: 0, transform: 'translateY(14px)' }, to: { opacity: 1, transform: 'none' } },
        spin: { to: { transform: 'rotate(360deg)' } },
        slideInRight: { from: { transform: 'translateX(100%)' }, to: { transform: 'none' } },
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
      },
      animation: {
        fadeUp: 'fadeUp .5s ease both',
        slideInRight: 'slideInRight .28s cubic-bezier(.2,.8,.2,1) both',
        fadeIn: 'fadeIn .2s ease both',
        spinSlow: 'spin .7s linear infinite',
      },
    },
  },
  plugins: [],
};
