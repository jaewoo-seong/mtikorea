/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // "Continuum" design language — see .design-ref/design-tokens-fixed.css
        //
        // Ink-on-light contrast ratios are noted against `canvas` (#f2f2f3);
        // every text token here clears WCAG AA (4.5:1) and every control border
        // clears the 3:1 non-text threshold. The Continuum reference values were
        // a half-step lighter and failed both — see `line` below in particular.
        primary: '#4a6d8f', // --color-accent, darkened from #5980a6 (3.7:1 → 4.9:1)
        accent2: '#56718c', // --color-accent-2, from #728fab (3.0:1 on blue-50 → 4.6:1)
        success: '#356b4f', // from #3f7d5c (4.4:1 → 5.6:1)
        danger: '#a4443a', // 5.4:1
        surface: '#e4e4e6', // --color-surface (inputs), darkened for field definition
        canvas: '#f2f2f3', // --color-bg
        ink: '#1d1f20', // --color-text
        muted: '#5d5d60', // neutral-700, from #7a7a7d (3.8:1 → 5.9:1)
        line: {
          // Decorative dividers and card edges.
          DEFAULT: 'rgba(29,31,32,0.22)', // --color-divider, from 0.16 (1.9:1 → 2.4:1)
          // Boundaries of interactive controls (inputs, selects, segmented
          // options) — these carry meaning, so they hold the 3:1 line.
          strong: 'rgba(29,31,32,0.52)', // 3.4:1 on canvas, 3.2:1 on surface
        },
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
        // Accent ramp. 600 tracks `primary` so `btn-primary` darkens on hover
        // (700) and press (800) instead of lightening, as it did when primary
        // sat between 500 and 600.
        acc: {
          100: '#eef6ff',
          200: '#d6ebff',
          300: '#b5d9fd',
          400: '#94bce3',
          500: '#749dc4',
          600: '#4a6d8f',
          700: '#3d5b78',
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
