import { startTransition, useEffect, useRef, useState } from 'react'

import { firstSentence } from '../lib/gridfinity/helpers'
import { mergeArrayBuffers } from '../lib/gridfinity/mesh'
import { defaultGridfinitySpec } from '../lib/gridfinity/spec'
import { getTemplateDefinition } from '../lib/gridfinity/templates'
import type {
  GenerationRequest,
  GenerationResult,
  ParameterValues,
  TemplateId,
  WorkerResponse,
} from '../lib/gridfinity/types'
import { useDebouncedValue } from './useDebouncedValue'

interface PendingRequest {
  resolve: (value: WorkerResponse) => void
  reject: (reason?: unknown) => void
}

export function useModelGenerator(
  templateId: TemplateId,
  rawParams: ParameterValues,
) {
  const [generation, setGeneration] = useState<GenerationResult | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [runtimeError, setRuntimeError] = useState<string | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const requestIdRef = useRef(0)
  const generationSequenceRef = useRef(0)
  const pendingRequestsRef = useRef(new Map<number, PendingRequest>())
  const debouncedParams = useDebouncedValue(rawParams)
  const template = getTemplateDefinition(templateId)
  const validation = template.schema.safeParse(rawParams)
  const validationErrors = validation.success
    ? []
    : validation.error.issues.map((issue) => firstSentence(issue.message))
  const isPreviewPending = rawParams !== debouncedParams

  useEffect(() => {
    const worker = new Worker(new URL('../workers/model.worker.ts', import.meta.url), {
      type: 'module',
    })
    const pendingRequests = pendingRequestsRef.current

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data
      const pending = pendingRequestsRef.current.get(response.requestId)

      if (!pending) {
        return
      }

      pendingRequestsRef.current.delete(response.requestId)

      if (response.kind === 'error') {
        pending.reject(new Error(response.message))
        return
      }

      pending.resolve(response)
    }

    workerRef.current = worker

    return () => {
      for (const pending of pendingRequests.values()) {
        pending.reject(new Error('生成器已关闭。'))
      }

      pendingRequests.clear()
      workerRef.current = null
      worker.terminate()
    }
  }, [])

  function postWorkerRequest(kind: 'generate' | 'export', payload: GenerationRequest) {
    return new Promise<WorkerResponse>((resolve, reject) => {
      const worker = workerRef.current

      if (!worker) {
        reject(new Error('生成器未初始化。'))
        return
      }

      const requestId = requestIdRef.current + 1
      requestIdRef.current = requestId
      pendingRequestsRef.current.set(requestId, { resolve, reject })
      worker.postMessage({ kind, requestId, payload })
    })
  }

  useEffect(() => {
    const parsed = template.schema.safeParse(debouncedParams)

    if (!parsed.success) {
      setIsGenerating(false)
      setGeneration(null)
      setRuntimeError(null)
      return
    }

    const payload: GenerationRequest = {
      templateId,
      params: parsed.data,
      specVersion: defaultGridfinitySpec.version,
    }
    const sequence = generationSequenceRef.current + 1
    generationSequenceRef.current = sequence
    setIsGenerating(true)
    setRuntimeError(null)

    postWorkerRequest('generate', payload)
      .then((response) => {
        if (generationSequenceRef.current !== sequence) {
          return
        }

        if (response.kind === 'generate-success') {
          startTransition(() => {
            setGeneration(response.result)
            setRuntimeError(null)
          })
        }
      })
      .catch((error) => {
        if (generationSequenceRef.current !== sequence) {
          return
        }

        setGeneration(null)
        setRuntimeError(error instanceof Error ? error.message : '生成失败。')
      })
      .finally(() => {
        if (generationSequenceRef.current === sequence) {
          setIsGenerating(false)
        }
      })
  }, [debouncedParams, template, templateId])

  async function exportModel() {
    const parsed = template.schema.safeParse(rawParams)

    if (!parsed.success) {
      throw new Error('参数校验未通过，无法导出 STL。')
    }

    setIsExporting(true)
    setRuntimeError(null)

    try {
      const response = await postWorkerRequest('export', {
        templateId,
        params: parsed.data,
        specVersion: defaultGridfinitySpec.version,
      })

      if (response.kind !== 'export-success') {
        throw new Error('导出失败。')
      }

      return mergeArrayBuffers(response.stlParts)
    } catch (error) {
      const message = error instanceof Error ? error.message : '导出失败。'
      setRuntimeError(message)
      throw error
    } finally {
      setIsExporting(false)
    }
  }

  return {
    generation,
    isGenerating,
    isExporting,
    runtimeError,
    validationErrors,
    isPreviewPending,
    exportModel,
  }
}
