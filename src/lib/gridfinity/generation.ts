import { serialize } from '@jscad/stl-serializer'

import { geometryToMeshData, getBoundsFromGeometry } from './mesh'
import { defaultGridfinitySpec } from './spec'
import { getTemplateDefinition } from './templates'
import type { GenerationRequest, ParameterValues, TemplateBuildOutput } from './types'

export function createCacheKey(request: GenerationRequest, normalizedParams: unknown) {
  return JSON.stringify({
    templateId: request.templateId,
    params: normalizedParams,
    specVersion: request.specVersion,
  })
}

export function generateModel(request: GenerationRequest) {
  const template = getTemplateDefinition(request.templateId)
  const parsed = template.schema.safeParse(request.params)

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? '参数校验失败。')
  }

  const buildTemplate = template.build as (
    params: ParameterValues,
    spec: typeof defaultGridfinitySpec,
  ) => TemplateBuildOutput
  const { geometry, warnings } = buildTemplate(parsed.data, defaultGridfinitySpec)
  const cacheKey = createCacheKey(request, parsed.data)

  return {
    geometry,
    result: {
      geometry: { cacheKey },
      meshData: geometryToMeshData(geometry),
      bounds: getBoundsFromGeometry(geometry),
      warnings,
    },
  }
}

export function serializeGeometryToStlParts(geometry: unknown) {
  return serialize({ binary: true }, geometry) as ArrayBuffer[]
}
