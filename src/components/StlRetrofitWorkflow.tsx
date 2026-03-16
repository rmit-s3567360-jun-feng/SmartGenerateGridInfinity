import type { ChangeEvent } from 'react'
import { useState } from 'react'

import type {
  GenerationResult,
  ImportedStlSourceSummary,
  JsonValue,
  StlRetrofitParams,
} from '../lib/gridfinity/types'
import { NumericFieldControl } from './NumericFieldControl'
import { PreviewCanvas } from './PreviewCanvas'

interface StlRetrofitWorkflowProps {
  values: StlRetrofitParams
  validationErrors: string[]
  generation: GenerationResult | null
  isGenerating: boolean
  isPreviewPending: boolean
  isImporting: boolean
  onChange: (key: string, value: JsonValue) => void
  onImport: (file: File) => Promise<ImportedStlSourceSummary>
  onReset: () => void
}

const rotationLabelMap = ['0°', '90°', '180°', '270°'] as const

export function StlRetrofitWorkflow({
  values,
  validationErrors,
  generation,
  isGenerating,
  isPreviewPending,
  isImporting,
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

  function rotateAxis(key: 'rotationX' | 'rotationY' | 'rotationZ') {
    const nextValue = ((Number(values[key]) + 1) % 4) as StlRetrofitParams[typeof key]

    onChange(key, nextValue)
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
          <span>上传 STL 模型</span>
          <small>支持 ASCII STL 和 Binary STL。首版只接受可稳定求解的封闭实体。</small>
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

        <div className="stl-rotation-grid">
          <RotationCard
            axis="X"
            value={rotationLabelMap[values.rotationX]}
            onRotate={() => rotateAxis('rotationX')}
          />
          <RotationCard
            axis="Y"
            value={rotationLabelMap[values.rotationY]}
            onRotate={() => rotateAxis('rotationY')}
          />
          <RotationCard
            axis="Z"
            value={rotationLabelMap[values.rotationZ]}
            onRotate={() => rotateAxis('rotationZ')}
          />
        </div>

        <label className="form-field">
          <span>尺寸模式</span>
          <small>自动模式会搜索最小占位；固定模式使用你手动指定的 Gridfinity 尺寸。</small>
          <select
            value={values.sizeMode}
            onChange={(event) => onChange('sizeMode', event.target.value)}
          >
            <option value="auto">自动推荐</option>
            <option value="locked">固定尺寸</option>
          </select>
        </label>

        <div className="form-grid">
          {values.sizeMode === 'locked' ? (
            <>
              <NumericFieldControl
                description="固定 Gridfinity X 占位。"
                label="宽度单元"
                max={8}
                min={1}
                step={1}
                value={values.gridX}
                onChange={(value) => onChange('gridX', normalizeNumberControlValue(value))}
              />
              <NumericFieldControl
                description="固定 Gridfinity Y 占位。"
                label="深度单元"
                max={8}
                min={1}
                step={1}
                value={values.gridY}
                onChange={(value) => onChange('gridY', normalizeNumberControlValue(value))}
              />
              <NumericFieldControl
                description="固定最终高度单位。"
                label="高度单元"
                max={24}
                min={2}
                step={1}
                value={values.heightUnits}
                onChange={(value) =>
                  onChange('heightUnits', normalizeNumberControlValue(value))
                }
              />
            </>
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
          <div>
            <span>磁铁孔</span>
            <small>沿用当前每格 4 孔、6 x 2mm 的磁铁孔布局。</small>
          </div>
          <input
            checked={values.magnetHoles}
            type="checkbox"
            onChange={(event) => onChange('magnetHoles', event.target.checked)}
          />
        </label>

        <label className="toggle-field">
          <div>
            <span>标准堆叠口</span>
            <small>默认关闭，开启后会在顶部增加标准 Gridfinity 堆叠口。</small>
          </div>
          <input
            checked={values.stackingLip}
            type="checkbox"
            onChange={(event) => onChange('stackingLip', event.target.checked)}
          />
        </label>

      </section>

      <div className="stl-results-column">
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

interface RotationCardProps {
  axis: 'X' | 'Y' | 'Z'
  value: string
  onRotate: () => void
}

function RotationCard({ axis, value, onRotate }: RotationCardProps) {
  return (
    <div className="stl-rotation-card">
      <span>{axis} 轴旋转</span>
      <strong>{value}</strong>
      <button className="button button--ghost" type="button" onClick={onRotate}>
        {axis} +90°
      </button>
    </div>
  )
}

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
