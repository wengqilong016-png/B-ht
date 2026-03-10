/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      boxShadow: {
        // Soft Console 2.0 — lighter neumorphism for admin UI
        'silicone': '2px 2px 8px rgba(15,23,42,.08), -2px -2px 8px rgba(255,255,255,.9)',
        'silicone-sm': '1px 1px 4px rgba(15,23,42,.06), -1px -1px 4px rgba(255,255,255,.85)',
        'silicone-pressed': 'inset 2px 2px 6px rgba(15,23,42,.10), inset -2px -2px 6px rgba(255,255,255,.85)',
        'silicone-dark': '3px 3px 8px rgba(0,0,0,.40), -2px -2px 6px rgba(255,255,255,.04)',
        // Field Mode — simple elevation for driver UI
        'field': '0 1px 3px rgba(15,23,42,.10)',
        'field-md': '0 2px 6px rgba(15,23,42,.12)',
        'field-inset': 'inset 0 2px 4px rgba(15,23,42,.12)',
      },
      backgroundImage: {
        'silicone-gradient': 'linear-gradient(135deg, #e8eaed 0%, #f3f5f8 100%)',
        'silicone-dark-gradient': 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
        'console-gradient': 'linear-gradient(135deg, #e8eaed 0%, #f3f5f8 100%)',
      },
      borderRadius: {
        // System-wide corner radius tokens
        'card': '20px',
        'subcard': '16px',
        'btn': '14px',
        'tag': '10px',
      },
    },
  },
  plugins: [],
}

