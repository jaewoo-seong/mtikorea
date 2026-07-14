/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#2563eb',
        accent: '#f59e0b',
        success: '#10b981',
        danger: '#ef4444',
        surface: '#ffffff',
        canvas: '#f9fafb',
        ink: '#1f2937',
        muted: '#6b7280',
        line: '#e5e7eb',
      },
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        display: ['"Source Serif 4"', 'Georgia', 'serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      boxShadow: {
        soft: '0 1px 2px rgba(15,23,42,0.06)',
        mid: '0 4px 16px rgba(15,23,42,0.08)',
      },
    },
  },
  plugins: [],
};
