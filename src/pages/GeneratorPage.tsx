import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'

import { ParameterPanel } from '../components/ParameterPanel'
import { PhotoOutlineWorkflow } from '../components/PhotoOutlineWorkflow'
import { PreviewCanvas } from '../components/PreviewCanvas'
import { StlCavityWorkflow } from '../components/StlCavityWorkflow'
import { StlRetrofitWorkflow } from '../components/StlRetrofitWorkflow'
import { useModelGenerator } from '../hooks/useModelGenerator'
import {
  getMemoryCardRecommendationSummary,
  normalizeMemoryCardModeParams,
} from '../lib/gridfinity/memoryCard'
import {
  PHOTO_OUTLINE_A4_SHEET_DOWNLOAD_PATH,
  getPhotoOutlineRecommendationSummary,
  PHOTO_OUTLINE_RULER_DOWNLOAD_PATH,
} from '../lib/gridfinity/photoOutline'
import { resolveStlCavityBinPlan } from '../lib/gridfinity/stlCavityBin'
import { resolveStlRetrofitPlan } from '../lib/gridfinity/stlRetrofit'
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
  const photoParams =
    templateId === 'photo-outline-bin' ? (rawParams as PhotoOutlineBinParams) : null
  const stlCavityParams =
    templateId === 'stl-cavity-bin' ? (rawParams as StlCavityBinParams) : null
  const stlParams =
    templateId === 'stl-retrofit' ? (rawParams as StlRetrofitParams) : null
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
  const photoOutlineSummary =
    templateId === 'photo-outline-bin'
      ? (() => {
          try {
            const photoTemplate = template as TemplateDefinition<PhotoOutlineBinParams>
            const parsed = photoTemplate.schema.safeParse(rawParams)

            if (!parsed.success) {
              return null
            }

            return getPhotoOutlineRecommendationSummary(parsed.data, defaultGridfinitySpec)
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
    memoryCardSummary?.size.gridX ??
    photoOutlineSummary?.size.gridX ??
    stlCavityPlan?.size.gridX ??
    stlRetrofitPlan?.size.gridX ??
    Number(rawParams.gridX ?? template.defaultParams.gridX)
  const currentGridY =
    memoryCardSummary?.size.gridY ??
    photoOutlineSummary?.size.gridY ??
    stlCavityPlan?.size.gridY ??
    stlRetrofitPlan?.size.gridY ??
    Number(rawParams.gridY ?? template.defaultParams.gridY)
  const currentHeightUnits =
    memoryCardSummary?.size.heightUnits ??
    photoOutlineSummary?.size.heightUnits ??
    stlCavityPlan?.size.heightUnits ??
    stlRetrofitPlan?.size.heightUnits ??
    Number(rawParams.heightUnits ?? template.defaultParams.heightUnits)

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

        if (key === 'lockOuterSize' && value === true && memoryCardSummary) {
          next.gridX = memoryCardSummary.size.gridX
          next.gridY = memoryCardSummary.size.gridY
          next.heightUnits = memoryCardSummary.size.heightUnits
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

            <PreviewCanvas
              bounds={generation?.bounds ?? null}
              isLoading={isGenerating}
              isPending={isPreviewPending}
              positions={generation?.meshData.positions ?? null}
            />
          </>
        )}

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

          {photoOutlineSummary ? (
            <div className="info-section">
              <h3>轮廓求解结果</h3>
              <ul>
                <li>
                  推荐尺寸: {photoOutlineSummary.size.gridX} x {photoOutlineSummary.size.gridY} x{' '}
                  {photoOutlineSummary.size.heightUnits}
                </li>
                <li>摆放方向: {photoOutlineSummary.orientationLabel}</li>
                <li>
                  轮廓尺寸: {photoOutlineSummary.contourWidthMm.toFixed(1)} x{' '}
                  {photoOutlineSummary.contourHeightMm.toFixed(1)} mm
                </li>
                <li>缩放比例: {photoOutlineSummary.mmPerPixel.toFixed(4)} mm/px</li>
                <li>关键点数量: {photoOutlineSummary.pointCount}</li>
              </ul>
            </div>
          ) : null}

          {stlCavityPlan ? (
            <div className="info-section">
              <h3>{stlCavityPlan.isAutoSized ? '自动推荐尺寸' : '固定外部尺寸'}</h3>
              <ul>
                <li>
                  推荐尺寸: {stlCavityPlan.size.gridX} x {stlCavityPlan.size.gridY} x{' '}
                  {stlCavityPlan.size.heightUnits}
                </li>
                <li>
                  旋转后尺寸: {stlCavityPlan.rotatedSizeMm[0].toFixed(1)} x{' '}
                  {stlCavityPlan.rotatedSizeMm[1].toFixed(1)} x{' '}
                  {stlCavityPlan.rotatedSizeMm[2].toFixed(1)} mm
                </li>
                <li>
                  型腔占位: {stlCavityPlan.cavitySizeMm[0].toFixed(1)} x{' '}
                  {stlCavityPlan.cavitySizeMm[1].toFixed(1)} x{' '}
                  {stlCavityPlan.cavitySizeMm[2].toFixed(1)} mm
                </li>
                <li>顶部余量: {stlCavityPlan.topClearanceMm.toFixed(1)} mm</li>
                <li>外形规则: 标准矩形外壳 + STL 负形</li>
              </ul>
            </div>
          ) : null}

          {stlRetrofitPlan ? (
            <div className="info-section">
              <h3>{stlRetrofitPlan.isAutoSized ? '自动推荐尺寸' : '固定外部尺寸'}</h3>
              <ul>
                <li>
                  推荐尺寸: {stlRetrofitPlan.size.gridX} x {stlRetrofitPlan.size.gridY} x{' '}
                  {stlRetrofitPlan.size.heightUnits}
                </li>
                <li>
                  旋转后尺寸: {stlRetrofitPlan.rotatedSizeMm[0].toFixed(1)} x{' '}
                  {stlRetrofitPlan.rotatedSizeMm[1].toFixed(1)} x{' '}
                  {stlRetrofitPlan.rotatedSizeMm[2].toFixed(1)} mm
                </li>
                <li>切除深度: {stlParams ? stlParams.cutDepth.toFixed(1) : '0.0'} mm</li>
                <li>底座高度: {stlRetrofitPlan.baseHeightMm.toFixed(1)} mm</li>
                <li>外形规则: 规整为标准矩形实体</li>
                <li>顶部规则: {stlParams?.stackingLip ? '标准堆叠口' : '标准平顶'}</li>
                <li>总高度: {stlRetrofitPlan.totalHeightMm.toFixed(1)} mm</li>
              </ul>
            </div>
          ) : null}

          {templateId === 'photo-outline-bin' ? (
            <div className="info-section">
              <h3>标尺校准</h3>
              <ul>
                <li>
                  标尺状态:{' '}
                  {photoParams?.analysis?.ruler.status === 'detected'
                      ? '已识别'
                      : photoParams?.analysis
                        ? '未识别'
                        : '等待上传'}
                </li>
                <li>已知尺寸: 80 x 60 mm L 形标尺</li>
                <li>
                  <a download href={PHOTO_OUTLINE_RULER_DOWNLOAD_PATH}>
                    下载标尺 STL
                  </a>
                </li>
                <li>
                  <a download href={PHOTO_OUTLINE_A4_SHEET_DOWNLOAD_PATH}>
                    下载 A4 校准底纸 SVG
                  </a>
                </li>
                <li>A4 底纸: 当前 V1 仍以内嵌 L 标尺校准，角标供后续整页校准升级</li>
                <li>首版边界: 单物体、俯拍、干净背景、同平面校准</li>
              </ul>
            </div>
          ) : null}

          {templateId === 'stl-cavity-bin' ? (
            <div className="info-section">
              <h3>源模型状态</h3>
              <ul>
                <li>上传状态: {stlCavityParams?.source ? '已导入' : '等待上传'}</li>
                <li>旋转限制: 仅支持 X / Y / Z 的 90° 步进旋转</li>
                <li>输入边界: 仅支持单个封闭实体 STL</li>
                <li>型腔策略: 使用真实 STL 几何减去内部负形</li>
                <li>开口策略: 顶部入口直接贯通到顶面</li>
              </ul>
            </div>
          ) : null}

          {templateId === 'stl-retrofit' ? (
            <div className="info-section">
              <h3>源模型状态</h3>
              <ul>
                <li>上传状态: {stlParams?.source ? '已导入' : '等待上传'}</li>
                <li>旋转限制: 仅支持 X / Y / Z 的 90° 步进旋转</li>
                <li>输入边界: 仅支持单个封闭实体 STL</li>
                <li>外形策略: 整体外形会规整为标准矩形</li>
                <li>高度策略: 通过补高标准实体对齐到标准 7mm 单位</li>
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
