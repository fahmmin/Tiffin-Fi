/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: { DEFAULT: '#6e54ff', dark: '#5b41f2', ink: '#5a3fe6', deep: '#9583ff', soft: '#ece8ff' },
        lav: { DEFAULT: '#ece8ff', 2: '#ddd7fe', line: '#d8d0ff' },
        card: '#efefef',
        ground: '#f5f5f6',
        well: '#f4f4f6',
        line: '#e6e6ea',
        ink: { DEFAULT: '#0d0d10', 2: '#63666e', 3: '#b9bbc3' },
        deep: { DEFAULT: '#0d0a1a', 2: '#1b1630' },
        ondeep: '#b9b2db',
        pink: '#ff8be0',
        cyan: '#7de3fa',
        ok: { DEFAULT: '#08718a', soft: '#e4f7fc' },
        warn: { DEFAULT: '#8a5300', soft: '#fff1de' },
        bad: { DEFAULT: '#a3156f', soft: '#ffe8f7' },
      },
      fontFamily: {
        display: ['Switzer', 'Stack Sans Headline', 'sans-serif'],
        body: ['Stack Sans Headline', 'Geist', 'sans-serif'],
        label: ['Geist', 'Stack Sans Headline', 'sans-serif'],
      },
      borderRadius: { '4xl': '32px' },
      boxShadow: {
        card: '0 1px 2px rgba(13,13,16,.08), 0 0 0 1px #e6e6ea',
        cta: '0 12px 30px rgba(110,84,255,.32)',
      },
    },
  },
  plugins: [],
}
