import { booleans, primitives, transforms } from '@jscad/modeling'
import { z } from 'zod'

import {
  createBaseBinSolid,
  createPocketBetween,
  getInteriorFloorZ,
} from './base'
import { evenlySpacedCenters, toRadians } from './helpers'
import {
  getMemoryCardModeDefaults,
  resolveMemoryCardPlan,
} from './memoryCard'
import { defaultGridfinitySpec, getBinMetrics } from './spec'
import type {
  AnyTemplateDefinition,
  GenericBinParams,
  GridfinitySpec,
  MemoryCardTrayParams,
  ParameterValues,
  ParameterField,
  PliersHolderParams,
  ScrewdriverRackParams,
  TemplateId,
  TemplateBuildOutput,
} from './types'

const { subtract, union } = booleans
const { cuboid, cylinder } = primitives
const { rotateX, translate } = transforms

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
})

const screwdriverRackSchema = baseSchema.extend({
  slotCount: z.coerce.number().int().min(2).max(16),
  holeDiameter: z.coerce.number().min(6).max(18),
  rowCount: z.coerce.number().int().min(1).max(3),
  spacing: z.coerce.number().min(3).max(24),
  tiltDegrees: z.coerce.number().min(0).max(20),
  handleClearance: z.coerce.number().min(12).max(38),
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

const pliersHolderSchema = baseSchema.extend({
  toolCount: z.coerce.number().int().min(1).max(6),
  channelWidth: z.coerce.number().min(12).max(38),
  channelDepth: z.coerce.number().min(10).max(32),
  spacing: z.coerce.number().min(4).max(20),
  handleOpening: z.coerce.number().min(10).max(28),
})

function buildGenericBin(
  params: GenericBinParams,
  spec: GridfinitySpec,
): TemplateBuildOutput {
  const solid = createBaseBinSolid(params, spec)
  const metrics = getBinMetrics(params, spec)
  const cavityBottomZ = getInteriorFloorZ(params, spec)
  const cavityTopZ = metrics.height + 2
  const cavityHeight = cavityTopZ - cavityBottomZ

  if (metrics.innerX <= 8 || metrics.innerY <= 8 || cavityHeight <= 8) {
    throw new Error('当前尺寸不足以生成可打印的通用收纳盒。')
  }

  const cavity = createPocketBetween(
    metrics.innerX,
    metrics.innerY,
    cavityBottomZ,
    cavityTopZ,
    0,
    0,
    metrics.innerRadius,
    metrics.segments,
  )

  let result = subtract(solid, cavity)
  const dividers = []
  const dividerHeight = metrics.height - cavityBottomZ
  const dividerZ = cavityBottomZ + dividerHeight / 2
  const compartmentWidth =
    (metrics.innerX - params.wallThickness * (params.compartmentsX - 1)) /
    params.compartmentsX
  const compartmentDepth =
    (metrics.innerY - params.wallThickness * (params.compartmentsY - 1)) /
    params.compartmentsY

  if (compartmentWidth < 8 || compartmentDepth < 8) {
    throw new Error('隔仓数量过多，导致单个收纳格宽度不足。')
  }

  for (let index = 1; index < params.compartmentsX; index += 1) {
    const x =
      -metrics.innerX / 2 +
      compartmentWidth * index +
      params.wallThickness * (index - 0.5)

    dividers.push(
      cuboid({
        size: [params.wallThickness, metrics.innerY, dividerHeight],
        center: [x, 0, dividerZ],
      }),
    )
  }

  for (let index = 1; index < params.compartmentsY; index += 1) {
    const y =
      -metrics.innerY / 2 +
      compartmentDepth * index +
      params.wallThickness * (index - 0.5)

    dividers.push(
      cuboid({
        size: [metrics.innerX, params.wallThickness, dividerHeight],
        center: [0, y, dividerZ],
      }),
    )
  }

  if (dividers.length > 0) {
    result = union(result, ...dividers)
  }

  return { geometry: result, warnings: [] }
}

function buildScrewdriverRack(
  params: ScrewdriverRackParams,
  spec: GridfinitySpec,
): TemplateBuildOutput {
  const solid = createBaseBinSolid(params, spec)
  const metrics = getBinMetrics(params, spec)
  const topPlateThickness = Math.max(5.5, params.holeDiameter * 0.35)
  const chamberBottomZ = getInteriorFloorZ(params, spec)
  const chamberTopZ = metrics.height - topPlateThickness + 0.2
  const chamberHeight = chamberTopZ - chamberBottomZ

  if (chamberHeight <= 8) {
    throw new Error('当前高度不足以生成螺丝刀收纳模板。')
  }

  const chamber = createPocketBetween(
    Math.max(12, metrics.innerX - 2),
    Math.max(12, metrics.innerY - 2),
    chamberBottomZ,
    chamberTopZ,
    0,
    0,
    Math.max(0.8, metrics.innerRadius - 0.4),
    metrics.segments,
  )

  let result = subtract(solid, chamber)
  const rows = params.rowCount
  const columns = Math.ceil(params.slotCount / rows)
  const xLayout = evenlySpacedCenters(
    columns,
    metrics.innerX - 4,
    params.holeDiameter,
    params.spacing,
  )
  const yLayout = evenlySpacedCenters(
    rows,
    metrics.innerY - 8,
    params.holeDiameter + 2,
    8,
  )
  const tilt = toRadians(params.tiltDegrees)
  const holeLength = Math.max(metrics.innerY + params.handleClearance, 32)
  const warnings: string[] = []

  if (xLayout.gap < params.spacing && columns > 1) {
    warnings.push('孔位间距已自动压缩，以适配当前箱体宽度。')
  }

  const holes = []
  let created = 0

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      if (created >= params.slotCount) {
        break
      }

      let hole = cylinder({
        radius: params.holeDiameter / 2,
        height: holeLength,
        segments: 28,
      })
      hole = rotateX(Math.PI / 2 - tilt, hole)
      hole = translate(
        [
          xLayout.centers[column],
          yLayout.centers[row] - metrics.innerY * 0.06,
          metrics.height - topPlateThickness / 2,
        ],
        hole,
      )
      holes.push(hole)
      created += 1
    }
  }

  result = subtract(result, ...holes)

  return { geometry: result, warnings }
}

function buildMemoryCardTray(
  params: MemoryCardTrayParams,
  spec: GridfinitySpec,
): TemplateBuildOutput {
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

function buildPliersHolder(
  params: PliersHolderParams,
  spec: GridfinitySpec,
): TemplateBuildOutput {
  const solid = createBaseBinSolid(params, spec)
  const metrics = getBinMetrics(params, spec)
  const channelBottomZ = Math.max(
    getInteriorFloorZ(params, spec),
    metrics.height - params.channelDepth,
  )
  const channelLength = Math.max(18, metrics.innerY * 0.72)
  const xLayout = evenlySpacedCenters(
    params.toolCount,
    metrics.innerX - 6,
    params.channelWidth,
    params.spacing,
  )
  const warnings: string[] = []

  if (xLayout.gap < params.spacing && params.toolCount > 1) {
    warnings.push('工具槽间距已自动压缩，以适配当前箱体宽度。')
  }

  const channels = xLayout.centers.flatMap((x) => {
    const channel = createPocketBetween(
      params.channelWidth,
      channelLength,
      channelBottomZ,
      metrics.height + 1,
      x,
      0,
      Math.min(2, params.channelWidth * 0.15),
      24,
    )

    const frontOpening = createPocketBetween(
      params.channelWidth * 0.82,
      params.handleOpening,
      channelBottomZ,
      metrics.height + 1.2,
      x,
      metrics.outerY / 2 - params.handleOpening / 2,
      0.6,
      16,
    )

    return [channel, frontOpening]
  })

  return {
    geometry: subtract(solid, ...channels),
    warnings,
  }
}

export const templateDefinitions: Record<TemplateId, AnyTemplateDefinition> = {
  'generic-bin': {
    id: 'generic-bin',
    name: '通用收纳盒',
    tagline: '最稳的 Gridfinity 起点',
    summary: '标准开口 bin，支持分仓、磁铁孔和标签 lip。',
    description:
      '适合装零件、螺丝、电子小件，按 Gridfinity 常见尺寸生成可直接打印的收纳盒。',
    previewFacts: ['开口 bin', '支持隔仓', '标签 lip 可选'],
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
    },
    fields: [
      numberField<GenericBinParams>('gridX', '宽度单元', 'Gridfinity X 方向单元数', 1, 4, 1),
      numberField<GenericBinParams>('gridY', '深度单元', 'Gridfinity Y 方向单元数', 1, 4, 1),
      numberField<GenericBinParams>('heightUnits', '高度单元', '每单位为 7mm', 2, 12, 1),
      numberField<GenericBinParams>('wallThickness', '壁厚', '建议 >= 1.6mm', 1.2, 3.6, 0.2),
      numberField<GenericBinParams>('floorThickness', '底厚', '打印友好的底部厚度', 1.2, 5, 0.2),
      numberField<GenericBinParams>('compartmentsX', '横向隔仓', 'X 方向分仓数量', 1, 4, 1),
      numberField<GenericBinParams>('compartmentsY', '纵向隔仓', 'Y 方向分仓数量', 1, 4, 1),
      booleanField<GenericBinParams>('magnetHoles', '磁铁孔', '底部增加 6x2mm 磁铁孔'),
      booleanField<GenericBinParams>('labelLip', '标签 lip', '前侧增加标签唇边'),
    ],
    build: buildGenericBin,
  },
  'screwdriver-rack': {
    id: 'screwdriver-rack',
    name: '螺丝刀收纳',
    tagline: '带倾角的孔位排布',
    summary: '顶部开孔、内部留空，适合批量放置精密螺丝刀。',
    description:
      '通过孔径、行数和倾角快速生成螺丝刀收纳 rack，兼顾可打印性与密度。',
    previewFacts: ['顶部孔位', '支持多排', '自动压缩孔距'],
    schema: screwdriverRackSchema,
    defaultParams: {
      gridX: 2,
      gridY: 2,
      heightUnits: 6,
      wallThickness: 2,
      floorThickness: 2,
      magnetHoles: true,
      labelLip: false,
      slotCount: 8,
      holeDiameter: 10,
      rowCount: 2,
      spacing: 14,
      tiltDegrees: 10,
      handleClearance: 24,
    },
    fields: [
      numberField<ScrewdriverRackParams>('gridX', '宽度单元', 'Gridfinity X 方向单元数', 1, 4, 1),
      numberField<ScrewdriverRackParams>('gridY', '深度单元', 'Gridfinity Y 方向单元数', 1, 4, 1),
      numberField<ScrewdriverRackParams>('heightUnits', '高度单元', '每单位为 7mm', 2, 12, 1),
      numberField<ScrewdriverRackParams>('wallThickness', '壁厚', '建议 >= 1.6mm', 1.2, 3.6, 0.2),
      numberField<ScrewdriverRackParams>('floorThickness', '底厚', '打印友好的底部厚度', 1.2, 5, 0.2),
      numberField<ScrewdriverRackParams>('slotCount', '孔位数量', '总孔位数量', 2, 16, 1),
      numberField<ScrewdriverRackParams>('holeDiameter', '孔径', '适配螺丝刀杆径', 6, 18, 0.5),
      numberField<ScrewdriverRackParams>('rowCount', '排数', '前后排布数量', 1, 3, 1),
      numberField<ScrewdriverRackParams>('spacing', '目标间距', '孔位之间的目标间距', 3, 24, 1),
      numberField<ScrewdriverRackParams>('tiltDegrees', '倾角', '顶部孔位后仰角度', 0, 20, 1),
      numberField<ScrewdriverRackParams>('handleClearance', '手柄避让', '内部留空长度', 12, 38, 1),
      booleanField<ScrewdriverRackParams>('magnetHoles', '磁铁孔', '底部增加 6x2mm 磁铁孔'),
    ],
    build: buildScrewdriverRack,
  },
  'memory-card-tray': {
    id: 'memory-card-tray',
    name: '内存卡托盘',
    tagline: '自动推荐最小尺寸',
    summary: '根据数量和模式自动推荐更紧凑的 SD / microSD 收纳布局。',
    description:
      '支持 microSD 极限收纳、SD 紧凑收纳和混合分区三种模式，默认优先压缩外部体积。',
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
      booleanField<MemoryCardTrayParams>('lockOuterSize', '固定外部尺寸', '关闭自动推荐，使用手动指定的外部单元'),
      numberField<MemoryCardTrayParams>('gridX', '宽度单元', '锁定模式下的 Gridfinity X 单元数', 1, 4, 1, {
        visibleWhen: [{ key: 'lockOuterSize', values: [true] }],
      }),
      numberField<MemoryCardTrayParams>('gridY', '深度单元', '锁定模式下的 Gridfinity Y 单元数', 1, 4, 1, {
        visibleWhen: [{ key: 'lockOuterSize', values: [true] }],
      }),
      numberField<MemoryCardTrayParams>('heightUnits', '高度单元', '锁定模式下的高度单位', 2, 6, 1, {
        visibleWhen: [{ key: 'lockOuterSize', values: [true] }],
      }),
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
  'pliers-holder': {
    id: 'pliers-holder',
    name: '钳子收纳',
    tagline: '宽槽 + 前开口',
    summary: '适合尖嘴钳、斜口钳等常见手工具的槽道式支撑。',
    description:
      '通过槽宽、槽深和前部开口尺寸快速生成钳子类工具的托槽式收纳盒。',
    previewFacts: ['托槽式', '前开口', '自动压缩槽距'],
    schema: pliersHolderSchema,
    defaultParams: {
      gridX: 2,
      gridY: 2,
      heightUnits: 4,
      wallThickness: 2,
      floorThickness: 2.2,
      magnetHoles: true,
      labelLip: false,
      toolCount: 3,
      channelWidth: 18,
      channelDepth: 22,
      spacing: 10,
      handleOpening: 16,
    },
    fields: [
      numberField<PliersHolderParams>('gridX', '宽度单元', 'Gridfinity X 方向单元数', 1, 4, 1),
      numberField<PliersHolderParams>('gridY', '深度单元', 'Gridfinity Y 方向单元数', 1, 4, 1),
      numberField<PliersHolderParams>('heightUnits', '高度单元', '每单位为 7mm', 2, 12, 1),
      numberField<PliersHolderParams>('wallThickness', '壁厚', '建议 >= 1.6mm', 1.2, 3.6, 0.2),
      numberField<PliersHolderParams>('floorThickness', '底厚', '打印友好的底部厚度', 1.2, 5, 0.2),
      numberField<PliersHolderParams>('toolCount', '工具数量', '托槽数量', 1, 6, 1),
      numberField<PliersHolderParams>('channelWidth', '槽宽', '单个托槽宽度', 12, 38, 0.5),
      numberField<PliersHolderParams>('channelDepth', '槽深', '从顶部向下切入深度', 10, 32, 0.5),
      numberField<PliersHolderParams>('spacing', '目标间距', '工具槽之间的目标间距', 4, 20, 0.5),
      numberField<PliersHolderParams>('handleOpening', '前开口', '前侧开口深度', 10, 28, 0.5),
      booleanField<PliersHolderParams>('magnetHoles', '磁铁孔', '底部增加 6x2mm 磁铁孔'),
    ],
    build: buildPliersHolder,
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
