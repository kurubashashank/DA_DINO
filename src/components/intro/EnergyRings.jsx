import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

export default function EnergyRings({ timeline }) {
  const group = useRef()

  useFrame((state) => {
    if (!group.current) return
    group.current.rotation.y = state.clock.elapsedTime * 0.06
    group.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.18) * 0.035
  })

  const opacity = THREE.MathUtils.smoothstep(timeline, 6.1, 7.8)
  return (
    <group ref={group} position={[0, 1.9, 0]} visible={opacity > 0}>
      {[3.15, 3.55, 4].map((radius, index) => (
        <mesh key={radius} rotation={[Math.PI / 2 + index * 0.12, index * 0.23, index * 0.18]}>
          <torusGeometry args={[radius, 0.008, 8, 128]} />
          <meshBasicMaterial color="#d0a45a" transparent opacity={opacity * (0.42 - index * 0.08)} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}
