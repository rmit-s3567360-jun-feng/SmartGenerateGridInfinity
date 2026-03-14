import type { ChangeEvent } from 'react'
import { useEffect, useEffectEvent, useRef, useState } from 'react'

import {
  detectPhotoOutlineFromRaster,
  PHOTO_OUTLINE_A4_SHEET_DOWNLOAD_PATH,
  PHOTO_OUTLINE_A4_SHEET_HEIGHT_MM,
  PHOTO_OUTLINE_A4_SHEET_WIDTH_MM,
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
  PhotoContourMode,
  PhotoOutlineBinParams,
  PhotoPoint,
} from '../lib/gridfinity/types'
import { NumericFieldControl } from './NumericFieldControl'
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
  isPreviewPending: boolean
  onChange: (key: string, value: JsonValue) => void
  onReset: () => void
}

export function PhotoOutlineWorkflow({
  values,
  validationErrors,
  generation,
  isGenerating,
  isPreviewPending,
  onChange,
  onReset,
}: PhotoOutlineWorkflowProps) {
  const [uploadedRaster, setUploadedRaster] = useState<UploadedRaster | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [reviewOriginPx, setReviewOriginPx] = useState<PhotoPoint | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const emitAnalysisInEffect = useEffectEvent((value: JsonValue) => {
    onChange('analysis', value)
  })
  const blockingErrors = validationErrors.filter(
    (error) => error !== '请先上传图片并完成轮廓识别。',
  )
  const contour = values.analysis?.status === 'ready' ? values.analysis.contour : null

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
      emitAnalysisInEffect(updatePhotoOutlineEditedPoints(analysis, nextPoints))
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

  function rerunAnalysis(
    raster: UploadedRaster,
    overrides: Partial<
      Pick<PhotoOutlineBinParams, 'foregroundThreshold' | 'simplifyTolerance' | 'contourMode'>
    > = {},
  ) {
    return detectPhotoOutlineFromRaster(
      {
        data: raster.data,
        width: raster.width,
        height: raster.height,
        name: raster.name,
      },
      {
        foregroundThreshold:
          overrides.foregroundThreshold ?? values.foregroundThreshold,
        simplifyTolerance: overrides.simplifyTolerance ?? values.simplifyTolerance,
        contourMode: overrides.contourMode ?? values.contourMode,
      },
    )
  }

  function commitAnalysis(nextAnalysis: PhotoOutlineBinParams['analysis']) {
    setReviewOriginPx(
      nextAnalysis?.status === 'ready' && nextAnalysis.contour
        ? {
            x: nextAnalysis.contour.boundsPx.minX,
            y: nextAnalysis.contour.boundsPx.maxY,
          }
        : null,
    )
    onChange('analysis', nextAnalysis)
  }

  async function handleFileSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    try {
      const raster = await loadRasterFromFile(file)
      const nextAnalysis = rerunAnalysis(raster)
      setUploadedRaster(raster)
      setUploadError(null)
      commitAnalysis(nextAnalysis)
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : '读取图片失败。')
      setUploadedRaster(null)
      setReviewOriginPx(null)
      onChange('analysis', null)
    }
  }

  function handleDetectionParamChange(
    key: 'foregroundThreshold' | 'simplifyTolerance' | 'contourMode',
    value: number | string | PhotoContourMode,
  ) {
    const normalizedValue =
      key === 'contourMode' ? value : normalizeNumberControlValue(value)

    onChange(key, normalizedValue)

    if (!uploadedRaster || typeof normalizedValue !== 'number') {
      return
    }

    const nextAnalysis = rerunAnalysis(uploadedRaster, { [key]: normalizedValue })
    commitAnalysis(nextAnalysis)
  }

  function handleReset() {
    setUploadedRaster(null)
    setUploadError(null)
    setDragIndex(null)
    setReviewOriginPx(null)
    onReset()
  }

  const pointOriginPx = reviewOriginPx
    ? reviewOriginPx
    : contour
      ? { x: contour.boundsPx.minX, y: contour.boundsPx.maxY }
      : null
  const pointScale = values.analysis?.ruler.mmPerPixel ?? 0
  const pointRows =
    contour && pointOriginPx
      ? contour.pointsPx.map((point, index) => ({
          index: index + 1,
          x: (point.x - pointOriginPx.x) * pointScale,
          y: (pointOriginPx.y - point.y) * pointScale,
        }))
      : []

  return (
    <div className="photo-workspace">
      <section className="panel photo-control-panel">
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
          <div className="button-row">
            <a
              className="button button--ghost"
              download
              href={PHOTO_OUTLINE_RULER_DOWNLOAD_PATH}
            >
              下载 L 形标尺 STL
            </a>
            <a
              className="button button--ghost"
              download
              href={PHOTO_OUTLINE_A4_SHEET_DOWNLOAD_PATH}
            >
              下载 A4 校准底纸 SVG
            </a>
          </div>
          <p>
            标尺外框 {PHOTO_OUTLINE_RULER_WIDTH_MM} x {PHOTO_OUTLINE_RULER_HEIGHT_MM} mm，臂宽{' '}
            {PHOTO_OUTLINE_RULER_BAR_WIDTH_MM} mm，厚 {PHOTO_OUTLINE_RULER_THICKNESS_MM} mm。
          </p>
          <p>
            A4 底纸尺寸 {PHOTO_OUTLINE_A4_SHEET_WIDTH_MM} x {PHOTO_OUTLINE_A4_SHEET_HEIGHT_MM}{' '}
            mm，内含同规格 L 标尺和低干扰定位角标；当前 V1 识别仍只使用内嵌 L 标尺。
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
          <small>建议把目标物与深色 L 形标尺放在同一平面，背景尽量干净。</small>
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
          <NumericFieldControl
            description="照片只负责 XY 轮廓，高度仍需手工输入。"
            label="物体高度"
            max={84}
            min={0.5}
            step={0.1}
            value={values.objectHeight}
            onChange={(value) => onChange('objectHeight', normalizeNumberControlValue(value))}
          />

          <NumericFieldControl
            description="给型腔四周增加的装配余量。"
            label="轮廓余量"
            max={4}
            min={0.3}
            step={0.1}
            value={values.cavityClearance}
            onChange={(value) =>
              onChange('cavityClearance', normalizeNumberControlValue(value))
            }
          />

          <NumericFieldControl
            description="在物体高度基础上额外预留的深度。"
            label="深度余量"
            max={8}
            min={0}
            step={0.1}
            value={values.depthClearance}
            onChange={(value) =>
              onChange('depthClearance', normalizeNumberControlValue(value))
            }
          />

          <label className="form-field">
            <span>轮廓模式</span>
            <small>平滑轮廓更抗表面图案，圆角包络更适合圆角小外壳。</small>
            <select
              value={values.contourMode}
              onChange={(event) =>
                handleDetectionParamChange(
                  'contourMode',
                  event.target.value as PhotoContourMode,
                )
              }
            >
              <option value="smooth">平滑轮廓</option>
              <option value="detail">保留细节</option>
              <option value="rounded">圆角包络</option>
            </select>
          </label>

          <NumericFieldControl
            description="控制外壳强度。"
            label="壁厚"
            max={3.6}
            min={1.2}
            step={0.1}
            value={values.wallThickness}
            onChange={(value) => onChange('wallThickness', normalizeNumberControlValue(value))}
          />

          <NumericFieldControl
            description="保留在型腔底部的结构厚度。"
            label="底厚"
            max={5}
            min={1.2}
            step={0.1}
            value={values.floorThickness}
            onChange={(value) => onChange('floorThickness', normalizeNumberControlValue(value))}
          />
        </div>

        <details className="photo-advanced-panel">
          <summary>识别调节</summary>
          <p className="panel__body">
            白色物体、复杂背景或表面图案干扰时，再调这里。
          </p>
          <div className="form-grid form-grid--compact">
            <NumericFieldControl
              description="调高可减少浅色背景干扰，调低可保留更多边缘。"
              label="识别阈值"
              max={180}
              min={10}
              step={1}
              value={values.foregroundThreshold}
              onChange={(value) => handleDetectionParamChange('foregroundThreshold', value)}
            />

            <NumericFieldControl
              description="值越大，轮廓点越少；配合轮廓模式一起调。"
              label="关键点简化"
              max={18}
              min={0.5}
              step={0.1}
              value={values.simplifyTolerance}
              onChange={(value) => handleDetectionParamChange('simplifyTolerance', value)}
            />
          </div>
        </details>

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

      <div className="photo-results-column">
        <PreviewCanvas
          bounds={generation?.bounds ?? null}
          isLoading={isGenerating}
          isPending={isPreviewPending}
          positions={generation?.meshData.positions ?? null}
        />

        <section className="panel photo-review-panel">
          <div className="panel__header">
            <div>
              <p className="panel__eyebrow">轮廓审查</p>
              <h2>图像叠加</h2>
            </div>
          </div>
          <p className="panel__body">
            审查项会叠加在原图上。拖拽关键点时，右上角 3D 预览会自动刷新。
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
              <p className="panel__body">坐标原点固定在首版轮廓的左下角，拖点时不会整体漂移。</p>
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
      </div>
    </div>
  )
}

function normalizeNumberControlValue(value: number | string) {
  if (typeof value === 'number') {
    return value
  }

  if (value.trim() === '') {
    return value
  }

  const numeric = Number(value)

  return Number.isFinite(numeric) ? numeric : value
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
