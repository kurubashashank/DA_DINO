import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

export default function ParticleSystem({ count = 350, timeline = 0 }) {
  const points = useRef()
  const positions = useMemo(() => {
    const array = new Float32Array(count * 3)
    for (let i = 0; i < count; i += 1) {
      array[i * 3] = (Math.random() - 0.5) * 12
      array[i * 3 + 1] = Math.random() * 7 - 1
      array[i * 3 + 2] = (Math.random() - 0.5) * 8
    }
    return array
  }, [count])

  useFrame((state) => {
    if (!points.current) return
    points.current.rotation.y = state.clock.elapsedTime * 0.015
    points.current.position.y = Math.sin(state.clock.elapsedTime * 0.12) * 0.08
    points.current.material.opacity = THREE.MathUtils.smoothstep(timeline, 1.2, 4.5) * 0.72
  })

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color="#d5a85a"
        size={0.018}
        sizeAttenuation
        transparent
        opacity={0}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}
