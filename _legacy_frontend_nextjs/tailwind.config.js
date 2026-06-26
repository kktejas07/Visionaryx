/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#0b1326', // surface
        surface: '#171f33',   // surfaceContainer
        'on-surface': '#dae2fd',
        'surface-variant': '#222a3d',
        primary: {
          light: '#afc6ff',
          DEFAULT: '#2065d1',
          dark: '#0c4a9e',
          container: '#222a3d',
          'on-container': '#afc6ff',
        },
        secondary: {
          light: '#75fd9c',
          DEFAULT: '#57e082',
          dark: '#003918',
        },
        success: {
          light: '#5be584',
          DEFAULT: '#00aa54',
          dark: '#007b55',
        },
        warning: {
          light: '#ffd666',
          DEFAULT: '#ffb950',
          dark: '#915f00',
        },
        error: {
          light: '#ffdad6',
          DEFAULT: '#ffb4ab',
          dark: '#93000a',
        },
        slate: {
          400: '#8c909f',
          500: '#424753',
        }
      },
      fontFamily: {
        manrope: ['Manrope', 'sans-serif'],
        inter: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
