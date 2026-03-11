import { booleans, extrusions, geometries, maths, primitives, transforms } from '@jscad/modeling'

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
  const footLayout = getBottomFootLayout(params, spec)

  const feet = footLayout.centers.map(([x, y]) =>
    translate([x, y, 0], createChamferedFoot(footLayout, metrics.segments)),
  )
  const foot = feet.length === 1 ? feet[0] : union(...feet)

  const upperHeight = Math.max(metrics.height - spec.footHeight, 1)
  const shell = translate(
    [0, 0, spec.footHeight],
    createVerticalRoundedPrism(
      metrics.outerX,
      metrics.outerY,
      upperHeight,
      spec.cornerRadius,
      metrics.segments,
    ),
  )

  let result = union(foot, shell)

  if (params.labelLip) {
    result = union(result, createLabelLip(metrics.outerX, metrics.outerY, metrics.height, spec))
  }

  if (params.magnetHoles) {
    const holeOffset = footLayout.footSize / 2 - spec.magnetDiameter * 0.9
    const magnetHoles = footLayout.centers.flatMap(([centerX, centerY]) =>
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

    result = subtract(result, ...magnetHoles)
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
  const shape = roundedRectangle({
    size: [size, size],
    roundRadius: Math.min(radius, size / 2 - 0.05),
    segments,
  })
  const baseSlice = slice.fromSides(geom2.toSides(shape))

  return slice.transform(
    mat4.fromTranslation(mat4.create(), [0, 0, z]),
    baseSlice,
  )
}
