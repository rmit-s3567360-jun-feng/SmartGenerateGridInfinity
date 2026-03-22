import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'

import { ParameterPanel } from '../components/ParameterPanel'
import { ModelSummaryPanel } from '../components/ModelSummaryPanel'
import { ParametricCavityWorkflow } from '../components/ParametricCavityWorkflow'
import { PhotoOutlineWorkflow } from '../components/PhotoOutlineWorkflow'
import { PreviewCanvas } from '../components/PreviewCanvas'
import { StlCavityWorkflow } from '../components/StlCavityWorkflow'
import { StlRetrofitWorkflow } from '../components/StlRetrofitWorkflow'
import { useModelGenerator } from '../hooks/useModelGenerator'
import {
  resolveMemoryCardPlan,
  normalizeMemoryCardModeParams,
} from '../lib/gridfinity/memoryCard'
import {
  resolvePhotoOutlinePlan,
} from '../lib/gridfinity/photoOutline'
import {
  resolveGenericShapeCavityPlan,
} from '../lib/gridfinity/genericShapeCavity'
import { resolveStlCavityBinPlan } from '../lib/gridfinity/stlCavityBin'
import { resolveStlRetrofitPlan } from '../lib/gridfinity/stlRetrofit'
import { templateCatalog } from '../lib/gridfinity/templateCatalog'
import {
  defaultGridfinitySpec,
  getBinMetrics,
  gridUnitsToMillimeters,
  heightUnitsToMillimeters,
} from '../lib/gridfinity/spec'
import {
  getDefaultGenericDividerOffsets,
  getTemplateDefinition,
} from '../lib/gridfinity/templates'
import type {
  GenericBinParams,
  MemoryCardMode,
  MemoryCardTrayParams,
  ParametricCavityBinParams,
  ParameterValues,
  PhotoOutlineBinParams,
  StlCavityBinParams,
  StlRetrofitParams,
  TemplateDefinition,
  TemplateId,
  JsonValue,
} from '../lib/gridfinity/types'

function getGenericInnerSpan(
  axis: 'x' | 'y',
  params: ParameterValues,
) {
  const gridUnits =
    axis === 'x' ? Number(params.gridX ?? 1) : Number(params.gridY ?? 1)
  const outerSpan = gridUnitsToMillimeters(gridUnits, defaultGridfinitySpec)
  const innerThickness =
    axis === 'x'
      ? Number(params.innerWallThicknessX ?? 2)
      : Number(params.innerWallThicknessY ?? 2)

  return Math.max(0, outerSpan - innerThickness * 2)
}

function isTemplateId(value: string | undefined): value is TemplateId {
  return (
    value === 'generic-bin' ||
    value === 'parametric-cavity-bin' ||
    value === 'memory-card-tray' ||
    value === 'photo-outline-bin' ||
    value === 'stl-cavity-bin' ||
    value === 'stl-retrofit'
  )
}

function createTimestamp() {
  return new Date().toISOString().replaceAll(':', '-')
}

export function GeneratorPage() {
  const { templateId: routeTemplateId } = useParams()
  const templateId = isTemplateId(routeTemplateId)
    ? routeTemplateId
    : 'generic-bin'
  const template = getTemplateDefinition(templateId)

  const [rawParams, setRawParams] = useState<ParameterValues>(template.defaultParams)
  const [appliedParams, setAppliedParams] = useState<ParameterValues>(template.defaultParams)
  const photoParams =
    templateId === 'photo-outline-bin' ? (rawParams as PhotoOutlineBinParams) : null
  const stlCavityParams =
    templateId === 'stl-cavity-bin' ? (rawParams as StlCavityBinParams) : null
  const stlParams =
    templateId === 'stl-retrofit' ? (rawParams as StlRetrofitParams) : null
  const parametricCavityParams =
    templateId === 'parametric-cavity-bin'
      ? (rawParams as ParametricCavityBinParams)
      : null
  const isManualShapeGeneration =
    templateId === 'parametric-cavity-bin'
  const generationParams = isManualShapeGeneration ? appliedParams : rawParams
  const {
    exportModel,
    importStlSource,
    generation,
    isExporting,
    isGenerating,
    isImporting,
    isPreviewPending,
    runtimeError,
    validationErrors,
  } = useModelGenerator(templateId, generationParams, {
    autoGenerate: !isManualShapeGeneration,
    exportParams: generationParams,
    validationParams: rawParams,
  })
  const hasUnappliedChanges = isManualShapeGeneration && rawParams !== appliedParams

  useEffect(() => {
    setRawParams(template.defaultParams)
    setAppliedParams(template.defaultParams)
  }, [template])

  useEffect(() => {
    if (!isManualShapeGeneration && appliedParams !== rawParams) {
      setAppliedParams(rawParams)
    }
  }, [appliedParams, isManualShapeGeneration, rawParams])

  if (!isTemplateId(routeTemplateId)) {
    return <Navigate replace to="/generator/generic-bin" />
  }

  const memoryCardPlan =
    templateId === 'memory-card-tray'
      ? (() => {
          try {
            const memoryTemplate = template as TemplateDefinition<MemoryCardTrayParams>
            const parsed = memoryTemplate.schema.safeParse(rawParams)

            if (!parsed.success) {
              return null
            }

            return resolveMemoryCardPlan(parsed.data, defaultGridfinitySpec)
          } catch {
            return null
          }
        })()
      : null
  const photoOutlinePlan =
    templateId === 'photo-outline-bin'
      ? (() => {
          try {
            const photoTemplate = template as TemplateDefinition<PhotoOutlineBinParams>
            const parsed = photoTemplate.schema.safeParse(rawParams)

            if (!parsed.success) {
              return null
            }

            return resolvePhotoOutlinePlan(parsed.data, defaultGridfinitySpec)
          } catch {
            return null
          }
        })()
      : null
  const genericShapePlan =
    templateId === 'parametric-cavity-bin' && parametricCavityParams
      ? (() => {
          try {
            const genericTemplate = template as TemplateDefinition<ParametricCavityBinParams>
            const parsed = genericTemplate.schema.safeParse(generationParams)

            if (!parsed.success) {
              return null
            }

            return resolveGenericShapeCavityPlan(parsed.data, defaultGridfinitySpec)
          } catch {
            return null
          }
        })()
      : null

  const stlRetrofitPlan =
    templateId === 'stl-retrofit'
      ? (() => {
          try {
            const stlTemplate = template as TemplateDefinition<StlRetrofitParams>
            const parsed = stlTemplate.schema.safeParse(rawParams)

            if (!parsed.success) {
              return null
            }

            return resolveStlRetrofitPlan(parsed.data, defaultGridfinitySpec)
          } catch {
            return null
          }
        })()
      : null
  const stlCavityPlan =
    templateId === 'stl-cavity-bin'
      ? (() => {
          try {
            const stlTemplate = template as TemplateDefinition<StlCavityBinParams>
            const parsed = stlTemplate.schema.safeParse(rawParams)

            if (!parsed.success) {
              return null
            }

            return resolveStlCavityBinPlan(parsed.data, defaultGridfinitySpec)
          } catch {
            return null
          }
        })()
      : null
  const currentGridX =
    genericShapePlan?.size.gridX ??
    memoryCardPlan?.size.gridX ??
    photoOutlinePlan?.size.gridX ??
    stlCavityPlan?.size.gridX ??
    stlRetrofitPlan?.size.gridX ??
    Number(rawParams.gridX ?? template.defaultParams.gridX)
  const currentGridY =
    genericShapePlan?.size.gridY ??
    memoryCardPlan?.size.gridY ??
    photoOutlinePlan?.size.gridY ??
    stlCavityPlan?.size.gridY ??
    stlRetrofitPlan?.size.gridY ??
    Number(rawParams.gridY ?? template.defaultParams.gridY)
  const currentHeightUnits =
    genericShapePlan?.size.heightUnits ??
    memoryCardPlan?.size.heightUnits ??
    photoOutlinePlan?.size.heightUnits ??
    stlCavityPlan?.size.heightUnits ??
    stlRetrofitPlan?.size.heightUnits ??
    Number(rawParams.heightUnits ?? template.defaultParams.heightUnits)
  const outerSizeLabel = formatSizeLabel([
    gridUnitsToMillimeters(currentGridX, defaultGridfinitySpec),
    gridUnitsToMillimeters(currentGridY, defaultGridfinitySpec),
    heightUnitsToMillimeters(currentHeightUnits, defaultGridfinitySpec),
  ])
  const genericInnerSizeLabel =
    templateId === 'generic-bin'
      ? (() => {
          const params = rawParams as GenericBinParams
          const metrics = getBinMetrics(params, defaultGridfinitySpec)

          return formatSizeLabel([
            Math.max(0, metrics.outerX - Number(params.innerWallThicknessX ?? 0) * 2),
            Math.max(0, metrics.outerY - Number(params.innerWallThicknessY ?? 0) * 2),
            Math.max(
              0,
              metrics.height -
                defaultGridfinitySpec.footHeight -
                Number(params.innerWallThicknessZ ?? 0),
            ),
          ])
        })()
      : null
  const summaryItems = resolveSummaryItems({
    currentGridX,
    currentGridY,
    currentHeightUnits,
    genericInnerSizeLabel,
    genericShapePlan,
    hasUnappliedChanges,
    memoryCardPlan,
    outerSizeLabel,
    photoOutlinePlan,
    rawParams,
    stlCavityPlan,
    stlRetrofitPlan,
    templateId,
  })
  const summaryStatusLabel = resolveSummaryStatusLabel({
    genericShapePlan,
    hasUnappliedChanges,
    memoryCardPlan,
    photoOutlinePlan,
    stlCavityPlan,
    stlRetrofitPlan,
    templateId,
  })
  const summaryWarnings =
    generation?.warnings.length
      ? generation.warnings
      : genericShapePlan?.warnings.length
        ? genericShapePlan.warnings
        : memoryCardPlan?.warnings.length
          ? memoryCardPlan.warnings
          : photoOutlinePlan?.warnings.length
            ? photoOutlinePlan.warnings
            : stlCavityPlan?.warnings.length
              ? stlCavityPlan.warnings
              : stlRetrofitPlan?.warnings.length
                ? stlRetrofitPlan.warnings
                : []
  const summaryPanel = (
    <ModelSummaryPanel
      items={summaryItems}
      statusLabel={summaryStatusLabel}
      warnings={summaryWarnings}
    />
  )
  const exportDisabled =
    Boolean(runtimeError) ||
    validationErrors.length > 0 ||
    hasUnappliedChanges ||
    !generation ||
    isGenerating ||
    isExporting
  const isDedicatedWorkflow =
    templateId === 'photo-outline-bin' ||
    templateId === 'stl-retrofit' ||
    templateId === 'stl-cavity-bin'
  const controlActionPanel =
    !isDedicatedWorkflow ? (
      <section className="panel panel--actions">
        <div className="panel__header">
          <div>
            <p className="panel__eyebrow">主要操作</p>
            <h2>导出与生成</h2>
          </div>
        </div>
        <p className="panel__hint">
          {templateId === 'parametric-cavity-bin'
            ? hasUnappliedChanges
              ? '先生成当前草稿，再导出 STL。'
              : '当前草稿已同步到预览，可以直接导出 STL。'
            : '参数校验通过后即可直接导出 STL。'}
        </p>
        <div className="button-row button-row--stack">
          {templateId === 'parametric-cavity-bin' ? (
            <button
              className="button button--wide"
              disabled={validationErrors.length > 0 || !hasUnappliedChanges || isGenerating}
              type="button"
              onClick={handleGenerateModel}
            >
              {isGenerating ? '生成中...' : '生成图形'}
            </button>
          ) : null}
          <button
            className={templateId === 'parametric-cavity-bin' ? 'button button--ghost button--wide' : 'button button--wide'}
            disabled={exportDisabled}
            type="button"
            onClick={() => void handleExport()}
          >
            {isExporting ? '导出中...' : '导出 STL'}
          </button>
        </div>
      </section>
    ) : null

  function handleParamChange(key: string, value: JsonValue) {
    setRawParams((current) => {
      let next = { ...current, [key]: value }

      if (templateId === 'generic-bin') {
        if (key === 'compartmentsX') {
          const dividerThickness = Number(
            (next as GenericBinParams).dividerThickness ?? 2,
          )
          const [dividerX1, dividerX2, dividerX3] =
            getDefaultGenericDividerOffsets(
              getGenericInnerSpan('x', next),
              dividerThickness,
              Number(value),
            )

          next = {
            ...(next as GenericBinParams),
            dividerX1,
            dividerX2,
            dividerX3,
          }
        }

        if (key === 'compartmentsY') {
          const dividerThickness = Number(
            (next as GenericBinParams).dividerThickness ?? 2,
          )
          const [dividerY1, dividerY2, dividerY3] =
            getDefaultGenericDividerOffsets(
              getGenericInnerSpan('y', next),
              dividerThickness,
              Number(value),
            )

          next = {
            ...(next as GenericBinParams),
            dividerY1,
            dividerY2,
            dividerY3,
          }
        }
      }

      if (templateId === 'memory-card-tray') {
        if (key === 'mode' && typeof value === 'string') {
          next = normalizeMemoryCardModeParams(
            next as MemoryCardTrayParams,
            value as MemoryCardMode,
          )
        }

        if (
          (key === 'sdCount' || key === 'microSdCount') &&
          String(next.mode) === 'mixed'
        ) {
          next.quantity =
            Number(next.sdCount ?? 0) + Number(next.microSdCount ?? 0)
        }

        if (
          key === 'gridX' ||
          key === 'gridY' ||
          key === 'heightUnits'
        ) {
          next.lockOuterSize = true
        }

        if (key === 'lockOuterSize' && value === true && memoryCardPlan) {
          next.gridX = memoryCardPlan.size.gridX
          next.gridY = memoryCardPlan.size.gridY
          next.heightUnits = memoryCardPlan.size.heightUnits
        }
      }

      if (templateId === 'stl-retrofit') {
        if (
          key === 'gridX' ||
          key === 'gridY' ||
          key === 'heightUnits'
        ) {
          next.sizeMode = 'locked'
        }

        if (key === 'sizeMode' && value === 'locked' && stlRetrofitPlan) {
          next.gridX = stlRetrofitPlan.size.gridX
          next.gridY = stlRetrofitPlan.size.gridY
          next.heightUnits = stlRetrofitPlan.size.heightUnits
        }
      }

      if (templateId === 'stl-cavity-bin') {
        if (
          key === 'gridX' ||
          key === 'gridY' ||
          key === 'heightUnits'
        ) {
          next.sizeMode = 'locked'
        }

        if (key === 'sizeMode' && value === 'locked' && stlCavityPlan) {
          next.gridX = stlCavityPlan.size.gridX
          next.gridY = stlCavityPlan.size.gridY
          next.heightUnits = stlCavityPlan.size.heightUnits
        }
      }

      return next
    })
  }

  function handleGenerateModel() {
    setAppliedParams(rawParams)
  }

  async function handleExport() {
    const stlBuffer = await exportModel()
    const blob = new Blob([stlBuffer], { type: 'model/stl' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `gridfinity-${template.id}-${createTimestamp()}.stl`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <main className="generator-page">
      <header className="generator-header">
        <div>
          <Link className="back-link" to="/">
            返回首页
          </Link>
          <h1>{template.name}</h1>
          <p>{template.description}</p>
        </div>
        {isDedicatedWorkflow ? (
          <div className="hero__actions">
            <button
              className="button"
              disabled={exportDisabled}
              type="button"
              onClick={() => void handleExport()}
            >
              {isExporting ? '导出中...' : '导出 STL'}
            </button>
          </div>
        ) : null}
      </header>

      <nav aria-label="模板切换" className="template-tabs">
        {templateCatalog.map((item) => (
          <Link
            className={item.id === template.id ? 'template-tab template-tab--active' : 'template-tab'}
            key={item.id}
            to={`/generator/${item.id}`}
          >
            {item.name}
          </Link>
        ))}
      </nav>

      <section
        className={
          templateId === 'photo-outline-bin' ||
          templateId === 'stl-retrofit' ||
          templateId === 'stl-cavity-bin'
            ? 'workspace workspace--photo'
            : 'workspace'
        }
      >
        {templateId === 'photo-outline-bin' ? (
          <PhotoOutlineWorkflow
            generation={generation}
            isGenerating={isGenerating}
            isPreviewPending={isPreviewPending}
            summaryPanel={
              <>
                {summaryPanel}
                {runtimeError ? (
                  <div className="error-box" role="alert">
                    <strong>生成失败</strong>
                    <p>{runtimeError}</p>
                  </div>
                ) : null}
              </>
            }
            onChange={handleParamChange}
            onReset={() => {
              setRawParams(template.defaultParams)
            }}
            validationErrors={validationErrors}
            values={photoParams as PhotoOutlineBinParams}
          />
        ) : templateId === 'stl-cavity-bin' ? (
          <StlCavityWorkflow
            generation={generation}
            isGenerating={isGenerating}
            isImporting={isImporting}
            isPreviewPending={isPreviewPending}
            summaryPanel={
              <>
                {summaryPanel}
                {runtimeError ? (
                  <div className="error-box" role="alert">
                    <strong>生成失败</strong>
                    <p>{runtimeError}</p>
                  </div>
                ) : null}
              </>
            }
            onChange={handleParamChange}
            onImport={importStlSource}
            onReset={() => {
              setRawParams(template.defaultParams)
            }}
            validationErrors={validationErrors}
            values={stlCavityParams as StlCavityBinParams}
          />
        ) : templateId === 'stl-retrofit' ? (
          <StlRetrofitWorkflow
            generation={generation}
            isGenerating={isGenerating}
            isImporting={isImporting}
            isPreviewPending={isPreviewPending}
            summaryPanel={
              <>
                {summaryPanel}
                {runtimeError ? (
                  <div className="error-box" role="alert">
                    <strong>生成失败</strong>
                    <p>{runtimeError}</p>
                  </div>
                ) : null}
              </>
            }
            onChange={handleParamChange}
            onImport={importStlSource}
            onReset={() => {
              setRawParams(template.defaultParams)
            }}
            validationErrors={validationErrors}
            values={stlParams as StlRetrofitParams}
          />
        ) : (
          <>
            {templateId === 'parametric-cavity-bin' ? (
              <ParametricCavityWorkflow
                actionPanel={controlActionPanel}
                hasPendingChanges={hasUnappliedChanges}
                isPreviewPending={hasUnappliedChanges || isPreviewPending}
                template={template as TemplateDefinition<ParametricCavityBinParams>}
                validationErrors={validationErrors}
                values={parametricCavityParams as ParametricCavityBinParams}
                onChange={handleParamChange}
                onReset={() => {
                  setRawParams(template.defaultParams)
                }}
              />
            ) : (
              <div className="control-stack">
                <ParameterPanel
                  key={template.id}
                  template={template}
                  validationErrors={validationErrors}
                  values={rawParams}
                  onChange={handleParamChange}
                  onReset={() => {
                    setRawParams(template.defaultParams)
                  }}
                />
                {controlActionPanel}
              </div>
            )}

            <div className="results-column">
              {summaryPanel}
              <PreviewCanvas
                bounds={generation?.bounds ?? null}
                isLoading={isGenerating}
                isPending={hasUnappliedChanges || isPreviewPending}
                pendingLabel={hasUnappliedChanges ? '草稿待生成' : '等待更新...'}
                positions={generation?.meshData.positions ?? null}
              />
              {runtimeError ? (
                <div className="error-box" role="alert">
                  <strong>生成失败</strong>
                  <p>{runtimeError}</p>
                </div>
              ) : null}
            </div>
          </>
        )}
      </section>
    </main>
  )
}

interface SummaryContext {
  currentGridX: number
  currentGridY: number
  currentHeightUnits: number
  genericInnerSizeLabel: string | null
  genericShapePlan: ReturnType<typeof resolveGenericShapeCavityPlan> | null
  hasUnappliedChanges: boolean
  memoryCardPlan: ReturnType<typeof resolveMemoryCardPlan> | null
  outerSizeLabel: string
  photoOutlinePlan: ReturnType<typeof resolvePhotoOutlinePlan> | null
  rawParams: ParameterValues
  stlCavityPlan: ReturnType<typeof resolveStlCavityBinPlan> | null
  stlRetrofitPlan: ReturnType<typeof resolveStlRetrofitPlan> | null
  templateId: TemplateId
}

function resolveSummaryItems(context: SummaryContext) {
  const {
    currentGridX,
    currentGridY,
    currentHeightUnits,
    genericInnerSizeLabel,
    genericShapePlan,
    memoryCardPlan,
    outerSizeLabel,
    photoOutlinePlan,
    rawParams,
    stlCavityPlan,
    stlRetrofitPlan,
    templateId,
  } = context

  const gridSizeLabel = `${currentGridX} x ${currentGridY} x ${currentHeightUnits}`

  if (templateId === 'generic-bin') {
    const params = rawParams as GenericBinParams

    return [
      { label: '外部尺寸', value: outerSizeLabel },
      { label: '内部有效尺寸', value: genericInnerSizeLabel ?? '等待输入' },
      { label: 'Gridfinity 占位', value: gridSizeLabel },
      { label: '分仓布局', value: `${params.compartmentsX} x ${params.compartmentsY}` },
    ]
  }

  if (templateId === 'memory-card-tray' && memoryCardPlan) {
    return [
      { label: '外部尺寸', value: outerSizeLabel },
      {
        label: '内部有效尺寸',
        value: formatSizeLabel([
          memoryCardPlan.trayWidth,
          memoryCardPlan.trayDepth,
          Math.max(0, memoryCardPlan.trayTopZ - memoryCardPlan.trayBottomZ),
        ]),
      },
      { label: 'Gridfinity 占位', value: gridSizeLabel },
      { label: '关键容量', value: `${memoryCardPlan.quantity} 张 · ${memoryCardPlan.arrangementLabel}` },
    ]
  }

  if (templateId === 'parametric-cavity-bin' && genericShapePlan) {
    const arrangementMode = (rawParams as ParametricCavityBinParams).arrangementMode

    const metrics = getBinMetrics(genericShapePlan.resolvedParams, defaultGridfinitySpec)

    return [
      { label: '外部尺寸', value: outerSizeLabel },
      {
        label: '内部有效尺寸',
        value: formatSizeLabel([
          metrics.innerX,
          metrics.innerY,
          genericShapePlan.usableCavityDepthMm,
        ]),
      },
      { label: 'Gridfinity 占位', value: gridSizeLabel },
      {
        label: '排布规则',
        value: arrangementMode === 'y-first' ? 'Y -> X -> Z' : 'X -> Y -> Z',
      },
      { label: '关键容量', value: `${genericShapePlan.totalCavityCount} 个型腔` },
    ]
  }

  if (templateId === 'photo-outline-bin' && photoOutlinePlan) {
    const params = rawParams as PhotoOutlineBinParams

    return [
      { label: '外部尺寸', value: outerSizeLabel },
      {
        label: '内部有效尺寸',
        value: formatSizeLabel([
          photoOutlinePlan.contourWidthMm + Number(params.cavityClearance ?? 0) * 2,
          photoOutlinePlan.contourHeightMm + Number(params.cavityClearance ?? 0) * 2,
          photoOutlinePlan.cavityDepth,
        ]),
      },
      { label: 'Gridfinity 占位', value: gridSizeLabel },
      {
        label: '关键摘要',
        value: `${photoOutlinePlan.orientation === 90 ? '90°' : '0°'} · ${photoOutlinePlan.cavityPointsMm.length} 点`,
      },
    ]
  }

  if (templateId === 'stl-cavity-bin' && stlCavityPlan) {
    return [
      { label: '外部尺寸', value: outerSizeLabel },
      { label: '内部有效尺寸', value: formatSizeLabel(stlCavityPlan.cavitySizeMm) },
      { label: 'Gridfinity 占位', value: gridSizeLabel },
      { label: '关键摘要', value: `顶部余量 ${stlCavityPlan.topClearanceMm.toFixed(1)} mm` },
    ]
  }

  if (templateId === 'stl-retrofit' && stlRetrofitPlan) {
    return [
      { label: '外部尺寸', value: outerSizeLabel },
      { label: '适配模型尺寸', value: formatSizeLabel(stlRetrofitPlan.rotatedSizeMm) },
      { label: 'Gridfinity 占位', value: gridSizeLabel },
      {
        label: '关键摘要',
        value: `切除深度 ${Number((rawParams as StlRetrofitParams).cutDepth ?? 0).toFixed(1)} mm`,
      },
    ]
  }

  return [
    { label: '外部尺寸', value: outerSizeLabel },
    { label: 'Gridfinity 占位', value: gridSizeLabel },
  ]
}

function resolveSummaryStatusLabel(context: Pick<
  SummaryContext,
  | 'genericShapePlan'
  | 'hasUnappliedChanges'
  | 'memoryCardPlan'
  | 'photoOutlinePlan'
  | 'stlCavityPlan'
  | 'stlRetrofitPlan'
  | 'templateId'
>) {
  if (context.templateId === 'parametric-cavity-bin' && context.hasUnappliedChanges) {
    return '草稿未生成'
  }

  if (context.templateId === 'memory-card-tray' && context.memoryCardPlan) {
    return context.memoryCardPlan.resolvedParams.lockOuterSize ? '固定尺寸' : '自动推荐'
  }

  if (context.templateId === 'parametric-cavity-bin' && context.genericShapePlan) {
    return '手动尺寸 / 自动排布'
  }

  if (context.templateId === 'photo-outline-bin' && context.photoOutlinePlan) {
    return '自动推荐'
  }

  if (context.templateId === 'stl-cavity-bin' && context.stlCavityPlan) {
    return context.stlCavityPlan.isAutoSized ? '自动推荐' : '固定尺寸'
  }

  if (context.templateId === 'stl-retrofit' && context.stlRetrofitPlan) {
    return context.stlRetrofitPlan.isAutoSized ? '自动推荐' : '固定尺寸'
  }

  return '当前配置'
}

function formatSizeLabel(size: [number, number, number]) {
  return `${size[0].toFixed(1)} x ${size[1].toFixed(1)} x ${size[2].toFixed(1)} mm`
}
