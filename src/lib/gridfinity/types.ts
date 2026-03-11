import type Geom3 from '@jscad/modeling/src/geometries/geom3/type'
import type { ZodType } from 'zod'

export type TemplateId =
  | 'generic-bin'
  | 'screwdriver-rack'
  | 'memory-card-tray'
  | 'pliers-holder'

export type PrimitiveParamValue = string | number | boolean
export type ParameterValues = Record<string, PrimitiveParamValue>
export type ParameterFieldSection = 'basic' | 'advanced'

export interface GridfinitySpec {
  version: string
  pitchXY: number
  heightUnit: number
  outerUnitSize: number
  tolerance: number
  cornerRadius: number
  footInset: number
  footHeight: number
  magnetDiameter: number
  magnetDepth: number
  labelDepth: number
  labelHeight: number
}

export interface BaseBinParams extends ParameterValues {
  gridX: number
  gridY: number
  heightUnits: number
  wallThickness: number
  floorThickness: number
  magnetHoles: boolean
  labelLip: boolean
}

export interface GenericBinParams extends BaseBinParams {
  compartmentsX: number
  compartmentsY: number
}

export interface ScrewdriverRackParams extends BaseBinParams {
  slotCount: number
  holeDiameter: number
  rowCount: number
  spacing: number
  tiltDegrees: number
  handleClearance: number
}

export type MemoryCardMode = 'micro-sd-compact' | 'sd-compact' | 'mixed'

export interface MemoryCardTrayParams extends BaseBinParams {
  mode: MemoryCardMode
  quantity: number
  sdCount: number
  microSdCount: number
  enableGripCutout: boolean
  enableLabelArea: boolean
  lockOuterSize: boolean
  slotTolerance: number
  minGripMargin: number
}

export interface PliersHolderParams extends BaseBinParams {
  toolCount: number
  channelWidth: number
  channelDepth: number
  spacing: number
  handleOpening: number
}

export interface FieldOption {
  label: string
  value: string
}

export interface FieldVisibilityRule<TParams extends ParameterValues = ParameterValues> {
  key: keyof TParams & string
  values: PrimitiveParamValue[]
}

export interface ParameterField<TParams extends ParameterValues = ParameterValues> {
  key: keyof TParams & string
  label: string
  description: string
  kind: 'number' | 'boolean' | 'select'
  section?: ParameterFieldSection
  min?: number
  max?: number
  step?: number
  options?: FieldOption[]
  visibleWhen?: Array<FieldVisibilityRule<TParams>>
}

export interface GeometryHandle {
  cacheKey: string
}

export interface MeshData {
  positions: Float32Array
}

export interface BoundsSummary {
  min: [number, number, number]
  max: [number, number, number]
  size: [number, number, number]
}

export interface TemplateBuildOutput {
  geometry: Geom3
  warnings: string[]
}

export interface TemplateDefinition<TParams extends ParameterValues> {
  id: TemplateId
  name: string
  tagline: string
  summary: string
  description: string
  previewFacts: string[]
  schema: ZodType<TParams>
  defaultParams: TParams
  fields: Array<ParameterField<TParams>>
  build: (params: TParams, spec: GridfinitySpec) => TemplateBuildOutput
}

export interface TemplateCatalogItem {
  id: TemplateId
  name: string
  tagline: string
  summary: string
  description: string
  previewFacts: string[]
}

export type AnyTemplateDefinition =
  | TemplateDefinition<GenericBinParams>
  | TemplateDefinition<ScrewdriverRackParams>
  | TemplateDefinition<MemoryCardTrayParams>
  | TemplateDefinition<PliersHolderParams>

export interface GenerationRequest {
  templateId: TemplateId
  params: ParameterValues
  specVersion: string
}

export interface GenerationResult {
  geometry: GeometryHandle
  meshData: MeshData
  bounds: BoundsSummary
  warnings: string[]
}

export interface WorkerGenerateSuccess {
  kind: 'generate-success'
  requestId: number
  result: GenerationResult
}

export interface WorkerExportSuccess {
  kind: 'export-success'
  requestId: number
  stlParts: ArrayBuffer[]
}

export interface WorkerErrorResponse {
  kind: 'error'
  requestId: number
  message: string
}

export type WorkerResponse =
  | WorkerGenerateSuccess
  | WorkerExportSuccess
  | WorkerErrorResponse

export interface WorkerRequest {
  kind: 'generate' | 'export'
  requestId: number
  payload: GenerationRequest
}
