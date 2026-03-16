import { booleans, measurements, primitives } from '@jscad/modeling'

import {
  createBaseBinSolid,
  createGridfinityMountBase,
  createGridfinityStackableBlock,
  createPocketBetween,
  getBottomFootLayout,
} from './base'
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

  it('can taper the retrofit mount base to a narrower top footprint', () => {
    const geometry = createGridfinityMountBase(
      2,
      1,
      14,
      false,
      defaultGridfinitySpec,
      [28, 18],
    )
    const shoulderSlice = intersect(
      geometry,
      cuboid({
        size: [120, 120, 0.3],
        center: [0, 0, defaultGridfinitySpec.footHeight + 0.15],
      }),
    )
    const topSlice = intersect(
      geometry,
      cuboid({
        size: [120, 120, 0.04],
        center: [0, 0, 13.98],
      }),
    )
    const [[shoulderMinX, shoulderMinY], [shoulderMaxX, shoulderMaxY]] =
      measureBoundingBox(shoulderSlice) as [
        [number, number, number],
        [number, number, number],
      ]
    const [[topMinX, topMinY], [topMaxX, topMaxY]] = measureBoundingBox(topSlice) as [
      [number, number, number],
      [number, number, number],
    ]

    expect(shoulderMaxX - shoulderMinX).toBeCloseTo(83.5, 1)
    expect(topMaxX - topMinX).toBeCloseTo(28, 0)
    expect(topMaxY - topMinY).toBeCloseTo(18, 0)
    expect(topMaxX - topMinX).toBeLessThan(shoulderMaxX - shoulderMinX - 20)
    expect(topMaxY - topMinY).toBeLessThan(shoulderMaxY - shoulderMinY - 20)
  })

  it('adds a standard stacking lip on top of a solid block when enabled', () => {
    const totalHeight = 21
    const geometry = createGridfinityStackableBlock(
      1,
      1,
      totalHeight,
      false,
      true,
      defaultGridfinitySpec,
    )
    const bodySlice = intersect(
      geometry,
      cuboid({
        size: [60, 60, 0.2],
        center: [0, 0, totalHeight - defaultGridfinitySpec.footHeight - 0.1],
      }),
    )
    const lipTopSlice = intersect(
      geometry,
      cuboid({
        size: [60, 60, 0.2],
        center: [0, 0, totalHeight - 0.1],
      }),
    )
    const [[bodyMinX], [bodyMaxX]] = measureBoundingBox(bodySlice) as [
      [number, number, number],
      [number, number, number],
    ]
    const [[lipMinX], [lipMaxX]] = measureBoundingBox(lipTopSlice) as [
      [number, number, number],
      [number, number, number],
    ]

    expect(bodyMaxX - bodyMinX).toBeCloseTo(defaultGridfinitySpec.outerUnitSize, 1)
    expect(lipMaxX - lipMinX).toBeLessThan(bodyMaxX - bodyMinX - 4)
  })
})
