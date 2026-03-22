import type { ReactNode } from 'react'
import { useState } from 'react'

import { createDefaultGenericShapeEntry } from '../lib/gridfinity/genericShapeCavity'
import type {
  AxisName,
  GenericShapeEntry,
  JsonValue,
  ParametricCavityBinParams,
  QuarterTurn,
  TemplateDefinition,
} from '../lib/gridfinity/types'
import { AxisInspectorGroup } from './AxisInspectorGroup'
import { ParameterPanel } from './ParameterPanel'

interface ParametricCavityWorkflowProps {
  actionPanel?: ReactNode
  hasPendingChanges: boolean
  isPreviewPending: boolean
  template: TemplateDefinition<ParametricCavityBinParams>
  values: ParametricCavityBinParams
  validationErrors: string[]
  onChange: (key: string, value: JsonValue) => void
  onReset: () => void
}

export function ParametricCavityWorkflow({
  actionPanel,
  hasPendingChanges,
  isPreviewPending,
  template,
  values,
  validationErrors,
  onChange,
  onReset,
}: ParametricCavityWorkflowProps) {
  const [clipboardEntry, setClipboardEntry] = useState<GenericShapeEntry | null>(null)
  const [clipboardMessage, setClipboardMessage] = useState<string | null>(null)

  function updateEntries(nextEntries: GenericShapeEntry[]) {
    onChange('shapeEntries', nextEntries)
  }

  function updateEntry(entryId: string, updater: (entry: GenericShapeEntry) => GenericShapeEntry) {
    updateEntries(
      values.shapeEntries.map((entry) => (entry.id === entryId ? updater(entry) : entry)),
    )
  }

  function addEntry(fromEntry?: GenericShapeEntry) {
    const nextIndex = values.shapeEntries.length + 1
    const nextEntry = cloneShapeEntry(fromEntry ?? createDefaultGenericShapeEntry(nextIndex), {
      id: createShapeId(),
      label: fromEntry?.label ? `${fromEntry.label} 副本` : `形状 ${nextIndex}`,
    })

    updateEntries([...values.shapeEntries, nextEntry])
  }

  function removeEntry(entryId: string) {
    updateEntries(values.shapeEntries.filter((entry) => entry.id !== entryId))
  }

  async function copyEntry(entry: GenericShapeEntry) {
    const cloned = cloneShapeEntry(entry)
    const serialized = JSON.stringify(cloned)

    setClipboardEntry(cloned)

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(serialized)
      }

      setClipboardMessage('已复制形状参数')
    } catch {
      setClipboardMessage('已复制到当前页面剪贴板')
    }
  }

  async function pasteEntry(entryId: string) {
    const fromClipboard = await readShapeEntryFromClipboard(clipboardEntry)

    if (!fromClipboard) {
      setClipboardMessage('未找到可粘贴的形状参数')
      return
    }

    updateEntry(entryId, (current) =>
      cloneShapeEntry(fromClipboard, {
        id: current.id,
      }),
    )
    setClipboardMessage('已粘贴形状参数')
  }

  async function pasteAsNewEntry() {
    const fromClipboard = await readShapeEntryFromClipboard(clipboardEntry)

    if (!fromClipboard) {
      setClipboardMessage('未找到可粘贴的形状参数')
      return
    }

    addEntry(fromClipboard)
    setClipboardMessage('已新增粘贴的形状')
  }

  return (
    <div className="control-stack">
      <ParameterPanel
        template={template}
        validationErrors={validationErrors}
        values={values}
        onChange={onChange}
        onReset={onReset}
      />
      <section className="panel">
        <div className="panel__header">
          <div>
            <p className="panel__eyebrow">型腔列表</p>
            <h2>基础形状</h2>
          </div>
          <div className="shape-entry-toolbar">
            <button className="button button--ghost" type="button" onClick={() => addEntry()}>
              添加形状
            </button>
            <button className="button button--ghost" type="button" onClick={() => void pasteAsNewEntry()}>
              粘贴新增
            </button>
          </div>
        </div>
        <p className="panel__meta">
          {hasPendingChanges
            ? '当前草稿尚未生成'
            : isPreviewPending
              ? '正在同步预览'
              : '当前预览已是最新'}
        </p>
        {clipboardMessage ? <p className="panel__hint">{clipboardMessage}</p> : null}
        <details className="help-drawer">
          <summary>编辑帮助</summary>
          <div className="help-drawer__body">
            <ul className="help-list">
              <li>先在左侧调整形状草稿，再到右侧预览区点击“生成图形”。</li>
              <li>复制后可直接粘贴为新形状，或覆盖当前形状。</li>
              <li>当前盒体尺寸始终手动指定，可在上方切换横向优先或纵向优先排布。</li>
              <li>盒高允许只包裹一部分 Z 高度，顶部可以露出。</li>
              <li>每个形状都使用固定的 X / Y / Z 旋转，不再自动切换姿态。</li>
            </ul>
          </div>
        </details>
        <div className="shape-entry-list">
          {values.shapeEntries.map((entry, index) => (
            <article className="shape-entry-card" key={entry.id}>
              <div className="shape-entry-card__header">
                <strong title={`形状 ${index + 1}`}>形状 {index + 1}</strong>
                <div className="shape-entry-card__actions">
                  <button
                    className="button button--ghost"
                    type="button"
                    onClick={() => void copyEntry(entry)}
                  >
                    复制
                  </button>
                  <button
                    className="button button--ghost"
                    type="button"
                    onClick={() => void pasteEntry(entry.id)}
                  >
                    粘贴
                  </button>
                  <button
                    className="button button--ghost"
                    type="button"
                    onClick={() => addEntry(entry)}
                  >
                    复制一份
                  </button>
                  <button
                    className="button button--ghost"
                    disabled={values.shapeEntries.length <= 1}
                    type="button"
                    onClick={() => removeEntry(entry.id)}
                  >
                    删除
                  </button>
                </div>
              </div>

              <div className="form-grid form-grid--shape">
                <TextInput
                  label="名称"
                  value={entry.label}
                  onChange={(nextValue) =>
                    updateEntry(entry.id, (current) => ({
                      ...current,
                      label: nextValue,
                    }))
                  }
                />

                <label className="form-field form-field--compact">
                  <span title="形状">形状</span>
                  <select
                    aria-label="形状"
                    value={entry.kind}
                    onChange={(event) =>
                      updateEntry(entry.id, (current) => ({
                        ...current,
                        kind: event.target.value as GenericShapeEntry['kind'],
                      }))
                    }
                  >
                    <option value="rectangle">矩形</option>
                    <option value="rounded-rectangle">圆角矩形</option>
                    <option value="circle">圆</option>
                    <option value="capsule">胶囊槽</option>
                  </select>
                </label>

                <NumericInput
                  label="数量"
                  step={1}
                  unit="个"
                  value={entry.quantity}
                  onChange={(nextValue) =>
                    updateEntry(entry.id, (current) => ({
                      ...current,
                      quantity: Math.max(1, Math.round(nextValue)),
                    }))
                  }
                />
              </div>

              <AxisInspectorGroup
                compact
                items={createShapeAxisItems(entry, updateEntry)}
                showHint={false}
              />

              {entry.kind === 'rounded-rectangle' ? (
                <div className="form-grid form-grid--shape form-grid--shape-secondary">
                  <NumericInput
                    label="圆角"
                    unit="mm"
                    value={entry.cornerRadius}
                    onChange={(nextValue) =>
                      updateEntry(entry.id, (current) => ({
                        ...current,
                        cornerRadius: nextValue,
                      }))
                    }
                  />
                </div>
              ) : null}

              <div className="shape-entry-card__advanced">
                <AxisInspectorGroup
                  compact
                  items={createRotationAxisItems(entry, updateEntry)}
                  showHint={false}
                  title="固定旋转"
                />
              </div>
            </article>
          ))}
        </div>
      </section>
      {actionPanel}
    </div>
  )
}

function createShapeAxisItems(
  entry: GenericShapeEntry,
  updateEntry: (entryId: string, updater: (entry: GenericShapeEntry) => GenericShapeEntry) => void,
) {
  const items: Array<{
    axis: AxisName
    value: number
    caption: string
    unit?: string
    onChange: (value: string) => void
    disabled?: boolean
  }> = []

  if (entry.kind === 'circle') {
    items.push(
      {
        axis: 'x',
        value: entry.diameter,
        caption: '直径',
        unit: 'mm',
        onChange: (nextValue) =>
          updateEntry(entry.id, (current) => ({
            ...current,
            diameter: normalizeNumberValue(nextValue, current.diameter),
          })),
      },
      {
        axis: 'y',
        value: entry.diameter,
        caption: '圆形截面',
        unit: 'mm',
        onChange: (nextValue) =>
          updateEntry(entry.id, (current) => ({
            ...current,
            diameter: normalizeNumberValue(nextValue, current.diameter),
          })),
      },
      {
        axis: 'z',
        value: entry.height,
        caption: '高度',
        unit: 'mm',
        onChange: (nextValue) =>
          updateEntry(entry.id, (current) => ({
            ...current,
            height: normalizeNumberValue(nextValue, current.height),
          })),
      },
    )

    return items
  }

  if (entry.kind === 'capsule') {
    items.push(
      {
        axis: 'x',
        value: entry.length,
        caption: '总长',
        unit: 'mm',
        onChange: (nextValue) =>
          updateEntry(entry.id, (current) => ({
            ...current,
            length: normalizeNumberValue(nextValue, current.length),
          })),
      },
      {
        axis: 'y',
        value: entry.diameter,
        caption: '直径',
        unit: 'mm',
        onChange: (nextValue) =>
          updateEntry(entry.id, (current) => ({
            ...current,
            diameter: normalizeNumberValue(nextValue, current.diameter),
          })),
      },
      {
        axis: 'z',
        value: entry.height,
        caption: '高度',
        unit: 'mm',
        onChange: (nextValue) =>
          updateEntry(entry.id, (current) => ({
            ...current,
            height: normalizeNumberValue(nextValue, current.height),
          })),
      },
    )

    return items
  }

  items.push(
    {
      axis: 'x',
      value: entry.width,
      caption: '尺寸 X',
      unit: 'mm',
      onChange: (nextValue) =>
        updateEntry(entry.id, (current) => ({
          ...current,
          width: normalizeNumberValue(nextValue, current.width),
        })),
    },
    {
      axis: 'y',
      value: entry.depth,
      caption: '尺寸 Y',
      unit: 'mm',
      onChange: (nextValue) =>
        updateEntry(entry.id, (current) => ({
          ...current,
          depth: normalizeNumberValue(nextValue, current.depth),
        })),
    },
    {
      axis: 'z',
      value: entry.height,
      caption: '尺寸 Z',
      unit: 'mm',
      onChange: (nextValue) =>
        updateEntry(entry.id, (current) => ({
          ...current,
          height: normalizeNumberValue(nextValue, current.height),
        })),
    },
  )

  return items
}

function createRotationAxisItems(
  entry: GenericShapeEntry,
  updateEntry: (entryId: string, updater: (entry: GenericShapeEntry) => GenericShapeEntry) => void,
) {
  const rotationFieldByAxis = {
    x: 'rotationX',
    y: 'rotationY',
    z: 'rotationZ',
  } as const

  return (['x', 'y', 'z'] as const).map((axis) => ({
    axis,
    value: String(entry[rotationFieldByAxis[axis]]),
    caption: `旋转 ${axis.toUpperCase()}`,
    options: rotationOptions,
    onChange: (nextValue: string) =>
      updateEntry(entry.id, (current) => ({
        ...current,
        [rotationFieldByAxis[axis]]: Number(nextValue) as QuarterTurn,
      })),
  }))
}

interface TextInputProps {
  label: string
  value: string
  onChange: (value: string) => void
}

function TextInput({
  label,
  value,
  onChange,
}: TextInputProps) {
  return (
    <label className="form-field form-field--compact">
      <span title={label}>{label}</span>
      <input
        aria-label={label}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

interface NumericInputProps {
  label: string
  step?: number
  unit?: string
  value: number
  onChange: (value: number) => void
}

function NumericInput({
  label,
  step = 0.1,
  unit,
  value,
  onChange,
}: NumericInputProps) {
  const [draftValue, setDraftValue] = useState<string | null>(null)
  const displayedValue = draftValue ?? String(value)

  return (
    <label className="form-field form-field--compact">
      <div className="form-field__top">
        <span title={label}>{label}</span>
        {unit ? <small className="field-unit">{unit}</small> : null}
      </div>
      <input
        aria-label={label}
        min={0}
        step={step}
        type="number"
        value={displayedValue}
        onBlur={() => {
          const numericValue = parseDraftNumber(displayedValue)

          if (numericValue === null) {
            setDraftValue(null)
            return
          }

          setDraftValue(null)
          onChange(numericValue)
        }}
        onChange={(event) => {
          const nextValue = event.target.value

          setDraftValue(nextValue)

          const numericValue = parseDraftNumber(nextValue)

          if (numericValue !== null) {
            onChange(numericValue)
          }
        }}
      />
    </label>
  )
}

function normalizeNumberValue(value: string, fallback: number) {
  const numeric = Number(value)

  return Number.isFinite(numeric) ? numeric : fallback
}

function parseDraftNumber(value: string) {
  const trimmed = value.trim()

  if (
    trimmed.length === 0 ||
    trimmed === '-' ||
    trimmed === '.' ||
    trimmed === '-.' ||
    trimmed.endsWith('.')
  ) {
    return null
  }

  const numeric = Number(trimmed)

  return Number.isFinite(numeric) ? numeric : null
}

function createShapeId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `shape-${Date.now()}-${Math.floor(Math.random() * 1000)}`
  )
}

function cloneShapeEntry(
  entry: GenericShapeEntry,
  overrides: Partial<GenericShapeEntry> = {},
): GenericShapeEntry {
  return {
    ...entry,
    ...overrides,
  }
}

async function readShapeEntryFromClipboard(
  fallbackEntry: GenericShapeEntry | null,
) {
  const clipboardText = await readClipboardText()
  const parsed = clipboardText ? parseShapeEntry(clipboardText) : null

  if (parsed) {
    return parsed
  }

  return fallbackEntry ? cloneShapeEntry(fallbackEntry) : null
}

async function readClipboardText() {
  try {
    if (!navigator.clipboard?.readText) {
      return null
    }

    return await navigator.clipboard.readText()
  } catch {
    return null
  }
}

function parseShapeEntry(rawText: string) {
  try {
    const parsed = JSON.parse(rawText) as Partial<GenericShapeEntry>
    const fallback = createDefaultGenericShapeEntry()

    return {
      ...fallback,
      ...parsed,
      id: parsed.id ?? fallback.id,
      label: parsed.label ?? fallback.label,
      kind: parsed.kind ?? fallback.kind,
      quantity: typeof parsed.quantity === 'number' ? parsed.quantity : fallback.quantity,
      width: typeof parsed.width === 'number' ? parsed.width : fallback.width,
      depth: typeof parsed.depth === 'number' ? parsed.depth : fallback.depth,
      height: typeof parsed.height === 'number' ? parsed.height : fallback.height,
      cornerRadius:
        typeof parsed.cornerRadius === 'number'
          ? parsed.cornerRadius
          : fallback.cornerRadius,
      diameter: typeof parsed.diameter === 'number' ? parsed.diameter : fallback.diameter,
      length: typeof parsed.length === 'number' ? parsed.length : fallback.length,
      rotationX:
        parsed.rotationX === 0 ||
        parsed.rotationX === 1 ||
        parsed.rotationX === 2 ||
        parsed.rotationX === 3
          ? parsed.rotationX
          : fallback.rotationX,
      rotationY:
        parsed.rotationY === 0 ||
        parsed.rotationY === 1 ||
        parsed.rotationY === 2 ||
        parsed.rotationY === 3
          ? parsed.rotationY
          : fallback.rotationY,
      rotationZ:
        parsed.rotationZ === 0 ||
        parsed.rotationZ === 1 ||
        parsed.rotationZ === 2 ||
        parsed.rotationZ === 3
          ? parsed.rotationZ
          : fallback.rotationZ,
    } satisfies GenericShapeEntry
  } catch {
    return null
  }
}

const rotationOptions = [
  { label: '0°', value: '0' },
  { label: '90°', value: '1' },
  { label: '180°', value: '2' },
  { label: '270°', value: '3' },
]
