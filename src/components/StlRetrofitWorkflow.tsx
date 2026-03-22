import type { ChangeEvent, ReactNode } from 'react'
import { useState } from 'react'

import type {
  GenerationResult,
  ImportedStlSourceSummary,
  JsonValue,
  StlRetrofitParams,
} from '../lib/gridfinity/types'
import { AxisInspectorGroup } from './AxisInspectorGroup'
import { FieldHint } from './FieldHint'
import { NumericFieldControl } from './NumericFieldControl'
import { PreviewCanvas } from './PreviewCanvas'

interface StlRetrofitWorkflowProps {
  values: StlRetrofitParams
  validationErrors: string[]
  generation: GenerationResult | null
  isGenerating: boolean
  isPreviewPending: boolean
  isImporting: boolean
  summaryPanel?: ReactNode
  onChange: (key: string, value: JsonValue) => void
  onImport: (file: File) => Promise<ImportedStlSourceSummary>
  onReset: () => void
}

export function StlRetrofitWorkflow({
  values,
  validationErrors,
  generation,
  isGenerating,
  isPreviewPending,
  isImporting,
  summaryPanel,
  onChange,
  onImport,
  onReset,
}: StlRetrofitWorkflowProps) {
  const [uploadError, setUploadError] = useState<string | null>(null)
  const blockingErrors = validationErrors.filter((error) => error !== '请先上传 STL 模型。')

  async function handleFileSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    event.target.value = ''

    if (!file) {
      return
    }

    try {
      const summary = await onImport(file)
      setUploadError(null)
      onChange('source', summary)
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : '导入 STL 失败。')
    }
  }

  function handleReset() {
    setUploadError(null)
    onReset()
  }

  return (
    <div className="stl-workspace">
      <section className="panel stl-control-panel">
        <div className="panel__header">
          <div>
            <p className="panel__eyebrow">导入流程</p>
            <h2>STL 改底适配</h2>
          </div>
          <button className="button button--ghost" type="button" onClick={handleReset}>
            恢复默认
          </button>
        </div>
        <p className="panel__body">
          上传 STL 后，先用 90° 旋转把模型摆正，再规整成 Gridfinity 标准矩形实体。
        </p>

        {uploadError ? (
          <div className="error-box" role="alert">
            <strong>导入失败</strong>
            <p>{uploadError}</p>
          </div>
        ) : null}

        {blockingErrors.length > 0 ? (
          <div className="error-box" role="alert">
            <strong>当前结果不可用</strong>
            <ul>
              {blockingErrors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <label className="photo-upload-box">
          <div className="form-field__top">
            <span>上传 STL 模型</span>
            <FieldHint text="支持 ASCII STL 和 Binary STL。首版只接受可稳定求解的封闭实体。" />
          </div>
          <input accept=".stl,model/stl" type="file" onChange={handleFileSelect} />
        </label>

        {isImporting ? (
          <div className="status-pill">正在解析 STL...</div>
        ) : null}

        {values.source ? (
          <div className="stl-meta-grid">
            <div className="stat-card">
              <span>当前文件</span>
              <strong>{values.source.name}</strong>
            </div>
            <div className="stat-card">
              <span>格式 / 面数</span>
              <strong>
                {values.source.format.toUpperCase()} / {values.source.triangleCount}
              </strong>
            </div>
            <div className="stat-card">
              <span>原始尺寸</span>
              <strong>
                {values.source.originalSizeMm[0].toFixed(1)} x {values.source.originalSizeMm[1].toFixed(1)} x{' '}
                {values.source.originalSizeMm[2].toFixed(1)} mm
              </strong>
            </div>
            <div className="stat-card">
              <span>文件大小</span>
              <strong>{formatFileSize(values.source.sizeBytes)}</strong>
            </div>
          </div>
        ) : null}

        <AxisInspectorGroup
          description="用 X / Y / Z 三轴旋转把模型朝向摆正，和右侧预览坐标轴同步。"
          items={[
            {
              axis: 'x',
              value: String(values.rotationX),
              options: rotationOptions,
              caption: 'X 轴旋转',
              onChange: (nextValue) => onChange('rotationX', Number(nextValue)),
            },
            {
              axis: 'y',
              value: String(values.rotationY),
              options: rotationOptions,
              caption: 'Y 轴旋转',
              onChange: (nextValue) => onChange('rotationY', Number(nextValue)),
            },
            {
              axis: 'z',
              value: String(values.rotationZ),
              options: rotationOptions,
              caption: 'Z 轴旋转',
              onChange: (nextValue) => onChange('rotationZ', Number(nextValue)),
            },
          ]}
          title="旋转"
        />

        <label className="form-field">
          <div className="form-field__top">
            <span>尺寸模式</span>
            <FieldHint text="自动模式会搜索最小占位；固定模式使用你手动指定的 Gridfinity 尺寸。" />
          </div>
          <select
            aria-label="尺寸模式"
            value={values.sizeMode}
            onChange={(event) => onChange('sizeMode', event.target.value)}
          >
            <option value="auto">自动推荐</option>
            <option value="locked">固定尺寸</option>
          </select>
        </label>

        <div className="form-grid">
          {values.sizeMode === 'locked' ? (
            <AxisInspectorGroup
              description="固定模式下直接指定外部 X / Y / Z 占位，便于和原模型姿态一起判断。"
              items={[
                {
                  axis: 'x',
                  value: values.gridX,
                  min: 1,
                  max: 8,
                  step: 1,
                  caption: 'X 占位单元',
                  onChange: (nextValue) =>
                    onChange('gridX', normalizeNumberControlValue(nextValue)),
                },
                {
                  axis: 'y',
                  value: values.gridY,
                  min: 1,
                  max: 8,
                  step: 1,
                  caption: 'Y 占位单元',
                  onChange: (nextValue) =>
                    onChange('gridY', normalizeNumberControlValue(nextValue)),
                },
                {
                  axis: 'z',
                  value: values.heightUnits,
                  min: 2,
                  max: 24,
                  step: 1,
                  caption: 'Z 高度单位',
                  onChange: (nextValue) =>
                    onChange('heightUnits', normalizeNumberControlValue(nextValue)),
                },
              ]}
              title="外部尺寸"
            />
          ) : null}

          <NumericFieldControl
            description="从模型底部切掉的深度。"
            label="切除深度"
            max={120}
            min={0.5}
            step={0.1}
            value={values.cutDepth}
            onChange={(value) => onChange('cutDepth', normalizeNumberControlValue(value))}
          />

          <NumericFieldControl
            description="模型 XY 外缘到 Gridfinity 占位边界的安全余量。"
            label="外缘余量"
            max={16}
            min={0}
            step={0.1}
            value={values.footprintMargin}
            onChange={(value) =>
              onChange('footprintMargin', normalizeNumberControlValue(value))
            }
          />

          <NumericFieldControl
            description="底脚之上的最小标准实体厚度。"
            label="实体层厚度"
            max={24}
            min={0.5}
            step={0.1}
            value={values.minAdapterThickness}
            onChange={(value) =>
              onChange('minAdapterThickness', normalizeNumberControlValue(value))
            }
          />
        </div>

        <label className="toggle-field">
          <div className="form-field__top">
            <span>磁铁孔</span>
            <FieldHint text="沿用当前每格 4 孔、6 x 2mm 的磁铁孔布局。" />
          </div>
          <input
            checked={values.magnetHoles}
            type="checkbox"
            onChange={(event) => onChange('magnetHoles', event.target.checked)}
          />
        </label>

        <label className="toggle-field">
          <div className="form-field__top">
            <span>标准堆叠口</span>
            <FieldHint text="默认关闭，开启后会在顶部增加标准 Gridfinity 堆叠口。" />
          </div>
          <input
            checked={values.stackingLip}
            type="checkbox"
            onChange={(event) => onChange('stackingLip', event.target.checked)}
          />
        </label>

      </section>

      <div className="stl-results-column">
        {summaryPanel}
        <PreviewCanvas
          bounds={generation?.bounds ?? null}
          isLoading={isGenerating}
          isPending={isPreviewPending}
          positions={generation?.meshData.positions ?? null}
        />

        <section className="panel stl-guidance-panel">
          <div className="panel__header">
            <div>
              <p className="panel__eyebrow">操作提示</p>
              <h2>改底规则</h2>
            </div>
          </div>
          <div className="info-section">
            <h3>首版边界</h3>
            <ul>
              <li>只支持 90° 步进旋转，不支持任意角度。</li>
              <li>当前会把整体外形规整为标准矩形，不缩放 STL，不合并多个模型。</li>
              <li>最终高度会自动补齐到 7mm 的 Gridfinity 高度单位。</li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  )
}

const rotationOptions = [
  { label: '0°', value: '0' },
  { label: '90°', value: '1' },
  { label: '180°', value: '2' },
  { label: '270°', value: '3' },
]

function normalizeNumberControlValue(value: number | string) {
  if (typeof value === 'number') {
    return value
  }

  if (value.trim() === '') {
    return value
  }

  const numeric = Number(value)

  return Number.isFinite(numeric) ? numeric : value
}

function formatFileSize(sizeBytes: number) {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`
  }

  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`
  }

  return `${(sizeBytes / 1024 / 1024).toFixed(2)} MB`
}
