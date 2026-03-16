import { serialize } from '@jscad/stl-serializer'

import { geometryToMeshData, getBoundsFromGeometry } from './mesh'
import { defaultGridfinitySpec } from './spec'
import { getTemplateDefinition } from './templates'
import type {
  GenerationRequest,
  ImportedAssetRecord,
  ParameterValues,
  TemplateBuildContext,
  TemplateBuildOutput,
} from './types'

export function createCacheKey(request: GenerationRequest, normalizedParams: unknown) {
  return JSON.stringify({
    templateId: request.templateId,
    params: normalizedParams,
    specVersion: request.specVersion,
  })
}

const defaultBuildContext: TemplateBuildContext = {
  getImportedAsset: () => null,
}

export function generateModel(
  request: GenerationRequest,
  context: TemplateBuildContext = defaultBuildContext,
) {
  const template = getTemplateDefinition(request.templateId)
  const parsed = template.schema.safeParse(request.params)

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? '参数校验失败。')
  }

  const buildTemplate = template.build as (
    params: ParameterValues,
    spec: typeof defaultGridfinitySpec,
    buildContext: TemplateBuildContext,
  ) => TemplateBuildOutput
  const { geometry, warnings } = buildTemplate(parsed.data, defaultGridfinitySpec, context)
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

export function createBuildContext(
  assets: Map<string, ImportedAssetRecord>,
): TemplateBuildContext {
  return {
    getImportedAsset: (assetId) => assets.get(assetId) ?? null,
  }
}

export function serializeGeometryToStlParts(geometry: unknown) {
  return serialize({ binary: true }, geometry) as ArrayBuffer[]
}
