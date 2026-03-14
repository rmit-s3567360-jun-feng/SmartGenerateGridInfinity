import { measurements } from '@jscad/modeling'

import { createBaseBinSolid } from './base'
import { generateModel, serializeGeometryToStlParts } from './generation'
import { resolveMemoryCardPlan } from './memoryCard'
import {
  createPhotoOutlineFixtureAnalysis,
  resolvePhotoOutlinePlan,
} from './photoOutline'
import { defaultGridfinitySpec } from './spec'
import { templateList } from './templates'
import type {
  BaseBinParams,
  MemoryCardTrayParams,
  PhotoOutlineBinParams,
} from './types'

const { measureVolume } = measurements

describe('gridfinity model generation', () => {
  it.each(templateList.map((template) => [template.id, template] as const))(
    'generates default geometry for %s',
    (_templateId, template) => {
      const { geometry, result } = generateModel({
        templateId: template.id,
        params:
          template.id === 'photo-outline-bin'
            ? {
                ...(template.defaultParams as PhotoOutlineBinParams),
                analysis: createPhotoOutlineFixtureAnalysis(),
              }
            : template.defaultParams,
        specVersion: defaultGridfinitySpec.version,
      })
      const stlParts = serializeGeometryToStlParts(geometry)
      const totalBytes = stlParts.reduce((sum, part) => sum + part.byteLength, 0)
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
          : template.defaultParams
      const baseSolid = createBaseBinSolid(baseParams, defaultGridfinitySpec)
      const carvedRatio = measureVolume(geometry) / measureVolume(baseSolid)

      expect(result.meshData.positions.length).toBeGreaterThan(0)
      expect(result.bounds.size[0]).toBeGreaterThan(0)
      expect(result.bounds.size[1]).toBeGreaterThan(0)
      expect(result.bounds.size[2]).toBeGreaterThan(0)
      expect(totalBytes).toBeGreaterThan(84)
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
})
