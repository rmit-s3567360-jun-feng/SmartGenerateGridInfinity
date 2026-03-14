interface NumericFieldControlProps {
  label: string
  description: string
  min: number
  max: number
  step: number
  value: unknown
  onChange: (value: number | string) => void
}

export function NumericFieldControl({
  label,
  description,
  min,
  max,
  step,
  value,
  onChange,
}: NumericFieldControlProps) {
  const sliderValue = clamp(resolveNumericValue(value, min), min, max)

  return (
    <label className="form-field form-field--number">
      <div className="form-field__top">
        <span>{label}</span>
        <output className="value-chip">{formatNumericValue(sliderValue, step)}</output>
      </div>
      <small>{description}</small>
      <div className="number-control">
        <input
          className="number-control__slider"
          max={max}
          min={min}
          step={step}
          type="range"
          value={sliderValue}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <div className="number-control__meta" aria-hidden="true">
          <span>{formatNumericValue(min, step)}</span>
          <span>拖动即可联动预览</span>
          <span>{formatNumericValue(max, step)}</span>
        </div>
        <input
          max={max}
          min={min}
          step={step}
          type="number"
          value={String(value)}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </label>
  )
}

function resolveNumericValue(value: unknown, fallback: number) {
  const numeric = Number(value)

  return Number.isFinite(numeric) ? numeric : fallback
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function formatNumericValue(value: number, step: number) {
  const precision = getPrecision(step)

  return precision > 0 ? value.toFixed(precision) : String(Math.round(value))
}

function getPrecision(step: number) {
  const normalized = String(step)
  const decimalPart = normalized.split('.')[1]

  return decimalPart?.length ?? 0
}
