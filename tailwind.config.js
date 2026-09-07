/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/renderer/index.html",
    "./src/renderer/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: 'rgba(22, 22, 24, 0.92)',
        card: 'rgba(30, 30, 34, 0.75)',
        glow: {
          cyan: '#00f2fe',
          emerald: '#10b981',
          amber: '#f59e0b',
          rose: '#f43f5e',
          purple: '#a855f7',
          blue: '#3b82f6',
        }
      },
      boxShadow: {
        'glow-emerald': '0 0 25px -5px rgba(16, 185, 129, 0.5)',
        'glow-amber': '0 0 25px -5px rgba(245, 158, 11, 0.5)',
        'glow-rose': '0 0 25px -5px rgba(244, 63, 94, 0.5)',
        'glow-cyan': '0 0 25px -5px rgba(0, 242, 254, 0.5)',
        'glow-purple': '0 0 25px -5px rgba(168, 85, 247, 0.5)',
        'inner-glow': 'inset 0 0 15px rgba(255, 255, 255, 0.05)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow': 'spin 12s linear infinite',
      }
    },
  },
  plugins: [],
}
