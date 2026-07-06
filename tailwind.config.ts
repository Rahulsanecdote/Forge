import type { Config } from 'tailwindcss';

/**
 * Forge design system — extends Tailwind with brand tokens.
 * Merge this `extend` block into your existing tailwind.config.ts
 * (the one create-next-app generated in Phase 00).
 */
const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: '#06090F',
        surface: '#0C1220',
        surface2: '#111827',
        surface3: '#0A0F1E',
        gold: '#E8C547',
        'gold-soft': '#F0CF5A',
        'gold-dim': 'rgba(232, 197, 71, 0.12)',
        'gold-border': 'rgba(232, 197, 71, 0.25)',
        ink: '#F0EDE6',
        muted: '#6B7280',
        'muted-dark': '#4B5563',
        line: 'rgba(255, 255, 255, 0.07)',
        'line-mid': 'rgba(255, 255, 255, 0.10)',
      },
      fontFamily: {
        bebas: ['var(--font-bebas)', 'sans-serif'],
        serif: ['var(--font-dm-serif)', 'serif'],
        mono: ['var(--font-plex-mono)', 'monospace'],
        sans: ['var(--font-dm-sans)', 'sans-serif'],
      },
      letterSpacing: {
        label: '0.15em',
        wide: '0.12em',
      },
      keyframes: {
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        glowPulse: {
          '0%, 100%': { textShadow: '0 0 60px rgba(232,197,71,0.25), 0 0 120px rgba(232,197,71,0.10)' },
          '50%': { textShadow: '0 0 80px rgba(232,197,71,0.35), 0 0 160px rgba(232,197,71,0.16)' },
        },
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.2' },
        },
      },
      animation: {
        'slide-up': 'slideUp 0.6s ease forwards',
        'fade-in': 'fadeIn 0.8s ease forwards',
        'glow-pulse': 'glowPulse 4s ease-in-out infinite',
        blink: 'blink 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
