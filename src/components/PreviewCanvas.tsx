import { useEffect, useRef, useState } from 'react'
import {
  AmbientLight,
  AxesHelper,
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
  isPending?: boolean
  positions: Float32Array | null
}

export function PreviewCanvas({
  bounds,
  isLoading,
  isPending = false,
  positions,
}: PreviewCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const cameraRef = useRef<PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const axesRef = useRef<AxesHelper | null>(null)
  const modelGroupRef = useRef<Group | null>(null)
  const meshRef = useRef<Mesh | null>(null)
  const fitViewRef = useRef<(() => void) | null>(null)
  const [rendererError, setRendererError] = useState<string | null>(null)

  useEffect(() => {
    const container = containerRef.current

    if (!container) {
      return
    }

    let renderer: WebGLRenderer
    const scene = new Scene()
    scene.background = new Color('#07131e')

    const camera = new PerspectiveCamera(42, 1, 0.1, 2000)
    camera.up.set(0, 0, 1)
    camera.position.set(150, -160, 110)
    cameraRef.current = camera

    try {
      renderer = new WebGLRenderer({ antialias: true })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      container.appendChild(renderer.domElement)
    } catch {
      queueMicrotask(() => {
        setRendererError('当前环境不支持 WebGL 预览，参数编辑和 STL 导出仍可继续。')
      })
      return
    }

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.target.set(0, 0, 20)
    controlsRef.current = controls

    const world = new Group()
    scene.add(world)

    const grid = new GridHelper(260, 16, '#5c90ab', '#173447')
    grid.rotateX(Math.PI / 2)
    world.add(grid)

    const axes = new AxesHelper(1)
    axes.renderOrder = 2
    if (Array.isArray(axes.material)) {
      axes.material.forEach((material) => {
        material.depthTest = false
      })
    } else {
      axes.material.depthTest = false
    }
    world.add(axes)
    axesRef.current = axes

    const modelGroup = new Group()
    world.add(modelGroup)
    modelGroupRef.current = modelGroup

    const mesh = new Mesh(
      new BufferGeometry(),
      new MeshStandardMaterial({
        color: '#f4b35a',
        metalness: 0.08,
        roughness: 0.64,
      }),
    )
    modelGroup.add(mesh)
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
      axes.geometry.dispose()
      if (Array.isArray(axes.material)) {
        axes.material.forEach((material) => material.dispose())
      } else {
        axes.material.dispose()
      }
      mesh.geometry.dispose()
      ;(mesh.material as MeshStandardMaterial).dispose()
      renderer.dispose()
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [])

  useEffect(() => {
    const mesh = meshRef.current
    const camera = cameraRef.current
    const controls = controlsRef.current
    const axes = axesRef.current
    const modelGroup = modelGroupRef.current

    if (!mesh || !camera || !controls || !axes || !modelGroup) {
      return
    }

    const fitCameraToBounds = (nextBounds: BoundsSummary | null) => {
      if (!nextBounds) {
        modelGroup.position.set(0, 0, 0)
        axes.position.set(0, 0, 0)
        axes.scale.setScalar(24)
        controls.target.set(0, 0, 20)
        camera.position.set(150, -160, 110)
        camera.near = 0.1
        camera.far = 2000
        camera.updateProjectionMatrix()
        controls.update()
        return
      }

      const originOffset = new Vector3(
        -nextBounds.min[0],
        -nextBounds.min[1],
        -nextBounds.min[2],
      )
      modelGroup.position.copy(originOffset)

      const box = new Box3(
        new Vector3(0, 0, 0),
        new Vector3(...nextBounds.size),
      )
      const center = box.getCenter(new Vector3())
      const size = box.getSize(new Vector3())
      const maxDim = Math.max(size.x, size.y, size.z, 18)
      const distance = maxDim * 2
      const axisLength = Math.max(maxDim * 0.75, 24)

      axes.position.set(0, 0, 0)
      axes.scale.setScalar(axisLength)

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
    }

    const nextGeometry = new BufferGeometry()

    if (positions && positions.length > 0) {
      nextGeometry.setAttribute('position', new BufferAttribute(positions, 3))
      nextGeometry.computeVertexNormals()
    }

    mesh.geometry.dispose()
    mesh.geometry = nextGeometry
    fitViewRef.current = () => fitCameraToBounds(bounds)
    fitCameraToBounds(bounds)
  }, [bounds, positions])

  const statusLabel = isLoading ? '生成中...' : isPending ? '等待更新...' : null

  return (
    <section className="preview-shell">
      <div className="preview-shell__header">
        <div>
          <p className="panel__eyebrow">3D 预览</p>
          <h2>实时网格</h2>
        </div>
        <div className="preview-shell__actions">
          {statusLabel ? (
            <span
              className={isPending && !isLoading ? 'status-pill status-pill--pending' : 'status-pill'}
            >
              {statusLabel}
            </span>
          ) : null}
          <button
            className="button button--ghost preview-reset-button"
            disabled={!bounds}
            type="button"
            onClick={() => fitViewRef.current?.()}
          >
            重置视角
          </button>
        </div>
      </div>
      <div className="preview-canvas" ref={containerRef}>
        <div className="axis-legend" aria-label="坐标轴图例">
          <span className="axis-legend__item axis-legend__item--x">X</span>
          <span className="axis-legend__item axis-legend__item--y">Y</span>
          <span className="axis-legend__item axis-legend__item--z">Z</span>
          <span className="axis-legend__origin">原点: 外轮廓角点</span>
        </div>
        {rendererError ? (
          <div className="preview-placeholder">{rendererError}</div>
        ) : !positions ? (
          <div className="preview-placeholder">等待有效参数后生成预览</div>
        ) : null}
      </div>
    </section>
  )
}
