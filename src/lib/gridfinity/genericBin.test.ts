import { booleans, measurements, primitives } from '@jscad/modeling'

import { createBaseBinSolid } from './base'
import { generateModel } from './generation'
import { defaultGridfinitySpec, getBinMetrics } from './spec'
import { getTemplateDefinition } from './templates'
import type { GenericBinParams } from './types'

const { intersect } = booleans
const { measureVolume } = measurements
const { cuboid } = primitives

function getDefaultGenericParams() {
  return structuredClone(
    getTemplateDefinition('generic-bin').defaultParams as GenericBinParams,
  )
}

describe('generic bin custom dividers', () => {
  it('moves the divider to the requested horizontal position', () => {
    const params: GenericBinParams = {
      ...getDefaultGenericParams(),
      compartmentsX: 2,
      dividerX1: 30,
    }
    const { geometry } = generateModel({
      templateId: 'generic-bin',
      params,
      specVersion: defaultGridfinitySpec.version,
    })
    const metrics = getBinMetrics(params)
    const cavityWidth = metrics.outerX - params.innerWallThicknessX * 2
    const cavityDepth = metrics.outerY - params.innerWallThicknessY * 2
    const cavityBottomZ = defaultGridfinitySpec.footHeight + params.innerWallThicknessZ
    const dividerCenterX =
      -cavityWidth / 2 + params.dividerX1 + params.dividerThickness / 2
    const dividerProbe = intersect(
      geometry,
      cuboid({
        size: [params.dividerThickness + 0.8, cavityDepth - 4, 10],
        center: [
          dividerCenterX,
          0,
          cavityBottomZ + Math.min(params.dividerHeight, 10) / 2,
        ],
      }),
    )
    const emptyCenterProbe = intersect(
      geometry,
      cuboid({
        size: [params.dividerThickness + 0.8, cavityDepth - 4, 10],
        center: [0, 0, cavityBottomZ + Math.min(params.dividerHeight, 10) / 2],
      }),
    )

    expect(measureVolume(dividerProbe)).toBeGreaterThan(150)
    expect(measureVolume(emptyCenterProbe)).toBeLessThan(20)
  })

  it('rejects divider positions that make a compartment too narrow', () => {
    expect(() =>
      generateModel({
        templateId: 'generic-bin',
        params: {
          ...getDefaultGenericParams(),
          compartmentsX: 4,
          dividerX1: 8,
          dividerX2: 12,
          dividerX3: 16,
        },
        specVersion: defaultGridfinitySpec.version,
      }),
    ).toThrow('横向隔仓位置过近')
  })

  it('collapses into a solid box when Z thickness is pushed to the limit', () => {
    const params: GenericBinParams = {
      ...getDefaultGenericParams(),
      innerWallThicknessZ: 40,
    }
    const { geometry, result } = generateModel({
      templateId: 'generic-bin',
      params,
      specVersion: defaultGridfinitySpec.version,
    })
    const solid = createBaseBinSolid(params, defaultGridfinitySpec)

    expect(measureVolume(geometry)).toBeCloseTo(measureVolume(solid), 1)
    expect(result.warnings).toContain('当前 XYZ 内壁厚度已接近实体盒，内部空腔已自动省略。')
  })
})
