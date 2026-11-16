/** @type {import('tailwindcss').Config} */
export default {
      content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
      darkMode: 'class',
      theme: {
            extend: {
                  colors: {
                        primary: {
                              50: '#EEF2FF',
                              100: '#E0E7FF',
                              200: '#C7D2FE',
                              300: '#A5B4FC',
                              400: '#818CF8',
                              500: '#6366F1',
                              600: '#4F46E5',
                              700: '#4338CA',
                              800: '#3730A3',
                              900: '#312E81',
                        },
                        navy: {
                              50: '#F0F4FF',
                              100: '#E0EAFF',
                              500: '#3B5998',
                              700: '#1E3A5F',
                              800: '#152B47',
                              900: '#0D1B2E',
                        },
                  },
                  fontFamily: {
                        sans: ['Inter', 'system-ui', 'sans-serif'],
                  },
            },
      },
      plugins: [],
};
