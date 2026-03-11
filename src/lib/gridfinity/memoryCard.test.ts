import {
  getMemoryCardRecommendationSummary,
  resolveMemoryCardPlan,
} from './memoryCard'
import { defaultGridfinitySpec } from './spec'
import { getTemplateDefinition } from './templates'
import type { MemoryCardTrayParams } from './types'

function getDefaultMemoryParams() {
  return structuredClone(
    getTemplateDefinition('memory-card-tray').defaultParams as MemoryCardTrayParams,
  )
}

describe('memory card template v2', () => {
  it('auto-recommends a compact size for default microSD mode', () => {
    const summary = getMemoryCardRecommendationSummary(
      getDefaultMemoryParams(),
      defaultGridfinitySpec,
    )

    expect(summary.isAutoSized).toBe(true)
    expect(summary.size.gridX * summary.size.gridY).toBe(2)
    expect(summary.size.heightUnits).toBe(2)
    expect(summary.quantity).toBe(12)
  })

  it('builds a mixed layout with automatic partitioning', () => {
    const plan = resolveMemoryCardPlan(
      {
        ...getDefaultMemoryParams(),
        mode: 'mixed',
        quantity: 12,
        sdCount: 4,
        microSdCount: 8,
      },
      defaultGridfinitySpec,
    )

    expect(plan.arrangementLabel).toContain('分区')
    expect(plan.slotPockets.length).toBe(12)
    expect(plan.size.gridX * plan.size.gridY).toBeGreaterThanOrEqual(2)
  })

  it('fails clearly when fixed outer size is too small', () => {
    expect(() =>
      resolveMemoryCardPlan(
        {
          ...getDefaultMemoryParams(),
          lockOuterSize: true,
          gridX: 1,
          gridY: 1,
          heightUnits: 2,
        },
        defaultGridfinitySpec,
      ),
    ).toThrow()
  })
})
