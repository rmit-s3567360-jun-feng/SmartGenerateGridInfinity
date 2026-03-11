/// <reference lib="webworker" />

import { generateModel, serializeGeometryToStlParts } from '../lib/gridfinity/generation'
import type { WorkerRequest, WorkerResponse } from '../lib/gridfinity/types'

const geometryCache = new Map<string, unknown>()
const workerScope = self as DedicatedWorkerGlobalScope

workerScope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data

  try {
    if (message.kind === 'generate') {
      const { geometry, result } = generateModel(message.payload)
      geometryCache.set(result.geometry.cacheKey, geometry)
      const response: WorkerResponse = {
        kind: 'generate-success',
        requestId: message.requestId,
        result,
      }

      workerScope.postMessage(response, [result.meshData.positions.buffer])
      return
    }

    const { result, geometry } = generateModel(message.payload)
    const cached = geometryCache.get(result.geometry.cacheKey) ?? geometry
    geometryCache.set(result.geometry.cacheKey, cached)
    const stlParts = serializeGeometryToStlParts(cached)
    const response: WorkerResponse = {
      kind: 'export-success',
      requestId: message.requestId,
      stlParts,
    }

    workerScope.postMessage(response, stlParts)
  } catch (error) {
    const response: WorkerResponse = {
      kind: 'error',
      requestId: message.requestId,
      message: error instanceof Error ? error.message : '生成失败。',
    }

    workerScope.postMessage(response)
  }
}
