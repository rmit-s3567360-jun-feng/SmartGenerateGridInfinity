import { booleans, measurements, primitives } from '@jscad/modeling'

import { createBaseBinSolid } from './base'
import { createBuildContext, generateModel, serializeGeometryToStlParts } from './generation'
import { resolveMemoryCardPlan } from './memoryCard'
import {
  createPhotoOutlineFixtureAnalysis,
  resolvePhotoOutlinePlan,
} from './photoOutline'
import { defaultGridfinitySpec, gridUnitsToMillimeters } from './spec'
import { resolveStlCavityBinPlan } from './stlCavityBin'
import { resolveStlRetrofitPlan } from './stlRetrofit'
import { templateList } from './templates'
import type {
  BaseBinParams,
  ImportedAssetRecord,
  MemoryCardTrayParams,
  PhotoOutlineBinParams,
  StlCavityBinParams,
  StlRetrofitParams,
} from './types'

const { measureVolume } = measurements
const { intersect, subtract, union } = booleans
const { cuboid } = primitives

describe('gridfinity model generation', () => {
  it.each(templateList.map((template) => [template.id, template] as const))(
    'generates default geometry for %s',
    (_templateId, template) => {
      const stlFixture = createStlFixtureAsset()
      const { geometry, result } = generateModel({
        templateId: template.id,
        params:
          template.id === 'photo-outline-bin'
            ? {
                ...(template.defaultParams as PhotoOutlineBinParams),
                analysis: createPhotoOutlineFixtureAnalysis(),
              }
            : template.id === 'stl-cavity-bin'
              ? {
                  ...(template.defaultParams as StlCavityBinParams),
                  source: stlFixture.summary,
                }
            : template.id === 'stl-retrofit'
              ? {
                  ...(template.defaultParams as StlRetrofitParams),
                  source: stlFixture.summary,
                }
            : template.defaultParams,
        specVersion: defaultGridfinitySpec.version,
      }, createBuildContext(new Map([[stlFixture.summary.assetId, stlFixture]])))
      const stlParts = serializeGeometryToStlParts(geometry)
      const totalBytes = stlParts.reduce((sum, part) => sum + part.byteLength, 0)

      expect(result.meshData.positions.length).toBeGreaterThan(0)
      expect(result.bounds.size[0]).toBeGreaterThan(0)
        expect(result.bounds.size[1]).toBeGreaterThan(0)
        expect(result.bounds.size[2]).toBeGreaterThan(0)
        expect(totalBytes).toBeGreaterThan(84)

      if (template.id === 'stl-cavity-bin') {
        const cavityParams: StlCavityBinParams = {
          ...(template.defaultParams as StlCavityBinParams),
          source: stlFixture.summary,
        }
        const plan = resolveStlCavityBinPlan(cavityParams, defaultGridfinitySpec)
        const baseSolid = createBaseBinSolid(plan.resolvedParams, defaultGridfinitySpec)
        const carvedRatio = measureVolume(geometry) / measureVolume(baseSolid)

        expect(result.bounds.size[2]).toBeCloseTo(plan.resolvedParams.heightUnits * 7, 1)
        expect(result.bounds.size[0]).toBeCloseTo(
          gridUnitsToMillimeters(plan.resolvedParams.gridX, defaultGridfinitySpec),
          1,
        )
        expect(result.bounds.size[1]).toBeCloseTo(
          gridUnitsToMillimeters(plan.resolvedParams.gridY, defaultGridfinitySpec),
          1,
        )
        expect(carvedRatio).toBeLessThan(0.96)
        return
      }

      if (template.id === 'stl-retrofit') {
        const retrofitParams: StlRetrofitParams = {
          ...(template.defaultParams as StlRetrofitParams),
          source: stlFixture.summary,
        }
        const plan = resolveStlRetrofitPlan(retrofitParams, defaultGridfinitySpec)

        expect(result.bounds.size[2]).toBeCloseTo(plan.totalHeightMm, 1)
        expect(result.bounds.size[2] % defaultGridfinitySpec.heightUnit).toBeCloseTo(0, 6)
        expect(result.bounds.size[2]).toBeGreaterThanOrEqual(defaultGridfinitySpec.footHeight)
        expect(result.bounds.size[0]).toBeCloseTo(41.5, 1)
        expect(result.bounds.size[1]).toBeCloseTo(41.5, 1)
        return
      }

      const baseParams: BaseBinParams =
        template.id === 'memory-card-tray'
          ? resolveMemoryCardPlan(
              template.defaultParams as MemoryCardTrayParams,
              defaultGridfinitySpec,
            ).resolvedParams
          : template.id === 'photo-outline-bin'
            ? resolvePhotoOutlinePlan(
                {
                  ...(template.defaultParams as PhotoOutlineBinParams),
                  analysis: createPhotoOutlineFixtureAnalysis(),
                },
                defaultGridfinitySpec,
              ).resolvedParams
            : (template.defaultParams as BaseBinParams)
      const baseSolid = createBaseBinSolid(baseParams, defaultGridfinitySpec)
      const carvedRatio = measureVolume(geometry) / measureVolume(baseSolid)

      expect(carvedRatio).toBeLessThan(0.96)
    },
  )

  it('rejects overly tight generic divider layouts', () => {
    expect(() =>
      generateModel({
        templateId: 'generic-bin',
        params: {
          ...templateList.find((template) => template.id === 'generic-bin')!.defaultParams,
          compartmentsX: 2,
          dividerX1: 2,
        },
        specVersion: defaultGridfinitySpec.version,
      }),
    ).toThrow()
  })

  it('extracts a valid plan for the photo outline template fixture', () => {
    const plan = resolvePhotoOutlinePlan(
      {
        ...(templateList.find((template) => template.id === 'photo-outline-bin')!
          .defaultParams as PhotoOutlineBinParams),
        analysis: createPhotoOutlineFixtureAnalysis(),
      },
      defaultGridfinitySpec,
    )

    expect(plan.size.gridX).toBeGreaterThanOrEqual(1)
    expect(plan.size.gridY).toBeGreaterThanOrEqual(1)
    expect(plan.size.heightUnits).toBeGreaterThanOrEqual(2)
    expect(plan.cavityPointsMm.length).toBeGreaterThanOrEqual(4)
    expect(plan.mmPerPixel).toBeGreaterThan(0)
  })

  it('standardizes the STL retrofit body to a rectangular block with a flat top by default', () => {
    const fixture = createStlFixtureAsset()
    const template = templateList.find((candidate) => candidate.id === 'stl-retrofit')!
    const params: StlRetrofitParams = {
      ...(template.defaultParams as StlRetrofitParams),
      source: fixture.summary,
    }
    const plan = resolveStlRetrofitPlan(params, defaultGridfinitySpec)
    const { geometry } = generateModel(
      {
        templateId: 'stl-retrofit',
        params,
        specVersion: defaultGridfinitySpec.version,
      },
      createBuildContext(new Map([[fixture.summary.assetId, fixture]])),
    )
    const topSlice = intersect(
      geometry,
      cuboid({
        size: [120, 120, 0.04],
        center: [0, 0, plan.totalHeightMm - 0.02],
      }),
    )
    const bodySlice = intersect(
      geometry,
      cuboid({
        size: [120, 120, 0.04],
        center: [0, 0, plan.totalHeightMm - defaultGridfinitySpec.footHeight - 0.02],
      }),
    )
    const [[topMinX, topMinY], [topMaxX, topMaxY]] = measurements.measureBoundingBox(topSlice) as [
      [number, number, number],
      [number, number, number],
    ]
    const [[bodyMinX, bodyMinY], [bodyMaxX, bodyMaxY]] =
      measurements.measureBoundingBox(bodySlice) as [
        [number, number, number],
        [number, number, number],
      ]
    const topWidth = topMaxX - topMinX
    const topDepth = topMaxY - topMinY
    const bodyWidth = bodyMaxX - bodyMinX
    const bodyDepth = bodyMaxY - bodyMinY

    expect(bodyWidth).toBeCloseTo(41.5, 1)
    expect(bodyDepth).toBeCloseTo(41.5, 1)
    expect(topWidth).toBeCloseTo(bodyWidth, 1)
    expect(topDepth).toBeCloseTo(bodyDepth, 1)
  })

  it('subtracts the imported STL shape instead of a plain bounding box for the cavity bin', () => {
    const fixture = createIrregularStlFixtureAsset()
    const template = templateList.find((candidate) => candidate.id === 'stl-cavity-bin')!
    const params: StlCavityBinParams = {
      ...(template.defaultParams as StlCavityBinParams),
      source: fixture.summary,
      xyClearance: 0,
      zClearance: 0,
    }
    const plan = resolveStlCavityBinPlan(params, defaultGridfinitySpec)
    const { geometry } = generateModel(
      {
        templateId: 'stl-cavity-bin',
        params,
        specVersion: defaultGridfinitySpec.version,
      },
      createBuildContext(new Map([[fixture.summary.assetId, fixture]])),
    )
    const baseSolid = createBaseBinSolid(plan.resolvedParams, defaultGridfinitySpec)
    const cavity = subtract(baseSolid, geometry)
    const lowerSlice = intersect(
      cavity,
      cuboid({
        size: [120, 120, 0.08],
        center: [0, 0, plan.cavityBottomZ + 2],
      }),
    )
    const upperSlice = intersect(
      cavity,
      cuboid({
        size: [120, 120, 0.08],
        center: [0, 0, plan.cavityBottomZ + 10],
      }),
    )
    const [[lowerMinX], [lowerMaxX]] = measurements.measureBoundingBox(lowerSlice) as [
      [number, number, number],
      [number, number, number],
    ]
    const [[upperMinX, upperMinY], [upperMaxX, upperMaxY]] =
      measurements.measureBoundingBox(upperSlice) as [
        [number, number, number],
        [number, number, number],
      ]
    const lowerWidth = lowerMaxX - lowerMinX
    const upperWidth = upperMaxX - upperMinX
    const upperDepth = upperMaxY - upperMinY
    const upperCenterX = (upperMinX + upperMaxX) / 2

    expect(lowerWidth).toBeCloseTo(20, 1)
    expect(upperWidth).toBeCloseTo(8, 1)
    expect(upperDepth).toBeCloseTo(12, 1)
    expect(upperCenterX).toBeGreaterThan(4)
    expect(upperWidth).toBeLessThan(lowerWidth - 8)
  })
})

function createStlFixtureAsset(): ImportedAssetRecord {
  const geometry = cuboid({
    size: [20, 20, 20],
    center: [0, 0, 10],
  })

  return {
    geometry,
    summary: {
      assetId: 'fixture-stl',
      name: 'fixture.stl',
      format: 'binary',
      sizeBytes: 2048,
      triangleCount: 12,
      originalBounds: {
        min: [-10, -10, 0],
        max: [10, 10, 20],
        size: [20, 20, 20],
      },
      originalSizeMm: [20, 20, 20],
    },
  }
}

function createIrregularStlFixtureAsset(): ImportedAssetRecord {
  const geometry = union(
    cuboid({
      size: [20, 20, 6],
      center: [0, 0, 3],
    }),
    cuboid({
      size: [8, 12, 8],
      center: [6, 0, 10],
    }),
  )

  return {
    geometry,
    summary: {
      assetId: 'fixture-stl-irregular',
      name: 'fixture-irregular.stl',
      format: 'binary',
      sizeBytes: 4096,
      triangleCount: 24,
      originalBounds: {
        min: [-10, -10, 0],
        max: [10, 10, 14],
        size: [20, 20, 14],
      },
      originalSizeMm: [20, 20, 14],
    },
  }
}
