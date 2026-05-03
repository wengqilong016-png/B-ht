/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
    './driver/**/*.{ts,tsx}',
    './admin/**/*.{ts,tsx}',
    './shared/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      boxShadow: {
        // Bahati Field Tool — subtle card lift
        'card': '0 1px 3px rgba(26, 24, 22, 0.08)',
        'card-raised': '0 2px 8px rgba(26, 24, 22, 0.12)',
        'card-inset': 'inset 1px 2px 4px rgba(26, 24, 22, 0.06)',
        // Legacy aliases — keep components working
        'silicone': '0 1px 3px rgba(26, 24, 22, 0.08)',
        'silicone-sm': '0 1px 3px rgba(26, 24, 22, 0.08)',
        'silicone-pressed': 'inset 1px 2px 4px rgba(26, 24, 22, 0.06)',
        'field': '0 1px 3px rgba(26, 24, 22, 0.08)',
        'field-md': '0 2px 8px rgba(26, 24, 22, 0.12)',
        'field-inset': 'inset 1px 2px 4px rgba(26, 24, 22, 0.06)',
      },
      backgroundImage: {
        'warm-gradient': 'linear-gradient(135deg, #f3efe8 0%, #faf7f2 100%)',
        'dark-gradient': 'linear-gradient(135deg, #292522 0%, #1a1816 100%)',
        // Legacy aliases
        'silicone-gradient': 'linear-gradient(135deg, #f3efe8 0%, #faf7f2 100%)',
        'console-gradient': 'linear-gradient(135deg, #f3efe8 0%, #faf7f2 100%)',
        'silicone-dark-gradient': 'linear-gradient(135deg, #292522 0%, #1a1816 100%)',
      },
      borderRadius: {
        // System-wide corner radius tokens
        'card': '20px',
        'subcard': '16px',
        'btn': '14px',
        'tag': '10px',
      },
      width: {
        'sidebar': '240px',
      },
      fontSize: {
        // Design system floor tokens
        'caption': ['10px', { lineHeight: '14px', fontWeight: '800' }],
        'body-sm': ['12px', { lineHeight: '16px' }],
      },
    },
  },
  plugins: [],
}

