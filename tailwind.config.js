/** @type {import('tailwindcss').Config} */

export default {
  content: ['./src/renderer/**/*.{html,tsx,ts,css}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: 'rgb(var(--c-surface) / <alpha-value>)',
          raised: 'rgb(var(--c-surface-raised) / <alpha-value>)',
          overlay: 'rgb(var(--c-surface-overlay) / <alpha-value>)',
          border: 'rgb(var(--c-surface-border) / <alpha-value>)',
          muted: 'rgb(var(--c-surface-muted) / <alpha-value>)'
        },
        accent: {
          DEFAULT: 'rgb(var(--c-accent) / <alpha-value>)',
          muted: 'rgb(var(--c-accent-muted) / <alpha-value>)',
          hover: 'rgb(var(--c-accent-hover) / <alpha-value>)',
          soft: 'rgb(var(--c-accent) / 0.14)'
        },
        terminal: {
          bg: 'rgb(var(--c-terminal-bg) / <alpha-value>)',
          fg: 'rgb(var(--c-terminal-fg) / <alpha-value>)'
        },
        warning: 'rgb(var(--c-warning) / <alpha-value>)'
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Cascadia Code', 'Consolas', 'monospace'],
        sans: ['"Segoe UI Variable"', 'Segoe UI', 'system-ui', 'sans-serif']
      },
      borderRadius: {
        app: '10px',
        card: '8px'
      },
      boxShadow: {
        panel: '0 1px 0 rgb(255 255 255 / 0.04) inset, 0 8px 24px rgb(0 0 0 / 0.28)',
        float: '0 12px 40px rgb(0 0 0 / 0.45)'
      }
    }
  },
  plugins: []
}
