import { defaultGridfinitySpec } from './spec'
import {
  resolveStlCavityBinPlan,
  stlCavityBinDefaultParams,
} from './stlCavityBin'
import type { ImportedStlSourceSummary, StlCavityBinParams } from './types'

function createSourceSummary(
  size: [number, number, number] = [40, 35, 12],
): ImportedStlSourceSummary {
  return {
    assetId: 'fixture-asset',
    name: 'fixture.stl',
    format: 'binary',
    sizeBytes: 2048,
    triangleCount: 12,
    originalBounds: {
      min: [0, 0, 0],
      max: [...size],
      size: [...size],
    },
    originalSizeMm: [...size],
  }
}

function getDefaultParams(overrides: Partial<StlCavityBinParams> = {}): StlCavityBinParams {
  return {
    ...structuredClone(stlCavityBinDefaultParams),
    source: createSourceSummary(),
    ...overrides,
  }
}

describe('stl cavity bin planning', () => {
  it('rotates the source dimensions in 90 degree steps', () => {
    const plan = resolveStlCavityBinPlan(
      getDefaultParams({
        source: createSourceSummary([10, 20, 30]),
        rotationX: 1,
      }),
      defaultGridfinitySpec,
    )

    expect(plan.rotatedSizeMm).toEqual([10, 30, 20])
  })

  it('auto-recommends the smallest compatible grid size and height', () => {
    const plan = resolveStlCavityBinPlan(getDefaultParams(), defaultGridfinitySpec)

    expect(plan.isAutoSized).toBe(true)
    expect(plan.size.gridX).toBe(2)
    expect(plan.size.gridY).toBe(2)
    expect(plan.size.heightUnits).toBe(3)
  })

  it('fails clearly when the locked footprint is too small', () => {
    expect(() =>
      resolveStlCavityBinPlan(
        getDefaultParams({
          sizeMode: 'locked',
          gridX: 1,
          gridY: 1,
          heightUnits: 3,
        }),
        defaultGridfinitySpec,
      ),
    ).toThrow('固定外部尺寸不足以容纳当前 STL 型腔')
  })

  it('fails when locked height is not enough for the cavity and top clearance', () => {
    expect(() =>
      resolveStlCavityBinPlan(
        getDefaultParams({
          source: createSourceSummary([20, 20, 18]),
          sizeMode: 'locked',
          gridX: 1,
          gridY: 1,
          heightUnits: 3,
        }),
        defaultGridfinitySpec,
      ),
    ).toThrow('固定高度不足以容纳 STL 型腔和顶部余量')
  })

  it('enables magnet holes by default for the cavity bin', () => {
    expect(stlCavityBinDefaultParams.magnetHoles).toBe(true)
  })
})
