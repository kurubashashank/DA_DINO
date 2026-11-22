import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { Preload } from '@react-three/drei'
import * as THREE from 'three'
import Dinosaur from './Dinosaur.jsx'
import CameraController from './CameraController.jsx'
import ParticleSystem from './ParticleSystem.jsx'
import EnergyRings from './EnergyRings.jsx'

export default function DinoScene({ timeline, parallax, onModelReady }) {
  const mobile = typeof window !== 'undefined' && window.innerWidth < 700
  return (
    <Canvas
      className="cinema-dino-canvas"
      dpr={[1, mobile ? 1.25 : 1.6]}
      gl={{ antialias: !mobile, alpha: false, powerPreference: 'high-performance' }}
      camera={{ fov: mobile ? 42 : 36, near: 0.1, far: 100, position: [2.8, 1.15, 10.5] }}
      onCreated={({ gl, scene }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.12
        scene.background = new THREE.Color('#020406')
        scene.fog = null
      }}
      shadows={false}
    >
      <hemisphereLight args={['#718ba0', '#120d08', 0.48]} />
      <ambientLight intensity={0.22} color="#71899a" />
      <directionalLight position={[4, 7, 5]} intensity={3.2} color="#e0be79" />
      <spotLight position={[-5, 5, 3]} intensity={9} angle={0.45} penumbra={0.8} color="#c27a35" />
      <spotLight position={[5, 6, -2]} intensity={11} angle={0.38} penumbra={0.7} color="#f1c36f" />
      <pointLight position={[0, 1, -4]} intensity={3.8} color="#93aabd" />
      <Suspense fallback={null}>
        <Dinosaur timeline={timeline} parallax={parallax} onReady={onModelReady} />
        <Preload all />
      </Suspense>
      <ParticleSystem count={mobile ? 180 : 350} timeline={timeline} />
      <EnergyRings timeline={timeline} />
      <CameraController timeline={timeline} parallax={parallax} />
    </Canvas>
  )
}
