import { useProgress } from '@react-three/drei'

export default function IntroLoader({ visible }) {
  const { progress, active } = useProgress()
  const value = active ? progress : 100
  return (
    <div className={`cinema-intro-loader${visible ? ' visible' : ''}`} role="status" aria-live="polite">
      <img src="/brand/da-dino-logo.png" alt="DINO CLOTHING" />
      <div className="cinema-loader-track"><span style={{ width: `${value}%` }} /></div>
      <small>{Math.round(value)}%</small>
    </div>
  )
}
