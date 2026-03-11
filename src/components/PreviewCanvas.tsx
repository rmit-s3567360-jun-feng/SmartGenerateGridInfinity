import { useEffect, useRef } from 'react'
import {
  AmbientLight,
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  GridHelper,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

import type { BoundsSummary } from '../lib/gridfinity/types'

interface PreviewCanvasProps {
  bounds: BoundsSummary | null
  isLoading: boolean
  positions: Float32Array | null
}

export function PreviewCanvas({
  bounds,
  isLoading,
  positions,
}: PreviewCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const cameraRef = useRef<PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const meshRef = useRef<Mesh | null>(null)

  useEffect(() => {
    const container = containerRef.current

    if (!container) {
      return
    }

    const scene = new Scene()
    scene.background = new Color('#07131e')

    const camera = new PerspectiveCamera(42, 1, 0.1, 2000)
    camera.up.set(0, 0, 1)
    camera.position.set(150, -160, 110)
    cameraRef.current = camera

    const renderer = new WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.target.set(0, 0, 20)
    controlsRef.current = controls

    const world = new Group()
    scene.add(world)

    const grid = new GridHelper(260, 16, '#5c90ab', '#173447')
    grid.rotateX(Math.PI / 2)
    world.add(grid)

    const mesh = new Mesh(
      new BufferGeometry(),
      new MeshStandardMaterial({
        color: '#f4b35a',
        metalness: 0.08,
        roughness: 0.64,
      }),
    )
    world.add(mesh)
    meshRef.current = mesh

    const ambientLight = new AmbientLight('#d2ecff', 1.7)
    const keyLight = new DirectionalLight('#fff1ce', 2.4)
    keyLight.position.set(120, -120, 160)
    const fillLight = new DirectionalLight('#7cc0ff', 1.1)
    fillLight.position.set(-140, 100, 90)
    scene.add(ambientLight, keyLight, fillLight)

    const resize = () => {
      const { clientWidth, clientHeight } = container
      const width = Math.max(clientWidth, 1)
      const height = Math.max(clientHeight, 1)
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }

    const observer = new ResizeObserver(resize)
    observer.observe(container)
    resize()

    let frameId = 0

    const render = () => {
      controls.update()
      renderer.render(scene, camera)
      frameId = window.requestAnimationFrame(render)
    }

    render()

    return () => {
      window.cancelAnimationFrame(frameId)
      observer.disconnect()
      controls.dispose()
      mesh.geometry.dispose()
      ;(mesh.material as MeshStandardMaterial).dispose()
      renderer.dispose()
      container.removeChild(renderer.domElement)
    }
  }, [])

  useEffect(() => {
    const mesh = meshRef.current
    const camera = cameraRef.current
    const controls = controlsRef.current

    if (!mesh || !camera || !controls) {
      return
    }

    const nextGeometry = new BufferGeometry()

    if (positions && positions.length > 0) {
      nextGeometry.setAttribute('position', new BufferAttribute(positions, 3))
      nextGeometry.computeVertexNormals()
    }

    mesh.geometry.dispose()
    mesh.geometry = nextGeometry

    if (!bounds) {
      return
    }

    const box = new Box3(
      new Vector3(...bounds.min),
      new Vector3(...bounds.max),
    )
    const center = box.getCenter(new Vector3())
    const size = box.getSize(new Vector3())
    const maxDim = Math.max(size.x, size.y, size.z, 18)
    const distance = maxDim * 2

    controls.target.copy(center)
    camera.position.set(
      center.x + distance * 0.8,
      center.y - distance * 0.95,
      center.z + distance * 0.55,
    )
    camera.near = 0.1
    camera.far = distance * 12
    camera.updateProjectionMatrix()
    controls.update()
  }, [bounds, positions])

  return (
    <section className="preview-shell">
      <div className="preview-shell__header">
        <div>
          <p className="panel__eyebrow">3D 预览</p>
          <h2>实时网格</h2>
        </div>
        {isLoading ? <span className="status-pill">生成中...</span> : null}
      </div>
      <div className="preview-canvas" ref={containerRef}>
        {!positions ? (
          <div className="preview-placeholder">等待有效参数后生成预览</div>
        ) : null}
      </div>
    </section>
  )
}
