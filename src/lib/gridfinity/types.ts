import type Geom3 from '@jscad/modeling/src/geometries/geom3/type'
import type { ZodType } from 'zod'

export type TemplateId =
  | 'generic-bin'
  | 'memory-card-tray'
  | 'photo-outline-bin'
  | 'stl-cavity-bin'
  | 'stl-retrofit'

export type PrimitiveParamValue = string | number | boolean
export type JsonValue = unknown
export type ParameterValues = Record<string, unknown>
export type ParameterFieldSection = 'basic' | 'advanced'
export type QuarterTurn = 0 | 1 | 2 | 3
export type StlFormat = 'ascii' | 'binary'

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
  innerWallThicknessX: number
  innerWallThicknessY: number
  innerWallThicknessZ: number
  dividerThickness: number
  dividerHeight: number
  dividerX1: number
  dividerX2: number
  dividerX3: number
  dividerY1: number
  dividerY2: number
  dividerY3: number
}

export type MemoryCardMode =
  | 'micro-sd-compact'
  | 'sd-compact'
  | 'mixed'

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

export interface PhotoPoint {
  x: number
  y: number
}

export interface PhotoBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
  width: number
  height: number
}

export type PhotoRulerCorner =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'

export interface PhotoOutlineSource {
  name: string
  width: number
  height: number
}

export interface PhotoOutlineRulerDetection {
  status: 'detected' | 'missing'
  corner: PhotoRulerCorner | null
  confidence: number
  mmPerPixel: number
  knownWidthMm: number
  knownHeightMm: number
  barThicknessPx: number
  boundsPx: PhotoBounds | null
}

export interface PhotoOutlineContour {
  pointsPx: PhotoPoint[]
  pointsMm: PhotoPoint[]
  boundsPx: PhotoBounds
  boundsMm: PhotoBounds
  widthMm: number
  heightMm: number
  areaMm2: number
}

export interface PhotoOutlineAnalysis {
  status: 'ready' | 'error'
  message: string | null
  source: PhotoOutlineSource
  ruler: PhotoOutlineRulerDetection
  contour: PhotoOutlineContour | null
  detection: {
    foregroundThreshold: number
    simplifyTolerance: number
    contourMode: PhotoContourMode
  }
}

export type PhotoContourMode = 'detail' | 'smooth' | 'rounded'

export interface PhotoOutlineBinParams extends BaseBinParams {
  objectHeight: number
  cavityClearance: number
  depthClearance: number
  foregroundThreshold: number
  simplifyTolerance: number
  contourMode: PhotoContourMode
  analysis: PhotoOutlineAnalysis | null
}

export interface StlRetrofitParams extends ParameterValues {
  source: ImportedStlSourceSummary | null
  sizeMode: 'auto' | 'locked'
  gridX: number
  gridY: number
  heightUnits: number
  rotationX: QuarterTurn
  rotationY: QuarterTurn
  rotationZ: QuarterTurn
  cutDepth: number
  footprintMargin: number
  minAdapterThickness: number
  magnetHoles: boolean
  stackingLip: boolean
}

export interface StlCavityBinParams extends ParameterValues {
  source: ImportedStlSourceSummary | null
  sizeMode: 'auto' | 'locked'
  gridX: number
  gridY: number
  heightUnits: number
  rotationX: QuarterTurn
  rotationY: QuarterTurn
  rotationZ: QuarterTurn
  wallThickness: number
  floorThickness: number
  xyClearance: number
  zClearance: number
  magnetHoles: boolean
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

export interface ImportedStlSourceSummary {
  assetId: string
  name: string
  format: StlFormat
  sizeBytes: number
  triangleCount: number
  originalBounds: BoundsSummary
  originalSizeMm: [number, number, number]
}

export interface ImportedAssetRecord {
  geometry: Geom3
  summary: ImportedStlSourceSummary
}

export interface TemplateBuildContext {
  getImportedAsset: (assetId: string) => ImportedAssetRecord | null
}

export interface StlRetrofitPlan {
  size: {
    gridX: number
    gridY: number
    heightUnits: number
  }
  rotatedSizeMm: [number, number, number]
  preservedBodyHeightMm: number
  baseHeightMm: number
  totalHeightMm: number
  isAutoSized: boolean
  warnings: string[]
}

export interface StlCavityBinPlan {
  size: {
    gridX: number
    gridY: number
    heightUnits: number
  }
  rotatedSizeMm: [number, number, number]
  cavitySizeMm: [number, number, number]
  cavityBottomZ: number
  cavityTopZ: number
  topClearanceMm: number
  resolvedParams: BaseBinParams
  isAutoSized: boolean
  warnings: string[]
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
  build: (
    params: TParams,
    spec: GridfinitySpec,
    context: TemplateBuildContext,
  ) => TemplateBuildOutput
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
  | TemplateDefinition<MemoryCardTrayParams>
  | TemplateDefinition<PhotoOutlineBinParams>
  | TemplateDefinition<StlCavityBinParams>
  | TemplateDefinition<StlRetrofitParams>

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

export interface WorkerImportStlSuccess {
  kind: 'import-stl-success'
  requestId: number
  summary: ImportedStlSourceSummary
}

export interface WorkerErrorResponse {
  kind: 'error'
  requestId: number
  message: string
}

export type WorkerResponse =
  | WorkerGenerateSuccess
  | WorkerExportSuccess
  | WorkerImportStlSuccess
  | WorkerErrorResponse

export interface WorkerGenerateRequest {
  kind: 'generate' | 'export'
  requestId: number
  payload: GenerationRequest
}

export interface WorkerImportStlRequest {
  kind: 'import-stl'
  requestId: number
  payload: {
    fileName: string
    bytes: ArrayBuffer
  }
}

export type WorkerRequest = WorkerGenerateRequest | WorkerImportStlRequest
