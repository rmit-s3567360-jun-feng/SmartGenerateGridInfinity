import { booleans, expansions, extrusions, geometries, transforms } from '@jscad/modeling'

import { createBaseBinSolid, createPocketBetween } from './base'
import { getBinMetrics, gridUnitsToMillimeters, heightUnitsToMillimeters } from './spec'
import type {
  BaseBinParams,
  GridfinitySpec,
  PhotoBounds,
  PhotoOutlineAnalysis,
  PhotoOutlineBinParams,
  PhotoOutlineContour,
  PhotoOutlineRulerDetection,
  PhotoOutlineSource,
  PhotoPoint,
  PhotoSingleGripSide,
  TemplateBuildOutput,
} from './types'

const { subtract } = booleans
const { offset } = expansions
const { extrudeLinear } = extrusions
const { geom2 } = geometries
const { translate } = transforms

export const PHOTO_OUTLINE_RULER_DOWNLOAD_PATH =
  '/downloads/photo-outline-l-ruler-80x60mm.stl'
export const PHOTO_OUTLINE_RULER_WIDTH_MM = 80
export const PHOTO_OUTLINE_RULER_HEIGHT_MM = 60
export const PHOTO_OUTLINE_RULER_BAR_WIDTH_MM = 10
export const PHOTO_OUTLINE_RULER_THICKNESS_MM = 2
const PHOTO_OUTLINE_EDGE_MARGIN_MM = 4
const PHOTO_OUTLINE_GRIP_CHANNEL_WIDTH_MM = 12
const PHOTO_OUTLINE_SINGLE_GRIP_RESERVE_MM = PHOTO_OUTLINE_GRIP_CHANNEL_WIDTH_MM
const PHOTO_OUTLINE_DOUBLE_GRIP_RESERVE_MM =
  PHOTO_OUTLINE_GRIP_CHANNEL_WIDTH_MM * 2
const PHOTO_OUTLINE_MAX_KEYPOINTS = 18

interface RasterSource {
  data: Uint8ClampedArray
  width: number
  height: number
  name: string
}

interface ConnectedComponent {
  pixels: number[]
  area: number
  minX: number
  minY: number
  maxX: number
  maxY: number
  rowCounts: Map<number, number>
  colCounts: Map<number, number>
}

interface RulerCandidate {
  component: ConnectedComponent
  boundsPx: PhotoBounds
  corner: NonNullable<PhotoOutlineRulerDetection['corner']>
  confidence: number
  mmPerPixel: number
  barThicknessPx: number
}

interface LShapeMetrics {
  armCoverage: number
  horizontalRatio: number
  verticalRatio: number
}

interface GripResolution {
  sides: PhotoSingleGripSide[]
  label: string
  shiftX: number
  reserveMm: number
  warning?: string
}

export interface PhotoOutlinePlan {
  size: {
    gridX: number
    gridY: number
    heightUnits: number
  }
  orientation: 0 | 90
  resolvedParams: BaseBinParams
  cavityPointsMm: PhotoPoint[]
  contourWidthMm: number
  contourHeightMm: number
  cavityBottomZ: number
  cavityTopZ: number
  cavityDepth: number
  gripSides: PhotoSingleGripSide[]
  gripLabel: string
  mmPerPixel: number
  warnings: string[]
}

export interface PhotoOutlineRecommendationSummary {
  size: PhotoOutlinePlan['size']
  orientationLabel: string
  gripLabel: string
  contourWidthMm: number
  contourHeightMm: number
  mmPerPixel: number
  pointCount: number
  warnings: string[]
}

export const photoOutlineDefaultParams: PhotoOutlineBinParams = {
  gridX: 2,
  gridY: 2,
  heightUnits: 4,
  wallThickness: 2,
  floorThickness: 2.4,
  magnetHoles: true,
  labelLip: false,
  objectHeight: 18,
  cavityClearance: 1.2,
  depthClearance: 1.2,
  gripMode: 'auto-side',
  singleGripSide: 'right',
  foregroundThreshold: 46,
  simplifyTolerance: 3.4,
  analysis: null,
}

export function createPhotoOutlineFixtureAnalysis(): PhotoOutlineAnalysis {
  const source: PhotoOutlineSource = {
    name: 'fixture-photo.png',
    width: 240,
    height: 180,
  }
  const ruler: PhotoOutlineRulerDetection = {
    status: 'detected',
    corner: 'bottom-left',
    confidence: 0.88,
    mmPerPixel: 0.5,
    knownWidthMm: PHOTO_OUTLINE_RULER_WIDTH_MM,
    knownHeightMm: PHOTO_OUTLINE_RULER_HEIGHT_MM,
    barThicknessPx: 6,
    boundsPx: makeBounds(8, 112, 88, 172),
  }
  const pointsPx = [
    { x: 96, y: 42 },
    { x: 138, y: 46 },
    { x: 168, y: 74 },
    { x: 156, y: 118 },
    { x: 112, y: 136 },
    { x: 70, y: 112 },
    { x: 62, y: 70 },
  ]

  return createReadyAnalysis(source, ruler, pointsPx, {
    foregroundThreshold: photoOutlineDefaultParams.foregroundThreshold,
    simplifyTolerance: photoOutlineDefaultParams.simplifyTolerance,
  })
}

export function detectPhotoOutlineFromRaster(
  source: RasterSource,
  options: Pick<PhotoOutlineBinParams, 'foregroundThreshold' | 'simplifyTolerance'>,
): PhotoOutlineAnalysis {
  const background = estimateBackgroundColor(source.data, source.width, source.height)
  const darkMask = createMask(source.width, source.height, (index) => {
    const offset = index * 4
    const r = source.data[offset]
    const g = source.data[offset + 1]
    const b = source.data[offset + 2]
    const channelSpread = Math.max(r, g, b) - Math.min(r, g, b)

    return (
      luminance(r, g, b) < 88 &&
      colorDistance([r, g, b], background) > 28 &&
      channelSpread <= 28
    )
  })
  const darkComponents = getConnectedComponents(darkMask, source.width, source.height)
  const rulerCandidate = selectRulerCandidate(darkComponents, source.width, source.height)

  if (!rulerCandidate) {
    return createErrorAnalysis(
      source,
      '未识别到 L 形标尺，请让黑色标尺与物体同平面并放在干净背景上。',
      options,
    )
  }

  const rulerDetection: PhotoOutlineRulerDetection = {
    status: 'detected',
    corner: rulerCandidate.corner,
    confidence: roundNumber(rulerCandidate.confidence, 3),
    mmPerPixel: roundNumber(rulerCandidate.mmPerPixel, 4),
    knownWidthMm: PHOTO_OUTLINE_RULER_WIDTH_MM,
    knownHeightMm: PHOTO_OUTLINE_RULER_HEIGHT_MM,
    barThicknessPx: roundNumber(rulerCandidate.barThicknessPx, 2),
    boundsPx: rulerCandidate.boundsPx,
  }

  const foregroundMask = createMask(
    source.width,
    source.height,
    (index) => {
      const offset = index * 4
      const r = source.data[offset]
      const g = source.data[offset + 1]
      const b = source.data[offset + 2]
      const distance = colorDistance([r, g, b], background)

      return distance > options.foregroundThreshold || luminance(r, g, b) < 96
    },
  )

  for (const pixel of rulerCandidate.component.pixels) {
    foregroundMask[pixel] = 0
  }

  clearMaskBorder(foregroundMask, source.width, source.height)
  const objectComponents = getConnectedComponents(
    foregroundMask,
    source.width,
    source.height,
  )
  const objectComponent = selectObjectComponent(
    objectComponents,
    rulerCandidate.boundsPx,
    source.width * source.height,
  )

  if (!objectComponent) {
    return {
      status: 'error',
      message: '已识别到标尺，但没有找到清晰的单物体轮廓。',
      source: toPhotoSource(source),
      ruler: rulerDetection,
      contour: null,
      detection: {
        foregroundThreshold: options.foregroundThreshold,
        simplifyTolerance: options.simplifyTolerance,
      },
    }
  }

  const objectMask = new Uint8Array(source.width * source.height)

  for (const pixel of objectComponent.pixels) {
    objectMask[pixel] = 1
  }

  const rawLoop = extractOuterLoop(objectMask, source.width, source.height)

  if (!rawLoop || rawLoop.length < 4) {
    return {
      status: 'error',
      message: '找到了前景区域，但未能提取稳定的外轮廓。',
      source: toPhotoSource(source),
      ruler: rulerDetection,
      contour: null,
      detection: {
        foregroundThreshold: options.foregroundThreshold,
        simplifyTolerance: options.simplifyTolerance,
      },
    }
  }

  const simplifiedLoop = simplifyClosedLoop(rawLoop, options.simplifyTolerance)

  if (simplifiedLoop.length < 4) {
    return {
      status: 'error',
      message: '轮廓关键点过少，请调高识别阈值或重新拍摄。',
      source: toPhotoSource(source),
      ruler: rulerDetection,
      contour: null,
      detection: {
        foregroundThreshold: options.foregroundThreshold,
        simplifyTolerance: options.simplifyTolerance,
      },
    }
  }

  const analysis = createReadyAnalysis(
    toPhotoSource(source),
    rulerDetection,
    simplifiedLoop,
    {
      foregroundThreshold: options.foregroundThreshold,
      simplifyTolerance: options.simplifyTolerance,
    },
  )

  if (rulerDetection.confidence < 0.55) {
    return {
      ...analysis,
      message: '标尺识别置信度偏低，建议检查叠加结果后再导出。',
    }
  }

  return analysis
}

export function updatePhotoOutlineEditedPoints(
  analysis: PhotoOutlineAnalysis,
  nextPointsPx: PhotoPoint[],
): PhotoOutlineAnalysis {
  if (analysis.status !== 'ready' || !analysis.contour) {
    return analysis
  }

  return createReadyAnalysis(
    analysis.source,
    analysis.ruler,
    nextPointsPx,
    analysis.detection,
    analysis.message,
    { preservePointOrder: true },
  )
}

export function getPhotoOutlineRecommendationSummary(
  params: PhotoOutlineBinParams,
  spec: GridfinitySpec,
) {
  const plan = resolvePhotoOutlinePlan(params, spec)

  return {
    size: plan.size,
    orientationLabel: plan.orientation === 90 ? '90°' : '0°',
    gripLabel: plan.gripLabel,
    contourWidthMm: roundNumber(plan.contourWidthMm, 1),
    contourHeightMm: roundNumber(plan.contourHeightMm, 1),
    mmPerPixel: roundNumber(plan.mmPerPixel, 4),
    pointCount: plan.cavityPointsMm.length,
    warnings: plan.warnings,
  } satisfies PhotoOutlineRecommendationSummary
}

export function resolvePhotoOutlinePlan(
  params: PhotoOutlineBinParams,
  spec: GridfinitySpec,
): PhotoOutlinePlan {
  if (!params.analysis || params.analysis.status !== 'ready' || !params.analysis.contour) {
    throw new Error('请先上传图片并完成轮廓识别。')
  }

  const contour = ensureCounterClockwise(params.analysis.contour.pointsMm)
  const cavityDepth = params.objectHeight + params.depthClearance
  const candidates: Array<PhotoOutlinePlan & { volume: number; area: number }> = []

  for (const orientation of [0, 90] as const) {
    const rotatedPoints = rotatePoints(contour, orientation)
    const bounds = getPointBounds(rotatedPoints)

    for (let gridX = 1; gridX <= 4; gridX += 1) {
      for (let gridY = 1; gridY <= 4; gridY += 1) {
        const outerX = gridUnitsToMillimeters(gridX, spec)
        const outerY = gridUnitsToMillimeters(gridY, spec)
        const innerX = outerX - params.wallThickness * 2
        const innerY = outerY - params.wallThickness * 2
        const grip = resolveGripMode(params, rotatedPoints, bounds, innerX)

        if (!grip) {
          continue
        }

        const requiredWidth =
          bounds.width +
          params.cavityClearance * 2 +
          PHOTO_OUTLINE_EDGE_MARGIN_MM * 2 +
          grip.reserveMm
        const requiredDepth =
          bounds.height +
          params.cavityClearance * 2 +
          PHOTO_OUTLINE_EDGE_MARGIN_MM * 2

        if (requiredWidth > innerX || requiredDepth > innerY) {
          continue
        }

        for (let heightUnits = 2; heightUnits <= 12; heightUnits += 1) {
          const heightMm = heightUnitsToMillimeters(heightUnits, spec)
          const minBottomZ = spec.footHeight + params.floorThickness
          const cavityBottomZ = heightMm - cavityDepth

          if (cavityBottomZ < minBottomZ) {
            continue
          }

          const shiftedPoints = translatePoints(rotatedPoints, grip.shiftX, 0)
          const shiftedBounds = getPointBounds(shiftedPoints)

          if (
            shiftedBounds.minX - params.cavityClearance <
              -innerX / 2 + PHOTO_OUTLINE_EDGE_MARGIN_MM ||
            shiftedBounds.maxX + params.cavityClearance >
              innerX / 2 - PHOTO_OUTLINE_EDGE_MARGIN_MM ||
            shiftedBounds.minY - params.cavityClearance <
              -innerY / 2 + PHOTO_OUTLINE_EDGE_MARGIN_MM ||
            shiftedBounds.maxY + params.cavityClearance >
              innerY / 2 - PHOTO_OUTLINE_EDGE_MARGIN_MM
          ) {
            continue
          }

          const planWarnings: string[] = []

          if (orientation === 90) {
            planWarnings.push('已自动切换为 90° 摆放，以减小外部尺寸。')
          }

          if (grip.warning) {
            planWarnings.push(grip.warning)
          }

          const resolvedParams: BaseBinParams = {
            gridX,
            gridY,
            heightUnits,
            wallThickness: params.wallThickness,
            floorThickness: params.floorThickness,
            magnetHoles: params.magnetHoles,
            labelLip: false,
          }

          candidates.push({
            size: { gridX, gridY, heightUnits },
            orientation,
            resolvedParams,
            cavityPointsMm: shiftedPoints,
            contourWidthMm: roundNumber(shiftedBounds.width, 2),
            contourHeightMm: roundNumber(shiftedBounds.height, 2),
            cavityBottomZ: roundNumber(cavityBottomZ, 2),
            cavityTopZ: roundNumber(heightMm + 1.2, 2),
            cavityDepth: roundNumber(cavityDepth, 2),
            gripSides: grip.sides,
            gripLabel: grip.label,
            mmPerPixel: params.analysis.ruler.mmPerPixel,
            warnings: Array.from(new Set(planWarnings)),
            volume: outerX * outerY * heightMm,
            area: outerX * outerY,
          })
        }
      }
    }
  }

  if (candidates.length === 0) {
    throw new Error('当前轮廓或高度超出首版搜索范围，请减小高度或重新校准照片。')
  }

  candidates.sort((left, right) =>
    left.volume - right.volume ||
    left.area - right.area ||
    left.size.heightUnits - right.size.heightUnits,
  )

  const best = candidates[0]

  return {
    size: best.size,
    orientation: best.orientation,
    resolvedParams: best.resolvedParams,
    cavityPointsMm: best.cavityPointsMm,
    contourWidthMm: best.contourWidthMm,
    contourHeightMm: best.contourHeightMm,
    cavityBottomZ: best.cavityBottomZ,
    cavityTopZ: best.cavityTopZ,
    cavityDepth: best.cavityDepth,
    gripSides: best.gripSides,
    gripLabel: best.gripLabel,
    mmPerPixel: best.mmPerPixel,
    warnings: best.warnings,
  }
}

export function buildPhotoOutlineBin(
  params: PhotoOutlineBinParams,
  spec: GridfinitySpec,
): TemplateBuildOutput {
  const plan = resolvePhotoOutlinePlan(params, spec)
  const solid = createBaseBinSolid(plan.resolvedParams, spec)
  const metrics = getBinMetrics(plan.resolvedParams, spec)
  const contourProfile = createContourProfile(plan.cavityPointsMm, params.cavityClearance)
  const cavity = translate(
    [0, 0, plan.cavityBottomZ],
    extrudeLinear(
      { height: plan.cavityTopZ - plan.cavityBottomZ },
      contourProfile,
    ),
  )
  const gripChannels = plan.gripSides.flatMap((side) =>
    createGripChannels(side, metrics.outerX, metrics.outerY, plan, params),
  )

  return {
    geometry: subtract(solid, cavity, ...gripChannels),
    warnings: plan.warnings,
  }
}

function createGripChannels(
  side: PhotoSingleGripSide,
  outerX: number,
  outerY: number,
  plan: PhotoOutlinePlan,
  params: Pick<PhotoOutlineBinParams, 'objectHeight'>,
) {
  const sideInset = side === 'left' ? -1 : 1
  const reach = PHOTO_OUTLINE_GRIP_CHANNEL_WIDTH_MM
  const spanY = Math.min(outerY - 8, plan.contourHeightMm + 16)
  const upperBottomZ = Math.max(plan.cavityBottomZ, plan.cavityTopZ - params.objectHeight * 0.52)
  const lowerBottomZ = Math.max(plan.cavityBottomZ, plan.cavityTopZ - params.objectHeight * 0.86)
  const lowerTopZ = Math.max(lowerBottomZ + 5, plan.cavityTopZ - params.objectHeight * 0.24)
  const sideCenterX =
    side === 'left'
      ? -outerX / 2 + reach / 2 + 0.5
      : outerX / 2 - reach / 2 - 0.5

  return [
    createPocketBetween(
      reach,
      spanY,
      upperBottomZ,
      plan.cavityTopZ + 0.2,
      sideCenterX,
      0,
      2.2,
      20,
    ),
    createPocketBetween(
      reach * 0.72,
      spanY * 0.62,
      lowerBottomZ,
      lowerTopZ,
      sideCenterX - sideInset * 1.2,
      0,
      1.6,
      16,
    ),
  ]
}

function createContourProfile(points: PhotoPoint[], clearance: number) {
  const profile = geom2.fromPoints(points.map(({ x, y }) => [x, y]))

  if (clearance <= 0) {
    return profile
  }

  return offset(
    { delta: clearance, corners: 'round', segments: 24 },
    profile,
  ) as ReturnType<typeof geom2.fromPoints>
}

function resolveGripMode(
  params: Pick<PhotoOutlineBinParams, 'gripMode' | 'singleGripSide'>,
  points: PhotoPoint[],
  bounds: PhotoBounds,
  innerX: number,
) {
  const preferredSide = getPreferredSingleSide(points)

  if (params.gripMode === 'double-sided') {
    if (
      bounds.width +
        PHOTO_OUTLINE_DOUBLE_GRIP_RESERVE_MM +
        PHOTO_OUTLINE_EDGE_MARGIN_MM * 2 >
      innerX
    ) {
      return null
    }

    return {
      sides: ['left', 'right'],
      label: '双侧双层',
      shiftX: 0,
      reserveMm: PHOTO_OUTLINE_DOUBLE_GRIP_RESERVE_MM,
    } satisfies GripResolution
  }

  if (params.gripMode === 'single-sided') {
    if (
      bounds.width +
        PHOTO_OUTLINE_SINGLE_GRIP_RESERVE_MM +
        PHOTO_OUTLINE_EDGE_MARGIN_MM * 2 >
      innerX
    ) {
      return null
    }

    return {
      sides: [params.singleGripSide],
      label: `单侧双层（${params.singleGripSide === 'left' ? '左侧' : '右侧'}）`,
      shiftX:
        params.singleGripSide === 'left'
          ? PHOTO_OUTLINE_SINGLE_GRIP_RESERVE_MM / 2
          : -PHOTO_OUTLINE_SINGLE_GRIP_RESERVE_MM / 2,
      reserveMm: PHOTO_OUTLINE_SINGLE_GRIP_RESERVE_MM,
    } satisfies GripResolution
  }

  if (
    bounds.width +
      PHOTO_OUTLINE_DOUBLE_GRIP_RESERVE_MM +
      PHOTO_OUTLINE_EDGE_MARGIN_MM * 2 <=
    innerX
  ) {
    return {
      sides: ['left', 'right'],
      label: '自动侧选择：双侧双层',
      shiftX: 0,
      reserveMm: PHOTO_OUTLINE_DOUBLE_GRIP_RESERVE_MM,
    } satisfies GripResolution
  }

  if (
    bounds.width +
      PHOTO_OUTLINE_SINGLE_GRIP_RESERVE_MM +
      PHOTO_OUTLINE_EDGE_MARGIN_MM * 2 <=
    innerX
  ) {
    return {
      sides: [preferredSide],
      label: `自动侧选择：单侧双层（${preferredSide === 'left' ? '左侧' : '右侧'}）`,
      shiftX:
        preferredSide === 'left'
          ? PHOTO_OUTLINE_SINGLE_GRIP_RESERVE_MM / 2
          : -PHOTO_OUTLINE_SINGLE_GRIP_RESERVE_MM / 2,
      reserveMm: PHOTO_OUTLINE_SINGLE_GRIP_RESERVE_MM,
      warning: '剩余空间不足，已自动改为单侧双层凹槽。',
    } satisfies GripResolution
  }

  return null
}

function getPreferredSingleSide(points: PhotoPoint[]): PhotoSingleGripSide {
  const centroid = getPolygonCentroid(points)

  if (Math.abs(centroid.x) > 0.25) {
    return centroid.x > 0 ? 'right' : 'left'
  }

  return 'right'
}

function createReadyAnalysis(
  source: PhotoOutlineSource,
  ruler: PhotoOutlineRulerDetection,
  pointsPx: PhotoPoint[],
  detection: PhotoOutlineAnalysis['detection'],
  message: string | null = null,
  options: {
    preservePointOrder?: boolean
  } = {},
): PhotoOutlineAnalysis {
  const contour = createContourSummary(pointsPx, ruler.mmPerPixel, options)

  return {
    status: 'ready',
    message,
    source,
    ruler,
    contour,
    detection,
  }
}

function createContourSummary(
  pointsPx: PhotoPoint[],
  mmPerPixel: number,
  options: {
    preservePointOrder?: boolean
  } = {},
): PhotoOutlineContour {
  const boundsPx = getPointBounds(pointsPx)
  const centerX = (boundsPx.minX + boundsPx.maxX) / 2
  const centerY = (boundsPx.minY + boundsPx.maxY) / 2
  const normalizedPointsMm = pointsPx.map(({ x, y }) => ({
    x: roundNumber((x - centerX) * mmPerPixel, 3),
    y: roundNumber((centerY - y) * mmPerPixel, 3),
  }))
  const pointsMm = options.preservePointOrder
    ? normalizedPointsMm
    : ensureCounterClockwise(normalizedPointsMm)
  const boundsMm = getPointBounds(pointsMm)

  return {
    pointsPx: pointsPx.map((point) => ({ ...point })),
    pointsMm,
    boundsPx,
    boundsMm,
    widthMm: roundNumber(boundsMm.width, 2),
    heightMm: roundNumber(boundsMm.height, 2),
    areaMm2: roundNumber(Math.abs(polygonArea(pointsMm)), 2),
  }
}

function createErrorAnalysis(
  source: RasterSource,
  message: string,
  options: PhotoOutlineAnalysis['detection'],
): PhotoOutlineAnalysis {
  return {
    status: 'error',
    message,
    source: toPhotoSource(source),
    ruler: {
      status: 'missing',
      corner: null,
      confidence: 0,
      mmPerPixel: 0,
      knownWidthMm: PHOTO_OUTLINE_RULER_WIDTH_MM,
      knownHeightMm: PHOTO_OUTLINE_RULER_HEIGHT_MM,
      barThicknessPx: 0,
      boundsPx: null,
    },
    contour: null,
    detection: options,
  }
}

function toPhotoSource(source: RasterSource): PhotoOutlineSource {
  return {
    name: source.name,
    width: source.width,
    height: source.height,
  }
}

function selectRulerCandidate(
  components: ConnectedComponent[],
  width: number,
  height: number,
) {
  const candidates = components
    .map((component) => evaluateRulerCandidate(component, width, height))
    .filter((candidate): candidate is RulerCandidate => candidate !== null)
    .sort((left, right) => right.confidence - left.confidence)

  return candidates[0] ?? null
}

function evaluateRulerCandidate(
  component: ConnectedComponent,
  imageWidth: number,
  imageHeight: number,
) {
  const boundsPx = componentBounds(component)
  const areaRatio = component.area / (imageWidth * imageHeight)
  const fillRatio = component.area / Math.max(boundsPx.width * boundsPx.height, 1)

  if (
    component.area < 140 ||
    boundsPx.width < 14 ||
    boundsPx.height < 14 ||
    areaRatio < 0.0014 ||
    fillRatio < 0.05 ||
    fillRatio > 0.45
  ) {
    return null
  }

  const bandHeight = Math.max(1, Math.floor(boundsPx.height * 0.25))
  const bandWidth = Math.max(1, Math.floor(boundsPx.width * 0.25))
  const topFill = getMaxBandFill(
    component.rowCounts,
    boundsPx.minY,
    boundsPx.minY + bandHeight,
    boundsPx.width,
  )
  const bottomFill = getMaxBandFill(
    component.rowCounts,
    boundsPx.maxY - bandHeight,
    boundsPx.maxY,
    boundsPx.width,
  )
  const leftFill = getMaxBandFill(
    component.colCounts,
    boundsPx.minX,
    boundsPx.minX + bandWidth,
    boundsPx.height,
  )
  const rightFill = getMaxBandFill(
    component.colCounts,
    boundsPx.maxX - bandWidth,
    boundsPx.maxX,
    boundsPx.height,
  )
  const cornerScores = [
    { corner: 'top-left' as const, score: (topFill + leftFill) / 2 },
    { corner: 'top-right' as const, score: (topFill + rightFill) / 2 },
    { corner: 'bottom-left' as const, score: (bottomFill + leftFill) / 2 },
    { corner: 'bottom-right' as const, score: (bottomFill + rightFill) / 2 },
  ]
  const bestCorner = cornerScores.sort((left, right) => right.score - left.score)[0]
  const targetAspect = PHOTO_OUTLINE_RULER_WIDTH_MM / PHOTO_OUTLINE_RULER_HEIGHT_MM
  const aspect = boundsPx.width / boundsPx.height
  const aspectScore = 1 - Math.min(1, Math.abs(aspect - targetAspect) / 1.1)
  const fillScore = 1 - Math.min(1, Math.abs(fillRatio - 0.2) / 0.22)
  const estimatedThickness = clampNumber(
    component.area / (boundsPx.width + boundsPx.height),
    3,
    Math.min(boundsPx.width, boundsPx.height) * 0.45,
  )
  const lShape = getLCornerMetrics(
    component,
    boundsPx,
    bestCorner.corner,
    estimatedThickness,
    imageWidth,
  )
  const widthScale = PHOTO_OUTLINE_RULER_WIDTH_MM / boundsPx.width
  const heightScale = PHOTO_OUTLINE_RULER_HEIGHT_MM / boundsPx.height
  const scaleConsistency =
    1 - Math.abs(widthScale - heightScale) / Math.max(widthScale, heightScale, 0.001)
  const estimatedBarWidthMm = estimatedThickness * ((widthScale + heightScale) / 2)
  const barWidthScore =
    1 - Math.min(1, Math.abs(estimatedBarWidthMm - PHOTO_OUTLINE_RULER_BAR_WIDTH_MM) / 6)
  const extentScore = Math.min(
    1,
    Math.min(boundsPx.width / imageWidth, boundsPx.height / imageHeight) / 0.16,
  )
  const confidence =
    bestCorner.score * 0.34 +
    fillScore * 0.14 +
    extentScore * 0.12 +
    aspectScore * 0.1 +
    lShape.armCoverage * 0.18 +
    Math.min(lShape.horizontalRatio, lShape.verticalRatio) * 0.06 +
    scaleConsistency * 0.04 +
    barWidthScore * 0.02

  if (confidence < 0.42) {
    return null
  }

  if (
    lShape.armCoverage < 0.84 ||
    lShape.horizontalRatio < 0.24 ||
    lShape.verticalRatio < 0.24 ||
    scaleConsistency < 0.55 ||
    estimatedBarWidthMm < 6 ||
    estimatedBarWidthMm > 16
  ) {
    return null
  }

  const mmPerPixel =
    (PHOTO_OUTLINE_RULER_WIDTH_MM / boundsPx.width +
      PHOTO_OUTLINE_RULER_HEIGHT_MM / boundsPx.height) /
    2

  return {
    component,
    boundsPx,
    corner: bestCorner.corner,
    confidence,
    mmPerPixel,
    barThicknessPx: estimatedThickness,
  } satisfies RulerCandidate
}

function getLCornerMetrics(
  component: ConnectedComponent,
  boundsPx: PhotoBounds,
  corner: NonNullable<PhotoOutlineRulerDetection['corner']>,
  thickness: number,
  imageWidth: number,
): LShapeMetrics {
  const pixels = new Set(component.pixels)
  const bandThickness = Math.max(1, Math.round(thickness))
  const horizontalLimit =
    corner.startsWith('top')
      ? boundsPx.minY + bandThickness
      : boundsPx.maxY - bandThickness
  const verticalLimit =
    corner.endsWith('left')
      ? boundsPx.minX + bandThickness
      : boundsPx.maxX - bandThickness
  let armHits = 0
  let armArea = 0
  let horizontalHits = 0
  let horizontalArea = 0
  let verticalHits = 0
  let verticalArea = 0

  for (let y = boundsPx.minY; y < boundsPx.maxY; y += 1) {
    const inHorizontalBand =
      corner.startsWith('top') ? y < horizontalLimit : y >= horizontalLimit

    for (let x = boundsPx.minX; x < boundsPx.maxX; x += 1) {
      const inVerticalBand =
        corner.endsWith('left') ? x < verticalLimit : x >= verticalLimit
      const pixelIndex = y * imageWidth + x
      const filled = pixels.has(pixelIndex)

      if (inHorizontalBand) {
        horizontalArea += 1

        if (filled) {
          horizontalHits += 1
        }
      }

      if (inVerticalBand) {
        verticalArea += 1

        if (filled) {
          verticalHits += 1
        }
      }

      if (inHorizontalBand || inVerticalBand) {
        armArea += 1

        if (filled) {
          armHits += 1
        }
      }
    }
  }

  return {
    armCoverage: armArea > 0 ? armHits / armArea : 0,
    horizontalRatio: horizontalArea > 0 ? horizontalHits / horizontalArea : 0,
    verticalRatio: verticalArea > 0 ? verticalHits / verticalArea : 0,
  }
}

function selectObjectComponent(
  components: ConnectedComponent[],
  rulerBounds: PhotoBounds,
  totalPixels: number,
) {
  return components
    .filter((component) => {
      const bounds = componentBounds(component)
      const overlapArea = intersectionArea(bounds, rulerBounds)
      const componentArea = Math.max(bounds.width * bounds.height, 1)

      return (
        component.area > totalPixels * 0.002 &&
        component.area < totalPixels * 0.7 &&
        overlapArea / componentArea < 0.12
      )
    })
    .sort((left, right) => right.area - left.area)[0]
}

function extractOuterLoop(mask: Uint8Array, width: number, height: number) {
  const edges: Array<{
    start: PhotoPoint
    end: PhotoPoint
    visited: boolean
  }> = []
  const outgoing = new Map<string, number[]>()

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) {
        continue
      }

      if (!isMaskFilled(mask, width, height, x, y - 1)) {
        addEdge(edges, outgoing, { x, y }, { x: x + 1, y })
      }

      if (!isMaskFilled(mask, width, height, x + 1, y)) {
        addEdge(edges, outgoing, { x: x + 1, y }, { x: x + 1, y: y + 1 })
      }

      if (!isMaskFilled(mask, width, height, x, y + 1)) {
        addEdge(edges, outgoing, { x: x + 1, y: y + 1 }, { x, y: y + 1 })
      }

      if (!isMaskFilled(mask, width, height, x - 1, y)) {
        addEdge(edges, outgoing, { x, y: y + 1 }, { x, y })
      }
    }
  }

  const loops: PhotoPoint[][] = []

  for (let index = 0; index < edges.length; index += 1) {
    if (edges[index].visited) {
      continue
    }

    const loop: PhotoPoint[] = []
    let currentIndex = index

    while (!edges[currentIndex].visited) {
      const current = edges[currentIndex]
      current.visited = true
      loop.push({ ...current.start })

      const nextEdges = outgoing.get(pointKey(current.end)) ?? []
      const nextIndex = nextEdges.find((candidate) => !edges[candidate].visited)

      if (nextIndex === undefined) {
        break
      }

      currentIndex = nextIndex
    }

    if (loop.length >= 4) {
      loops.push(loop)
    }
  }

  if (loops.length === 0) {
    return null
  }

  return loops.sort((left, right) => Math.abs(polygonArea(right)) - Math.abs(polygonArea(left)))[0]
}

function simplifyClosedLoop(points: PhotoPoint[], tolerance: number) {
  let simplified = removeCollinearPoints(normalizeClosedPoints(points))

  if (simplified.length > PHOTO_OUTLINE_MAX_KEYPOINTS) {
    const open = [...simplified, simplified[0]]
    simplified = removeCollinearPoints(rdp(open, tolerance).slice(0, -1))
  }

  if (simplified.length > PHOTO_OUTLINE_MAX_KEYPOINTS) {
    const step = Math.ceil(simplified.length / PHOTO_OUTLINE_MAX_KEYPOINTS)
    simplified = simplified.filter((_point, index) => index % step === 0)
  }

  if (simplified.length < 4) {
    return normalizeClosedPoints(points).slice(0, 4)
  }

  return simplified
}

function normalizeClosedPoints(points: PhotoPoint[]) {
  const cleaned = removeDuplicateSequentialPoints(points)
  const center = cleaned.reduce(
    (sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }),
    { x: 0, y: 0 },
  )
  const centroid = {
    x: center.x / cleaned.length,
    y: center.y / cleaned.length,
  }
  let startIndex = 0
  let bestDistance = -1

  for (let index = 0; index < cleaned.length; index += 1) {
    const point = cleaned[index]
    const distance = (point.x - centroid.x) ** 2 + (point.y - centroid.y) ** 2

    if (distance > bestDistance) {
      bestDistance = distance
      startIndex = index
    }
  }

  return cleaned.slice(startIndex).concat(cleaned.slice(0, startIndex))
}

function removeDuplicateSequentialPoints(points: PhotoPoint[]) {
  return points.filter((point, index) => {
    const previous = index === 0 ? points.at(-1) : points[index - 1]

    return !previous || previous.x !== point.x || previous.y !== point.y
  })
}

function removeCollinearPoints(points: PhotoPoint[]) {
  return points.filter((point, index) => {
    const previous = points[(index - 1 + points.length) % points.length]
    const next = points[(index + 1) % points.length]

    return Math.abs(cross(previous, point, next)) > 0.01
  })
}

function rdp(points: PhotoPoint[], epsilon: number): PhotoPoint[] {
  if (points.length <= 2) {
    return points
  }

  let farthestIndex = 0
  let farthestDistance = 0

  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = perpendicularDistance(points[index], points[0], points.at(-1)!)

    if (distance > farthestDistance) {
      farthestDistance = distance
      farthestIndex = index
    }
  }

  if (farthestDistance <= epsilon) {
    return [points[0], points.at(-1)!]
  }

  const left = rdp(points.slice(0, farthestIndex + 1), epsilon)
  const right = rdp(points.slice(farthestIndex), epsilon)

  return left.slice(0, -1).concat(right)
}

function perpendicularDistance(point: PhotoPoint, start: PhotoPoint, end: PhotoPoint) {
  const dx = end.x - start.x
  const dy = end.y - start.y

  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y)
  }

  const numerator = Math.abs(
    dy * point.x - dx * point.y + end.x * start.y - end.y * start.x,
  )

  return numerator / Math.hypot(dx, dy)
}

function ensureCounterClockwise(points: PhotoPoint[]) {
  return polygonArea(points) >= 0 ? points : [...points].reverse()
}

function rotatePoints(points: PhotoPoint[], orientation: 0 | 90) {
  if (orientation === 0) {
    return points.map((point) => ({ ...point }))
  }

  return points.map(({ x, y }) => ({
    x: -y,
    y: x,
  }))
}

function translatePoints(points: PhotoPoint[], offsetX: number, offsetY: number) {
  return points.map((point) => ({
    x: roundNumber(point.x + offsetX, 3),
    y: roundNumber(point.y + offsetY, 3),
  }))
}

function getPointBounds(points: PhotoPoint[]): PhotoBounds {
  const minX = Math.min(...points.map((point) => point.x))
  const minY = Math.min(...points.map((point) => point.y))
  const maxX = Math.max(...points.map((point) => point.x))
  const maxY = Math.max(...points.map((point) => point.y))

  return makeBounds(minX, minY, maxX, maxY)
}

function polygonArea(points: PhotoPoint[]) {
  let area = 0

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    area += current.x * next.y - next.x * current.y
  }

  return area / 2
}

function getPolygonCentroid(points: PhotoPoint[]) {
  const signedArea = polygonArea(points)

  if (Math.abs(signedArea) < 0.0001) {
    const average = points.reduce(
      (sum, point) => ({
        x: sum.x + point.x,
        y: sum.y + point.y,
      }),
      { x: 0, y: 0 },
    )

    return {
      x: average.x / points.length,
      y: average.y / points.length,
    }
  }

  let centroidX = 0
  let centroidY = 0

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    const crossValue = current.x * next.y - next.x * current.y
    centroidX += (current.x + next.x) * crossValue
    centroidY += (current.y + next.y) * crossValue
  }

  const factor = 1 / (6 * signedArea)

  return {
    x: centroidX * factor,
    y: centroidY * factor,
  }
}

function cross(previous: PhotoPoint, current: PhotoPoint, next: PhotoPoint) {
  return (
    (current.x - previous.x) * (next.y - current.y) -
    (current.y - previous.y) * (next.x - current.x)
  )
}

function addEdge(
  edges: Array<{
    start: PhotoPoint
    end: PhotoPoint
    visited: boolean
  }>,
  outgoing: Map<string, number[]>,
  start: PhotoPoint,
  end: PhotoPoint,
) {
  const edgeIndex = edges.push({ start, end, visited: false }) - 1
  const key = pointKey(start)
  const bucket = outgoing.get(key)

  if (bucket) {
    bucket.push(edgeIndex)
    return
  }

  outgoing.set(key, [edgeIndex])
}

function pointKey(point: PhotoPoint) {
  return `${point.x},${point.y}`
}

function isMaskFilled(mask: Uint8Array, width: number, height: number, x: number, y: number) {
  if (x < 0 || y < 0 || x >= width || y >= height) {
    return false
  }

  return mask[y * width + x] === 1
}

function getConnectedComponents(mask: Uint8Array, width: number, height: number) {
  const visited = new Uint8Array(mask.length)
  const components: ConnectedComponent[] = []
  const queue = new Int32Array(mask.length)

  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index] || visited[index]) {
      continue
    }

    let queueStart = 0
    let queueEnd = 0
    queue[queueEnd] = index
    queueEnd += 1
    visited[index] = 1
    const pixels: number[] = []
    let minX = width
    let minY = height
    let maxX = 0
    let maxY = 0
    const rowCounts = new Map<number, number>()
    const colCounts = new Map<number, number>()

    while (queueStart < queueEnd) {
      const current = queue[queueStart]
      queueStart += 1
      const x = current % width
      const y = Math.floor(current / width)
      pixels.push(current)
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
      rowCounts.set(y, (rowCounts.get(y) ?? 0) + 1)
      colCounts.set(x, (colCounts.get(x) ?? 0) + 1)

      for (const neighbor of getNeighborIndexes(current, x, y, width, height)) {
        if (!mask[neighbor] || visited[neighbor]) {
          continue
        }

        visited[neighbor] = 1
        queue[queueEnd] = neighbor
        queueEnd += 1
      }
    }

    components.push({
      pixels,
      area: pixels.length,
      minX,
      minY,
      maxX,
      maxY,
      rowCounts,
      colCounts,
    })
  }

  return components
}

function getNeighborIndexes(
  index: number,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const neighbors: number[] = []

  if (x > 0) {
    neighbors.push(index - 1)
  }

  if (x < width - 1) {
    neighbors.push(index + 1)
  }

  if (y > 0) {
    neighbors.push(index - width)
  }

  if (y < height - 1) {
    neighbors.push(index + width)
  }

  return neighbors
}

function componentBounds(component: ConnectedComponent) {
  return makeBounds(
    component.minX,
    component.minY,
    component.maxX + 1,
    component.maxY + 1,
  )
}

function getMaxBandFill(
  counts: Map<number, number>,
  start: number,
  end: number,
  totalSpan: number,
) {
  let best = 0

  for (const [position, count] of counts.entries()) {
    if (position < start || position > end) {
      continue
    }

    best = Math.max(best, count / totalSpan)
  }

  return best
}

function clampNumber(value: number, min: number, max: number) {
  const upper = Math.max(min, max)

  return Math.min(upper, Math.max(min, value))
}

function intersectionArea(left: PhotoBounds, right: PhotoBounds) {
  const width = Math.max(0, Math.min(left.maxX, right.maxX) - Math.max(left.minX, right.minX))
  const height = Math.max(0, Math.min(left.maxY, right.maxY) - Math.max(left.minY, right.minY))

  return width * height
}

function clearMaskBorder(mask: Uint8Array, width: number, height: number) {
  for (let x = 0; x < width; x += 1) {
    mask[x] = 0
    mask[(height - 1) * width + x] = 0
  }

  for (let y = 0; y < height; y += 1) {
    mask[y * width] = 0
    mask[y * width + (width - 1)] = 0
  }
}

function createMask(
  width: number,
  height: number,
  predicate: (index: number) => boolean,
) {
  const mask = new Uint8Array(width * height)

  for (let index = 0; index < width * height; index += 1) {
    mask[index] = predicate(index) ? 1 : 0
  }

  return mask
}

function estimateBackgroundColor(data: Uint8ClampedArray, width: number, height: number) {
  const samplesR: number[] = []
  const samplesG: number[] = []
  const samplesB: number[] = []
  const stride = Math.max(1, Math.floor(Math.max(width, height) / 100))

  const sample = (x: number, y: number) => {
    const offset = (y * width + x) * 4
    samplesR.push(data[offset])
    samplesG.push(data[offset + 1])
    samplesB.push(data[offset + 2])
  }

  for (let x = 0; x < width; x += stride) {
    sample(x, 0)
    sample(x, height - 1)
  }

  for (let y = 0; y < height; y += stride) {
    sample(0, y)
    sample(width - 1, y)
  }

  return [
    median(samplesR),
    median(samplesG),
    median(samplesB),
  ] as const
}

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)

  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

function luminance(r: number, g: number, b: number) {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

function colorDistance(
  [r1, g1, b1]: readonly [number, number, number],
  [r2, g2, b2]: readonly [number, number, number],
) {
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2)
}

function makeBounds(minX: number, minY: number, maxX: number, maxY: number): PhotoBounds {
  return {
    minX: roundNumber(minX, 3),
    minY: roundNumber(minY, 3),
    maxX: roundNumber(maxX, 3),
    maxY: roundNumber(maxY, 3),
    width: roundNumber(maxX - minX, 3),
    height: roundNumber(maxY - minY, 3),
  }
}

function roundNumber(value: number, digits = 2) {
  return Number(value.toFixed(digits))
}
