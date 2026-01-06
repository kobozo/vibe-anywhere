import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Backgrounds
        background: 'var(--background)',
        'background-secondary': 'var(--background-secondary)',
        'background-tertiary': 'var(--background-tertiary)',
        'background-input': 'var(--background-input)',

        // Borders
        border: 'var(--border)',
        'border-secondary': 'var(--border-secondary)',

        // Text
        foreground: 'var(--foreground)',
        'foreground-secondary': 'var(--foreground-secondary)',
        'foreground-tertiary': 'var(--foreground-tertiary)',

        // Primary (accent)
        primary: 'var(--primary)',
        'primary-hover': 'var(--primary-hover)',
        'primary-foreground': 'var(--primary-foreground)',

        // Semantic
        success: 'var(--success)',
        'success-foreground': 'var(--success-foreground)',
        warning: 'var(--warning)',
        'warning-foreground': 'var(--warning-foreground)',
        error: 'var(--error)',
        'error-foreground': 'var(--error-foreground)',

        // Selection/Focus
        selection: 'var(--selection)',
        focus: 'var(--focus)',

        // Terminal
        terminal: {
          bg: 'var(--terminal-background)',
          fg: 'var(--terminal-foreground)',
          cursor: 'var(--terminal-cursor)',
          selection: 'var(--terminal-selection-background)',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
