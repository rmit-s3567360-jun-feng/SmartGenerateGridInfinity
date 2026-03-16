import { booleans, extrusions, geometries, maths, primitives, transforms } from '@jscad/modeling'
import type Geom3 from '@jscad/modeling/src/geometries/geom3/type'

import { getBinMetrics, getGridUnitCenters, getUnitFootSize } from './spec'
import type { BaseBinParams, GridfinitySpec } from './types'

const { subtract, union } = booleans
const { extrudeFromSlices, extrudeLinear, slice } = extrusions
const { geom2 } = geometries
const { mat4 } = maths
const { roundedRectangle, cylinder, cuboid } = primitives
const { translate } = transforms

export function createBaseBinSolid(
  params: BaseBinParams,
  spec: GridfinitySpec,
) {
  const metrics = getBinMetrics(params, spec)
  let result = createGridfinityMountBase(
    params.gridX,
    params.gridY,
    metrics.height,
    params.magnetHoles,
    spec,
  )

  if (params.labelLip) {
    result = union(result, createLabelLip(metrics.outerX, metrics.outerY, metrics.height, spec))
  }

  return result
}

export function createGridfinityMountBase(
  gridX: number,
  gridY: number,
  baseHeightMm: number,
  magnetHoles: boolean,
  spec: GridfinitySpec,
  topFootprint: [number, number] | null = null,
) {
  const metrics = getBinMetrics(
    {
      gridX,
      gridY,
      heightUnits: Math.max(2, Math.ceil(baseHeightMm / spec.heightUnit)),
      wallThickness: 2,
    },
    spec,
  )
  const footLayout = getBottomFootLayout({ gridX, gridY }, spec)
  const foot = createFootCluster(footLayout, metrics.segments)
  const upperHeight = Math.max(baseHeightMm - spec.footHeight, 0.2)
  const shellTopWidth = clampTopFootprint(topFootprint?.[0] ?? metrics.outerX, metrics.outerX)
  const shellTopDepth = clampTopFootprint(topFootprint?.[1] ?? metrics.outerY, metrics.outerY)
  const shell = translate(
    [0, 0, spec.footHeight],
    createAdapterShell(
      metrics.outerX,
      metrics.outerY,
      upperHeight,
      shellTopWidth,
      shellTopDepth,
      spec.cornerRadius,
      metrics.segments,
    ),
  )

  let result = union(foot, shell)

  if (magnetHoles) {
    result = subtract(result, ...createMagnetHoles(footLayout, spec))
  }

  return result
}

export function createGridfinityStackableBlock(
  gridX: number,
  gridY: number,
  totalHeightMm: number,
  magnetHoles: boolean,
  stackingLip: boolean,
  spec: GridfinitySpec,
) {
  const metrics = getBinMetrics(
    {
      gridX,
      gridY,
      heightUnits: Math.max(2, Math.ceil(totalHeightMm / spec.heightUnit)),
      wallThickness: 2,
    },
    spec,
  )
  const footLayout = getBottomFootLayout({ gridX, gridY }, spec)
  const feet = createFootCluster(footLayout, metrics.segments)
  const lipHeight = stackingLip ? spec.footHeight : 0
  const bodyHeight = Math.max(totalHeightMm - spec.footHeight - lipHeight, 0.2)
  const body = translate(
    [0, 0, spec.footHeight],
    createVerticalRoundedPrism(
      metrics.outerX,
      metrics.outerY,
      bodyHeight,
      spec.cornerRadius,
      metrics.segments,
    ),
  )
  let result = union(feet, body)

  if (stackingLip) {
    const lip = createStackingLip(
      footLayout,
      totalHeightMm - spec.footHeight,
      metrics.segments,
      spec,
    )

    result = union(result, lip)
  }

  if (magnetHoles) {
    result = subtract(result, ...createMagnetHoles(footLayout, spec))
  }

  return result
}

export function getBottomFootLayout(
  params: Pick<BaseBinParams, 'gridX' | 'gridY'>,
  spec: GridfinitySpec,
) {
  const footSize = getUnitFootSize(spec)
  const shoulderSize = spec.outerUnitSize
  const bottomChamferInset = 0.8
  const bottomSize = footSize - bottomChamferInset * 2
  const bottomChamferHeight = 0.8
  const straightHeight = 1.2
  const topChamferHeight = Math.max(
    0.8,
    spec.footHeight - bottomChamferHeight - straightHeight,
  )
  const footRadius = Math.max(1.2, spec.cornerRadius - 1.4)
  const shoulderRadius = Math.min(spec.cornerRadius, shoulderSize / 2 - 0.05)
  const bottomRadius = Math.min(footRadius, bottomSize / 2 - 0.05)
  const xCenters = getGridUnitCenters(params.gridX, spec)
  const yCenters = getGridUnitCenters(params.gridY, spec)
  const centers = xCenters.flatMap((x) => yCenters.map((y) => [x, y] as [number, number]))

  return {
    shoulderSize,
    footSize,
    bottomSize,
    shoulderRadius,
    footRadius,
    bottomRadius,
    bottomChamferHeight,
    straightHeight,
    topChamferHeight,
    centers,
  }
}

export function getInteriorFloorZ(
  params: Pick<BaseBinParams, 'floorThickness'>,
  spec: GridfinitySpec,
) {
  return spec.footHeight + params.floorThickness
}

export function createPocketBetween(
  width: number,
  depth: number,
  bottomZ: number,
  topZ: number,
  centerX: number,
  centerY: number,
  cornerRadius: number,
  segments: number,
) {
  const height = topZ - bottomZ
  const maxRadius = Math.min(width, depth, height) / 2 - 0.05

  if (height <= 0) {
    throw new Error('生成 cavity 时出现无效高度。')
  }

  if (maxRadius <= 0.05) {
    return cuboid({
      size: [width, depth, height],
      center: [centerX, centerY, bottomZ + height / 2],
    })
  }

  return translate(
    [centerX, centerY, bottomZ],
    createVerticalRoundedPrism(
      width,
      depth,
      height,
      Math.min(cornerRadius, maxRadius),
      segments,
    ),
  )
}

export function createVerticalHole(
  x: number,
  y: number,
  radius: number,
  height: number,
  bottomZ: number,
  segments = 32,
) {
  return translate(
    [x, y, bottomZ + height / 2],
    cylinder({
      radius,
      height,
      segments,
    }),
  )
}

function createFootCluster(
  footLayout: ReturnType<typeof getBottomFootLayout>,
  segments: number,
): Geom3 {
  const feet = footLayout.centers.map(([x, y]) =>
    translate([x, y, 0], createChamferedFoot(footLayout, segments)),
  )

  return (feet.length === 1 ? feet[0] : union(...feet)) as Geom3
}

function createMagnetHoles(
  footLayout: ReturnType<typeof getBottomFootLayout>,
  spec: GridfinitySpec,
) {
  const holeOffset = footLayout.footSize / 2 - spec.magnetDiameter * 0.9

  return footLayout.centers.flatMap(([centerX, centerY]) =>
    [
      [holeOffset, holeOffset],
      [holeOffset, -holeOffset],
      [-holeOffset, holeOffset],
      [-holeOffset, -holeOffset],
    ].map(([offsetX, offsetY]) =>
      translate(
        [centerX + offsetX, centerY + offsetY, spec.magnetDepth / 2],
        cylinder({
          radius: spec.magnetDiameter / 2,
          height: spec.magnetDepth + 0.3,
          segments: 32,
        }),
      ),
    ),
  )
}

function createLabelLip(
  outerX: number,
  outerY: number,
  height: number,
  spec: GridfinitySpec,
) {
  return cuboid({
    size: [outerX * 0.58, spec.labelDepth, spec.labelHeight],
    center: [
      0,
      outerY / 2 - spec.labelDepth / 2 - 0.4,
      height - spec.labelHeight * 0.7,
    ],
  })
}

function createVerticalRoundedPrism(
  width: number,
  depth: number,
  height: number,
  cornerRadius: number,
  segments: number,
) {
  return extrudeLinear(
    { height },
    roundedRectangle({
      size: [width, depth],
      roundRadius: Math.min(cornerRadius, Math.min(width, depth) / 2 - 0.05),
      segments,
    }),
  )
}

function createStackingLip(
  profile: ReturnType<typeof getBottomFootLayout>,
  bottomZ: number,
  segments: number,
  spec: GridfinitySpec,
) {
  const sizeShrink = spec.tolerance * 2
  const radiusShrink = spec.tolerance
  const sliceSpecs = [
    {
      size: Math.max(1.2, profile.shoulderSize - sizeShrink),
      radius: Math.max(0.8, profile.shoulderRadius - radiusShrink),
      z: 0,
    },
    {
      size: Math.max(1.2, profile.footSize - sizeShrink),
      radius: Math.max(0.8, profile.footRadius - radiusShrink),
      z: profile.topChamferHeight,
    },
    {
      size: Math.max(1.2, profile.footSize - sizeShrink),
      radius: Math.max(0.8, profile.footRadius - radiusShrink),
      z: profile.topChamferHeight + profile.straightHeight,
    },
    {
      size: Math.max(1.2, profile.bottomSize - sizeShrink),
      radius: Math.max(0.8, profile.bottomRadius - radiusShrink),
      z:
        profile.topChamferHeight +
        profile.straightHeight +
        profile.bottomChamferHeight,
    },
  ] as const
  const lips = profile.centers.map(([x, y]) =>
    translate(
      [x, y, bottomZ],
      extrudeFromSlices(
        {
          numberOfSlices: sliceSpecs.length,
          callback: (_progress, index) =>
            createFootSlice(
              sliceSpecs[index].size,
              sliceSpecs[index].radius,
              sliceSpecs[index].z,
              segments,
            ),
        },
        createFootSlice(
          sliceSpecs[0].size,
          sliceSpecs[0].radius,
          sliceSpecs[0].z,
          segments,
        ),
      ),
    ),
  )

  return (lips.length === 1 ? lips[0] : union(...lips)) as Geom3
}

function createAdapterShell(
  baseWidth: number,
  baseDepth: number,
  height: number,
  topWidth: number,
  topDepth: number,
  cornerRadius: number,
  segments: number,
) {
  if (
    Math.abs(baseWidth - topWidth) < 0.01 &&
    Math.abs(baseDepth - topDepth) < 0.01
  ) {
    return createVerticalRoundedPrism(
      baseWidth,
      baseDepth,
      height,
      cornerRadius,
      segments,
    )
  }

  return extrudeFromSlices(
    {
      numberOfSlices: 2,
      callback: (_progress, index) =>
        createRoundedRectSlice(
          index === 0 ? baseWidth : topWidth,
          index === 0 ? baseDepth : topDepth,
          cornerRadius,
          index === 0 ? 0 : height,
          segments,
        ),
    },
    createRoundedRectSlice(baseWidth, baseDepth, cornerRadius, 0, segments),
  )
}

function createChamferedFoot(
  profile: ReturnType<typeof getBottomFootLayout>,
  segments: number,
) {
  const sliceSpecs = [
    {
      size: profile.bottomSize,
      radius: profile.bottomRadius,
      z: 0,
    },
    {
      size: profile.footSize,
      radius: profile.footRadius,
      z: profile.bottomChamferHeight,
    },
    {
      size: profile.footSize,
      radius: profile.footRadius,
      z: profile.bottomChamferHeight + profile.straightHeight,
    },
    {
      size: profile.shoulderSize,
      radius: profile.shoulderRadius,
      z:
        profile.bottomChamferHeight +
        profile.straightHeight +
        profile.topChamferHeight,
    },
  ] as const

  return extrudeFromSlices(
    {
      numberOfSlices: sliceSpecs.length,
      callback: (_progress, index) =>
        createFootSlice(
          sliceSpecs[index].size,
          sliceSpecs[index].radius,
          sliceSpecs[index].z,
          segments,
        ),
    },
    createFootSlice(
      sliceSpecs[0].size,
      sliceSpecs[0].radius,
      sliceSpecs[0].z,
      segments,
    ),
  )
}

function createFootSlice(
  size: number,
  radius: number,
  z: number,
  segments: number,
) {
  return createRoundedRectSlice(size, size, radius, z, segments)
}

function createRoundedRectSlice(
  width: number,
  depth: number,
  radius: number,
  z: number,
  segments: number,
) {
  const shape = roundedRectangle({
    size: [width, depth],
    roundRadius: Math.min(radius, Math.min(width, depth) / 2 - 0.05),
    segments,
  })
  const baseSlice = slice.fromSides(geom2.toSides(shape))

  return slice.transform(mat4.fromTranslation(mat4.create(), [0, 0, z]), baseSlice)
}

function clampTopFootprint(value: number, outerSpan: number) {
  return Math.min(outerSpan, Math.max(1.2, value))
}
