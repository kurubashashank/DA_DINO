import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

export default function CameraController({ timeline, parallax }) {
  const { camera, size } = useThree()

  useFrame((state) => {
    const mobile = size.width < 700
    const intro = THREE.MathUtils.smoothstep(timeline, 0, 4.5)
    const settle = THREE.MathUtils.smoothstep(timeline, 4.5, 7)
    const aspect = size.width / Math.max(size.height, 1)
    const framingZ = mobile
      ? (aspect < 0.58 ? 19.5 : 17.5)
      : (aspect < 1.35 ? 14.2 : 11.8)
    const baseZ = THREE.MathUtils.lerp(15.5, framingZ, intro)
    const baseY = THREE.MathUtils.lerp(1.2, 1.45, settle)
    const targetX = THREE.MathUtils.lerp(0, parallax.x * 0.08, settle)
    const targetY = THREE.MathUtils.lerp(1.15 + parallax.y * 0.04, baseY, settle)
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetX, 0.025)
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetY, 0.025)
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, baseZ, 0.025)
    camera.lookAt(0, 1.4, 0)
  })

  return null
}
