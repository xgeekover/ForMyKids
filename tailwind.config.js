/** @type {import('tailwindcss').Config} */
// content 를 popnpop 페이지로 한정 → Tailwind 유틸리티/preflight 이 popnpop 번들에만 들어가고
// 다른 페이지(memory/dodge/런처)의 스타일은 건드리지 않는다.
export default {
  content: ['./games/popnpop/index.html', './games/popnpop/src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        cute: ['"Jua"', '"Fredoka"', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        bob: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        drift: {
          '0%, 100%': { transform: 'translateX(0)' },
          '50%': { transform: 'translateX(20px)' },
        },
      },
      animation: {
        bob: 'bob 2.8s ease-in-out infinite',
        drift: 'drift 10s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
