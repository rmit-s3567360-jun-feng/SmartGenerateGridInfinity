import { useState } from 'react'

import type { AxisName, FieldOption } from '../lib/gridfinity/types'
import { FieldHint } from './FieldHint'

interface AxisInspectorItem {
  axis: AxisName
  value: string | number
  onChange: (value: string) => void
  min?: number
  max?: number
  step?: number
  options?: FieldOption[]
  caption?: string
  unit?: string
  disabled?: boolean
}

interface AxisInspectorGroupProps {
  title?: string
  description?: string
  items: AxisInspectorItem[]
  compact?: boolean
  showHint?: boolean
}

export function AxisInspectorGroup({
  title,
  description,
  items,
  compact = false,
  showHint = true,
}: AxisInspectorGroupProps) {
  return (
    <section className={compact ? 'axis-group axis-group--compact' : 'axis-group'}>
      {title ? (
        <div className="axis-group__header">
          <div className="axis-group__title">
            <h3 title={title}>{title}</h3>
            {showHint && description ? <FieldHint text={description} /> : null}
          </div>
        </div>
      ) : null}
      <div className="axis-group__grid">
        {items.map((item) => (
          <AxisInspectorField
            item={item}
            key={`${item.axis}-${item.caption ?? ''}`}
            showHint={showHint}
          />
        ))}
      </div>
    </section>
  )
}

interface AxisInspectorFieldProps {
  item: AxisInspectorItem
  showHint: boolean
}

function AxisInspectorField({ item, showHint }: AxisInspectorFieldProps) {
  const [draftValue, setDraftValue] = useState<string | null>(null)
  const displayedValue = draftValue ?? String(item.value)

  if (item.options) {
    return (
      <label className={`axis-input axis-input--${item.axis}`}>
        <div className="axis-input__top">
          <span className="axis-input__badge">{item.axis.toUpperCase()}</span>
          {item.unit ? <small className="field-unit">{item.unit}</small> : null}
          {showHint && item.caption ? <FieldHint text={item.caption} /> : null}
        </div>
        <select
          aria-label={item.caption ?? item.axis.toUpperCase()}
          disabled={item.disabled}
          value={String(item.value)}
          onChange={(event) => item.onChange(event.target.value)}
        >
          {item.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    )
  }

  return (
    <label className={`axis-input axis-input--${item.axis}`}>
      <div className="axis-input__top">
        <span className="axis-input__badge">{item.axis.toUpperCase()}</span>
        {item.unit ? <small className="field-unit">{item.unit}</small> : null}
        {showHint && item.caption ? <FieldHint text={item.caption} /> : null}
      </div>
      <input
        aria-label={item.caption ?? item.axis.toUpperCase()}
        disabled={item.disabled}
        inputMode="decimal"
        max={item.max}
        min={item.min}
        step={item.step}
        type="number"
        value={displayedValue}
        onBlur={() => {
          const normalizedValue = normalizeNumericDraft(displayedValue)

          if (!normalizedValue) {
            setDraftValue(null)
            return
          }

          setDraftValue(null)
          item.onChange(normalizedValue)
        }}
        onChange={(event) => {
          const nextValue = event.target.value

          setDraftValue(nextValue)

          const normalizedValue = normalizeNumericDraft(nextValue)

          if (normalizedValue) {
            item.onChange(normalizedValue)
          }
        }}
      />
    </label>
  )
}

function normalizeNumericDraft(value: string) {
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

  return Number.isFinite(numeric) ? trimmed : null
}
