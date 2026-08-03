/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        serif: ["'Cormorant Garamond'", 'serif'],
        sans: ["'Source Sans 3'", 'system-ui', 'sans-serif'],
      },
      colors: {
        parish: {
          bg: '#f7f2e8',
          card: '#fffdf8',
          ink: '#17263f',
          navy: '#1a2b4a',
          blue: '#34589c',
          blueDeep: '#26436f',
          blueDark: '#152c4c',
          gold: '#c39b4e',
          goldLight: '#e4c06a',
          border: '#ece2cd',
          borderSoft: '#e0d6c1',
          muted: '#8a836f',
          text2: '#6b6552',
          error: '#a13d29',
          errorBg: '#fbeeea',
          errorBorder: '#f0cec3',
          ok: '#2f6b48',
          okBg: '#eaf4ee',
          okBorder: '#bfe0cc',
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
      },
      animation: {
        fadeUp: 'fadeUp .5s ease both',
        spinSlow: 'spin .7s linear infinite',
      },
    },
  },
  plugins: [],
};
