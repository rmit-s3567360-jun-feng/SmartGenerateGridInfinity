import { startTransition, useEffect, useRef, useState } from 'react'

import { firstSentence } from '../lib/gridfinity/helpers'
import { mergeArrayBuffers } from '../lib/gridfinity/mesh'
import { defaultGridfinitySpec } from '../lib/gridfinity/spec'
import { getTemplateDefinition } from '../lib/gridfinity/templates'
import type {
  GenerationRequest,
  GenerationResult,
  ImportedStlSourceSummary,
  ParameterValues,
  TemplateId,
  WorkerRequest,
  WorkerResponse,
} from '../lib/gridfinity/types'
import { useDebouncedValue } from './useDebouncedValue'

interface PendingRequest {
  resolve: (value: WorkerResponse) => void
  reject: (reason?: unknown) => void
}

interface UseModelGeneratorOptions {
  autoGenerate?: boolean
  exportParams?: ParameterValues
  validationParams?: ParameterValues
}

export function useModelGenerator(
  templateId: TemplateId,
  generationParams: ParameterValues,
  options: UseModelGeneratorOptions = {},
) {
  const [generation, setGeneration] = useState<GenerationResult | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [runtimeError, setRuntimeError] = useState<string | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const requestIdRef = useRef(0)
  const generationSequenceRef = useRef(0)
  const pendingRequestsRef = useRef(new Map<number, PendingRequest>())
  const debouncedParams = useDebouncedValue(generationParams)
  const template = getTemplateDefinition(templateId)
  const validationSource = options.validationParams ?? generationParams
  const exportSource = options.exportParams ?? generationParams
  const shouldAutoGenerate = options.autoGenerate ?? true
  const effectiveGenerationParams = shouldAutoGenerate
    ? debouncedParams
    : generationParams
  const validation = template.schema.safeParse(validationSource)
  const validationErrors = validation.success
    ? []
    : validation.error.issues.map((issue) => firstSentence(issue.message))
  const isPreviewPending = shouldAutoGenerate && generationParams !== debouncedParams

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

  function postWorkerRequest(
    request: WorkerRequest,
    transfer: Transferable[] = [],
  ) {
    return new Promise<WorkerResponse>((resolve, reject) => {
      const worker = workerRef.current

      if (!worker) {
        reject(new Error('生成器未初始化。'))
        return
      }

      pendingRequestsRef.current.set(request.requestId, { resolve, reject })
      worker.postMessage(request, transfer)
    })
  }

  function createRequestId() {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    return requestId
  }

  useEffect(() => {
    const parsed = template.schema.safeParse(effectiveGenerationParams)

    if (!parsed.success) {
      generationSequenceRef.current += 1
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

    const requestId = createRequestId()

    postWorkerRequest({
      kind: 'generate',
      requestId,
      payload,
    })
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
  }, [effectiveGenerationParams, template, templateId])

  async function exportModel() {
    const parsed = template.schema.safeParse(exportSource)

    if (!parsed.success) {
      throw new Error('参数校验未通过，无法导出 STL。')
    }

    setIsExporting(true)
    setRuntimeError(null)

    try {
      const response = await postWorkerRequest({
        kind: 'export',
        requestId: createRequestId(),
        payload: {
          templateId,
          params: parsed.data,
          specVersion: defaultGridfinitySpec.version,
        },
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

  async function importStlSource(file: File) {
    const bytes = await file.arrayBuffer()

    setIsImporting(true)
    setRuntimeError(null)

    try {
      const response = await postWorkerRequest(
        {
          kind: 'import-stl',
          requestId: createRequestId(),
          payload: {
            fileName: file.name,
            bytes,
          },
        },
        [bytes],
      )

      if (response.kind !== 'import-stl-success') {
        throw new Error('导入 STL 失败。')
      }

      return response.summary as ImportedStlSourceSummary
    } catch (error) {
      const message = error instanceof Error ? error.message : '导入 STL 失败。'
      setRuntimeError(message)
      throw error
    } finally {
      setIsImporting(false)
    }
  }

  return {
    generation,
    isGenerating,
    isExporting,
    isImporting,
    runtimeError,
    validationErrors,
    isPreviewPending,
    exportModel,
    importStlSource,
  }
}
