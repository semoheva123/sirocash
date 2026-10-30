import type { Config } from 'tailwindcss';
export default {content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'], theme: {extend: {colors: {cyan: '#00F3FF', ink: '#080C10'}, fontFamily: {sans: ['Arial', 'Tahoma', 'sans-serif']}}}, plugins: []} satisfies Config;
