import type { BaseBinParams, GridfinitySpec } from './types'

export const GRIDFINITY_SPEC_VERSION = 'gridfinity-community-bin-v1'

export const defaultGridfinitySpec: GridfinitySpec = {
  version: GRIDFINITY_SPEC_VERSION,
  pitchXY: 42,
  heightUnit: 7,
  outerUnitSize: 41.5,
  tolerance: 0.15,
  cornerRadius: 3.2,
  footInset: 2.4,
  footHeight: 4.75,
  magnetDiameter: 6,
  magnetDepth: 2,
  labelDepth: 5.2,
  labelHeight: 2.4,
}

export interface BinMetrics {
  outerX: number
  outerY: number
  innerX: number
  innerY: number
  height: number
  innerRadius: number
  segments: number
}

export function gridUnitsToMillimeters(
  units: number,
  spec: GridfinitySpec = defaultGridfinitySpec,
) {
  return units * spec.pitchXY - (spec.pitchXY - spec.outerUnitSize)
}

export function heightUnitsToMillimeters(
  units: number,
  spec: GridfinitySpec = defaultGridfinitySpec,
) {
  return units * spec.heightUnit
}

export function getGridUnitCenters(
  units: number,
  spec: GridfinitySpec = defaultGridfinitySpec,
) {
  const start = -((units - 1) * spec.pitchXY) / 2

  return Array.from({ length: units }, (_, index) => start + index * spec.pitchXY)
}

export function getUnitFootSize(spec: GridfinitySpec = defaultGridfinitySpec) {
  return spec.outerUnitSize - spec.footInset * 2
}

export function getBinMetrics(
  params: Pick<
    BaseBinParams,
    'gridX' | 'gridY' | 'heightUnits' | 'wallThickness'
  >,
  spec: GridfinitySpec = defaultGridfinitySpec,
): BinMetrics {
  const outerX = gridUnitsToMillimeters(params.gridX, spec)
  const outerY = gridUnitsToMillimeters(params.gridY, spec)
  const height = heightUnitsToMillimeters(params.heightUnits, spec)
  const innerX = outerX - params.wallThickness * 2
  const innerY = outerY - params.wallThickness * 2
  const innerRadius = Math.max(0.8, spec.cornerRadius - params.wallThickness * 0.45)
  const segments = outerX > 84 || outerY > 84 ? 40 : 32

  return {
    outerX,
    outerY,
    innerX,
    innerY,
    height,
    innerRadius,
    segments,
  }
}
