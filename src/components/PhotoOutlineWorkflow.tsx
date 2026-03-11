import type { ChangeEvent } from 'react'
import { useEffect, useEffectEvent, useRef, useState } from 'react'

import {
  detectPhotoOutlineFromRaster,
  PHOTO_OUTLINE_RULER_BAR_WIDTH_MM,
  PHOTO_OUTLINE_RULER_DOWNLOAD_PATH,
  PHOTO_OUTLINE_RULER_HEIGHT_MM,
  PHOTO_OUTLINE_RULER_THICKNESS_MM,
  PHOTO_OUTLINE_RULER_WIDTH_MM,
  updatePhotoOutlineEditedPoints,
} from '../lib/gridfinity/photoOutline'
import type {
  GenerationResult,
  JsonValue,
  PhotoOutlineBinParams,
  PhotoPoint,
} from '../lib/gridfinity/types'
import { PreviewCanvas } from './PreviewCanvas'

interface UploadedRaster {
  dataUrl: string
  width: number
  height: number
  name: string
  data: Uint8ClampedArray
}

interface PhotoOutlineWorkflowProps {
  values: PhotoOutlineBinParams
  validationErrors: string[]
  generation: GenerationResult | null
  isGenerating: boolean
  onChange: (key: string, value: JsonValue) => void
  onReset: () => void
}

export function PhotoOutlineWorkflow({
  values,
  validationErrors,
  generation,
  isGenerating,
  onChange,
  onReset,
}: PhotoOutlineWorkflowProps) {
  const [uploadedRaster, setUploadedRaster] = useState<UploadedRaster | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const emitAnalysis = useEffectEvent((value: JsonValue) => {
    onChange('analysis', value)
  })
  const blockingErrors = validationErrors.filter(
    (error) => error !== '请先上传图片并完成轮廓识别。',
  )
  const contour = values.analysis?.status === 'ready' ? values.analysis.contour : null

  useEffect(() => {
    if (!uploadedRaster) {
      return
    }

    const nextAnalysis = detectPhotoOutlineFromRaster(
      {
        data: uploadedRaster.data,
        width: uploadedRaster.width,
        height: uploadedRaster.height,
        name: uploadedRaster.name,
      },
      {
        foregroundThreshold: values.foregroundThreshold,
        simplifyTolerance: values.simplifyTolerance,
      },
    )

    emitAnalysis(nextAnalysis)
  }, [uploadedRaster, values.foregroundThreshold, values.simplifyTolerance])

  useEffect(() => {
    const activeRaster = uploadedRaster
    const activeAnalysis = values.analysis
    const activeContour = contour

    if (dragIndex === null || !activeRaster || activeAnalysis?.status !== 'ready' || !activeContour) {
      return
    }

    const raster = activeRaster
    const analysis = activeAnalysis
    const contourPoints = activeContour.pointsPx

    function handlePointerMove(event: PointerEvent) {
      const svg = svgRef.current

      if (!svg) {
        return
      }

      const nextPoint = projectPointerToImage(
        svg,
        event.clientX,
        event.clientY,
        raster.width,
        raster.height,
      )
      const nextPoints = contourPoints.map((point, index) =>
        index === dragIndex ? nextPoint : point,
      )
      emitAnalysis(updatePhotoOutlineEditedPoints(analysis, nextPoints))
    }

    function handlePointerUp() {
      setDragIndex(null)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [contour, dragIndex, uploadedRaster, values.analysis])

  async function handleFileSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    try {
      const raster = await loadRasterFromFile(file)
      setUploadedRaster(raster)
      setUploadError(null)
      onChange('analysis', null)
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : '读取图片失败。')
      setUploadedRaster(null)
      onChange('analysis', null)
    }
  }

  function handleReset() {
    setUploadedRaster(null)
    setUploadError(null)
    setDragIndex(null)
    onReset()
  }

  const pointRows =
    contour?.pointsMm.map((point, index) => ({
      index: index + 1,
      x: point.x - contour.boundsMm.minX,
      y: contour.boundsMm.maxY - point.y,
    })) ?? []

  return (
    <div className="photo-workspace">
      <section className="panel">
        <div className="panel__header">
          <div>
            <p className="panel__eyebrow">识别流程</p>
            <h2>照片轮廓收纳</h2>
          </div>
          <button className="button button--ghost" type="button" onClick={handleReset}>
            恢复默认
          </button>
        </div>
        <p className="panel__body">
          上传单张俯拍照片后，系统会先识别 L 形标尺，再抽取关键点轮廓。拖拽橙色节点即可修正首版轮廓。
        </p>
        <div className="photo-ruler-download">
          <a
            className="button button--ghost"
            download
            href={PHOTO_OUTLINE_RULER_DOWNLOAD_PATH}
          >
            下载 L 形标尺 STL
          </a>
          <p>
            标尺外框 {PHOTO_OUTLINE_RULER_WIDTH_MM} x {PHOTO_OUTLINE_RULER_HEIGHT_MM} mm，臂宽{' '}
            {PHOTO_OUTLINE_RULER_BAR_WIDTH_MM} mm，厚 {PHOTO_OUTLINE_RULER_THICKNESS_MM} mm。
          </p>
        </div>

        {uploadError ? (
          <div className="error-box" role="alert">
            <strong>图片读取失败</strong>
            <p>{uploadError}</p>
          </div>
        ) : null}

        {blockingErrors.length > 0 ? (
          <div className="error-box" role="alert">
            <strong>当前结果不可用</strong>
            <ul>
              {blockingErrors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <label className="photo-upload-box">
          <span>上传俯拍照片</span>
          <small>建议把目标物与黑色 L 形标尺放在同一平面，背景尽量干净。</small>
          <input accept="image/*" type="file" onChange={handleFileSelect} />
        </label>

        {uploadedRaster ? (
          <div className="photo-meta-grid">
            <div className="stat-card">
              <span>当前图片</span>
              <strong>{uploadedRaster.name}</strong>
            </div>
            <div className="stat-card">
              <span>识别分辨率</span>
              <strong>
                {uploadedRaster.width} x {uploadedRaster.height}
              </strong>
            </div>
          </div>
        ) : null}

        <div className="form-grid">
          <label className="form-field">
            <span>物体高度</span>
            <small>照片只负责 XY 轮廓，高度仍需手工输入。</small>
            <input
              max={84}
              min={4}
              step={0.5}
              type="number"
              value={String(values.objectHeight)}
              onChange={(event) => onChange('objectHeight', Number(event.target.value))}
            />
          </label>

          <label className="form-field">
            <span>轮廓余量</span>
            <small>给型腔四周增加的装配余量。</small>
            <input
              max={4}
              min={0.3}
              step={0.1}
              type="number"
              value={String(values.cavityClearance)}
              onChange={(event) => onChange('cavityClearance', Number(event.target.value))}
            />
          </label>

          <label className="form-field">
            <span>深度余量</span>
            <small>在物体高度基础上额外预留的深度。</small>
            <input
              max={8}
              min={0}
              step={0.1}
              type="number"
              value={String(values.depthClearance)}
              onChange={(event) => onChange('depthClearance', Number(event.target.value))}
            />
          </label>

          <label className="form-field">
            <span>取物凹槽</span>
            <small>支持双侧双层、单侧双层和自动侧选择。</small>
            <select
              value={values.gripMode}
              onChange={(event) => onChange('gripMode', event.target.value)}
            >
              <option value="double-sided">双侧双层</option>
              <option value="single-sided">单侧双层</option>
              <option value="auto-side">自动侧选择</option>
            </select>
          </label>

          {values.gripMode === 'single-sided' ? (
            <label className="form-field">
              <span>单侧方向</span>
              <small>单侧双层模式下生效。</small>
              <select
                value={values.singleGripSide}
                onChange={(event) => onChange('singleGripSide', event.target.value)}
              >
                <option value="left">左侧</option>
                <option value="right">右侧</option>
              </select>
            </label>
          ) : null}

          <label className="form-field">
            <span>识别阈值</span>
            <small>调高可减少浅色背景干扰，调低可保留更多边缘。</small>
            <input
              max={180}
              min={10}
              step={1}
              type="number"
              value={String(values.foregroundThreshold)}
              onChange={(event) => onChange('foregroundThreshold', Number(event.target.value))}
            />
          </label>

          <label className="form-field">
            <span>关键点简化</span>
            <small>值越大，轮廓点越少，适合先做粗修。</small>
            <input
              max={18}
              min={0.5}
              step={0.1}
              type="number"
              value={String(values.simplifyTolerance)}
              onChange={(event) => onChange('simplifyTolerance', Number(event.target.value))}
            />
          </label>

          <label className="form-field">
            <span>壁厚</span>
            <small>控制外壳强度。</small>
            <input
              max={3.6}
              min={1.2}
              step={0.1}
              type="number"
              value={String(values.wallThickness)}
              onChange={(event) => onChange('wallThickness', Number(event.target.value))}
            />
          </label>

          <label className="form-field">
            <span>底厚</span>
            <small>保留在型腔底部的结构厚度。</small>
            <input
              max={5}
              min={1.2}
              step={0.1}
              type="number"
              value={String(values.floorThickness)}
              onChange={(event) => onChange('floorThickness', Number(event.target.value))}
            />
          </label>
        </div>

        <label className="toggle-field">
          <div>
            <span>磁铁孔</span>
            <small>在底部保留 6 x 2mm 磁铁孔阵列。</small>
          </div>
          <input
            checked={values.magnetHoles}
            type="checkbox"
            onChange={(event) => onChange('magnetHoles', event.target.checked)}
          />
        </label>
      </section>

      <section className="panel photo-review-panel">
        <div className="panel__header">
          <div>
            <p className="panel__eyebrow">轮廓审查</p>
            <h2>图像叠加</h2>
          </div>
        </div>
        <p className="panel__body">
          审查项会叠加在原图上。拖拽关键点时，右下角 3D 预览会自动刷新。
        </p>

        {!uploadedRaster ? (
          <div className="photo-empty-state">
            先上传一张带 L 形标尺的俯拍照片，系统会在这里显示叠加结果。
          </div>
        ) : (
          <div
            className="photo-review-stage"
            style={{ aspectRatio: `${uploadedRaster.width} / ${uploadedRaster.height}` }}
          >
            <svg
              className="photo-review-svg"
              ref={svgRef}
              viewBox={`0 0 ${uploadedRaster.width} ${uploadedRaster.height}`}
            >
              <image
                height={uploadedRaster.height}
                href={uploadedRaster.dataUrl}
                width={uploadedRaster.width}
                x={0}
                y={0}
              />

              {values.analysis?.ruler.boundsPx ? (
                <rect
                  className="photo-ruler-box"
                  height={values.analysis.ruler.boundsPx.height}
                  width={values.analysis.ruler.boundsPx.width}
                  x={values.analysis.ruler.boundsPx.minX}
                  y={values.analysis.ruler.boundsPx.minY}
                />
              ) : null}

              {contour ? (
                <>
                  <polygon
                    className="photo-contour-polygon"
                    points={contour.pointsPx.map((point) => `${point.x},${point.y}`).join(' ')}
                  />
                  <rect
                    className="photo-contour-bounds"
                    height={contour.boundsPx.height}
                    width={contour.boundsPx.width}
                    x={contour.boundsPx.minX}
                    y={contour.boundsPx.minY}
                  />
                  <text
                    className="photo-dimension-label"
                    x={contour.boundsPx.minX + contour.boundsPx.width / 2}
                    y={Math.max(18, contour.boundsPx.minY - 8)}
                  >
                    {contour.widthMm.toFixed(1)} mm
                  </text>
                  <text
                    className="photo-dimension-label"
                    transform={`translate(${contour.boundsPx.maxX + 12} ${contour.boundsPx.minY + contour.boundsPx.height / 2}) rotate(90)`}
                  >
                    {contour.heightMm.toFixed(1)} mm
                  </text>
                  {contour.pointsPx.map((point, index) => (
                    <circle
                      className="photo-point-handle"
                      cx={point.x}
                      cy={point.y}
                      key={`${point.x}-${point.y}-${index}`}
                      r={5.5}
                      onPointerDown={() => setDragIndex(index)}
                    />
                  ))}
                </>
              ) : null}
            </svg>
          </div>
        )}

        {values.analysis?.message ? (
          values.analysis.status === 'ready' ? (
            <div className="warning-box">
              <strong>识别提醒</strong>
              <p>{values.analysis.message}</p>
            </div>
          ) : (
            <div className="error-box" role="alert">
              <strong>识别失败</strong>
              <p>{values.analysis.message}</p>
            </div>
          )
        ) : null}

        {pointRows.length > 0 ? (
          <div className="photo-points-table">
            <h3>关键点毫米坐标</h3>
            <div className="photo-points-table__grid">
              {pointRows.map((row) => (
                <div className="photo-point-card" key={row.index}>
                  <strong>P{row.index}</strong>
                  <span>X {row.x.toFixed(1)} mm</span>
                  <span>Y {row.y.toFixed(1)} mm</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <PreviewCanvas
        bounds={generation?.bounds ?? null}
        isLoading={isGenerating}
        positions={generation?.meshData.positions ?? null}
      />
    </div>
  )
}

function projectPointerToImage(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
  width: number,
  height: number,
) {
  const rect = svg.getBoundingClientRect()

  return {
    x: clamp(((clientX - rect.left) / rect.width) * width, 0, width),
    y: clamp(((clientY - rect.top) / rect.height) * height, 0, height),
  } satisfies PhotoPoint
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

async function loadRasterFromFile(file: File): Promise<UploadedRaster> {
  const dataUrl = await readFileAsDataUrl(file)
  const image = await loadImage(dataUrl)
  const scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight))
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('当前浏览器无法读取图片像素。')
  }

  context.drawImage(image, 0, 0, width, height)
  const imageData = context.getImageData(0, 0, width, height)

  return {
    dataUrl: canvas.toDataURL('image/png'),
    width,
    height,
    name: file.name,
    data: new Uint8ClampedArray(imageData.data),
  }
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('读取文件失败。'))
    reader.readAsDataURL(file)
  })
}

function loadImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()

    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('图片格式无法解析。'))
    image.src = dataUrl
  })
}
