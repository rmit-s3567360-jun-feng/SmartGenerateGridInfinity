import { getInteriorFloorZ } from './base'
import { getBinMetrics, gridUnitsToMillimeters, heightUnitsToMillimeters } from './spec'
import type {
  GridfinitySpec,
  MemoryCardMode,
  MemoryCardTrayParams,
} from './types'

type CardKind = 'sd' | 'micro-sd'
type ArrangementKind = 'single' | 'mixed-side-by-side' | 'mixed-front-back'

interface CardProfile {
  kind: CardKind
  label: string
  width: number
  length: number
  pocketDepth: number
  cornerRadius: number
  gripDepth: number
}

export interface MemoryCardResolvedSize {
  gridX: number
  gridY: number
  heightUnits: number
  outerX: number
  outerY: number
  outerZ: number
}

export interface MemoryCardSlotPocket {
  kind: CardKind
  centerX: number
  centerY: number
  width: number
  depth: number
  bottomZ: number
  topZ: number
  cornerRadius: number
}

export interface MemoryCardGripChannel {
  centerX: number
  centerY: number
  width: number
  depth: number
  bottomZ: number
  topZ: number
  cornerRadius: number
}

interface LayoutCandidate {
  kind: CardKind
  orientation: 'default' | 'rotated'
  columns: number
  rows: number
  width: number
  depth: number
  slotWidth: number
  slotDepth: number
  pocketDepth: number
  cornerRadius: number
  slotCenters: Array<{ x: number; y: number }>
  gripChannels: Array<{ x: number; y: number; width: number; depth: number }>
}

export interface MemoryCardResolvedPlan {
  resolvedParams: MemoryCardTrayParams
  size: MemoryCardResolvedSize
  quantity: number
  arrangement: ArrangementKind
  arrangementLabel: string
  trayCenterY: number
  trayWidth: number
  trayDepth: number
  trayBottomZ: number
  trayTopZ: number
  slotPockets: MemoryCardSlotPocket[]
  gripChannels: MemoryCardGripChannel[]
  warnings: string[]
}

const CARD_PROFILES: Record<CardKind, CardProfile> = {
  'micro-sd': {
    kind: 'micro-sd',
    label: 'microSD',
    width: 11,
    length: 15,
    pocketDepth: 2.2,
    cornerRadius: 1.2,
    gripDepth: 3.2,
  },
  sd: {
    kind: 'sd',
    label: 'SD',
    width: 24,
    length: 32,
    pocketDepth: 3.6,
    cornerRadius: 1.8,
    gripDepth: 5,
  },
}

const MODE_DEFAULTS: Record<
  MemoryCardMode,
  Pick<
    MemoryCardTrayParams,
    | 'gridX'
    | 'gridY'
    | 'heightUnits'
    | 'quantity'
    | 'sdCount'
    | 'microSdCount'
    | 'slotTolerance'
    | 'minGripMargin'
  >
> = {
  'micro-sd-compact': {
    gridX: 2,
    gridY: 1,
    heightUnits: 2,
    quantity: 12,
    sdCount: 0,
    microSdCount: 12,
    slotTolerance: 0.45,
    minGripMargin: 1.2,
  },
  'sd-compact': {
    gridX: 2,
    gridY: 2,
    heightUnits: 3,
    quantity: 6,
    sdCount: 6,
    microSdCount: 0,
    slotTolerance: 0.55,
    minGripMargin: 2,
  },
  mixed: {
    gridX: 2,
    gridY: 2,
    heightUnits: 3,
    quantity: 12,
    sdCount: 4,
    microSdCount: 8,
    slotTolerance: 0.5,
    minGripMargin: 1.6,
  },
}

const MODE_MIN_HEIGHT: Record<MemoryCardMode, number> = {
  'micro-sd-compact': 2,
  'sd-compact': 3,
  mixed: 3,
}

const SEARCH_GRID_RANGE = [1, 2, 3, 4]
const SEARCH_HEIGHT_MAX = 6

export function getMemoryCardModeDefaults(mode: MemoryCardMode) {
  return MODE_DEFAULTS[mode]
}

export function normalizeMemoryCardModeParams(
  params: MemoryCardTrayParams,
  mode: MemoryCardMode,
) {
  const defaults = getMemoryCardModeDefaults(mode)
  const lockedSize = params.lockOuterSize
    ? {
        gridX: params.gridX,
        gridY: params.gridY,
        heightUnits: params.heightUnits,
      }
    : {
        gridX: defaults.gridX,
        gridY: defaults.gridY,
        heightUnits: defaults.heightUnits,
      }

  return {
    ...params,
    ...defaults,
    ...lockedSize,
    mode,
  }
}

export function getMemoryCardRequestedQuantity(params: MemoryCardTrayParams) {
  if (params.mode === 'mixed') {
    return params.sdCount + params.microSdCount
  }

  return params.quantity
}

export function resolveMemoryCardPlan(
  params: MemoryCardTrayParams,
  spec: GridfinitySpec,
): MemoryCardResolvedPlan {
  if (params.lockOuterSize) {
    return buildPlanForSize(params, spec, {
      gridX: params.gridX,
      gridY: params.gridY,
      heightUnits: params.heightUnits,
    })
  }

  const recommended = recommendMemoryCardSize(params, spec)

  if (!recommended) {
    throw new Error('当前数量超出首版自动推荐范围，建议减少数量或改为固定更大尺寸。')
  }

  return recommended
}

export function getMemoryCardRecommendationSummary(
  params: MemoryCardTrayParams,
  spec: GridfinitySpec,
) {
  const plan = resolveMemoryCardPlan(params, spec)

  return {
    quantity: plan.quantity,
    arrangementLabel: plan.arrangementLabel,
    size: plan.size,
    warnings: plan.warnings,
    isAutoSized: !params.lockOuterSize,
  }
}

function recommendMemoryCardSize(
  params: MemoryCardTrayParams,
  spec: GridfinitySpec,
) {
  const candidates: MemoryCardResolvedPlan[] = []
  const minHeightUnits = MODE_MIN_HEIGHT[params.mode]

  for (const gridX of SEARCH_GRID_RANGE) {
    for (const gridY of SEARCH_GRID_RANGE) {
      for (
        let heightUnits = minHeightUnits;
        heightUnits <= SEARCH_HEIGHT_MAX;
        heightUnits += 1
      ) {
        try {
          candidates.push(
            buildPlanForSize(params, spec, {
              gridX,
              gridY,
              heightUnits,
            }),
          )
        } catch {
          continue
        }
      }
    }
  }

  candidates.sort((left, right) => {
    const leftVolume = left.size.outerX * left.size.outerY * left.size.outerZ
    const rightVolume = right.size.outerX * right.size.outerY * right.size.outerZ

    if (leftVolume !== rightVolume) {
      return leftVolume - rightVolume
    }

    const leftArea = left.size.outerX * left.size.outerY
    const rightArea = right.size.outerX * right.size.outerY

    if (leftArea !== rightArea) {
      return leftArea - rightArea
    }

    if (left.size.outerZ !== right.size.outerZ) {
      return left.size.outerZ - right.size.outerZ
    }

    if (left.size.outerY !== right.size.outerY) {
      return left.size.outerY - right.size.outerY
    }

    return left.size.outerX - right.size.outerX
  })

  const best = candidates[0]

  if (!best) {
    return null
  }

  return {
    ...best,
    warnings: [
      `已自动推荐 ${best.size.gridX} x ${best.size.gridY} x ${best.size.heightUnits} 尺寸。`,
      ...best.warnings,
    ],
  }
}

function buildPlanForSize(
  params: MemoryCardTrayParams,
  spec: GridfinitySpec,
  size: Pick<MemoryCardResolvedSize, 'gridX' | 'gridY' | 'heightUnits'>,
): MemoryCardResolvedPlan {
  const effectiveParams: MemoryCardTrayParams = {
    ...params,
    ...size,
    quantity: getMemoryCardRequestedQuantity(params),
  }
  const metrics = getBinMetrics(effectiveParams, spec)
  const quantity = getMemoryCardRequestedQuantity(effectiveParams)
  const labelBandDepth = effectiveParams.enableLabelArea ? 8 : 0
  // V2 prioritizes the smallest viable footprint, so keep the tray border
  // tight while still leaving a printable shell around the slot field.
  const perimeterMargin = Math.max(
    1.1,
    Math.min(1.4, effectiveParams.minGripMargin),
  )
  const usableWidth = metrics.innerX - perimeterMargin * 2
  const usableDepth = metrics.innerY - perimeterMargin * 2 - labelBandDepth
  const interiorFloorZ = getInteriorFloorZ(effectiveParams, spec)
  const availablePocketDepth = metrics.height - interiorFloorZ - 0.8

  if (usableWidth <= 8 || usableDepth <= 8) {
    throw new Error('当前尺寸不足以生成内存卡托盘。')
  }

  if (availablePocketDepth <= 1) {
    throw new Error('当前高度不足以生成内存卡托盘。')
  }

  const layout = buildArrangementCandidate(
    effectiveParams,
    usableWidth,
    usableDepth,
    availablePocketDepth,
  )
  const trayCenterY = labelBandDepth > 0 ? -labelBandDepth / 2 : 0
  const trayWidth = Math.min(metrics.innerX, layout.width + perimeterMargin * 2)
  const trayDepth = Math.min(metrics.innerY - labelBandDepth * 0.2, layout.depth + perimeterMargin * 2)
  const trayTopZ = metrics.height + 1
  const trayBottomZ = Math.max(
    interiorFloorZ,
    metrics.height - Math.max(layout.maxPocketDepth * 0.6, 1.4),
  )
  const slotPockets = createSlotPockets(
    layout,
    trayCenterY,
    interiorFloorZ,
    metrics.height,
    trayTopZ,
  )
  const gripChannels = effectiveParams.enableGripCutout
    ? createGripChannels(layout, trayCenterY, interiorFloorZ, metrics.height, trayTopZ)
    : []

  return {
    resolvedParams: effectiveParams,
    size: {
      ...size,
      outerX: gridUnitsToMillimeters(size.gridX, spec),
      outerY: gridUnitsToMillimeters(size.gridY, spec),
      outerZ: heightUnitsToMillimeters(size.heightUnits, spec),
    },
    quantity,
    arrangement: layout.arrangement,
    arrangementLabel: layout.arrangementLabel,
    trayCenterY,
    trayWidth,
    trayDepth,
    trayBottomZ,
    trayTopZ,
    slotPockets,
    gripChannels,
    warnings: layout.warnings,
  }
}

function buildArrangementCandidate(
  params: MemoryCardTrayParams,
  usableWidth: number,
  usableDepth: number,
  availablePocketDepth: number,
) {
  if (params.mode === 'mixed') {
    if (params.sdCount <= 0) {
      const candidates = buildSingleTypeCandidates(
        'micro-sd',
        params.microSdCount,
        usableWidth,
        usableDepth,
        params,
        availablePocketDepth,
      )
      const candidate = candidates[0]

      if (!candidate) {
        throw new Error('当前尺寸不足以容纳 microSD 布局。')
      }

      return {
        arrangement: 'single' as const,
        arrangementLabel: `仅 microSD 区 ${candidate.columns} x ${candidate.rows}`,
        width: candidate.width,
        depth: candidate.depth,
        maxPocketDepth: candidate.pocketDepth,
        slotPockets: toGlobalSlotPockets(candidate, 0, 0),
        gripChannels: toGlobalGripChannels(candidate, 0, 0),
        warnings: [] as string[],
      }
    }

    if (params.microSdCount <= 0) {
      const candidates = buildSingleTypeCandidates(
        'sd',
        params.sdCount,
        usableWidth,
        usableDepth,
        params,
        availablePocketDepth,
      )
      const candidate = candidates[0]

      if (!candidate) {
        throw new Error('当前尺寸不足以容纳 SD 布局。')
      }

      return {
        arrangement: 'single' as const,
        arrangementLabel: `仅 SD 区 ${candidate.columns} x ${candidate.rows}`,
        width: candidate.width,
        depth: candidate.depth,
        maxPocketDepth: candidate.pocketDepth,
        slotPockets: toGlobalSlotPockets(candidate, 0, 0),
        gripChannels: toGlobalGripChannels(candidate, 0, 0),
        warnings: [] as string[],
      }
    }

    return buildMixedArrangement(params, usableWidth, usableDepth, availablePocketDepth)
  }

  const kind: CardKind = params.mode === 'sd-compact' ? 'sd' : 'micro-sd'
  const candidates = buildSingleTypeCandidates(
    kind,
    params.quantity,
    usableWidth,
    usableDepth,
    params,
    availablePocketDepth,
  )
  const candidate = candidates[0]

  if (!candidate) {
    throw new Error('当前尺寸不足以容纳指定数量的内存卡。')
  }

  return {
    arrangement: 'single' as const,
    arrangementLabel: `${CARD_PROFILES[kind].label} ${candidate.columns} x ${candidate.rows} 紧凑布局`,
    width: candidate.width,
    depth: candidate.depth,
    maxPocketDepth: candidate.pocketDepth,
    slotPockets: toGlobalSlotPockets(candidate, 0, 0),
    gripChannels: toGlobalGripChannels(candidate, 0, 0),
    warnings: [] as string[],
  }
}

function buildMixedArrangement(
  params: MemoryCardTrayParams,
  usableWidth: number,
  usableDepth: number,
  availablePocketDepth: number,
) {
  const sdCandidates = buildSingleTypeCandidates(
    'sd',
    params.sdCount,
    usableWidth,
    usableDepth,
    params,
    availablePocketDepth,
  )
  const microCandidates = buildSingleTypeCandidates(
    'micro-sd',
    params.microSdCount,
    usableWidth,
    usableDepth,
    params,
    availablePocketDepth,
  )
  const groupGap = Math.max(params.minGripMargin * 1.6, 4)
  const combined = []

  for (const sdCandidate of sdCandidates) {
    for (const microCandidate of microCandidates) {
      const sideBySideWidth = sdCandidate.width + microCandidate.width + groupGap
      const sideBySideDepth = Math.max(sdCandidate.depth, microCandidate.depth)

      if (sideBySideWidth <= usableWidth && sideBySideDepth <= usableDepth) {
        const sdOffsetX = -sideBySideWidth / 2 + sdCandidate.width / 2
        const microOffsetX = sideBySideWidth / 2 - microCandidate.width / 2

        combined.push({
          arrangement: 'mixed-side-by-side' as const,
          arrangementLabel: 'SD 与 microSD 左右分区',
          width: sideBySideWidth,
          depth: sideBySideDepth,
          maxPocketDepth: Math.max(sdCandidate.pocketDepth, microCandidate.pocketDepth),
          slotPockets: [
            ...toGlobalSlotPockets(sdCandidate, sdOffsetX, 0),
            ...toGlobalSlotPockets(microCandidate, microOffsetX, 0),
          ],
          gripChannels: [
            ...toGlobalGripChannels(sdCandidate, sdOffsetX, 0),
            ...toGlobalGripChannels(microCandidate, microOffsetX, 0),
          ],
          score: sideBySideWidth * sideBySideDepth,
        })
      }

      const frontBackWidth = Math.max(sdCandidate.width, microCandidate.width)
      const frontBackDepth = sdCandidate.depth + microCandidate.depth + groupGap

      if (frontBackWidth <= usableWidth && frontBackDepth <= usableDepth) {
        const sdOffsetY = -frontBackDepth / 2 + sdCandidate.depth / 2
        const microOffsetY = frontBackDepth / 2 - microCandidate.depth / 2

        combined.push({
          arrangement: 'mixed-front-back' as const,
          arrangementLabel: 'SD 与 microSD 前后分区',
          width: frontBackWidth,
          depth: frontBackDepth,
          maxPocketDepth: Math.max(sdCandidate.pocketDepth, microCandidate.pocketDepth),
          slotPockets: [
            ...toGlobalSlotPockets(sdCandidate, 0, sdOffsetY),
            ...toGlobalSlotPockets(microCandidate, 0, microOffsetY),
          ],
          gripChannels: [
            ...toGlobalGripChannels(sdCandidate, 0, sdOffsetY),
            ...toGlobalGripChannels(microCandidate, 0, microOffsetY),
          ],
          score: frontBackWidth * frontBackDepth,
        })
      }
    }
  }

  combined.sort((left, right) => left.score - right.score)
  const best = combined[0]

  if (!best) {
    throw new Error('当前尺寸不足以容纳混合卡型布局。')
  }

  return {
    arrangement: best.arrangement,
    arrangementLabel: best.arrangementLabel,
    width: best.width,
    depth: best.depth,
    maxPocketDepth: best.maxPocketDepth,
    slotPockets: best.slotPockets,
    gripChannels: best.gripChannels,
    warnings: [] as string[],
  }
}

function buildSingleTypeCandidates(
  kind: CardKind,
  count: number,
  usableWidth: number,
  usableDepth: number,
  params: MemoryCardTrayParams,
  availablePocketDepth: number,
) {
  if (count <= 0) {
    return []
  }

  const profile = CARD_PROFILES[kind]
  const slotTolerance = params.slotTolerance
  const gap = params.minGripMargin
  const orientations = [
    {
      orientation: 'default' as const,
      slotWidth: profile.width + slotTolerance * 2,
      slotDepth: profile.length + slotTolerance * 2,
    },
    {
      orientation: 'rotated' as const,
      slotWidth: profile.length + slotTolerance * 2,
      slotDepth: profile.width + slotTolerance * 2,
    },
  ]
  const candidates: LayoutCandidate[] = []

  for (const orientation of orientations) {
    if (profile.pocketDepth > availablePocketDepth) {
      continue
    }

    for (let columns = 1; columns <= count; columns += 1) {
      const rows = Math.ceil(count / columns)
      const width = columns * orientation.slotWidth + (columns - 1) * gap
      const depth = rows * orientation.slotDepth + (rows - 1) * gap

      if (width > usableWidth || depth > usableDepth) {
        continue
      }

      const xCenters = createCenteredPositions(columns, orientation.slotWidth, gap)
      const yCenters = createCenteredPositions(rows, orientation.slotDepth, gap)
      const slotCenters = []

      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const index = row * columns + column

          if (index >= count) {
            continue
          }

          slotCenters.push({
            x: xCenters[column],
            y: yCenters[row],
          })
        }
      }

      const gripChannels = params.enableGripCutout
        ? yCenters.map((centerY) => ({
            x: 0,
            y:
              centerY +
              orientation.slotDepth / 2 -
              profile.gripDepth / 2 -
              Math.min(0.7, orientation.slotDepth * 0.08),
            width: Math.min(width + gap * 0.3, usableWidth),
            depth: Math.min(profile.gripDepth, orientation.slotDepth * 0.46),
          }))
        : []

      candidates.push({
        kind,
        orientation: orientation.orientation,
        columns,
        rows,
        width,
        depth,
        slotWidth: orientation.slotWidth,
        slotDepth: orientation.slotDepth,
        pocketDepth: profile.pocketDepth,
        cornerRadius: profile.cornerRadius,
        slotCenters,
        gripChannels,
      })
    }
  }

  candidates.sort((left, right) => {
    const area = left.width * left.depth - right.width * right.depth

    if (area !== 0) {
      return area
    }

    if (left.depth !== right.depth) {
      return left.depth - right.depth
    }

    return left.width - right.width
  })

  return candidates
}

function toGlobalSlotPockets(candidate: LayoutCandidate, offsetX: number, offsetY: number) {
  return candidate.slotCenters.map((center) => ({
    kind: candidate.kind,
    centerX: center.x + offsetX,
    centerY: center.y + offsetY,
    width: candidate.slotWidth,
    depth: candidate.slotDepth,
    pocketDepth: candidate.pocketDepth,
    cornerRadius: candidate.cornerRadius,
  }))
}

function toGlobalGripChannels(candidate: LayoutCandidate, offsetX: number, offsetY: number) {
  return candidate.gripChannels.map((channel) => ({
    centerX: channel.x + offsetX,
    centerY: channel.y + offsetY,
    width: channel.width,
    depth: channel.depth,
  }))
}

function createSlotPockets(
  layout: {
    slotPockets: Array<{
      kind: CardKind
      centerX: number
      centerY: number
      width: number
      depth: number
      pocketDepth: number
      cornerRadius: number
    }>
  },
  trayCenterY: number,
  interiorFloorZ: number,
  height: number,
  topZ: number,
) {
  return layout.slotPockets.map((slot) => {
    const bottomZ = Math.max(interiorFloorZ, height - slot.pocketDepth)

    return {
      kind: slot.kind,
      centerX: slot.centerX,
      centerY: slot.centerY + trayCenterY,
      width: slot.width,
      depth: slot.depth,
      bottomZ,
      topZ,
      cornerRadius: slot.cornerRadius,
    }
  })
}

function createGripChannels(
  layout: {
    gripChannels: Array<{
      centerX: number
      centerY: number
      width: number
      depth: number
    }>
  },
  trayCenterY: number,
  interiorFloorZ: number,
  height: number,
  topZ: number,
) {
  const bottomZ = Math.max(interiorFloorZ, height - 1.6)

  return layout.gripChannels.map((channel) => ({
    centerX: channel.centerX,
    centerY: channel.centerY + trayCenterY,
    width: channel.width,
    depth: channel.depth,
    bottomZ,
    topZ,
    cornerRadius: 0.8,
  }))
}

function createCenteredPositions(count: number, itemSize: number, gap: number) {
  const usedSpan = count * itemSize + (count - 1) * gap
  const start = -usedSpan / 2 + itemSize / 2

  return Array.from({ length: count }, (_, index) => start + index * (itemSize + gap))
}
