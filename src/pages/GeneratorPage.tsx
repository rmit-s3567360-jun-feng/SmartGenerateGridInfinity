import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'

import { ParameterPanel } from '../components/ParameterPanel'
import { PreviewCanvas } from '../components/PreviewCanvas'
import { useModelGenerator } from '../hooks/useModelGenerator'
import {
  getMemoryCardRecommendationSummary,
  normalizeMemoryCardModeParams,
} from '../lib/gridfinity/memoryCard'
import { templateCatalog } from '../lib/gridfinity/templateCatalog'
import {
  defaultGridfinitySpec,
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
  ParameterValues,
  TemplateDefinition,
  TemplateId,
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
    value === 'screwdriver-rack' ||
    value === 'memory-card-tray' ||
    value === 'pliers-holder'
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
  const {
    exportModel,
    generation,
    isExporting,
    isGenerating,
    runtimeError,
    validationErrors,
  } = useModelGenerator(templateId, rawParams)

  useEffect(() => {
    setRawParams(template.defaultParams)
  }, [template])

  if (!isTemplateId(routeTemplateId)) {
    return <Navigate replace to="/generator/generic-bin" />
  }

  const memoryCardSummary =
    templateId === 'memory-card-tray'
      ? (() => {
          try {
            const memoryTemplate = template as TemplateDefinition<MemoryCardTrayParams>
            const parsed = memoryTemplate.schema.safeParse(rawParams)

            if (!parsed.success) {
              return null
            }

            return getMemoryCardRecommendationSummary(parsed.data, defaultGridfinitySpec)
          } catch {
            return null
          }
        })()
      : null
  const currentGridX = memoryCardSummary?.size.gridX ?? Number(rawParams.gridX ?? template.defaultParams.gridX)
  const currentGridY = memoryCardSummary?.size.gridY ?? Number(rawParams.gridY ?? template.defaultParams.gridY)
  const currentHeightUnits =
    memoryCardSummary?.size.heightUnits ??
    Number(rawParams.heightUnits ?? template.defaultParams.heightUnits)

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
        <div className="hero__actions">
          <button
            className="button"
            disabled={
              Boolean(runtimeError) ||
              validationErrors.length > 0 ||
              !generation ||
              isGenerating ||
              isExporting
            }
            type="button"
            onClick={() => void handleExport()}
          >
            {isExporting ? '导出中...' : '导出 STL'}
          </button>
        </div>
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

      <section className="workspace">
        <ParameterPanel
          key={template.id}
          template={template}
          validationErrors={validationErrors}
          values={rawParams}
          onChange={(key, value) => {
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

                if (key === 'lockOuterSize' && value === true && memoryCardSummary) {
                  next.gridX = memoryCardSummary.size.gridX
                  next.gridY = memoryCardSummary.size.gridY
                  next.heightUnits = memoryCardSummary.size.heightUnits
                }
              }

              return next
            })
          }}
          onReset={() => {
            setRawParams(template.defaultParams)
          }}
        />

        <PreviewCanvas
          bounds={generation?.bounds ?? null}
          isLoading={isGenerating}
          positions={generation?.meshData.positions ?? null}
        />

        <aside className="panel panel--info">
          <div className="panel__header">
            <div>
              <p className="panel__eyebrow">规格摘要</p>
              <h2>当前模型</h2>
            </div>
          </div>

          <div className="stats-grid">
            <div className="stat-card">
              <span>外部宽度</span>
              <strong>{gridUnitsToMillimeters(currentGridX).toFixed(1)} mm</strong>
            </div>
            <div className="stat-card">
              <span>外部深度</span>
              <strong>{gridUnitsToMillimeters(currentGridY).toFixed(1)} mm</strong>
            </div>
            <div className="stat-card">
              <span>总高度</span>
              <strong>{heightUnitsToMillimeters(currentHeightUnits).toFixed(1)} mm</strong>
            </div>
            <div className="stat-card">
              <span>网格包围盒</span>
              <strong>
                {generation
                  ? `${generation.bounds.size[0].toFixed(1)} x ${generation.bounds.size[1].toFixed(1)} x ${generation.bounds.size[2].toFixed(1)}`
                  : '等待生成'}
              </strong>
            </div>
          </div>

          <div className="info-section">
            <h3>兼容规则</h3>
            <ul>
              <li>XY 节距: 42mm</li>
              <li>高度单位: 7mm</li>
              <li>外轮廓按 41.5mm 方块兼容</li>
              <li>磁铁孔规格: 6 x 2mm</li>
            </ul>
          </div>

          <div className="info-section">
            <h3>模板特性</h3>
            <ul>
              {template.previewFacts.map((fact) => (
                <li key={fact}>{fact}</li>
              ))}
            </ul>
          </div>

          {memoryCardSummary ? (
            <div className="info-section">
              <h3>{memoryCardSummary.isAutoSized ? '自动推荐尺寸' : '固定外部尺寸'}</h3>
              <ul>
                <li>
                  推荐尺寸: {memoryCardSummary.size.gridX} x {memoryCardSummary.size.gridY} x{' '}
                  {memoryCardSummary.size.heightUnits}
                </li>
                <li>布局方式: {memoryCardSummary.arrangementLabel}</li>
                <li>总卡数: {memoryCardSummary.quantity}</li>
              </ul>
            </div>
          ) : null}

          {generation?.warnings.length ? (
            <div className="warning-box">
              <strong>自动调整</strong>
              <ul>
                {generation.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {runtimeError ? (
            <div className="error-box" role="alert">
              <strong>生成失败</strong>
              <p>{runtimeError}</p>
            </div>
          ) : null}
        </aside>
      </section>
    </main>
  )
}
