/* 스크린리더 전용 라이브 영역 — 화면에는 보이지 않지만 상태 변화를 읽어준다.
   (뒤집은 카드 이름, 짝 맞춤/실패 안내) */
export default function Announcer({ message }) {
  return (
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {message}
    </div>
  )
}
