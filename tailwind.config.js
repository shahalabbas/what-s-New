/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: '#0A84FF',
        'accent-hover': '#0071E3',
        surface: '#F5F5F7',
        'primary-text': '#1D1D1F',
        'secondary-text': '#6E6E73',
        border: '#E5E5EA',
        live: '#34C759',
        soon: '#FF9F0A',
        danger: '#FF3B30',
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
      borderRadius: {
        '2xl': '16px',
        '3xl': '20px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.06)',
        'card-hover': '0 2px 8px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.08)',
      },
    },
  },
  plugins: [],
}
