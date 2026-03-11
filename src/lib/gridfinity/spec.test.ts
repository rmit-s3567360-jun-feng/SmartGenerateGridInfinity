import {
  defaultGridfinitySpec,
  getBinMetrics,
  gridUnitsToMillimeters,
  heightUnitsToMillimeters,
} from './spec'

describe('gridfinity spec helpers', () => {
  it('converts grid units to millimeters', () => {
    expect(gridUnitsToMillimeters(1)).toBeCloseTo(41.5)
    expect(gridUnitsToMillimeters(2)).toBeCloseTo(83.5)
    expect(heightUnitsToMillimeters(4)).toBeCloseTo(28)
  })

  it('derives bin metrics from base params', () => {
    const metrics = getBinMetrics(
      {
        gridX: 2,
        gridY: 1,
        heightUnits: 4,
        wallThickness: 2,
      },
      defaultGridfinitySpec,
    )

    expect(metrics.outerX).toBeCloseTo(83.5)
    expect(metrics.outerY).toBeCloseTo(41.5)
    expect(metrics.innerX).toBeCloseTo(79.5)
    expect(metrics.height).toBeCloseTo(28)
  })
})
