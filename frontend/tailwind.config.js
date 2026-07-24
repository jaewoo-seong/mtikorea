/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // "Continuum" design language — see .design-ref/design-tokens-fixed.css
        primary: '#5980a6', // --color-accent
        accent2: '#728fab', // --color-accent-2
        success: '#3f7d5c',
        danger: '#a4443a',
        surface: '#e9e9ea', // --color-surface (inputs)
        canvas: '#f2f2f3', // --color-bg
        ink: '#1d1f20', // --color-text
        muted: '#7a7a7d', // neutral-600
        line: 'rgba(29,31,32,0.16)', // --color-divider
        neutral: {
          100: '#f5f5f8',
          200: '#e7e7ea',
          300: '#d4d4d7',
          400: '#b7b7ba',
          500: '#98989b',
          600: '#7a7a7d',
          700: '#5d5d60',
          800: '#424244',
          900: '#2b2b2d',
        },
        acc: {
          100: '#eef6ff',
          200: '#d6ebff',
          300: '#b5d9fd',
          400: '#94bce3',
          500: '#749dc4',
          600: '#597ea3',
          700: '#416180',
          800: '#2c455d',
          900: '#1d2d3d',
        },
      },
      fontFamily: {
        sans: ['Barlow', 'system-ui', 'sans-serif'],
        display: ['"Barlow Condensed"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      boxShadow: {
        soft: 'none',
        mid: '0 3px 10px rgba(43,43,45,0.16)',
      },
    },
  },
  plugins: [],
};
