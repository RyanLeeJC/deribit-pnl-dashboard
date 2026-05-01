import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Make UI corners sharper globally by halving Tailwind's default radii.
      borderRadius: {
        none: '0px',
        sm: '0.03125rem', // 0.5px
        DEFAULT: '0.0625rem', // 1px
        md: '0.09375rem', // 1.5px
        lg: '0.125rem', // 2px
        xl: '0.1875rem', // 3px
        '2xl': '0.25rem', // 4px
        '3xl': '0.375rem', // 6px
        full: '9999px',
      },
    },
  },
  plugins: [],
} satisfies Config

