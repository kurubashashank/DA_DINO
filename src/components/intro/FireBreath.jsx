import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

const EMBER_COUNT = 18
const FORWARD = new THREE.Vector3(0, 0, 1)
const FLAME_DIRECTION = new THREE.Vector3(-0.42, -0.08, 1).normalize()

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = `
  uniform float uTime;
  uniform float uIntensity;
  uniform float uCore;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 4; i++) {
      value += noise(p) * amplitude;
      p *= 2.03;
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    float turbulence = fbm(vec2(vUv.x * 5.0 + uTime * 0.45, vUv.y * 3.8 - uTime * 2.8));
    float center = 0.5 + (turbulence - 0.5) * 0.18 + sin(uTime * 7.0 + vUv.y * 11.0) * 0.035;
    float taper = (0.34 * pow(max(0.0, 1.0 - vUv.y), 0.78) + 0.012) * (0.72 + turbulence * 0.55);
    float width = mix(taper, taper * 0.36, uCore);
    float edge = abs(vUv.x - center);
    float body = 1.0 - smoothstep(width * 0.72, width + 0.025, edge);
    float baseFade = smoothstep(0.0, 0.06, vUv.y);
    float tipFade = 1.0 - smoothstep(0.76, 1.0, vUv.y);
    float alpha = body * baseFade * tipFade * (0.58 + turbulence * 0.42) * uIntensity;

    float hotCenter = 1.0 - smoothstep(0.0, width * 0.52, edge);
    vec3 color = mix(vec3(1.0, 0.045, 0.004), vec3(1.0, 0.34, 0.018), hotCenter);
    color = mix(color, vec3(1.0, 0.9, 0.48), hotCenter * (1.0 - smoothstep(0.28, 0.82, vUv.y)) * (0.68 + uCore * 0.3));
    if (uCore > 0.5) {
      alpha *= 0.82;
      color = mix(vec3(1.0, 0.3, 0.015), vec3(1.0, 0.96, 0.64), hotCenter);
    }
    gl_FragColor = vec4(color, alpha);
  }
`

function createFlameMaterial(core) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 0 },
      uCore: { value: core },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  })
}

export default function FireBreath({ model, parentRef, timeline }) {
  const root = useRef()
  const outerFlame = useRef()
  const innerFlame = useRef()
  const light = useRef()
  const embers = useRef()
  const jaw = useMemo(() => model.getObjectByName('jaw'), [model])
  const camera = useThree((state) => state.camera)
  const emberPositions = useMemo(() => new Float32Array(EMBER_COUNT * 3), [])
  const outerMaterial = useMemo(() => createFlameMaterial(0), [])
  const innerMaterial = useMemo(() => createFlameMaterial(1), [])
  const vectors = useMemo(() => ({
    position: new THREE.Vector3(),
    direction: new THREE.Vector3(),
    screenDirection: new THREE.Vector3(),
    cameraForward: new THREE.Vector3(),
    cameraFacing: new THREE.Vector3(),
    right: new THREE.Vector3(),
    localBillboardRotation: new THREE.Quaternion(),
    parentRotation: new THREE.Quaternion(),
    billboardRotation: new THREE.Quaternion(),
    billboardMatrix: new THREE.Matrix4(),
  }), [])

  useEffect(() => () => {
    outerMaterial.dispose()
    innerMaterial.dispose()
  }, [innerMaterial, outerMaterial])

  useFrame((state) => {
    if (!root.current || !jaw || !parentRef.current) return

    const time = state.clock.elapsedTime
    const fadeIn = THREE.MathUtils.smoothstep(timeline, 4.7, 5.25)
    const fadeOut = 1 - THREE.MathUtils.smoothstep(timeline, 5.6, 6.45)
    const intensity = fadeIn * fadeOut
    root.current.visible = intensity > 0.005
    if (!root.current.visible) return

    model.updateWorldMatrix(true, true)
    parentRef.current.updateWorldMatrix(true, false)
    jaw.getWorldPosition(vectors.position)
    parentRef.current.getWorldQuaternion(vectors.parentRotation)
    vectors.direction.copy(FLAME_DIRECTION).applyQuaternion(vectors.parentRotation).normalize()
    vectors.position.addScaledVector(vectors.direction, 0.36)
    vectors.position.y += 0.05
    parentRef.current.worldToLocal(vectors.position)
    vectors.position.x += 0.15
    vectors.position.y -= 0.5

    camera.updateWorldMatrix(true, false)
    camera.getWorldDirection(vectors.cameraForward)
    vectors.screenDirection.copy(vectors.direction)
      .addScaledVector(vectors.cameraForward, -vectors.direction.dot(vectors.cameraForward))
    if (vectors.screenDirection.lengthSq() < 0.01) vectors.screenDirection.copy(camera.up)
    vectors.screenDirection.normalize()
    vectors.cameraFacing.copy(vectors.cameraForward).negate()
    vectors.right.crossVectors(vectors.screenDirection, vectors.cameraFacing).normalize()
    vectors.billboardMatrix.makeBasis(vectors.right, vectors.screenDirection, vectors.cameraFacing)
    vectors.billboardRotation.setFromRotationMatrix(vectors.billboardMatrix)
    vectors.parentRotation.invert()
    vectors.localBillboardRotation.copy(vectors.parentRotation).multiply(vectors.billboardRotation)

    root.current.position.copy(vectors.position)
    root.current.quaternion.copy(vectors.localBillboardRotation)
    root.current.updateWorldMatrix(true, false)
    const worldPosition = root.current.getWorldPosition(new THREE.Vector3())
    const projected = worldPosition.project(camera)
    const clampedX = THREE.MathUtils.clamp(projected.x, -0.82, 0.82)
    const clampedY = THREE.MathUtils.clamp(projected.y, -0.76, 0.76)
    if (clampedX !== projected.x || clampedY !== projected.y) {
      const safeWorld = new THREE.Vector3(clampedX, clampedY, projected.z).unproject(camera)
      parentRef.current.worldToLocal(safeWorld)
      root.current.position.copy(safeWorld)
    }

    const flicker = 0.84 + Math.sin(time * 23) * 0.12 + Math.sin(time * 11) * 0.06
    for (const flame of [outerFlame.current, innerFlame.current]) {
      flame.material.uniforms.uTime.value = time
      flame.material.uniforms.uIntensity.value = intensity * flicker
    }
    light.current.intensity = intensity * (2.8 + Math.sin(time * 19) * 0.75)
    embers.current.material.opacity = intensity * 0.86

    const positions = embers.current.geometry.attributes.position
    for (let index = 0; index < EMBER_COUNT; index += 1) {
      const progress = (time * 1.25 + index / EMBER_COUNT) % 1
      positions.array[index * 3] = Math.sin(time * 5 + index * 8) * (0.025 + progress * 0.11)
      positions.array[index * 3 + 1] = 0.06 + progress * 1.05
      positions.array[index * 3 + 2] = Math.cos(time * 6 + index * 11) * 0.025
    }
    positions.needsUpdate = true
  })

  if (!jaw) return null

  return (
    <group ref={root} visible={false}>
      <mesh ref={outerFlame} position={[0, 0.53, 0]} scale={[0.78, 1.18, 1]} material={outerMaterial}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      <mesh ref={innerFlame} position={[0, 0.1, 0.01]} scale={[0.42, 0.72, 1]} material={innerMaterial}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      <points ref={embers}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[emberPositions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          color="#ff9d37"
          size={0.075}
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          sizeAttenuation
        />
      </points>
      <pointLight ref={light} position={[0, 0.16, 0.04]} color="#ff641d" intensity={0} distance={2.2} decay={2} />
    </group>
  )
}
