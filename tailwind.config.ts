import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/app/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f5ff',
          100: '#e0ebfe',
          200: '#c8dcfd',
          300: '#9fc1fa',
          400: '#6d9af6',
          500: '#3b7ae7',
          600: '#2563d6',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#173a5e',
          950: '#0f2a4a',
        },
        burgundy: {
          50: '#fdf0f0',
          100: '#fbe6e6',
          200: '#f6cccc',
          300: '#ee9e9e',
          400: '#e36b6b',
          500: '#d64545',
          600: '#c03030',
          700: '#9d2525',
          800: '#822327',
          900: '#722f37',
        },
        textile: {
          50: '#faf8f5',
          100: '#f3efe6',
          200: '#e6ddd0',
          300: '#d4c9b0',
          400: '#c0b28a',
          500: '#b7a89a',
          600: '#a39482',
          700: '#877a6c',
          800: '#6f6358',
          900: '#5a5048',
        },
        cream: {
          50: '#fefdfc',
          100: '#fdfaf6',
          200: '#faf3e8',
          300: '#f5e8d0',
          400: '#efe0c0',
          500: '#e8dcc6',
          600: '#d4c4a6',
          700: '#b8a584',
          800: '#968668',
          900: '#796d54',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Cascadia Mono', 'Consolas', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      boxShadow: {
        'card': '0 1px 2px rgba(15,23,42,.04), 0 1px 3px rgba(15,23,42,.06)',
        'pop': '0 10px 30px -12px rgba(15,23,42,.25)',
        'rail': '0 1px 2px rgba(15,23,42,.05)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          from: { opacity: '0', transform: 'translateX(16px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        'slide-down': {
          from: { opacity: '0', transform: 'translateY(-8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-in': 'fade-in .18s ease-out',
        'slide-up': 'slide-up .2s ease-out',
        'slide-in-right': 'slide-in-right .22s ease-out',
        'slide-down': 'slide-down .2s ease-out',
        'scale-in': 'scale-in .15s ease-out',
      },
    },
  },
  plugins: [],
};

export default config;
