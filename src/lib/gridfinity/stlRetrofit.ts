import { createGridfinityStackableBlock } from './base'
import { gridUnitsToMillimeters, heightUnitsToMillimeters } from './spec'
import type {
  GridfinitySpec,
  QuarterTurn,
  StlRetrofitParams,
  StlRetrofitPlan,
  TemplateBuildContext,
  TemplateBuildOutput,
} from './types'

export const stlRetrofitDefaultParams: StlRetrofitParams = {
  source: null,
  sizeMode: 'auto',
  gridX: 2,
  gridY: 2,
  heightUnits: 4,
  rotationX: 0,
  rotationY: 0,
  rotationZ: 0,
  cutDepth: 3,
  footprintMargin: 1,
  minAdapterThickness: 2,
  magnetHoles: false,
  stackingLip: false,
}

export function resolveStlRetrofitPlan(
  params: StlRetrofitParams,
  spec: GridfinitySpec,
): StlRetrofitPlan {
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

  if (params.cutDepth <= 0) {
    throw new Error('切除深度必须大于 0。')
  }

  if (params.cutDepth >= rotatedSizeMm[2]) {
    throw new Error('切除深度必须小于当前模型高度。')
  }

  const preservedBodyHeightMm = roundMm(rotatedSizeMm[2] - params.cutDepth)
  const minimumBaseHeightMm = roundMm(
    Math.max(params.cutDepth, spec.footHeight + params.minAdapterThickness),
  )
  const minimumTotalHeightMm = preservedBodyHeightMm + minimumBaseHeightMm
  const requiredWidth = rotatedSizeMm[0] + params.footprintMargin * 2
  const requiredDepth = rotatedSizeMm[1] + params.footprintMargin * 2
  const warnings: string[] = []
  const size =
    params.sizeMode === 'auto'
      ? resolveAutoSize(requiredWidth, requiredDepth, minimumTotalHeightMm, spec)
      : resolveLockedSize(params, requiredWidth, requiredDepth, minimumTotalHeightMm, spec)
  const totalHeightMm = heightUnitsToMillimeters(size.heightUnits, spec)
  const baseHeightMm = roundMm(totalHeightMm - preservedBodyHeightMm)

  if (baseHeightMm < minimumBaseHeightMm - 0.001) {
    throw new Error('当前高度不足以容纳切除后的模型和适配底座。')
  }

  if (baseHeightMm > minimumBaseHeightMm + 0.01) {
    warnings.push('已自动补高底座，以对齐 Gridfinity 标准高度单位。')
  }

  return {
    size,
    rotatedSizeMm,
    preservedBodyHeightMm,
    baseHeightMm,
    totalHeightMm,
    isAutoSized: params.sizeMode === 'auto',
    warnings,
  }
}

export function buildStlRetrofit(
  params: StlRetrofitParams,
  spec: GridfinitySpec,
  context: TemplateBuildContext,
): TemplateBuildOutput {
  const plan = resolveStlRetrofitPlan(params, spec)

  if (!params.source) {
    throw new Error('请先上传 STL 模型。')
  }

  const asset = context.getImportedAsset(params.source.assetId)

  if (!asset) {
    throw new Error('导入模型缓存已失效，请重新上传 STL。')
  }

  // STL is only used to compute the fitted Gridfinity envelope for V1.
  void asset.geometry

  const warnings = [
    ...plan.warnings,
    '已将模型整体规整为标准矩形 Gridfinity 实体。',
  ]

  if (params.stackingLip) {
    warnings.push('顶部已追加标准 Gridfinity 堆叠口。')
  } else {
    warnings.push('顶部已保持标准平顶，避免出现上下都为 Gridfinity 结构。')
  }

  return {
    geometry: createGridfinityStackableBlock(
      plan.size.gridX,
      plan.size.gridY,
      plan.totalHeightMm,
      params.magnetHoles,
      params.stackingLip,
      spec,
    ),
    warnings,
  }
}

function resolveAutoSize(
  requiredWidth: number,
  requiredDepth: number,
  minimumTotalHeightMm: number,
  spec: GridfinitySpec,
) {
  const heightUnits = Math.max(2, Math.ceil(minimumTotalHeightMm / spec.heightUnit))

  if (heightUnits > 24) {
    throw new Error('当前 STL 高度超出首版 24U 搜索范围。')
  }

  const candidates: Array<{
    gridX: number
    gridY: number
    heightUnits: number
    area: number
    width: number
    depth: number
  }> = []

  for (let gridX = 1; gridX <= 8; gridX += 1) {
    for (let gridY = 1; gridY <= 8; gridY += 1) {
      const width = gridUnitsToMillimeters(gridX, spec)
      const depth = gridUnitsToMillimeters(gridY, spec)

      if (width < requiredWidth || depth < requiredDepth) {
        continue
      }

      candidates.push({
        gridX,
        gridY,
        heightUnits,
        area: width * depth,
        width,
        depth,
      })
    }
  }

  if (candidates.length === 0) {
    throw new Error('当前 STL 的 XY 尺寸超出首版 8x8 搜索范围。')
  }

  candidates.sort((left, right) =>
    left.area - right.area ||
    left.width - right.width ||
    left.depth - right.depth,
  )

  const best = candidates[0]

  return {
    gridX: best.gridX,
    gridY: best.gridY,
    heightUnits: best.heightUnits,
  }
}

function resolveLockedSize(
  params: StlRetrofitParams,
  requiredWidth: number,
  requiredDepth: number,
  minimumTotalHeightMm: number,
  spec: GridfinitySpec,
) {
  const width = gridUnitsToMillimeters(params.gridX, spec)
  const depth = gridUnitsToMillimeters(params.gridY, spec)
  const totalHeightMm = heightUnitsToMillimeters(params.heightUnits, spec)

  if (width < requiredWidth || depth < requiredDepth) {
    throw new Error('固定外部尺寸不足以容纳当前 STL。')
  }

  if (totalHeightMm < minimumTotalHeightMm - 0.001) {
    throw new Error('固定高度不足以容纳切除后的模型和适配底座。')
  }

  return {
    gridX: params.gridX,
    gridY: params.gridY,
    heightUnits: params.heightUnits,
  }
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
      ;[x, y, z] = [x, -z, y]
      continue
    }

    if (axis === 'y') {
      ;[x, y, z] = [z, y, -x]
      continue
    }

    ;[x, y, z] = [-y, x, z]
  }

  return [x, y, z]
}

function roundMm(value: number) {
  return Number(value.toFixed(3))
}
