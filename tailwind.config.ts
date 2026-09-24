import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#0a0a0a',
          card: '#141414',
          hover: '#1c1c1c',
          border: '#272727',
        },
        primary: {
          DEFAULT: '#f97316',
          hover: '#ea6c0a',
          muted: '#f9731620',
        },
        amber: {
          muted: '#f59e0b20',
        },
        text: {
          DEFAULT: '#f0f0f0',
          muted: '#9a9a9a',
          faint: '#767676',
        },
        // Readable text scale for the dark background. Use these instead of
        // ad-hoc greys: body text never darker than ink-muted, hints/labels
        // never darker than ink-hint (disabled states excepted).
        ink: {
          DEFAULT: '#f0f0f0',
          soft: '#c8c8c8',
          muted: '#9a9a9a',
          hint: '#7a7a7a',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xl: '1rem',
        '2xl': '1.25rem',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'shimmer': 'shimmer 1.5s infinite',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
      },
    },
  },
  plugins: [],
}
export default config
