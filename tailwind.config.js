/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans Arabic"', 'system-ui', 'sans-serif'],
      },
      colors: {
        slate: {
          100: '#17233a',
          200: '#263551',
          300: '#43536d',
          400: '#66758b',
          500: '#8490a1',
          600: '#a5aebb',
          700: '#c8ced7',
          800: '#e5e8ed',
          900: '#f4f6f8',
        },
        ink: {
          950: '#f7f8fa',
          900: '#ffffff',
          850: '#ffffff',
          800: '#f0f3f7',
          700: '#e6ebf1',
          600: '#d7dee8',
          500: '#c7d0dc',
        },
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#2563eb',
          600: '#1d4ed8',
          700: '#1e40af',
          800: '#1e3a8a',
          900: '#172554',
        },
        accent: {
          400: '#f5b73c',
          500: '#e09b1c',
          600: '#b87a0e',
        },
        danger: {
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
        },
        success: {
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
        },
      },
      boxShadow: {
        glow: '0 2px 8px -3px rgba(37,99,235,0.22)',
        card: '0 1px 3px rgba(15,23,42,0.08)',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: { '0%': { opacity: '0', transform: 'translateY(12px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        scaleIn: { '0%': { opacity: '0', transform: 'scale(0.96)' }, '100%': { opacity: '1', transform: 'scale(1)' } },
      },
      animation: {
        fadeIn: 'fadeIn .25s ease-out',
        slideUp: 'slideUp .3s ease-out',
        scaleIn: 'scaleIn .2s ease-out',
      },
    },
  },
  plugins: [],
};
