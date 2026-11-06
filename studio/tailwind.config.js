/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: { DEFAULT: '#6E54FF', dark: '#5B42EA', soft: '#EEEAFE' },
        lav: '#EEEAFE',
        card: '#EFEFEF',
        ground: '#F6F6F7',
        ink: '#0D0A1A',
        pink: '#FF8BE0',
        cyan: '#7DE3FA',
      },
      fontFamily: {
        display: ['Switzer', 'Stack Sans Headline', 'sans-serif'],
        body: ['Stack Sans Headline', 'Geist', 'sans-serif'],
        label: ['Geist', 'Stack Sans Headline', 'sans-serif'],
      },
      borderRadius: { '4xl': '32px' },
    },
  },
  plugins: [],
}
