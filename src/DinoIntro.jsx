import { Component, useCallback, useEffect, useRef, useState } from 'react'
import DinoScene from './components/intro/DinoScene.jsx'
import IntroLoader from './components/intro/IntroLoader.jsx'
import LogoReveal from './components/intro/LogoReveal.jsx'
import './styles.css'

const INTRO_DURATION = 10

class ModelErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { failed: false }
  }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error) {
    if (import.meta.env.DEV) console.warn('DINO 3D model unavailable:', error?.message || error)
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="cinema-model-fallback" role="status">
          <span>DINO CLOTHING</span>
          {import.meta.env.DEV && <small>Add the animated model at public/models/Trex.glb</small>}
        </div>
      )
    }
    return this.props.children
  }
}

export default function DinoIntro({ onComplete }) {
  const frameRef = useRef(null)
  const exitTimerRef = useRef(null)
  const transitionLockedRef = useRef(false)
  const startRef = useRef(null)
  const loaderFallbackRef = useRef(null)
  const audioRef = useRef(null)
  const [visible, setVisible] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [timeline, setTimeline] = useState(0)
  const [exiting, setExiting] = useState(false)
  const [parallax, setParallax] = useState({ x: 0, y: 0 })

  const dismiss = (stopAudio = true) => {
    if (transitionLockedRef.current) return
    transitionLockedRef.current = true
    window.cancelAnimationFrame(frameRef.current)
    if (stopAudio && audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    setExiting(true)
    exitTimerRef.current = window.setTimeout(() => {
      setVisible(false)
      onComplete?.()
    }, 620)
  }

  const startAndDismiss = () => dismiss(true)

  useEffect(() => {
    if (!visible) return undefined
    document.body.classList.add('dino-intro-open')

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      transitionLockedRef.current = true
      setVisible(false)
      onComplete?.()
      return () => document.body.classList.remove('dino-intro-open')
    }

    const startAfterLoading = () => {
      if (startRef.current !== null) return
      startRef.current = performance.now()
      const tick = (now) => {
        const seconds = (now - startRef.current) / 1000
        setTimeline(seconds)
        if (seconds >= INTRO_DURATION) {
          dismiss()
          return
        }
        frameRef.current = window.requestAnimationFrame(tick)
      }
      frameRef.current = window.requestAnimationFrame(tick)
    }

    if (loaded) startAfterLoading()

    return () => {
      document.body.classList.remove('dino-intro-open')
      window.cancelAnimationFrame(frameRef.current)
    }
  }, [visible, loaded, onComplete])

  useEffect(() => {
    if (!visible || loaded) return undefined
    loaderFallbackRef.current = window.setTimeout(() => setLoaded(true), 8000)
    return () => window.clearTimeout(loaderFallbackRef.current)
  }, [visible, loaded])

  useEffect(() => {
    if (!visible || !loaded || !audioRef.current) return undefined
    const audio = audioRef.current
    audio.currentTime = 0
    audio.volume = 0.72
    audio.muted = true
    const playAudio = () => {
      const playback = audio.play()
      if (playback?.catch) {
        playback.then(() => {
          audio.muted = false
        }).catch(() => {
          audio.muted = true
        })
      }
    }
    playAudio()

    const unlockOnGesture = () => {
      audio.muted = false
      if (audio.paused) playAudio()
    }
    window.addEventListener('pointerdown', unlockOnGesture, { capture: true, once: true })
    window.addEventListener('keydown', unlockOnGesture, { capture: true, once: true })

    return () => {
      window.removeEventListener('pointerdown', unlockOnGesture, true)
      window.removeEventListener('keydown', unlockOnGesture, true)
      audio.pause()
      audio.currentTime = 0
    }
  }, [visible, loaded])

  useEffect(() => {
    if (!visible) return undefined
    const updatePointer = (event) => {
      const point = event.touches?.[0] || event
      if (!point) return
      setParallax({
        x: (point.clientX / window.innerWidth - 0.5) * 2,
        y: (point.clientY / window.innerHeight - 0.5) * -2,
      })
    }
    const resetPointer = () => setParallax({ x: 0, y: 0 })
    const mobile = window.matchMedia('(pointer: coarse)').matches
    if (!mobile) window.addEventListener('pointermove', updatePointer)
    else window.addEventListener('touchmove', updatePointer, { passive: true })
    window.addEventListener('pointerleave', resetPointer)
    return () => {
      window.removeEventListener('pointermove', updatePointer)
      window.removeEventListener('touchmove', updatePointer)
      window.removeEventListener('pointerleave', resetPointer)
    }
  }, [visible])

  const handleModelReady = useCallback(() => {
    window.clearTimeout(loaderFallbackRef.current)
    setLoaded(true)
  }, [])

  if (!visible) return null

  return (
    <section
      className={`cinema-intro${exiting ? ' is-exiting' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="DINO CLOTHING cinematic introduction"
      tabIndex={-1}
      onPointerDown={startAndDismiss}
      onKeyDown={(event) => {
        if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') startAndDismiss()
      }}
    >
      <audio ref={audioRef} src="/Logo-audio.mp3" preload="auto" autoPlay muted playsInline />
      <ModelErrorBoundary>
        <DinoScene timeline={timeline} parallax={parallax} onModelReady={handleModelReady} />
      </ModelErrorBoundary>
      <div className="cinema-vignette" aria-hidden="true" />
      <div className="cinema-grain" aria-hidden="true" />
      <IntroLoader visible={!loaded} />
      <LogoReveal visible={timeline >= 7.25} />
    </section>
  )
}
