// Tailwind 는 @tailwind 지시문이 있는 CSS(=popnpop 의 index.css)에만 출력을 주입한다.
// 따라서 이 설정은 전역이지만 다른 페이지(memory/dodge/런처)의 CSS 에는 영향이 없다.
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
