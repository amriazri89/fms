/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#E7F3EC',
          100: '#CDE7D8',
          500: '#2E8A5E',
          600: '#1F6F4A',
          700: '#185A3C',
          900: '#0E3523',
        },
        gold: { 50: '#FDF4E1', 500: '#C98A12', 600: '#A8730E' },
        ink: '#22302A',
        muted: '#5F6B65',
        line: '#DCE3DF',
        income: '#1F6F4A',
        expense: '#B23B3B',
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
