/// <reference lib="webworker" />

import { generateModel, serializeGeometryToExportParts } from '../lib/gridfinity/generation'
import { createImportedAssetRecord } from '../lib/gridfinity/stlImport'
import type {
  ImportedAssetRecord,
  WorkerRequest,
  WorkerResponse,
} from '../lib/gridfinity/types'

const MAX_GEOMETRY_CACHE_SIZE = 12
const MAX_IMPORTED_ASSET_CACHE_SIZE = 6
const geometryCache = new Map<string, unknown>()
const importedAssetCache = new Map<string, ImportedAssetRecord>()
const workerScope = self as DedicatedWorkerGlobalScope

function cacheGeometry(cacheKey: string, geometry: unknown) {
  if (geometryCache.has(cacheKey)) {
    geometryCache.delete(cacheKey)
  }

  geometryCache.set(cacheKey, geometry)

  if (geometryCache.size <= MAX_GEOMETRY_CACHE_SIZE) {
    return
  }

  const oldestKey = geometryCache.keys().next().value

  if (oldestKey !== undefined) {
    geometryCache.delete(oldestKey)
  }
}

function cacheImportedAsset(asset: ImportedAssetRecord) {
  if (importedAssetCache.has(asset.summary.assetId)) {
    importedAssetCache.delete(asset.summary.assetId)
  }

  importedAssetCache.set(asset.summary.assetId, asset)

  if (importedAssetCache.size <= MAX_IMPORTED_ASSET_CACHE_SIZE) {
    return
  }

  const oldestKey = importedAssetCache.keys().next().value

  if (oldestKey !== undefined) {
    importedAssetCache.delete(oldestKey)
  }
}

function getImportedAsset(assetId: string) {
  const cached = importedAssetCache.get(assetId)

  if (!cached) {
    return null
  }

  importedAssetCache.delete(assetId)
  importedAssetCache.set(assetId, cached)

  return cached
}

workerScope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data

  try {
    if (message.kind === 'import-stl') {
      const assetId = globalThis.crypto.randomUUID()
      const asset = createImportedAssetRecord(
        assetId,
        message.payload.fileName,
        message.payload.bytes,
      )

      cacheImportedAsset(asset)
      workerScope.postMessage({
        kind: 'import-stl-success',
        requestId: message.requestId,
        summary: asset.summary,
      } satisfies WorkerResponse)
      return
    }

    const context = {
      getImportedAsset,
    }

    if (message.kind === 'generate') {
      const { geometry, result } = generateModel(message.payload, context)
      cacheGeometry(result.geometry.cacheKey, geometry)
      const response: WorkerResponse = {
        kind: 'generate-success',
        requestId: message.requestId,
        result,
      }

      workerScope.postMessage(response, [result.meshData.positions.buffer])
      return
    }

    const { result, geometry } = generateModel(message.payload.request, context)
    const cached = geometryCache.get(result.geometry.cacheKey) ?? geometry
    cacheGeometry(result.geometry.cacheKey, cached)
    const fileParts = serializeGeometryToExportParts(cached, message.payload.format)
    const response: WorkerResponse = {
      kind: 'export-success',
      requestId: message.requestId,
      format: message.payload.format,
      fileParts,
    }

    workerScope.postMessage(response, fileParts)
  } catch (error) {
    const response: WorkerResponse = {
      kind: 'error',
      requestId: message.requestId,
      message: error instanceof Error ? error.message : '生成失败。',
    }

    workerScope.postMessage(response)
  }
}
