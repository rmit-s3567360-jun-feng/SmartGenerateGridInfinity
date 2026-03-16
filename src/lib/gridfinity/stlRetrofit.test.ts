import { defaultGridfinitySpec } from './spec'
import { resolveStlRetrofitPlan, stlRetrofitDefaultParams } from './stlRetrofit'
import type { ImportedStlSourceSummary, StlRetrofitParams } from './types'

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

function getDefaultParams(overrides: Partial<StlRetrofitParams> = {}): StlRetrofitParams {
  return {
    ...structuredClone(stlRetrofitDefaultParams),
    source: createSourceSummary(),
    ...overrides,
  }
}

describe('stl retrofit planning', () => {
  it('rotates the source dimensions in 90 degree steps', () => {
    const plan = resolveStlRetrofitPlan(
      getDefaultParams({
        source: createSourceSummary([10, 20, 30]),
        rotationX: 1,
      }),
      defaultGridfinitySpec,
    )

    expect(plan.rotatedSizeMm).toEqual([10, 30, 20])
  })

  it('auto-recommends the smallest compatible grid size', () => {
    const plan = resolveStlRetrofitPlan(getDefaultParams(), defaultGridfinitySpec)

    expect(plan.isAutoSized).toBe(true)
    expect(plan.size.gridX).toBe(2)
    expect(plan.size.gridY).toBe(1)
    expect(plan.size.heightUnits).toBe(3)
  })

  it('fails clearly when the locked footprint is too small', () => {
    expect(() =>
      resolveStlRetrofitPlan(
        getDefaultParams({
          sizeMode: 'locked',
          gridX: 1,
          gridY: 1,
          heightUnits: 3,
        }),
        defaultGridfinitySpec,
      ),
    ).toThrow('固定外部尺寸不足以容纳当前 STL')
  })

  it('updates the preserved body and base heights when cut depth changes', () => {
    const shallowCut = resolveStlRetrofitPlan(
      getDefaultParams({
        source: createSourceSummary([30, 30, 13]),
        cutDepth: 3,
      }),
      defaultGridfinitySpec,
    )
    const deepCut = resolveStlRetrofitPlan(
      getDefaultParams({
        source: createSourceSummary([30, 30, 13]),
        cutDepth: 5,
      }),
      defaultGridfinitySpec,
    )

    expect(deepCut.preservedBodyHeightMm).toBeLessThan(shallowCut.preservedBodyHeightMm)
    expect(deepCut.baseHeightMm).toBeGreaterThan(shallowCut.baseHeightMm)
    expect(deepCut.totalHeightMm).toBe(shallowCut.totalHeightMm)
  })

  it('fails when locked height is not enough for the adapter base', () => {
    expect(() =>
      resolveStlRetrofitPlan(
        getDefaultParams({
          source: createSourceSummary([20, 20, 24]),
          sizeMode: 'locked',
          gridX: 1,
          gridY: 1,
          heightUnits: 3,
        }),
        defaultGridfinitySpec,
      ),
    ).toThrow('固定高度不足以容纳切除后的模型和适配底座')
  })

  it('disables the top stacking lip by default when preserving the imported body', () => {
    expect(stlRetrofitDefaultParams.stackingLip).toBe(false)
  })
})
