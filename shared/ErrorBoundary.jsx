/* ForMyKids · React 에러 바운더리
   렌더 중 예외가 나도 하얀 화면 대신 귀여운 폴백을 보여주고,
   데이터 자가 치유 후 잠시 뒤 메인 런처로 복구한다. */
import { Component } from 'react'
import { selfHeal } from './fmk-store.js'

const BTN = {
  fontFamily: 'inherit', border: 'none', cursor: 'pointer', borderRadius: '999px',
  padding: '12px 22px', fontSize: '1.1rem', color: '#fff', textDecoration: 'none',
  boxShadow: '0 8px 18px rgba(150,110,160,.3), inset 0 -5px 0 rgba(0,0,0,.12)',
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { crashed: false }
  }

  static getDerivedStateFromError() {
    return { crashed: true }
  }

  componentDidCatch() {
    try { selfHeal() } catch (e) {} // 데이터 오염이 원인일 수 있으니 자가 치유
    const home = this.props.homeHref || '../../index.html'
    this._t = setTimeout(() => { try { window.location.href = home } catch (e) {} }, 3200)
  }

  componentWillUnmount() { clearTimeout(this._t) }

  render() {
    if (!this.state.crashed) return this.props.children
    const home = this.props.homeHref || '../../index.html'
    return (
      <div
        role="alertdialog"
        aria-label="오류 안내"
        style={{
          position: 'fixed', inset: 0, zIndex: 2147483647, display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: 20,
          background: 'linear-gradient(160deg,#fff0f7,#e3f3ff)',
          fontFamily: "'Jua','Gaegu',system-ui,sans-serif", color: '#6b4a6b', textAlign: 'center',
        }}
      >
        <div style={{ background: '#fff', borderRadius: 32, padding: '30px 26px', maxWidth: 380, width: '100%', boxShadow: '0 18px 38px rgba(150,110,160,.32)' }}>
          <div style={{ fontSize: '4rem', lineHeight: 1 }}>🧹</div>
          <h1 style={{ fontSize: '1.8rem', margin: '.15em 0', color: '#ff6fa3' }}>어라라?</h1>
          <p style={{ fontSize: '1.2rem', margin: '.2em 0' }}>게임방을 다시 정돈할게요!</p>
          <p style={{ opacity: 0.75, margin: '.5em 0 0' }}>잠시 후 놀이터로 데려다줄게요…</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 18, flexWrap: 'wrap' }}>
            <a href={home} style={{ ...BTN, background: 'linear-gradient(160deg,#9fd0ff,#7aa8ff)' }}>🏠 홈으로</a>
            <button type="button" onClick={() => window.location.reload()} style={{ ...BTN, background: 'linear-gradient(160deg,#ff9dc4,#ff6fa3)' }}>🔄 다시 시도</button>
          </div>
        </div>
      </div>
    )
  }
}
