import { booleans, primitives } from '@jscad/modeling'
import { z } from 'zod'

import {
  createBaseBinSolid,
  createPocketBetween,
} from './base'
import {
  getMemoryCardModeDefaults,
  resolveMemoryCardPlan,
} from './memoryCard'
import {
  buildPhotoOutlineBin,
  photoOutlineDefaultParams,
} from './photoOutline'
import { defaultGridfinitySpec, getBinMetrics } from './spec'
import {
  buildStlCavityBin,
  stlCavityBinDefaultParams,
} from './stlCavityBin'
import {
  buildStlRetrofit,
  stlRetrofitDefaultParams,
} from './stlRetrofit'
import type {
  AnyTemplateDefinition,
  GenericBinParams,
  GridfinitySpec,
  MemoryCardTrayParams,
  ParameterValues,
  ParameterField,
  TemplateId,
  TemplateBuildOutput,
  TemplateBuildContext,
} from './types'

const { subtract, union } = booleans
const { cuboid } = primitives

const baseSchema = z.object({
  gridX: z.coerce.number().int().min(1).max(4),
  gridY: z.coerce.number().int().min(1).max(4),
  heightUnits: z.coerce.number().int().min(2).max(12),
  wallThickness: z.coerce.number().min(1.2).max(3.6),
  floorThickness: z.coerce.number().min(1.2).max(5),
  magnetHoles: z.boolean(),
  labelLip: z.boolean(),
})

const numberField = <T extends ParameterValues>(
  key: keyof T & string,
  label: string,
  description: string,
  min: number,
  max: number,
  step: number,
  extra: Partial<ParameterField<T>> = {},
): ParameterField<T> => ({
  key,
  label,
  description,
  kind: 'number',
  min,
  max,
  step,
  ...extra,
})

const booleanField = <T extends ParameterValues>(
  key: keyof T & string,
  label: string,
  description: string,
  extra: Partial<ParameterField<T>> = {},
): ParameterField<T> => ({
  key,
  label,
  description,
  kind: 'boolean',
  ...extra,
})

const genericBinSchema = baseSchema.extend({
  compartmentsX: z.coerce.number().int().min(1).max(4),
  compartmentsY: z.coerce.number().int().min(1).max(4),
  innerWallThicknessX: z.coerce.number().min(2).max(84),
  innerWallThicknessY: z.coerce.number().min(2).max(84),
  innerWallThicknessZ: z.coerce.number().min(2).max(84),
  dividerThickness: z.coerce.number().min(1.2).max(12),
  dividerHeight: z.coerce.number().min(2).max(84),
  dividerX1: z.coerce.number().min(2).max(120),
  dividerX2: z.coerce.number().min(2).max(120),
  dividerX3: z.coerce.number().min(2).max(120),
  dividerY1: z.coerce.number().min(2).max(120),
  dividerY2: z.coerce.number().min(2).max(120),
  dividerY3: z.coerce.number().min(2).max(120),
}).superRefine((value, context) => {
  validateDividerOrder(
    [value.dividerX1, value.dividerX2, value.dividerX3],
    value.compartmentsX,
    'dividerX1',
    'X',
    context,
  )
  validateDividerOrder(
    [value.dividerY1, value.dividerY2, value.dividerY3],
    value.compartmentsY,
    'dividerY1',
    'Y',
    context,
  )
})

const memoryCardTraySchema = baseSchema.extend({
  mode: z.enum(['micro-sd-compact', 'sd-compact', 'mixed']),
  quantity: z.coerce.number().int().min(1).max(48),
  sdCount: z.coerce.number().int().min(0).max(24),
  microSdCount: z.coerce.number().int().min(0).max(48),
  enableGripCutout: z.boolean(),
  enableLabelArea: z.boolean(),
  lockOuterSize: z.boolean(),
  slotTolerance: z.coerce.number().min(0.25).max(1),
  minGripMargin: z.coerce.number().min(1).max(4),
}).superRefine((value, context) => {
  if (value.mode === 'mixed' && value.sdCount + value.microSdCount < 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: '混合模式至少需要一张 SD 或一张 microSD。',
      path: ['sdCount'],
    })
  }
})

const photoPointSchema = z.object({
  x: z.number(),
  y: z.number(),
})

const photoBoundsSchema = z.object({
  minX: z.number(),
  minY: z.number(),
  maxX: z.number(),
  maxY: z.number(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
})

const photoOutlineAnalysisSchema = z.object({
  status: z.enum(['ready', 'error']),
  message: z.string().nullable(),
  source: z.object({
    name: z.string(),
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  ruler: z.object({
    status: z.enum(['detected', 'missing']),
    corner: z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right']).nullable(),
    confidence: z.number().min(0).max(1),
    mmPerPixel: z.number().min(0),
    knownWidthMm: z.number().positive(),
    knownHeightMm: z.number().positive(),
    barThicknessPx: z.number().min(0),
    boundsPx: photoBoundsSchema.nullable(),
  }),
  contour: z.object({
    pointsPx: z.array(photoPointSchema).min(4),
    pointsMm: z.array(photoPointSchema).min(4),
    boundsPx: photoBoundsSchema,
    boundsMm: photoBoundsSchema,
    widthMm: z.number().positive(),
    heightMm: z.number().positive(),
    areaMm2: z.number().positive(),
  }).nullable(),
  detection: z.object({
    foregroundThreshold: z.number().min(10).max(180),
    simplifyTolerance: z.number().min(0.5).max(18),
    contourMode: z.enum(['detail', 'smooth', 'rounded']),
  }),
})

const photoOutlineBinSchema = baseSchema.extend({
  objectHeight: z.coerce.number().min(0.5).max(84),
  cavityClearance: z.coerce.number().min(0.3).max(4),
  depthClearance: z.coerce.number().min(0).max(8),
  foregroundThreshold: z.coerce.number().min(10).max(180),
  simplifyTolerance: z.coerce.number().min(0.5).max(18),
  contourMode: z.enum(['detail', 'smooth', 'rounded']),
  analysis: photoOutlineAnalysisSchema.nullable(),
}).superRefine((value, context) => {
  if (!value.analysis) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: '请先上传图片并完成轮廓识别。',
      path: ['analysis'],
    })
    return
  }

  if (value.analysis.status !== 'ready' || !value.analysis.contour) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: value.analysis.message ?? '请先修正标尺或轮廓识别结果。',
      path: ['analysis'],
    })
  }
})

const quarterTurnSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
])

const importedStlSourceSummarySchema = z.object({
  assetId: z.string().min(1),
  name: z.string().min(1),
  format: z.enum(['ascii', 'binary']),
  sizeBytes: z.number().int().positive(),
  triangleCount: z.number().int().positive(),
  originalBounds: z.object({
    min: z.tuple([z.number(), z.number(), z.number()]),
    max: z.tuple([z.number(), z.number(), z.number()]),
    size: z.tuple([z.number(), z.number(), z.number()]),
  }),
  originalSizeMm: z.tuple([z.number().positive(), z.number().positive(), z.number().positive()]),
})

const stlRetrofitSchema = z.object({
  source: importedStlSourceSummarySchema.nullable(),
  sizeMode: z.enum(['auto', 'locked']),
  gridX: z.coerce.number().int().min(1).max(8),
  gridY: z.coerce.number().int().min(1).max(8),
  heightUnits: z.coerce.number().int().min(2).max(24),
  rotationX: quarterTurnSchema,
  rotationY: quarterTurnSchema,
  rotationZ: quarterTurnSchema,
  cutDepth: z.coerce.number().min(0.5).max(120),
  footprintMargin: z.coerce.number().min(0).max(16),
  minAdapterThickness: z.coerce.number().min(0.5).max(24),
  magnetHoles: z.boolean(),
  stackingLip: z.boolean(),
}).superRefine((value, context) => {
  if (!value.source) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: '请先上传 STL 模型。',
      path: ['source'],
    })
  }
})

const stlCavityBinSchema = z.object({
  source: importedStlSourceSummarySchema.nullable(),
  sizeMode: z.enum(['auto', 'locked']),
  gridX: z.coerce.number().int().min(1).max(8),
  gridY: z.coerce.number().int().min(1).max(8),
  heightUnits: z.coerce.number().int().min(2).max(24),
  rotationX: quarterTurnSchema,
  rotationY: quarterTurnSchema,
  rotationZ: quarterTurnSchema,
  wallThickness: z.coerce.number().min(1.2).max(3.6),
  floorThickness: z.coerce.number().min(1.2).max(5),
  xyClearance: z.coerce.number().min(0).max(4),
  zClearance: z.coerce.number().min(0).max(12),
  magnetHoles: z.boolean(),
}).superRefine((value, context) => {
  if (!value.source) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: '请先上传 STL 模型。',
      path: ['source'],
    })
  }
})

function buildGenericBin(
  params: GenericBinParams,
  spec: GridfinitySpec,
  _context: TemplateBuildContext,
): TemplateBuildOutput {
  void _context

  const solid = createBaseBinSolid(params, spec)
  const metrics = getBinMetrics(params, spec)
  const warnings: string[] = []
  const cavityBottomZ = spec.footHeight + params.innerWallThicknessZ
  const cavityTopZ = metrics.height + 2
  const cavityHeight = cavityTopZ - cavityBottomZ
  const cavityWidth = Math.max(0, metrics.outerX - params.innerWallThicknessX * 2)
  const cavityDepth = Math.max(0, metrics.outerY - params.innerWallThicknessY * 2)

  if (cavityWidth <= 2 || cavityDepth <= 2 || cavityHeight <= 2) {
    return {
      geometry: solid,
      warnings: ['当前 XYZ 内壁厚度已接近实体盒，内部空腔已自动省略。'],
    }
  }

  const cavity = createPocketBetween(
    cavityWidth,
    cavityDepth,
    cavityBottomZ,
    cavityTopZ,
    0,
    0,
    metrics.innerRadius,
    metrics.segments,
  )

  let result = subtract(solid, cavity)
  const dividers = []
  const maxDividerHeight = Math.max(metrics.height - cavityBottomZ, 0)
  const dividerHeight = Math.min(params.dividerHeight, maxDividerHeight)
  const dividerZ = cavityBottomZ + dividerHeight / 2

  if (params.dividerHeight > maxDividerHeight + 0.01) {
    warnings.push('隔板高度已自动限制在当前 Z 内壁厚度之上的可用空间内。')
  }

  const dividerXs = resolveDividerCenters(
    cavityWidth,
    params.dividerThickness,
    [params.dividerX1, params.dividerX2, params.dividerX3],
    params.compartmentsX,
    '横向',
  )
  const dividerYs = resolveDividerCenters(
    cavityDepth,
    params.dividerThickness,
    [params.dividerY1, params.dividerY2, params.dividerY3],
    params.compartmentsY,
    '纵向',
  )

  for (const x of dividerXs) {
    if (dividerHeight <= 0) {
      break
    }

    dividers.push(
      cuboid({
        size: [params.dividerThickness, cavityDepth, dividerHeight],
        center: [x, 0, dividerZ],
      }),
    )
  }

  for (const y of dividerYs) {
    if (dividerHeight <= 0) {
      break
    }

    dividers.push(
      cuboid({
        size: [cavityWidth, params.dividerThickness, dividerHeight],
        center: [0, y, dividerZ],
      }),
    )
  }

  if (dividers.length > 0) {
    result = union(result, ...dividers)
  }

  return { geometry: result, warnings }
}

function validateDividerOrder(
  dividerOffsets: number[],
  compartmentCount: number,
  pathKey: 'dividerX1' | 'dividerY1',
  axisLabel: 'X' | 'Y',
  context: z.RefinementCtx,
) {
  const activeOffsets = dividerOffsets.slice(0, Math.max(0, compartmentCount - 1))

  for (let index = 1; index < activeOffsets.length; index += 1) {
    if (activeOffsets[index] <= activeOffsets[index - 1]) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${axisLabel} 向隔板位置需要按从小到大设置。`,
        path: [pathKey],
      })
      return
    }
  }
}

function resolveDividerCenters(
  span: number,
  dividerThickness: number,
  dividerOffsets: number[],
  compartmentCount: number,
  axisLabel: '横向' | '纵向',
) {
  const minCompartmentSpan = 8
  const activeOffsets = dividerOffsets.slice(0, Math.max(0, compartmentCount - 1))
  const centers = activeOffsets.map(
    (offset) => -span / 2 + offset + dividerThickness / 2,
  )
  let previousEdge = -span / 2

  for (const center of centers) {
    const compartmentSpan = center - dividerThickness / 2 - previousEdge

    if (compartmentSpan < minCompartmentSpan) {
      throw new Error(`${axisLabel}隔仓位置过近，导致单个收纳格尺寸不足。`)
    }

    previousEdge = center + dividerThickness / 2
  }

  const trailingSpan = span / 2 - previousEdge

  if (trailingSpan < minCompartmentSpan) {
    throw new Error(`${axisLabel}隔仓位置过近，导致单个收纳格尺寸不足。`)
  }

  return centers
}

export function getDefaultGenericDividerOffsets(
  span: number,
  dividerThickness: number,
  compartmentCount: number,
) {
  if (compartmentCount <= 1) {
    return [12, 24, 36] as const
  }

  const dividerCount = compartmentCount - 1
  const compartmentSpan =
    (span - dividerCount * dividerThickness) / compartmentCount
  const positions = Array.from({ length: dividerCount }, (_, index) =>
    Number(
      (
        compartmentSpan * (index + 1) +
        dividerThickness * index
      ).toFixed(1),
    ),
  )

  return [
    positions[0] ?? 12,
    positions[1] ?? 24,
    positions[2] ?? 36,
  ] as const
}

function buildMemoryCardTray(
  params: MemoryCardTrayParams,
  spec: GridfinitySpec,
  _context: TemplateBuildContext,
): TemplateBuildOutput {
  void _context

  const plan = resolveMemoryCardPlan(params, spec)
  const solid = createBaseBinSolid(plan.resolvedParams, spec)
  const metrics = getBinMetrics(plan.resolvedParams, spec)
  const trayPocket = createPocketBetween(
    plan.trayWidth,
    plan.trayDepth,
    plan.trayBottomZ,
    plan.trayTopZ,
    0,
    plan.trayCenterY,
    Math.max(1, metrics.innerRadius - 0.6),
    metrics.segments,
  )
  const slotPockets = plan.slotPockets.map((slot) =>
    createPocketBetween(
      slot.width,
      slot.depth,
      slot.bottomZ,
      slot.topZ,
      slot.centerX,
      slot.centerY,
      slot.cornerRadius,
      20,
    ),
  )
  const gripChannels = plan.gripChannels.map((channel) =>
    createPocketBetween(
      channel.width,
      channel.depth,
      channel.bottomZ,
      channel.topZ,
      channel.centerX,
      channel.centerY,
      channel.cornerRadius,
      16,
    ),
  )

  return {
    geometry: subtract(solid, trayPocket, ...slotPockets, ...gripChannels),
    warnings: plan.warnings,
  }
}

export const templateDefinitions: Record<TemplateId, AnyTemplateDefinition> = {
  'generic-bin': {
    id: 'generic-bin',
    name: '通用收纳盒',
    tagline: '最稳的 Gridfinity 起点',
    summary: '标准开口 bin，支持分仓、隔板尺寸、磁铁孔、XYZ 内壁厚度和标签 lip。',
    description:
      '适合装零件、螺丝、电子小件，按 Gridfinity 常见尺寸生成可直接打印的收纳盒。',
    previewFacts: ['开口 bin', '支持隔板距离/厚度/高度', 'XYZ 内壁厚度可调'],
    schema: genericBinSchema,
    defaultParams: {
      gridX: 2,
      gridY: 2,
      heightUnits: 4,
      wallThickness: 2,
      floorThickness: 2,
      magnetHoles: true,
      labelLip: true,
      compartmentsX: 2,
      compartmentsY: 1,
      innerWallThicknessX: 2,
      innerWallThicknessY: 2,
      innerWallThicknessZ: 2,
      dividerThickness: 2,
      dividerHeight: 22,
      dividerX1: getDefaultGenericDividerOffsets(79.5, 2, 2)[0],
      dividerX2: getDefaultGenericDividerOffsets(79.5, 2, 2)[1],
      dividerX3: getDefaultGenericDividerOffsets(79.5, 2, 2)[2],
      dividerY1: getDefaultGenericDividerOffsets(79.5, 2, 1)[0],
      dividerY2: getDefaultGenericDividerOffsets(79.5, 2, 1)[1],
      dividerY3: getDefaultGenericDividerOffsets(79.5, 2, 1)[2],
    },
    fields: [
      numberField<GenericBinParams>('gridX', '宽度单元', 'Gridfinity X 方向单元数', 1, 4, 1),
      numberField<GenericBinParams>('gridY', '深度单元', 'Gridfinity Y 方向单元数', 1, 4, 1),
      numberField<GenericBinParams>('heightUnits', '高度单元', '每单位为 7mm', 2, 12, 1),
      numberField<GenericBinParams>('innerWallThicknessX', 'X 内壁厚度', '控制左右两侧内壁厚度；加大后会压缩内部宽度', 2, 84, 0.5),
      numberField<GenericBinParams>('innerWallThicknessY', 'Y 内壁厚度', '控制前后两侧内壁厚度；加大后会压缩内部深度', 2, 84, 0.5),
      numberField<GenericBinParams>('innerWallThicknessZ', 'Z 内壁厚度', '控制底部向上的实体厚度；加大到极限会接近实心封闭盒', 2, 84, 0.5),
      numberField<GenericBinParams>('compartmentsX', '横向隔仓', 'X 方向分仓数量', 1, 4, 1),
      numberField<GenericBinParams>('compartmentsY', '纵向隔仓', 'Y 方向分仓数量', 1, 4, 1),
      numberField<GenericBinParams>('dividerThickness', '隔板厚度', '统一控制所有隔板厚度', 1.2, 12, 0.2),
      numberField<GenericBinParams>('dividerHeight', '隔板高度', '从 Z 内壁厚度之上开始计算的隔板高度', 2, 84, 0.5),
      numberField<GenericBinParams>('dividerX1', '横向隔板 1 距离', '从左侧最外缘内壁量到第 1 条横向隔板起始边的距离（mm）', 2, 120, 0.5, {
        visibleWhen: [{ key: 'compartmentsX', values: [2, 3, 4] }],
      }),
      numberField<GenericBinParams>('dividerX2', '横向隔板 2 距离', '从左侧最外缘内壁量到第 2 条横向隔板起始边的距离（mm）', 2, 120, 0.5, {
        visibleWhen: [{ key: 'compartmentsX', values: [3, 4] }],
      }),
      numberField<GenericBinParams>('dividerX3', '横向隔板 3 距离', '从左侧最外缘内壁量到第 3 条横向隔板起始边的距离（mm）', 2, 120, 0.5, {
        visibleWhen: [{ key: 'compartmentsX', values: [4] }],
      }),
      numberField<GenericBinParams>('dividerY1', '纵向隔板 1 距离', '从前侧最外缘内壁量到第 1 条纵向隔板起始边的距离（mm）', 2, 120, 0.5, {
        visibleWhen: [{ key: 'compartmentsY', values: [2, 3, 4] }],
      }),
      numberField<GenericBinParams>('dividerY2', '纵向隔板 2 距离', '从前侧最外缘内壁量到第 2 条纵向隔板起始边的距离（mm）', 2, 120, 0.5, {
        visibleWhen: [{ key: 'compartmentsY', values: [3, 4] }],
      }),
      numberField<GenericBinParams>('dividerY3', '纵向隔板 3 距离', '从前侧最外缘内壁量到第 3 条纵向隔板起始边的距离（mm）', 2, 120, 0.5, {
        visibleWhen: [{ key: 'compartmentsY', values: [4] }],
      }),
      booleanField<GenericBinParams>('magnetHoles', '磁铁孔', '底部增加 6x2mm 磁铁孔'),
      booleanField<GenericBinParams>('labelLip', '标签 lip', '前侧增加标签唇边'),
    ],
    build: buildGenericBin,
  },
  'memory-card-tray': {
    id: 'memory-card-tray',
    name: '内存卡托盘',
    tagline: '自动推荐最小尺寸',
    summary: '根据数量和模式自动推荐更紧凑的 SD / microSD 收纳布局。',
    description:
      '支持 microSD 极限收纳、SD 紧凑收纳和混合分区模式，默认优先压缩外部体积。',
    previewFacts: ['自动推荐尺寸', 'SD / microSD / 混合', '高级参数可折叠'],
    schema: memoryCardTraySchema,
    defaultParams: {
      gridX: getMemoryCardModeDefaults('micro-sd-compact').gridX,
      gridY: getMemoryCardModeDefaults('micro-sd-compact').gridY,
      heightUnits: getMemoryCardModeDefaults('micro-sd-compact').heightUnits,
      wallThickness: 1.8,
      floorThickness: 1.8,
      magnetHoles: true,
      labelLip: false,
      mode: 'micro-sd-compact',
      quantity: getMemoryCardModeDefaults('micro-sd-compact').quantity,
      sdCount: getMemoryCardModeDefaults('micro-sd-compact').sdCount,
      microSdCount: getMemoryCardModeDefaults('micro-sd-compact').microSdCount,
      enableGripCutout: true,
      enableLabelArea: false,
      lockOuterSize: false,
      slotTolerance: getMemoryCardModeDefaults('micro-sd-compact').slotTolerance,
      minGripMargin: getMemoryCardModeDefaults('micro-sd-compact').minGripMargin,
    },
    fields: [
      {
        key: 'mode',
        label: '收纳模式',
        description: '选择 microSD、SD 或混合分区模式',
        kind: 'select',
        options: [
          { label: 'microSD 极限收纳', value: 'micro-sd-compact' },
          { label: 'SD 紧凑收纳', value: 'sd-compact' },
          { label: '混合收纳', value: 'mixed' },
        ],
      },
      numberField<MemoryCardTrayParams>('quantity', '数量', '单一卡型时要收纳的卡片数量', 1, 48, 1, {
        visibleWhen: [{ key: 'mode', values: ['micro-sd-compact', 'sd-compact'] }],
      }),
      numberField<MemoryCardTrayParams>('sdCount', 'SD 数量', '混合模式下的 SD 数量', 0, 24, 1, {
        visibleWhen: [{ key: 'mode', values: ['mixed'] }],
      }),
      numberField<MemoryCardTrayParams>('microSdCount', 'microSD 数量', '混合模式下的 microSD 数量', 0, 48, 1, {
        visibleWhen: [{ key: 'mode', values: ['mixed'] }],
      }),
      booleanField<MemoryCardTrayParams>('enableGripCutout', '抓取缺口', '为每一排提供共享抓取通道'),
      booleanField<MemoryCardTrayParams>('enableLabelArea', '标签区', '前侧预留标签区域'),
      booleanField<MemoryCardTrayParams>('lockOuterSize', '固定外部尺寸', '打开后使用你手动指定的外部单元；直接修改下面尺寸也会自动开启'),
      numberField<MemoryCardTrayParams>('gridX', '宽度单元', '模型占用的 Gridfinity X 单元数；手动修改会自动锁定外部尺寸', 1, 4, 1),
      numberField<MemoryCardTrayParams>('gridY', '深度单元', '模型占用的 Gridfinity Y 单元数；手动修改会自动锁定外部尺寸', 1, 4, 1),
      numberField<MemoryCardTrayParams>('heightUnits', '高度单元', '模型高度单位；手动修改会自动锁定外部尺寸', 2, 6, 1),
      numberField<MemoryCardTrayParams>('wallThickness', '壁厚', '高级：建议 >= 1.6mm', 1.2, 3.6, 0.2, {
        section: 'advanced',
      }),
      numberField<MemoryCardTrayParams>('floorThickness', '底厚', '高级：打印友好的底部厚度', 1.2, 5, 0.2, {
        section: 'advanced',
      }),
      numberField<MemoryCardTrayParams>('slotTolerance', '卡槽公差', '高级：卡片四周预留的公差', 0.25, 1, 0.05, {
        section: 'advanced',
      }),
      numberField<MemoryCardTrayParams>('minGripMargin', '最小间距', '高级：卡槽和抓取通道的最小间距', 1, 4, 0.1, {
        section: 'advanced',
      }),
      booleanField<MemoryCardTrayParams>('magnetHoles', '磁铁孔', '高级：底部增加 6x2mm 磁铁孔', {
        section: 'advanced',
      }),
    ],
    build: buildMemoryCardTray,
  },
  'photo-outline-bin': {
    id: 'photo-outline-bin',
    name: '照片轮廓收纳',
    tagline: '上传俯拍照片后自动识别轮廓',
    summary: '基于 L 形标尺完成尺度校准，抽取关键点轮廓并生成首版型腔收纳。',
    description:
      '首版支持单物体俯拍、L 形标尺校准、关键点拖拽修正、轮廓模式切换，以及 0° / 90° 自动尺寸搜索。',
    previewFacts: ['L 形标尺校准', '轮廓模式切换', '自动搜索最小外部尺寸'],
    schema: photoOutlineBinSchema,
    defaultParams: photoOutlineDefaultParams,
    fields: [],
    build: buildPhotoOutlineBin,
  },
  'stl-cavity-bin': {
    id: 'stl-cavity-bin',
    name: 'STL 型腔收纳',
    tagline: '导入物品 STL 后生成标准矩形 Gridfinity 型腔盒',
    summary: '导入被收纳物 STL、旋转摆正、自动推荐尺寸，并在标准 Gridfinity 盒体内部挖出对应型腔。',
    description:
      '首版支持 ASCII / Binary STL，按 90° 旋转摆正后生成标准矩形外壳，并使用真实 STL 几何减去型腔。',
    previewFacts: ['导入 STL', '真实 STL 负形', '标准矩形外壳'],
    schema: stlCavityBinSchema,
    defaultParams: stlCavityBinDefaultParams,
    fields: [],
    build: buildStlCavityBin,
  },
  'stl-retrofit': {
    id: 'stl-retrofit',
    name: 'STL 改底适配',
    tagline: '导入模型后规整为 Gridfinity 标准矩形实体',
    summary: '导入 STL、旋转摆正、自动推荐占位，并规整为标准矩形外形与底部脚位。',
    description:
      '首版支持 ASCII / Binary STL，按 90° 旋转摆正后规整为标准矩形外形；顶部默认保持平顶，可选标准堆叠口，并自动补齐到 Gridfinity 标准高度。',
    previewFacts: ['导入 STL', '90° 旋转摆正', '标准矩形外形'],
    schema: stlRetrofitSchema,
    defaultParams: stlRetrofitDefaultParams,
    fields: [],
    build: buildStlRetrofit,
  },
}

export const templateList = Object.values(templateDefinitions)

export function getTemplateDefinition(templateId: TemplateId) {
  return templateDefinitions[templateId]
}

export function getDefaultTemplateRequest(templateId: TemplateId) {
  const template = getTemplateDefinition(templateId)

  return {
    templateId,
    params: template.defaultParams,
    specVersion: defaultGridfinitySpec.version,
  }
}
