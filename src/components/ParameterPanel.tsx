import { useState } from 'react'

import type {
  AnyTemplateDefinition,
  JsonValue,
  ParameterField,
  ParameterValues,
  PrimitiveParamValue,
} from '../lib/gridfinity/types'
import { NumericFieldControl } from './NumericFieldControl'

interface ParameterPanelProps {
  template: AnyTemplateDefinition
  values: ParameterValues
  validationErrors: string[]
  onChange: (key: string, value: JsonValue) => void
  onReset: () => void
}

export function ParameterPanel({
  template,
  values,
  validationErrors,
  onChange,
  onReset,
}: ParameterPanelProps) {
  const [showAdvanced, setShowAdvanced] = useState(false)

  const visibleFields = template.fields.filter((field) => {
    if (!field.visibleWhen || field.visibleWhen.length === 0) {
      return true
    }

    return field.visibleWhen.every((rule) => {
      const rawValue = values[rule.key] as PrimitiveParamValue
      const normalizedValue =
        typeof rawValue === 'string' &&
        rule.values.some((candidate) => typeof candidate === 'number')
          ? Number(rawValue)
          : rawValue

      return rule.values.includes(normalizedValue)
    })
  })
  const basicFields = visibleFields.filter((field) => field.section !== 'advanced')
  const advancedFields = visibleFields.filter((field) => field.section === 'advanced')

  function renderField(field: ParameterField<ParameterValues>) {
    const value = values[field.key]

    if (field.kind === 'boolean') {
      return (
        <label className="toggle-field" key={field.key}>
          <div>
            <span>{field.label}</span>
            <small>{field.description}</small>
          </div>
          <input
            checked={Boolean(value)}
            onChange={(event) => onChange(field.key, event.target.checked)}
            type="checkbox"
          />
        </label>
      )
    }

    if (field.kind === 'select') {
      return (
        <label className="form-field" key={field.key}>
          <span>{field.label}</span>
          <small>{field.description}</small>
          <select
            value={String(value)}
            onChange={(event) => onChange(field.key, event.target.value)}
          >
            {field.options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      )
    }

    if (
      field.min !== undefined &&
      field.max !== undefined &&
      field.step !== undefined
    ) {
      return (
        <NumericFieldControl
          description={field.description}
          key={field.key}
          label={field.label}
          max={field.max}
          min={field.min}
          step={field.step}
          value={value}
          onChange={(nextValue) => onChange(field.key, nextValue)}
        />
      )
    }

    return (
      <label className="form-field" key={field.key}>
        <span>{field.label}</span>
        <small>{field.description}</small>
        <input
          max={field.max}
          min={field.min}
          step={field.step}
          type="number"
          value={String(value)}
          onChange={(event) => onChange(field.key, event.target.value)}
        />
      </label>
    )
  }

  return (
    <section className="panel panel--controls">
      <div className="panel__header">
        <div>
          <p className="panel__eyebrow">参数调节</p>
          <h2>{template.name}</h2>
        </div>
        <button className="button button--ghost" type="button" onClick={onReset}>
          恢复默认
        </button>
      </div>
      <p className="panel__body">{template.summary}</p>
      <p className="panel__hint">数字参数支持拖动滑杆，方便边调边看 3D 预览。</p>
      {validationErrors.length > 0 ? (
        <div className="error-box" role="alert">
          <strong>参数需要修正</strong>
          <ul>
            {validationErrors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="form-grid">
        {basicFields.map((field) => renderField(field as ParameterField<ParameterValues>))}
      </div>
      {advancedFields.length > 0 ? (
        <>
          <button
            className="button button--ghost advanced-toggle"
            type="button"
            onClick={() => setShowAdvanced((current) => !current)}
          >
            {showAdvanced ? '收起高级设置' : '展开高级设置'}
          </button>
          {showAdvanced ? (
            <div className="form-grid">
              {advancedFields.map((field) =>
                renderField(field as ParameterField<ParameterValues>),
              )}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  )
}
