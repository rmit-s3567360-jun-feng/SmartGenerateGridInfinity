import { booleans, expansions, measurements, primitives, transforms } from '@jscad/modeling'
import type Geom3 from '@jscad/modeling/src/geometries/geom3/type'

import { createBaseBinSolid, createPocketBetween } from './base'
import {
  getBinMetrics,
  heightUnitsToMillimeters,
} from './spec'
import type {
  GenericShapeEntry,
  GenericShapeKind,
  GenericShapePose,
  GenericShapePoseCandidate,
  GridfinitySpec,
  ParametricCavityBinParams,
  PlacedShapeInstance,
  QuarterTurn,
  ShapeArrangementMode,
  ShapeCavityPlan,
  TemplateBuildContext,
  TemplateBuildOutput,
} from './types'

const { intersect, subtract, union } = booleans
const { expand } = expansions
const { measureBoundingBox } = measurements
const { cuboid } = primitives
const { rotateX, rotateY, rotateZ, translate } = transforms

const SHAPE_CLEARANCE_SEGMENTS = 20
const SHAPE_BOOLEAN_OVERLAP_MM = 0.02

interface NormalizedShapeEntry {
  id: string
  label: string
  kind: GenericShapeKind
  quantity: number
  width: number
  depth: number
  height: number
  cornerRadius: number
}

interface ResolvedEntryPose {
  entry: GenericShapeEntry
  normalized: NormalizedShapeEntry
  candidate: GenericShapePoseCandidate
}

interface PackItem {
  id: string
  entryId: string
  label: string
  kind: GenericShapeKind
  pose: GenericShapePose
  poseLabel: string
  rotationX: QuarterTurn
  rotationY: QuarterTurn
  rotationZ: QuarterTurn
  footprintX: number
  footprintY: number
  cavityHeight: number
  packWidth: number
  packHeight: number
  area: number
  quantityIndex: number
}

interface PackedItem extends PackItem {
  x: number
  y: number
  width: number
  height: number
  centerX: number
  centerY: number
}

export function createDefaultGenericShapeEntry(index = 1): GenericShapeEntry {
  return {
    id: `shape-${index}`,
    label: `形状 ${index}`,
    kind: 'rectangle',
    quantity: 1,
    width: 28,
    depth: 18,
    height: 8,
    cornerRadius: 3,
    diameter: 16,
    length: 28,
    rotationX: 0,
    rotationY: 0,
    rotationZ: 0,
  }
}

export function resolveGenericShapeCavityPlan(
  params: ParametricCavityBinParams,
  spec: GridfinitySpec,
): ShapeCavityPlan {
  const entries = params.shapeEntries ?? []

  if (entries.length === 0) {
    throw new Error('请至少添加一种形状。')
  }

  const heightMm = heightUnitsToMillimeters(params.heightUnits, spec)
  const cavityBottomZ = roundMm(spec.footHeight + params.floorThickness)
  const usableCavityDepthMm = roundMm(heightMm - cavityBottomZ)

  if (usableCavityDepthMm <= 0) {
    throw new Error('当前盒体高度不足以形成有效型腔。')
  }

  const preferredTopClearanceMm = roundMm(Math.max(0, params.zClearance))
  const entriesWithPoses = entries.map((entry) => {
    const normalized = normalizeShapeEntry(entry)
    const candidate = sortPoseCandidatesForCurrentBox(
      [
        resolveManualPoseCandidate(
          normalized,
          entry,
          params.xyClearance,
          Number.POSITIVE_INFINITY,
        ),
      ].filter((value): value is GenericShapePoseCandidate => value !== null),
      usableCavityDepthMm,
      preferredTopClearanceMm,
    )[0]

    if (!candidate) {
      throw new Error('当前姿态或旋转设置无法生成有效型腔。')
    }

    return {
      entry,
      normalized,
      candidate,
    } satisfies ResolvedEntryPose
  })
  const metrics = getBinMetrics(
    {
      gridX: params.gridX,
      gridY: params.gridY,
      heightUnits: params.heightUnits,
      wallThickness: params.wallThickness,
    },
    spec,
  )
  const packed = searchPackedLayout(
    entriesWithPoses,
    metrics.innerX,
    metrics.innerY,
    params.interItemGap,
    params.arrangementMode,
  )

  if (!packed) {
    throw new Error('当前盒体尺寸不足以容纳当前布局。')
  }

  const maxCavityHeight = Math.max(...packed.items.map((item) => item.cavityHeight))
  const topClearanceMm = roundMm(usableCavityDepthMm - maxCavityHeight)
  const protrusionHeightMm = roundMm(Math.max(0, maxCavityHeight - usableCavityDepthMm))
  const warnings: string[] = []

  if (protrusionHeightMm > 0.01) {
    warnings.push(`已允许顶部露出 ${protrusionHeightMm.toFixed(1)} mm，以适配当前盒高。`)
  } else if (topClearanceMm > preferredTopClearanceMm + 0.01) {
    warnings.push(`当前盒体顶部仍有 ${(topClearanceMm - preferredTopClearanceMm).toFixed(1)} mm 额外余量。`)
  }

  const placedInstances = packed.items.map(
    (item): PlacedShapeInstance => ({
      entryId: item.entryId,
      label: item.label,
      kind: item.kind,
      pose: item.pose,
      poseLabel: item.poseLabel,
      centerX: roundMm(item.centerX),
      centerY: roundMm(item.centerY),
      footprintX: item.footprintX,
      footprintY: item.footprintY,
      cavityHeight: item.cavityHeight,
      cavityBottomZ,
      rotationX: item.rotationX,
      rotationY: item.rotationY,
      rotationZ: item.rotationZ,
    }),
  )

  const chosenPoses = entries.map((entry) => {
    const matched = placedInstances.find((instance) => instance.entryId === entry.id)

    if (!matched) {
      throw new Error('内部求解失败：缺少形状姿态结果。')
    }

    return {
      entryId: entry.id,
      label: entry.label,
      kind: entry.kind,
      quantity: entry.quantity,
      pose: matched.pose,
      poseLabel: matched.poseLabel,
      rotationX: matched.rotationX,
      rotationY: matched.rotationY,
      rotationZ: matched.rotationZ,
    }
  })

  return {
    size: {
      gridX: params.gridX,
      gridY: params.gridY,
      heightUnits: params.heightUnits,
    },
    cavityBottomZ,
    cavityTopZ: roundMm(heightMm + 1.2),
    topClearanceMm,
    usableCavityDepthMm,
    protrusionHeightMm,
    totalCavityCount: placedInstances.length,
    placedInstances,
    chosenPoses,
    resolvedParams: {
      gridX: params.gridX,
      gridY: params.gridY,
      heightUnits: params.heightUnits,
      wallThickness: params.wallThickness,
      floorThickness: params.floorThickness,
      magnetHoles: params.magnetHoles,
      labelLip: false,
    },
    isAutoSized: false,
    warnings: Array.from(new Set(warnings)),
  }
}

export function buildGenericShapeCavityBin(
  params: ParametricCavityBinParams,
  spec: GridfinitySpec,
  _context: TemplateBuildContext,
): TemplateBuildOutput {
  void _context

  const plan = resolveGenericShapeCavityPlan(params, spec)
  const solid = createBaseBinSolid(plan.resolvedParams, spec)
  const cavities: Geom3[] = []

  for (const instance of plan.placedInstances) {
    const entry = params.shapeEntries.find((candidate) => candidate.id === instance.entryId)

    if (!entry) {
      throw new Error('内部求解失败：缺少 shape entry。')
    }

    const normalized = normalizeShapeEntry(entry)
    const cavityGeometry = createPoseGeometry(
      normalized,
      instance.pose,
      params.xyClearance,
    )
    cavities.push(
      translate([instance.centerX, instance.centerY, plan.cavityBottomZ], cavityGeometry) as Geom3,
    )

    const entryBottomZ = Math.max(
      plan.cavityBottomZ + instance.cavityHeight - SHAPE_BOOLEAN_OVERLAP_MM,
      plan.cavityBottomZ,
    )
    const openingGeometry = createTopOpeningGeometry(
      normalized,
      instance.pose,
      params.xyClearance,
      entryBottomZ,
      plan.cavityTopZ,
      instance.footprintX,
      instance.footprintY,
    )

    if (openingGeometry) {
      cavities.push(
        translate([instance.centerX, instance.centerY, 0], openingGeometry) as Geom3,
      )
    }
  }

  if (cavities.length === 0) {
    return {
      geometry: solid,
      warnings: plan.warnings,
    }
  }

  const carved = subtract(solid, cavities.length === 1 ? cavities[0] : (union(...cavities) as Geom3))

  return {
    geometry: carved,
    warnings: plan.warnings,
  }
}

function searchPackedLayout(
  entries: ResolvedEntryPose[],
  innerX: number,
  innerY: number,
  interItemGap: number,
  arrangementMode: ShapeArrangementMode,
) {
  const areaLowerBound = entries.reduce(
    (sum, item) =>
      sum +
      item.entry.quantity *
        ((item.candidate.footprintX + interItemGap) * (item.candidate.footprintY + interItemGap)),
    0,
  )

  if (areaLowerBound > (innerX + interItemGap) * (innerY + interItemGap) + 0.001) {
    return null
  }

  return packResolvedItems(entries, innerX, innerY, interItemGap, arrangementMode)
}

function packResolvedItems(
  chosen: ResolvedEntryPose[],
  innerX: number,
  innerY: number,
  interItemGap: number,
  arrangementMode: ShapeArrangementMode,
) {
  const items = chosen.flatMap((item) =>
    Array.from({ length: item.entry.quantity }, (_, quantityIndex) => ({
      id: `${item.entry.id}-${item.candidate.pose}-${quantityIndex + 1}`,
      entryId: item.entry.id,
      label: item.entry.label,
      kind: item.entry.kind,
      pose: item.candidate.pose,
      poseLabel: item.candidate.label,
      rotationX: item.candidate.rotationX,
      rotationY: item.candidate.rotationY,
      rotationZ: item.candidate.rotationZ,
      footprintX: item.candidate.footprintX,
      footprintY: item.candidate.footprintY,
      cavityHeight: item.candidate.cavityHeight,
      packWidth: roundMm(item.candidate.footprintX + interItemGap),
      packHeight: roundMm(item.candidate.footprintY + interItemGap),
      area: item.candidate.footprintX * item.candidate.footprintY,
      quantityIndex,
    })),
  )

  items.sort((left, right) =>
    arrangementMode === 'y-first'
      ? right.packWidth - left.packWidth ||
        right.packHeight - left.packHeight ||
        right.cavityHeight - left.cavityHeight ||
        right.area - left.area ||
        left.entryId.localeCompare(right.entryId) ||
        left.quantityIndex - right.quantityIndex
      : right.packHeight - left.packHeight ||
        right.packWidth - left.packWidth ||
        right.cavityHeight - left.cavityHeight ||
        right.area - left.area ||
        left.entryId.localeCompare(right.entryId) ||
        left.quantityIndex - right.quantityIndex,
  )

  const packed = packItemsAlongAxes(
    items,
    innerX + interItemGap,
    innerY + interItemGap,
    arrangementMode,
  )

  if (!packed) {
    return null
  }

  const containerWidth = innerX + interItemGap
  const containerHeight = innerY + interItemGap
  const positioned = packed.map((item) => ({
    ...item,
    centerX: roundMm(item.x + item.packWidth / 2 - containerWidth / 2),
    centerY: roundMm(item.y + item.packHeight / 2 - containerHeight / 2),
  }))
  const bounds = positioned.reduce(
    (current, item) => ({
      minX: Math.min(current.minX, item.centerX - item.footprintX / 2),
      maxX: Math.max(current.maxX, item.centerX + item.footprintX / 2),
      minY: Math.min(current.minY, item.centerY - item.footprintY / 2),
      maxY: Math.max(current.maxY, item.centerY + item.footprintY / 2),
    }),
    {
      minX: Infinity,
      maxX: -Infinity,
      minY: Infinity,
      maxY: -Infinity,
    },
  )
  const offsetX = roundMm((bounds.minX + bounds.maxX) / 2)
  const offsetY = roundMm((bounds.minY + bounds.maxY) / 2)

  return {
    items: positioned.map((item) => ({
      ...item,
      centerX: roundMm(item.centerX - offsetX),
      centerY: roundMm(item.centerY - offsetY),
    })),
  }
}

function packItemsAlongAxes(
  items: PackItem[],
  width: number,
  height: number,
  arrangementMode: ShapeArrangementMode,
): PackedItem[] | null {
  if (arrangementMode === 'y-first') {
    return packItemsAlongColumns(items, width, height)
  }

  return packItemsAlongRows(items, width, height)
}

function packItemsAlongRows(
  items: PackItem[],
  width: number,
  height: number,
) {
  const packed: PackedItem[] = []
  let cursorX = 0
  let cursorY = 0
  let rowHeight = 0

  for (const item of items) {
    if (item.packWidth > width + 0.001 || item.packHeight > height + 0.001) {
      return null
    }

    if (cursorX > 0 && cursorX + item.packWidth > width + 0.001) {
      cursorX = 0
      cursorY = roundMm(cursorY + rowHeight)
      rowHeight = 0
    }

    if (cursorY + item.packHeight > height + 0.001) {
      return null
    }

    packed.push({
      ...item,
      x: roundMm(cursorX),
      y: roundMm(cursorY),
      width: item.packWidth,
      height: item.packHeight,
      centerX: 0,
      centerY: 0,
    })
    cursorX = roundMm(cursorX + item.packWidth)
    rowHeight = Math.max(rowHeight, item.packHeight)
  }

  return packed
}

function packItemsAlongColumns(
  items: PackItem[],
  width: number,
  height: number,
) {
  const packed: PackedItem[] = []
  let cursorX = 0
  let cursorY = 0
  let columnWidth = 0

  for (const item of items) {
    if (item.packWidth > width + 0.001 || item.packHeight > height + 0.001) {
      return null
    }

    if (cursorY > 0 && cursorY + item.packHeight > height + 0.001) {
      cursorY = 0
      cursorX = roundMm(cursorX + columnWidth)
      columnWidth = 0
    }

    if (cursorX + item.packWidth > width + 0.001) {
      return null
    }

    packed.push({
      ...item,
      x: roundMm(cursorX),
      y: roundMm(cursorY),
      width: item.packWidth,
      height: item.packHeight,
      centerX: 0,
      centerY: 0,
    })
    cursorY = roundMm(cursorY + item.packHeight)
    columnWidth = Math.max(columnWidth, item.packWidth)
  }

  return packed
}

function sortPoseCandidatesForCurrentBox(
  candidates: GenericShapePoseCandidate[],
  usableCavityDepthMm: number,
  preferredTopClearanceMm: number,
) {
  return [...candidates].sort((left, right) => {
    const leftOverflow = Math.max(0, left.cavityHeight - usableCavityDepthMm)
    const rightOverflow = Math.max(0, right.cavityHeight - usableCavityDepthMm)

    if (leftOverflow !== rightOverflow) {
      return leftOverflow - rightOverflow
    }

    const leftClearanceDelta = Math.abs(
      Math.max(0, usableCavityDepthMm - left.cavityHeight) - preferredTopClearanceMm,
    )
    const rightClearanceDelta = Math.abs(
      Math.max(0, usableCavityDepthMm - right.cavityHeight) - preferredTopClearanceMm,
    )

    return (
      leftClearanceDelta - rightClearanceDelta ||
      left.footprintY - right.footprintY ||
      left.footprintX - right.footprintX ||
      left.cavityHeight - right.cavityHeight
    )
  })
}

function resolveManualPoseCandidate(
  normalized: NormalizedShapeEntry,
  entry: GenericShapeEntry,
  xyClearance: number,
  maxObjectHeight: number,
) {
  const pose = resolvePoseFromQuarterTurns(
    entry.rotationX,
    entry.rotationY,
    entry.rotationZ,
  )

  return buildPoseCandidate(
    normalized,
    pose,
    getRotationLabel(entry.rotationX, entry.rotationY, entry.rotationZ),
    xyClearance,
    maxObjectHeight,
    entry.rotationX,
    entry.rotationY,
    entry.rotationZ,
  )
}

function buildPoseCandidate(
  normalized: NormalizedShapeEntry,
  pose: GenericShapePose,
  label: string,
  xyClearance: number,
  maxObjectHeight: number,
  rotationX: QuarterTurn,
  rotationY: QuarterTurn,
  rotationZ: QuarterTurn,
) {
  const geometry = createPoseGeometry(normalized, pose, xyClearance)
  const [[minX, minY, minZ], [maxX, maxY, maxZ]] = measureBoundingBox(geometry) as [
    [number, number, number],
    [number, number, number],
  ]
  const footprintX = roundMm(maxX - minX)
  const footprintY = roundMm(maxY - minY)
  const cavityHeight = roundMm(maxZ - minZ)

  if (cavityHeight > maxObjectHeight + 0.001) {
    return null
  }

  return {
    pose,
    label,
    rotationX,
    rotationY,
    rotationZ,
    footprintX,
    footprintY,
    cavityHeight,
  } satisfies GenericShapePoseCandidate
}

function createPoseGeometry(
  normalized: NormalizedShapeEntry,
  pose: GenericShapePose,
  xyClearance: number,
) {
  const segments = getShapeSegments(normalized)
  const base = createPocketBetween(
    normalized.width,
    normalized.depth,
    0,
    normalized.height,
    0,
    0,
    normalized.cornerRadius,
    segments,
  ) as Geom3
  let rotated = base

  if (pose === 'flat-rotated') {
    rotated = rotateZ(Math.PI / 2, rotated) as Geom3
  }

  if (pose === 'vertical-on-width') {
    rotated = rotateY(Math.PI / 2, rotated) as Geom3
  }

  if (pose === 'vertical-on-depth') {
    rotated = rotateX(Math.PI / 2, rotated) as Geom3
  }

  const normalizedGeometry = normalizePoseGeometry(rotated)

  if (xyClearance <= 0) {
    return normalizedGeometry
  }

  if (normalized.kind === 'rectangle') {
    const [[minX, minY, minZ], [maxX, maxY, maxZ]] = measureBoundingBox(normalizedGeometry) as [
      [number, number, number],
      [number, number, number],
    ]

    return cuboid({
      size: [
        roundMm(maxX - minX + xyClearance * 2),
        roundMm(maxY - minY + xyClearance * 2),
        roundMm(maxZ - minZ),
      ],
      center: [0, 0, roundMm((maxZ - minZ) / 2)],
    }) as Geom3
  }

  const [[minX, minY, minZ], [maxX, maxY, maxZ]] = measureBoundingBox(normalizedGeometry) as [
    [number, number, number],
    [number, number, number],
  ]
  const clearanced = expand(
    {
      delta: xyClearance,
      corners: 'round',
      segments: SHAPE_CLEARANCE_SEGMENTS,
    },
    normalizedGeometry,
  ) as Geom3
  const clip = cuboid({
    size: [
      maxX - minX + xyClearance * 4 + 2,
      maxY - minY + xyClearance * 4 + 2,
      maxZ - minZ,
    ],
    center: [0, 0, (maxZ - minZ) / 2],
  })

  return intersect(clearanced, clip) as Geom3
}

function createTopOpeningGeometry(
  normalized: NormalizedShapeEntry,
  pose: GenericShapePose,
  xyClearance: number,
  bottomZ: number,
  topZ: number,
  footprintX: number,
  footprintY: number,
) {
  if (topZ - bottomZ <= 0.01) {
    return null
  }

  if (pose === 'flat' || pose === 'flat-rotated') {
    const profile = getFlatOpeningProfile(normalized, pose, xyClearance)

    return createPocketBetween(
      profile.width,
      profile.depth,
      bottomZ,
      topZ,
      0,
      0,
      profile.cornerRadius,
      getShapeSegments(normalized),
    ) as Geom3
  }

  return cuboid({
    size: [footprintX, footprintY, topZ - bottomZ],
    center: [0, 0, bottomZ + (topZ - bottomZ) / 2],
  }) as Geom3
}

function getFlatOpeningProfile(
  normalized: NormalizedShapeEntry,
  pose: GenericShapePose,
  xyClearance: number,
) {
  const width =
    pose === 'flat-rotated' ? normalized.depth : normalized.width
  const depth =
    pose === 'flat-rotated' ? normalized.width : normalized.depth
  const cornerRadius =
    normalized.kind === 'rectangle'
      ? 0
      : normalized.cornerRadius + xyClearance

  return {
    width: roundMm(width + xyClearance * 2),
    depth: roundMm(depth + xyClearance * 2),
    cornerRadius: roundMm(cornerRadius),
  }
}

function getShapeSegments(normalized: Pick<NormalizedShapeEntry, 'kind' | 'width'>) {
  return normalized.kind === 'rectangle' ? 16 : Math.max(18, normalized.width > 40 ? 28 : 22)
}

function normalizePoseGeometry(geometry: Geom3) {
  const [[minX, minY, minZ], [maxX, maxY]] = measureBoundingBox(geometry) as [
    [number, number, number],
    [number, number, number],
  ]

  return translate(
    [
      -(minX + maxX) / 2,
      -(minY + maxY) / 2,
      -minZ,
    ],
    geometry,
  ) as Geom3
}

function normalizeShapeEntry(entry: GenericShapeEntry): NormalizedShapeEntry {
  if (entry.kind === 'circle') {
    return {
      id: entry.id,
      label: entry.label,
      kind: entry.kind,
      quantity: entry.quantity,
      width: entry.diameter,
      depth: entry.diameter,
      height: entry.height,
      cornerRadius: entry.diameter / 2,
    }
  }

  if (entry.kind === 'capsule') {
    return {
      id: entry.id,
      label: entry.label,
      kind: entry.kind,
      quantity: entry.quantity,
      width: entry.length,
      depth: entry.diameter,
      height: entry.height,
      cornerRadius: entry.diameter / 2,
    }
  }

  return {
    id: entry.id,
    label: entry.label,
    kind: entry.kind,
    quantity: entry.quantity,
    width: entry.width,
    depth: entry.depth,
    height: entry.height,
    cornerRadius: entry.kind === 'rounded-rectangle' ? entry.cornerRadius : 0,
  }
}

function resolvePoseFromQuarterTurns(
  rotationX: QuarterTurn,
  rotationY: QuarterTurn,
  rotationZ: QuarterTurn,
): GenericShapePose {
  const rotatedHeightAxis = rotatePointByQuarterTurns(
    [0, 0, 1],
    rotationX,
    rotationY,
    rotationZ,
  )
  const rotatedWidthAxis = rotatePointByQuarterTurns(
    [1, 0, 0],
    rotationX,
    rotationY,
    rotationZ,
  )

  if (Math.abs(rotatedHeightAxis[2]) === 1) {
    return Math.abs(rotatedWidthAxis[1]) === 1 ? 'flat-rotated' : 'flat'
  }

  if (Math.abs(rotatedHeightAxis[0]) === 1) {
    return 'vertical-on-width'
  }

  return 'vertical-on-depth'
}

function getRotationLabel(
  rotationX: QuarterTurn,
  rotationY: QuarterTurn,
  rotationZ: QuarterTurn,
) {
  return `固定旋转 X ${formatQuarterTurn(rotationX)} / Y ${formatQuarterTurn(rotationY)} / Z ${formatQuarterTurn(rotationZ)}`
}

function formatQuarterTurn(turns: QuarterTurn) {
  return `${turns * 90}°`
}

function rotatePointByQuarterTurns(
  point: [number, number, number],
  rotationX: QuarterTurn,
  rotationY: QuarterTurn,
  rotationZ: QuarterTurn,
) {
  let next = point

  next = rotatePoint(next, 'x', rotationX)
  next = rotatePoint(next, 'y', rotationY)
  next = rotatePoint(next, 'z', rotationZ)

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
