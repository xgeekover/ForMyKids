/* 5초 미리 보기 카운트다운 배너.
   count 가 바뀔 때마다 key 로 숫자 span 을 리마운트해 팝 애니메이션을 재생한다. */
export default function PreviewBanner({ show, count }) {
  return (
    <div className={'preview-banner' + (show ? ' is-show' : '')} aria-live="polite">
      <span className="preview-eyes">👀</span>
      <span className="preview-text">외워라 얍!</span>
      <span className="preview-count" key={count}>{count}</span>
    </div>
  )
}
