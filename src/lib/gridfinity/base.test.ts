import { booleans, measurements, primitives } from '@jscad/modeling'

import { createBaseBinSolid, createPocketBetween, getBottomFootLayout } from './base'
import { defaultGridfinitySpec } from './spec'

const { intersect } = booleans
const { measureBoundingBox, measureVolume } = measurements
const { cuboid } = primitives

describe('gridfinity base geometry', () => {
  it('lays out one foot per grid cell', () => {
    const layout = getBottomFootLayout(
      {
        gridX: 2,
        gridY: 3,
      },
      defaultGridfinitySpec,
    )

    expect(layout.centers).toEqual([
      [-21, -42],
      [-21, 0],
      [-21, 42],
      [21, -42],
      [21, 0],
      [21, 42],
    ])
  })

  it('adds visible stepped feet volume below the shell', () => {
    const volume = measureVolume(
      createBaseBinSolid(
        {
          gridX: 2,
          gridY: 1,
          heightUnits: 4,
          wallThickness: 2,
          floorThickness: 2,
          magnetHoles: false,
          labelLip: false,
        },
        defaultGridfinitySpec,
      ),
    )

    expect(volume).toBeGreaterThan(50000)
  })

  it('uses a chamfered foot profile instead of one continuous roundover', () => {
    const geometry = createBaseBinSolid(
      {
        gridX: 1,
        gridY: 1,
        heightUnits: 4,
        wallThickness: 2,
        floorThickness: 2,
        magnetHoles: false,
        labelLip: false,
      },
      defaultGridfinitySpec,
    )
    const shoulderSlice = intersect(
      geometry,
      cuboid({
        size: [60, 60, 0.3],
        center: [0, 0, defaultGridfinitySpec.footHeight - 0.15],
      }),
    )
    const footSlice = intersect(
      geometry,
      cuboid({
        size: [60, 60, 0.3],
        center: [0, 0, 1.6],
      }),
    )
    const baseSlice = intersect(
      geometry,
      cuboid({
        size: [60, 60, 0.3],
        center: [0, 0, 0.15],
      }),
    )
    const [[shoulderMinX], [shoulderMaxX]] = measureBoundingBox(shoulderSlice) as [
      [number, number, number],
      [number, number, number],
    ]
    const [[footMinX], [footMaxX]] = measureBoundingBox(footSlice) as [
      [number, number, number],
      [number, number, number],
    ]
    const [[baseMinX], [baseMaxX]] = measureBoundingBox(baseSlice) as [
      [number, number, number],
      [number, number, number],
    ]
    const shoulderWidth = shoulderMaxX - shoulderMinX
    const footWidth = footMaxX - footMinX
    const baseWidth = baseMaxX - baseMinX

    expect(shoulderWidth).toBeCloseTo(defaultGridfinitySpec.outerUnitSize, 1)
    expect(footWidth).toBeLessThan(shoulderWidth - 2)
    expect(baseWidth).toBeLessThan(footWidth)
  })

  it('keeps cavity sidewalls vertical when only planar corner rounding is requested', () => {
    const pocket = createPocketBetween(20, 12, 0, 10, 0, 0, 2, 24)
    const lowerSlice = intersect(
      pocket,
      cuboid({
        size: [30, 30, 0.3],
        center: [0, 0, 0.15],
      }),
    )
    const upperSlice = intersect(
      pocket,
      cuboid({
        size: [30, 30, 0.3],
        center: [0, 0, 9.85],
      }),
    )
    const [[lowerMinX], [lowerMaxX]] = measureBoundingBox(lowerSlice) as [
      [number, number, number],
      [number, number, number],
    ]
    const [[upperMinX], [upperMaxX]] = measureBoundingBox(upperSlice) as [
      [number, number, number],
      [number, number, number],
    ]

    expect(lowerMaxX - lowerMinX).toBeCloseTo(20, 1)
    expect(upperMaxX - upperMinX).toBeCloseTo(20, 1)
  })
})
