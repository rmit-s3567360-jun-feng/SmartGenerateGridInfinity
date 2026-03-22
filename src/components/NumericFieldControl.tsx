import { useState } from 'react'

import { FieldHint } from './FieldHint'

interface NumericFieldControlProps {
  label: string
  description: string
  min: number
  max: number
  step: number
  unit?: string
  showHint?: boolean
  value: unknown
  onChange: (value: number | string) => void
}

export function NumericFieldControl({
  label,
  description,
  min,
  max,
  step,
  unit,
  showHint = true,
  value,
  onChange,
}: NumericFieldControlProps) {
  const [draftValue, setDraftValue] = useState<string | null>(null)
  const displayedValue = draftValue ?? String(value)

  return (
    <label className="form-field form-field--number">
      <div className="form-field__top">
        <span title={label}>{label}</span>
        {unit ? <small className="field-unit">{unit}</small> : null}
        {showHint ? <FieldHint text={description} /> : null}
      </div>
      <input
        aria-label={label}
        max={max}
        min={min}
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

  const numericValue = Number(trimmed)

  return Number.isFinite(numericValue) ? numericValue : null
}
