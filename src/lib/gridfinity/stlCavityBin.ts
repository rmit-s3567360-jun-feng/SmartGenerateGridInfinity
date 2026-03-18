import { booleans, measurements, transforms } from '@jscad/modeling'
import type Geom3 from '@jscad/modeling/src/geometries/geom3/type'

import { createBaseBinSolid, createPocketBetween } from './base'
import {
  getBinMetrics,
  gridUnitsToMillimeters,
  heightUnitsToMillimeters,
} from './spec'
import type {
  GridfinitySpec,
  ImportedStlSourceSummary,
  QuarterTurn,
  StlCavityBinParams,
  StlCavityBinPlan,
  TemplateBuildContext,
  TemplateBuildOutput,
} from './types'

const { subtract, union } = booleans
const { measureBoundingBox } = measurements
const { rotateX, rotateY, rotateZ, scale, translate } = transforms

const STL_CAVITY_EDGE_MARGIN_MM = 4
const STL_BOOLEAN_OVERLAP_MM = 0.02

export const stlCavityBinDefaultParams: StlCavityBinParams = {
  source: null,
  sizeMode: 'auto',
  gridX: 2,
  gridY: 2,
  heightUnits: 4,
  rotationX: 0,
  rotationY: 0,
  rotationZ: 0,
  wallThickness: 2,
  floorThickness: 2.4,
  xyClearance: 0.8,
  zClearance: 1.4,
  magnetHoles: true,
}

export function resolveStlCavityBinPlan(
  params: StlCavityBinParams,
  spec: GridfinitySpec,
): StlCavityBinPlan {
  if (!params.source) {
    throw new Error('请先上传 STL 模型。')
  }

  const rotatedSizeMm = rotateSizeByQuarterTurns(
    params.source.originalSizeMm,
    params.rotationX,
    params.rotationY,
    params.rotationZ,
  )

  if (rotatedSizeMm.some((value) => value <= 0 || !Number.isFinite(value))) {
    throw new Error('导入 STL 的包围盒尺寸无效。')
  }

  const cavitySizeMm: [number, number, number] = [
    roundMm(rotatedSizeMm[0] + params.xyClearance * 2),
    roundMm(rotatedSizeMm[1] + params.xyClearance * 2),
    roundMm(rotatedSizeMm[2]),
  ]
  const cavityBottomZ = roundMm(spec.footHeight + params.floorThickness)
  const minimumTotalHeightMm = roundMm(
    cavityBottomZ + cavitySizeMm[2] + params.zClearance,
  )
  const requiredWidth = cavitySizeMm[0] + STL_CAVITY_EDGE_MARGIN_MM * 2
  const requiredDepth = cavitySizeMm[1] + STL_CAVITY_EDGE_MARGIN_MM * 2
  const warnings: string[] = []
  const size =
    params.sizeMode === 'auto'
      ? resolveAutoSize(requiredWidth, requiredDepth, minimumTotalHeightMm, params, spec)
      : resolveLockedSize(params, requiredWidth, requiredDepth, minimumTotalHeightMm, spec)
  const totalHeightMm = heightUnitsToMillimeters(size.heightUnits, spec)
  const topClearanceMm = roundMm(totalHeightMm - cavityBottomZ - cavitySizeMm[2])

  if (topClearanceMm < params.zClearance - 0.001) {
    throw new Error('当前高度不足以容纳 STL 型腔和顶部余量。')
  }

  if (topClearanceMm > params.zClearance + 0.01) {
    warnings.push('已自动增加顶部余量，以对齐 Gridfinity 标准高度单位。')
  }

  return {
    size,
    rotatedSizeMm,
    cavitySizeMm,
    cavityBottomZ,
    cavityTopZ: roundMm(totalHeightMm + 1.2),
    topClearanceMm,
    resolvedParams: {
      gridX: size.gridX,
      gridY: size.gridY,
      heightUnits: size.heightUnits,
      wallThickness: params.wallThickness,
      floorThickness: params.floorThickness,
      magnetHoles: params.magnetHoles,
      labelLip: false,
    },
    isAutoSized: params.sizeMode === 'auto',
    warnings,
  }
}

export function buildStlCavityBin(
  params: StlCavityBinParams,
  spec: GridfinitySpec,
  context: TemplateBuildContext,
): TemplateBuildOutput {
  const plan = resolveStlCavityBinPlan(params, spec)

  if (!params.source) {
    throw new Error('请先上传 STL 模型。')
  }

  const asset = context.getImportedAsset(params.source.assetId)

  if (!asset) {
    throw new Error('导入模型缓存已失效，请重新上传 STL。')
  }

  const solid = createBaseBinSolid(plan.resolvedParams, spec)
  const metrics = getBinMetrics(plan.resolvedParams, spec)

  try {
    const objectCavity = createCavityGeometry(
      asset.geometry,
      params.source,
      params,
      plan,
    )
    const entryBottomZ = Math.max(
      plan.cavityBottomZ + plan.cavitySizeMm[2] - STL_BOOLEAN_OVERLAP_MM,
      plan.cavityBottomZ,
    )
    const entryPocket = createPocketBetween(
      plan.cavitySizeMm[0],
      plan.cavitySizeMm[1],
      entryBottomZ,
      plan.cavityTopZ,
      0,
      0,
      metrics.innerRadius,
      metrics.segments,
    )

    return {
      geometry: subtract(solid, union(objectCavity, entryPocket) as Geom3),
      warnings: plan.warnings,
    }
  } catch {
    throw new Error('无法根据当前 STL 生成稳定型腔，请调整朝向或清隙后重试。')
  }
}

function resolveAutoSize(
  requiredWidth: number,
  requiredDepth: number,
  minimumTotalHeightMm: number,
  params: Pick<
    StlCavityBinParams,
    'wallThickness' | 'floorThickness'
  >,
  spec: GridfinitySpec,
) {
  const candidates: Array<{
    gridX: number
    gridY: number
    heightUnits: number
    area: number
    volume: number
  }> = []

  for (let gridX = 1; gridX <= 8; gridX += 1) {
    for (let gridY = 1; gridY <= 8; gridY += 1) {
      const outerX = gridUnitsToMillimeters(gridX, spec)
      const outerY = gridUnitsToMillimeters(gridY, spec)
      const innerX = outerX - params.wallThickness * 2
      const innerY = outerY - params.wallThickness * 2

      if (innerX < requiredWidth || innerY < requiredDepth) {
        continue
      }

      for (let heightUnits = 2; heightUnits <= 24; heightUnits += 1) {
        const heightMm = heightUnitsToMillimeters(heightUnits, spec)

        if (heightMm < minimumTotalHeightMm - 0.001) {
          continue
        }

        candidates.push({
          gridX,
          gridY,
          heightUnits,
          area: outerX * outerY,
          volume: outerX * outerY * heightMm,
        })
      }
    }
  }

  if (candidates.length === 0) {
    throw new Error('当前 STL 尺寸或清隙超出首版 8x8x24 搜索范围。')
  }

  candidates.sort((left, right) =>
    left.volume - right.volume ||
    left.area - right.area ||
    left.heightUnits - right.heightUnits,
  )

  return {
    gridX: candidates[0].gridX,
    gridY: candidates[0].gridY,
    heightUnits: candidates[0].heightUnits,
  }
}

function resolveLockedSize(
  params: Pick<
    StlCavityBinParams,
    'gridX' | 'gridY' | 'heightUnits' | 'wallThickness'
  >,
  requiredWidth: number,
  requiredDepth: number,
  minimumTotalHeightMm: number,
  spec: GridfinitySpec,
) {
  const outerX = gridUnitsToMillimeters(params.gridX, spec)
  const outerY = gridUnitsToMillimeters(params.gridY, spec)
  const innerX = outerX - params.wallThickness * 2
  const innerY = outerY - params.wallThickness * 2
  const totalHeightMm = heightUnitsToMillimeters(params.heightUnits, spec)

  if (innerX < requiredWidth || innerY < requiredDepth) {
    throw new Error('固定外部尺寸不足以容纳当前 STL 型腔。')
  }

  if (totalHeightMm < minimumTotalHeightMm - 0.001) {
    throw new Error('固定高度不足以容纳 STL 型腔和顶部余量。')
  }

  return {
    gridX: params.gridX,
    gridY: params.gridY,
    heightUnits: params.heightUnits,
  }
}

function createCavityGeometry(
  geometry: Geom3,
  source: ImportedStlSourceSummary,
  params: Pick<
    StlCavityBinParams,
    'rotationX' | 'rotationY' | 'rotationZ'
  >,
  plan: StlCavityBinPlan,
) {
  const normalized = normalizeRotatedGeometry(geometry, source, params)
  const [[minX, minY], [maxX, maxY]] = measureBoundingBox(normalized) as [
    [number, number, number],
    [number, number, number],
  ]
  const width = maxX - minX
  const depth = maxY - minY

  if (width <= 0 || depth <= 0) {
    throw new Error('导入 STL 的包围盒尺寸无效。')
  }

  const clearanced = scale(
    [plan.cavitySizeMm[0] / width, plan.cavitySizeMm[1] / depth, 1],
    normalized,
  ) as Geom3

  return translate([0, 0, plan.cavityBottomZ], clearanced)
}

function normalizeRotatedGeometry(
  geometry: Geom3,
  source: ImportedStlSourceSummary,
  params: Pick<
    StlCavityBinParams,
    'rotationX' | 'rotationY' | 'rotationZ'
  >,
) {
  const centered = translate(
    [
      -(source.originalBounds.min[0] + source.originalBounds.max[0]) / 2,
      -(source.originalBounds.min[1] + source.originalBounds.max[1]) / 2,
      -(source.originalBounds.min[2] + source.originalBounds.max[2]) / 2,
    ],
    geometry,
  ) as Geom3
  const rotated = rotateImportedGeometry(centered, params)
  const [[rotatedMinX, rotatedMinY, rotatedMinZ], [rotatedMaxX, rotatedMaxY]] =
    measureBoundingBox(rotated) as [
      [number, number, number],
      [number, number, number],
    ]

  return translate(
    [
      -(rotatedMinX + rotatedMaxX) / 2,
      -(rotatedMinY + rotatedMaxY) / 2,
      -rotatedMinZ,
    ],
    rotated,
  ) as Geom3
}

function rotateImportedGeometry(
  geometry: Geom3,
  params: Pick<StlCavityBinParams, 'rotationX' | 'rotationY' | 'rotationZ'>,
) {
  let result = geometry

  if (params.rotationX !== 0) {
    result = rotateX((Math.PI / 2) * params.rotationX, result) as Geom3
  }

  if (params.rotationY !== 0) {
    result = rotateY((Math.PI / 2) * params.rotationY, result) as Geom3
  }

  if (params.rotationZ !== 0) {
    result = rotateZ((Math.PI / 2) * params.rotationZ, result) as Geom3
  }

  return result
}

function rotateSizeByQuarterTurns(
  size: readonly [number, number, number],
  rotationXTurns: QuarterTurn,
  rotationYTurns: QuarterTurn,
  rotationZTurns: QuarterTurn,
): [number, number, number] {
  const halfX = size[0] / 2
  const halfY = size[1] / 2
  const halfZ = size[2] / 2
  const corners: Array<[number, number, number]> = [
    [-halfX, -halfY, -halfZ],
    [halfX, -halfY, -halfZ],
    [-halfX, halfY, -halfZ],
    [halfX, halfY, -halfZ],
    [-halfX, -halfY, halfZ],
    [halfX, -halfY, halfZ],
    [-halfX, halfY, halfZ],
    [halfX, halfY, halfZ],
  ]
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]

  for (const corner of corners) {
    const [x, y, z] = rotatePointByQuarterTurns(
      corner,
      rotationXTurns,
      rotationYTurns,
      rotationZTurns,
    )
    min[0] = Math.min(min[0], x)
    min[1] = Math.min(min[1], y)
    min[2] = Math.min(min[2], z)
    max[0] = Math.max(max[0], x)
    max[1] = Math.max(max[1], y)
    max[2] = Math.max(max[2], z)
  }

  return [
    roundMm(max[0] - min[0]),
    roundMm(max[1] - min[1]),
    roundMm(max[2] - min[2]),
  ]
}

function rotatePointByQuarterTurns(
  point: [number, number, number],
  rotationXTurns: QuarterTurn,
  rotationYTurns: QuarterTurn,
  rotationZTurns: QuarterTurn,
) {
  let next = point

  next = rotatePoint(next, 'x', rotationXTurns)
  next = rotatePoint(next, 'y', rotationYTurns)
  next = rotatePoint(next, 'z', rotationZTurns)

  return next
}

function rotatePoint(
  point: [number, number, number],
  axis: 'x' | 'y' | 'z',
  turns: QuarterTurn,
): [number, number, number] {
  let [x, y, z] = point

  for (let index = 0; index < turns; index += 1) {
    if (axis === 'x') {
      const nextY = -z
      const nextZ = y

      y = nextY
      z = nextZ
      continue
    }

    if (axis === 'y') {
      const nextX = z
      const nextZ = -x

      x = nextX
      z = nextZ
      continue
    }

    const nextX = -y
    const nextY = x

    x = nextX
    y = nextY
  }

  return [x, y, z]
}

function roundMm(value: number) {
  return Number(value.toFixed(3))
}
