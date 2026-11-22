import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useAnimations, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import FireBreath from './FireBreath.jsx'

export default function Dinosaur({ timeline, parallax, onReady, modelPath = '/models/Trex.glb' }) {
  const group = useRef()
  const gltf = useGLTF(modelPath)
  const idleStarted = useRef(false)
  const { size } = useThree()

  const model = useMemo(() => {
    gltf.scene.traverse((object) => {
      if (!object.isMesh) return
      object.castShadow = false
      object.receiveShadow = false
      object.frustumCulled = true
      object.visible = true
      object.frustumCulled = false
      object.material = new THREE.MeshStandardMaterial({
        color: '#77786f',
        roughness: 0.58,
        metalness: 0.12,
        emissive: '#171811',
        emissiveIntensity: 0.22,
        side: THREE.DoubleSide,
      })
    })
    return gltf.scene
  }, [gltf.scene])
  const { actions } = useAnimations(gltf.animations, model)
  const walkAction = actions.Walk
  const idleAction = actions.Idle

  useEffect(() => {
    gltf.scene.scale.set(1, 1, 1)
    gltf.scene.position.set(0, 0, 0)
    gltf.scene.rotation.set(0, 0, 0)
    gltf.scene.traverse((object) => {
      if (object.isBone && object.name === 'motion_root') {
        object.position.set(0, 0, 0)
        object.rotation.set(0, 0, 0)
        object.scale.set(1, 1, 1)
      }
      if (object.isSkinnedMesh && object.skeleton) object.skeleton.pose()
    })
    gltf.scene.updateMatrixWorld(true)

    const box = new THREE.Box3().setFromObject(model)
    const size = box.getSize(new THREE.Vector3())
    const targetHeight = 2.8
    const scale = targetHeight / Math.max(size.y, 1)
    model.scale.setScalar(scale)
    const centered = new THREE.Box3().setFromObject(model)
    const center = centered.getCenter(new THREE.Vector3())
    model.position.set(-center.x, -center.y + targetHeight / 2, -center.z)
    model.updateMatrixWorld(true)

    if (walkAction) {
      walkAction.reset()
      walkAction.setLoop(THREE.LoopRepeat, Infinity)
      walkAction.play()
    } else if (import.meta.env.DEV) {
      console.warn(`The ${modelPath} model does not contain the expected Walk animation.`)
    }

    onReady?.(gltf.animations.map((clip) => clip.name))
    return () => {
      walkAction?.stop()
      idleAction?.stop()
    }
  }, [model, gltf, gltf.animations, idleAction, modelPath, onReady, walkAction])

  useFrame((state) => {
    if (!group.current) return
    const approach = THREE.MathUtils.smoothstep(timeline, 0.25, 4.7)
    const reveal = THREE.MathUtils.smoothstep(timeline, 0.5, 4.8)
    const disappear = 1 - THREE.MathUtils.smoothstep(timeline, 5.8, 7.15)
    const remainVisible = disappear > 0.012
    group.current.visible = remainVisible
    if (!remainVisible) return

    model.traverse((object) => {
      if (!object.isMesh) return
      object.material.transparent = true
      object.material.opacity = disappear
      object.material.depthWrite = disappear > 0.25
    })

    if (timeline >= 4.7 && !idleStarted.current && idleAction) {
      idleStarted.current = true
      idleAction.reset().play()
      walkAction?.crossFadeTo(idleAction, 0.65, false)
    }

    const mobile = size.width < 700
    const tablet = size.width < 1024
    const startX = mobile ? -0.9 : tablet ? -1.5 : -2.2
    const startZ = mobile ? -1.0 : -2.6
    group.current.position.x = THREE.MathUtils.lerp(startX, 0, approach)
    group.current.position.z = THREE.MathUtils.lerp(startZ, 0, approach)
    group.current.position.y = mobile ? 0 : Math.sin(state.clock.elapsedTime * 0.22) * 0.025
    group.current.scale.setScalar(THREE.MathUtils.lerp(0.78, 0.9, reveal))
    group.current.rotation.y = THREE.MathUtils.lerp(-0.5 + reveal * 0.33, parallax.x * 0.09, 0.04)
    group.current.rotation.x = THREE.MathUtils.lerp(0.02, parallax.y * 0.035, 0.04)
  })

  return (
    <group ref={group}>
      <primitive object={model} />
      <FireBreath model={model} parentRef={group} timeline={timeline} />
    </group>
  )
}

useGLTF.preload('/models/Trex.glb')
