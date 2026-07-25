/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Tajawal', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: {
          950: '#070b12',
          900: '#0b111c',
          850: '#0f1623',
          800: '#141d2e',
          700: '#1c2740',
          600: '#28365a',
          500: '#3a4a73',
        },
        brand: {
          50: '#eafaf3',
          100: '#cdf2e1',
          200: '#9ee5c4',
          300: '#66d3a2',
          400: '#34bd82',
          500: '#16a06a',
          600: '#0c8055',
          700: '#0a6645',
          800: '#0b5138',
          900: '#0a3f2d',
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
        glow: '0 0 0 1px rgba(52,189,130,0.25), 0 8px 30px -8px rgba(52,189,130,0.35)',
        card: '0 1px 0 0 rgba(255,255,255,0.04) inset, 0 12px 30px -12px rgba(0,0,0,0.6)',
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
