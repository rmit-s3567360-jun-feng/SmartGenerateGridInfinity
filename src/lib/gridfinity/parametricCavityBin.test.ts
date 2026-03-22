import { booleans, measurements, primitives } from '@jscad/modeling'

import { createBaseBinSolid } from './base'
import { generateModel } from './generation'
import {
  createDefaultGenericShapeEntry,
  resolveGenericShapeCavityPlan,
} from './genericShapeCavity'
import { defaultGridfinitySpec } from './spec'
import { getTemplateDefinition } from './templates'
import type { ParametricCavityBinParams } from './types'

const { intersect, subtract } = booleans
const { measureVolume } = measurements
const { cuboid } = primitives

function getDefaultParametricCavityParams() {
  return structuredClone(
    getTemplateDefinition('parametric-cavity-bin').defaultParams as ParametricCavityBinParams,
  )
}

describe('parametric cavity bin', () => {
  it('validates that cavity mode needs at least one shape', () => {
    const template = getTemplateDefinition('parametric-cavity-bin')
    const emptyParsed = template.schema.safeParse({
      ...getDefaultParametricCavityParams(),
      shapeEntries: [],
    })

    expect(emptyParsed.success).toBe(false)
  })

  it('fits a tall repeated part only after the user rotates it manually', () => {
    const params: ParametricCavityBinParams = {
      ...getDefaultParametricCavityParams(),
      gridX: 3,
      gridY: 1,
      heightUnits: 6,
      shapeEntries: [
        {
          ...createDefaultGenericShapeEntry(1),
          label: '矩形块',
          quantity: 5,
          width: 30,
          depth: 25,
          height: 14,
          rotationX: 1,
          rotationY: 0,
          rotationZ: 0,
        },
      ],
    }
    const unrotatedParams: ParametricCavityBinParams = {
      ...params,
      shapeEntries: [
        {
          ...params.shapeEntries[0],
          rotationX: 0,
          rotationY: 0,
          rotationZ: 0,
        },
      ],
    }
    const plan = resolveGenericShapeCavityPlan(params, defaultGridfinitySpec)

    expect(plan.chosenPoses[0].pose).toBe('vertical-on-depth')
    expect(plan.totalCavityCount).toBe(5)
    expect(() => resolveGenericShapeCavityPlan(unrotatedParams, defaultGridfinitySpec)).toThrow(
      '当前盒体尺寸不足以容纳当前布局。',
    )
  })

  it('allows the current manual box to expose the top when the object protrudes on Z', () => {
    const params: ParametricCavityBinParams = {
      ...getDefaultParametricCavityParams(),
      gridX: 1,
      gridY: 1,
      heightUnits: 2,
      shapeEntries: [
        {
          ...createDefaultGenericShapeEntry(1),
          label: '高块',
          quantity: 1,
          width: 24,
          depth: 16,
          height: 18,
        },
      ],
    }
    const plan = resolveGenericShapeCavityPlan(params, defaultGridfinitySpec)

    expect(plan.protrusionHeightMm).toBeGreaterThan(0)
    expect(plan.usableCavityDepthMm).toBeLessThan(plan.placedInstances[0].cavityHeight)
    expect(plan.warnings.some((warning) => warning.includes('顶部露出'))).toBe(true)
  })

  it('arranges repeated cavities row by row when arrangement mode is x-first', () => {
    const params: ParametricCavityBinParams = {
      ...getDefaultParametricCavityParams(),
      arrangementMode: 'x-first',
      gridX: 2,
      gridY: 2,
      heightUnits: 4,
      shapeEntries: [
        {
          ...createDefaultGenericShapeEntry(1),
          label: '矩形块',
          quantity: 4,
          width: 25,
          depth: 16,
          height: 8,
        },
      ],
    }
    const plan = resolveGenericShapeCavityPlan(params, defaultGridfinitySpec)
    const yLevels = Array.from(
      new Set(plan.placedInstances.map((instance) => instance.centerY.toFixed(3))),
    )
      .map((value) => Number(value))
      .sort((left, right) => left - right)
    const firstRow = plan.placedInstances
      .filter((instance) => Math.abs(instance.centerY - yLevels[0]) < 0.001)
      .sort((left, right) => left.centerX - right.centerX)

    expect(yLevels).toHaveLength(2)
    expect(firstRow).toHaveLength(2)
    expect(firstRow[0].centerX).toBeLessThan(firstRow[1].centerX)
  })

  it('arranges repeated cavities column by column when arrangement mode is y-first', () => {
    const params: ParametricCavityBinParams = {
      ...getDefaultParametricCavityParams(),
      arrangementMode: 'y-first',
      gridX: 2,
      gridY: 2,
      heightUnits: 4,
      shapeEntries: [
        {
          ...createDefaultGenericShapeEntry(1),
          label: '矩形块',
          quantity: 6,
          width: 25,
          depth: 16,
          height: 8,
        },
      ],
    }
    const plan = resolveGenericShapeCavityPlan(params, defaultGridfinitySpec)
    const xLevels = Array.from(
      new Set(plan.placedInstances.map((instance) => instance.centerX.toFixed(3))),
    )
      .map((value) => Number(value))
      .sort((left, right) => left - right)
    const firstColumn = plan.placedInstances
      .filter((instance) => Math.abs(instance.centerX - xLevels[0]) < 0.001)
      .sort((left, right) => left.centerY - right.centerY)

    expect(xLevels).toHaveLength(2)
    expect(firstColumn).toHaveLength(4)
    expect(firstColumn[0].centerY).toBeLessThan(firstColumn[1].centerY)
  })

  it('supports fixed XYZ rotation without any automatic pose toggles', () => {
    const params: ParametricCavityBinParams = {
      ...getDefaultParametricCavityParams(),
      gridX: 1,
      gridY: 1,
      heightUnits: 4,
      shapeEntries: [
        {
          ...createDefaultGenericShapeEntry(1),
          label: '旋转块',
          quantity: 1,
          width: 16,
          depth: 10,
          height: 28,
          rotationX: 1,
          rotationY: 0,
          rotationZ: 0,
        },
      ],
    }
    const plan = resolveGenericShapeCavityPlan(params, defaultGridfinitySpec)

    expect(plan.chosenPoses[0].pose).toBe('vertical-on-depth')
    expect(plan.chosenPoses[0].rotationX).toBe(1)
    expect(plan.chosenPoses[0].rotationY).toBe(0)
    expect(plan.chosenPoses[0].rotationZ).toBe(0)
  })

  it('fails clearly when the current fixed box cannot fit the manually rotated layout', () => {
    const params: ParametricCavityBinParams = {
      ...getDefaultParametricCavityParams(),
      gridX: 2,
      gridY: 1,
      heightUnits: 4,
      shapeEntries: [
        {
          ...createDefaultGenericShapeEntry(1),
          label: '矩形块',
          quantity: 5,
          width: 30,
          depth: 25,
          height: 14,
        },
      ],
    }

    expect(() => resolveGenericShapeCavityPlan(params, defaultGridfinitySpec)).toThrow(
      '当前盒体尺寸不足以容纳当前布局。',
    )
  })

  it('centers the packed cavity group within the bin by default', () => {
    const params: ParametricCavityBinParams = {
      ...getDefaultParametricCavityParams(),
      gridX: 3,
      gridY: 2,
      heightUnits: 4,
      shapeEntries: [
        {
          ...createDefaultGenericShapeEntry(1),
          label: '矩形块',
          quantity: 2,
          width: 24,
          depth: 16,
          height: 8,
        },
        {
          ...createDefaultGenericShapeEntry(2),
          label: '圆片',
          kind: 'circle',
          quantity: 1,
          diameter: 18,
          height: 5,
        },
      ],
    }
    const plan = resolveGenericShapeCavityPlan(params, defaultGridfinitySpec)
    const bounds = plan.placedInstances.reduce(
      (current, instance) => ({
        minX: Math.min(current.minX, instance.centerX - instance.footprintX / 2),
        maxX: Math.max(current.maxX, instance.centerX + instance.footprintX / 2),
        minY: Math.min(current.minY, instance.centerY - instance.footprintY / 2),
        maxY: Math.max(current.maxY, instance.centerY + instance.footprintY / 2),
      }),
      {
        minX: Infinity,
        maxX: -Infinity,
        minY: Infinity,
        maxY: -Infinity,
      },
    )

    expect((bounds.minX + bounds.maxX) / 2).toBeCloseTo(0, 6)
    expect((bounds.minY + bounds.maxY) / 2).toBeCloseTo(0, 6)
  })

  it('keeps flat rectangle cavities square from the floor to the top opening', () => {
    const params: ParametricCavityBinParams = {
      ...getDefaultParametricCavityParams(),
      gridX: 2,
      gridY: 1,
      heightUnits: 4,
      shapeEntries: [
        {
          ...createDefaultGenericShapeEntry(1),
          label: '矩形块',
          quantity: 1,
          width: 24,
          depth: 16,
          height: 8,
        },
      ],
    }
    const plan = resolveGenericShapeCavityPlan(params, defaultGridfinitySpec)
    const { geometry } = generateModel({
      templateId: 'parametric-cavity-bin',
      params,
      specVersion: defaultGridfinitySpec.version,
    })
    const baseSolid = createBaseBinSolid(plan.resolvedParams, defaultGridfinitySpec)
    const cavity = subtract(baseSolid, geometry)
    const instance = plan.placedInstances[0]
    const probeX = instance.centerX + instance.footprintX / 2 - 0.35
    const probeY = instance.centerY + instance.footprintY / 2 - 0.35
    const lowerCornerProbe = intersect(
      cavity,
      cuboid({
        size: [0.6, 0.6, 0.6],
        center: [probeX, probeY, plan.cavityBottomZ + 1],
      }),
    )
    const upperCornerProbe = intersect(
      cavity,
      cuboid({
        size: [0.6, 0.6, 0.6],
        center: [probeX, probeY, plan.cavityTopZ - 1.6],
      }),
    )

    expect(measureVolume(lowerCornerProbe)).toBeGreaterThan(0.05)
    expect(measureVolume(upperCornerProbe)).toBeGreaterThan(0.05)
  })

  it('keeps flat rounded cavities rounded all the way to the top opening', () => {
    const params: ParametricCavityBinParams = {
      ...getDefaultParametricCavityParams(),
      gridX: 2,
      gridY: 1,
      heightUnits: 4,
      shapeEntries: [
        {
          ...createDefaultGenericShapeEntry(1),
          label: '圆角块',
          kind: 'rounded-rectangle',
          quantity: 1,
          width: 24,
          depth: 16,
          height: 12,
          cornerRadius: 4,
        },
      ],
    }
    const plan = resolveGenericShapeCavityPlan(params, defaultGridfinitySpec)
    const { geometry } = generateModel({
      templateId: 'parametric-cavity-bin',
      params,
      specVersion: defaultGridfinitySpec.version,
    })
    const baseSolid = createBaseBinSolid(plan.resolvedParams, defaultGridfinitySpec)
    const cavity = subtract(baseSolid, geometry)
    const instance = plan.placedInstances[0]
    const probeX = instance.centerX + instance.footprintX / 2 - 0.35
    const probeY = instance.centerY + instance.footprintY / 2 - 0.35
    const lowerCornerProbe = intersect(
      cavity,
      cuboid({
        size: [0.6, 0.6, 0.6],
        center: [probeX, probeY, plan.cavityBottomZ + 1],
      }),
    )
    const upperCornerProbe = intersect(
      cavity,
      cuboid({
        size: [0.6, 0.6, 0.6],
        center: [probeX, probeY, plan.cavityTopZ - 1.6],
      }),
    )

    expect(measureVolume(lowerCornerProbe)).toBeLessThan(0.01)
    expect(measureVolume(upperCornerProbe)).toBeLessThan(0.01)
  })
})
