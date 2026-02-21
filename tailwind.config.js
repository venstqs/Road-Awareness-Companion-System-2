/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#FF8C00',
          orange: '#FF8C00',
        },
        secondary: {
          DEFAULT: '#334155',
          grey: '#334155',
        },
        success: '#10B981',
        warning: '#F59E0B',
        danger: '#EF4444',
        info: '#3B82F6',
        slate: {
          light: '#F8FAFC',
          dark: '#0F172A',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['Roboto Mono', 'monospace'],
      },
      borderRadius: {
        'small': '8px',
        'medium': '12px',
        'large': '16px',
      },
      boxShadow: {
        'subtle': '0 1px 3px rgba(0,0,0,0.1)',
        'deep': '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
      },
      transitionDuration: {
        '200': '200ms',
      }
    },
  },
  plugins: [],
}
