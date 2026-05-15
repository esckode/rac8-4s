/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './packages/frontend/src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Court Blue (brand)
        court: {
          50: '#F5FAFF',
          100: '#EAF4FF',
          200: '#C9E5FF',
          300: '#A8D5FF',
          400: '#7BC3FF',
          500: '#4FA9F0',
          600: '#2E8AD4',
          700: '#1F6BAA',
          900: '#0F3D6B',
        },
        // Lavender (secondary)
        lavender: {
          50: '#FAF6FF',
          100: '#F2EBFF',
          200: '#E0CFF7',
          300: '#C5AEEF',
          400: '#A98AE0',
          500: '#8E69C9',
          700: '#5F3FA0',
        },
        // Accent colors
        mint: {
          100: '#E8F8EF',
          200: '#C6EFD6',
          400: '#6BCF96',
          600: '#2F9D6B',
        },
        peach: {
          100: '#FFF2E0',
          200: '#FFDDB3',
          400: '#FFB35F',
          600: '#D87A1F',
        },
        pink: {
          100: '#FFEBF4',
          300: '#FFB3D9',
          500: '#E36EA8',
        },
        rose: {
          100: '#FFE5E5',
          200: '#FFCBCB',
          400: '#FF8A8A',
          600: '#C84545',
        },
        gold: {
          200: '#FFE8A3',
          400: '#F2C24A',
          600: '#B58308',
        },
        // Ink / Neutrals
        ink: {
          50: '#F0F3F8',
          100: '#E3E8F0',
          200: '#CCD3DF',
          300: '#A5AFC0',
          400: '#8693A6',
          500: '#5B6B7D',
          600: '#455369',
          700: '#2A3A55',
          800: '#1C2A42',
          900: '#0F1B2E',
        },
      },
      spacing: {
        // 4px base scale
        s: {
          '1': '4px',
          '2': '8px',
          '3': '12px',
          '4': '16px',
          '5': '20px',
          '6': '24px',
          '8': '32px',
          '10': '40px',
          '12': '48px',
          '16': '64px',
        }
      },
      borderRadius: {
        xs: '6px',
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '20px',
        '2xl': '24px',
        '3xl': '32px',
        full: '999px',
      },
      boxShadow: {
        xs: '0 1px 2px rgba(31, 107, 170, 0.06)',
        sm: '0 2px 6px rgba(31, 107, 170, 0.07)',
        md: '0 6px 18px rgba(31, 107, 170, 0.09)',
        lg: '0 18px 40px rgba(31, 107, 170, 0.12)',
        xl: '0 28px 60px rgba(31, 107, 170, 0.16)',
        focus: '0 0 0 4px rgba(123, 195, 255, 0.30)',
      },
      screens: {
        sm: '640px',
        md: '768px',
        lg: '1024px',
        xl: '1280px',
        '2xl': '1440px',
        '3xl': '1920px',
      },
      transitionDuration: {
        fast: '100ms',
        normal: '200ms',
        slow: '300ms',
      },
      transitionTimingFunction: {
        snap: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        smooth: 'cubic-bezier(0.4, 0, 0.2, 1)',
        'ease-out': 'cubic-bezier(0, 0, 0.2, 1)',
      },
    },
  },
  plugins: [],
}
