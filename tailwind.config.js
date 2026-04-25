/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        trybe: {
          50: '#effef4',
          100: '#d9fce5',
          200: '#b5f7cd',
          300: '#7ceea8',
          400: '#3cdd7a',
          500: '#16a34a',
          600: '#11873d',
          700: '#116b34',
          800: '#12542c',
          900: '#104526',
          950: '#032712',
        },
      },
      fontFamily: {
        sans: ['"DM Sans"', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'soft': '0 2px 16px 0 rgba(0,0,0,0.05)',
        'soft-md': '0 4px 24px 0 rgba(0,0,0,0.07)',
        'soft-lg': '0 8px 32px 0 rgba(0,0,0,0.09)',
        'soft-xl': '0 12px 48px 0 rgba(0,0,0,0.11)',
        'glow-green': '0 0 24px 0 rgba(22,163,74,0.15)',
        'glow-green-md': '0 0 40px 0 rgba(22,163,74,0.2)',
        'inner-soft': 'inset 0 2px 6px 0 rgba(0,0,0,0.04)',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.25rem',
        '4xl': '1.5rem',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'scale-in': 'scaleIn 0.3s ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
      },
    },
  },
  plugins: [],
}
