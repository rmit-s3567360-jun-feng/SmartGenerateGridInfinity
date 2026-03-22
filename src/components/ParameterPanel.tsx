import { useEffect, useState } from 'react'

import type {
  AnyTemplateDefinition,
  JsonValue,
  ParameterField,
  ParameterFieldGroup,
  ParameterPanelSectionId,
  ParameterValues,
  PrimitiveParamValue,
} from '../lib/gridfinity/types'
import { AxisInspectorGroup } from './AxisInspectorGroup'
import { FieldHint } from './FieldHint'
import { NumericFieldControl } from './NumericFieldControl'

type AnyParameterField = ParameterField<any>

interface ParameterPanelProps {
  template: AnyTemplateDefinition
  values: ParameterValues
  validationErrors: string[]
  onChange: (key: string, value: JsonValue) => void
  onReset: () => void
}

interface PanelSectionMeta {
  eyebrow: string
  title: string
  description: string
}

const PANEL_SECTION_ORDER: ParameterPanelSectionId[] = [
  'general',
  'size',
  'layout',
  'features',
  'advanced',
]

const PANEL_SECTION_META: Record<ParameterPanelSectionId, PanelSectionMeta> = {
  general: {
    eyebrow: 'GENERAL',
    title: '基础配置',
    description: '先确定模式、数量和这次要解决的主要配置。',
  },
  size: {
    eyebrow: 'SIZE',
    title: '基础尺寸',
    description: '先锁定外部占位和高度，避免后续排布失衡。',
  },
  layout: {
    eyebrow: 'LAYOUT',
    title: '内部结构 / 排布',
    description: '再微调内部实体、隔板和型腔相关规则。',
  },
  features: {
    eyebrow: 'FEATURES',
    title: '附加功能',
    description: '最后补充标签、磁铁孔等附加能力。',
  },
  advanced: {
    eyebrow: 'ADVANCED',
    title: '高级设置',
    description: '通常先用默认值；只有需要收口细节时再展开。',
  },
}

export function ParameterPanel({
  template,
  values,
  validationErrors,
  onChange,
  onReset,
}: ParameterPanelProps) {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(validationErrors.length > 0)
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
  const advancedFields = visibleFields.filter((field) => field.section === 'advanced')
  const helpItems = visibleFields
    .filter((field) => field.description.trim().length > 0)
    .map((field) => ({
      id: field.key,
      label:
        field.group?.presentation === 'axis' && field.axis
          ? `${field.group.label} · ${field.axis.toUpperCase()}`
          : field.label,
      description: field.unit
        ? `${field.description} 当前单位：${field.unit}。`
        : field.description,
    }))
  const sections = PANEL_SECTION_ORDER
    .map((sectionId) => {
      const fields = visibleFields.filter(
        (field) => resolvePanelSection(field) === sectionId,
      ) as AnyParameterField[]

      if (fields.length === 0) {
        return null
      }

      return {
        blocks: buildFieldBlocks(fields),
        id: sectionId,
        isDirty: fields.some((field) =>
          isFieldDirty(field, values[field.key], template.defaultParams[field.key]),
        ),
      }
    })
    .filter((section): section is PanelSection => section !== null)
  const modifiedSectionCount = sections.filter((section) => section.isDirty).length

  useEffect(() => {
    if (validationErrors.length > 0) {
      setIsAdvancedOpen(true)
    }
  }, [validationErrors.length])

  function renderField(field: AnyParameterField) {
    if (field.kind === 'boolean') {
      return renderBooleanField(field)
    }

    if (field.kind === 'select') {
      return renderSelectField(field)
    }

    if (
      field.min !== undefined &&
      field.max !== undefined &&
      field.step !== undefined
    ) {
      return (
        <NumericFieldControl
          description={field.description}
          label={field.label}
          max={field.max}
          min={field.min}
          showHint
          step={field.step}
          unit={field.unit}
          value={values[field.key]}
          onChange={(nextValue) => onChange(field.key, nextValue)}
        />
      )
    }

    return (
      <label className="form-field">
        <div className="form-field__top">
          <span title={field.label}>{field.label}</span>
          <div className="form-field__meta">
            {field.unit ? <small className="field-unit">{field.unit}</small> : null}
            <FieldHint text={field.description} />
          </div>
        </div>
        <input
          aria-label={field.label}
          max={field.max}
          min={field.min}
          step={field.step}
          type="number"
          value={String(values[field.key])}
          onChange={(event) => onChange(field.key, event.target.value)}
        />
      </label>
    )
  }

  function renderBooleanField(field: AnyParameterField) {
    const isChecked = Boolean(values[field.key])

    return (
      <label className="switch-field">
        <div className="switch-field__copy">
          <div className="form-field__top">
            <span title={field.label}>{field.label}</span>
            <div className="form-field__meta">
              <FieldHint text={field.description} />
            </div>
          </div>
          <small>{field.description}</small>
        </div>
        <span className={isChecked ? 'switch switch--checked' : 'switch'}>
          <input
            aria-label={field.label}
            checked={isChecked}
            className="switch__input"
            type="checkbox"
            onChange={(event) => onChange(field.key, event.target.checked)}
          />
          <span aria-hidden="true" className="switch__track">
            <span className="switch__thumb" />
          </span>
        </span>
      </label>
    )
  }

  function renderSelectField(field: AnyParameterField) {
    const value = String(values[field.key])
    const presentation = field.presentation ?? 'default'

    if (presentation === 'cards') {
      return (
        <section className="choice-field choice-field--cards">
          <div className="form-field__top">
            <span title={field.label}>{field.label}</span>
            <div className="form-field__meta">
              <FieldHint text={field.description} />
            </div>
          </div>
          <div aria-label={field.label} className="choice-card-grid" role="group">
            {field.options?.map((option) => {
              const isActive = option.value === value

              return (
                <button
                  aria-pressed={isActive}
                  className={isActive ? 'choice-card choice-card--active' : 'choice-card'}
                  key={option.value}
                  type="button"
                  onClick={() => onChange(field.key, option.value)}
                >
                  <strong>{option.label}</strong>
                  {option.description ? <small>{option.description}</small> : null}
                </button>
              )
            })}
          </div>
        </section>
      )
    }

    if (presentation === 'segmented') {
      return (
        <section className="choice-field">
          <div className="form-field__top">
            <span title={field.label}>{field.label}</span>
            <div className="form-field__meta">
              <FieldHint text={field.description} />
            </div>
          </div>
          <div aria-label={field.label} className="segmented-control" role="group">
            {field.options?.map((option) => {
              const isActive = option.value === value

              return (
                <button
                  aria-pressed={isActive}
                  className={
                    isActive
                      ? 'segmented-control__option segmented-control__option--active'
                      : 'segmented-control__option'
                  }
                  key={option.value}
                  type="button"
                  onClick={() => onChange(field.key, option.value)}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
        </section>
      )
    }

    return (
      <label className="form-field">
        <div className="form-field__top">
          <span title={field.label}>{field.label}</span>
          <div className="form-field__meta">
            {field.unit ? <small className="field-unit">{field.unit}</small> : null}
            <FieldHint text={field.description} />
          </div>
        </div>
        <select
          aria-label={field.label}
          value={value}
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

  function renderBlock(block: FieldBlock) {
    const className = resolveBlockClassName(block)

    if (block.kind === 'field') {
      return (
        <div className={className} key={block.field.key}>
          {renderField(block.field)}
        </div>
      )
    }

    return (
      <div className={className} key={block.group.id}>
        <AxisInspectorGroup
          description={block.group.description}
          items={block.fields.map((field) => ({
            axis: field.axis!,
            value: String(values[field.key] ?? ''),
            min: field.min,
            max: field.max,
            step: field.step,
            options: field.options,
            caption: field.description,
            unit: field.unit,
            onChange: (nextValue) => onChange(field.key, nextValue),
          }))}
          showHint={false}
          title={block.group.label}
        />
      </div>
    )
  }

  function renderSection(section: PanelSection) {
    const meta = PANEL_SECTION_META[section.id]
    const body = (
      <div className="parameter-section__content">
        <p className="parameter-section__description">{meta.description}</p>
        <div className="parameter-section__grid">
          {section.blocks.map((block) => renderBlock(block))}
        </div>
      </div>
    )

    if (section.id === 'advanced') {
      return (
        <details
          className={
            section.isDirty
              ? 'parameter-section parameter-section--advanced parameter-section--dirty'
              : 'parameter-section parameter-section--advanced'
          }
          key={section.id}
          open={isAdvancedOpen}
        >
          <summary
            className="parameter-section__summary"
            onClick={(event) => {
              event.preventDefault()
              setIsAdvancedOpen((current) => !current)
            }}
          >
            <SectionHeader
              count={section.blocks.length}
              eyebrow={meta.eyebrow}
              isDirty={section.isDirty}
              title={meta.title}
            />
          </summary>
          {isAdvancedOpen ? body : null}
        </details>
      )
    }

    return (
      <section
        className={
          section.isDirty
            ? 'parameter-section parameter-section--dirty'
            : 'parameter-section'
        }
        key={section.id}
      >
        <SectionHeader
          count={section.blocks.length}
          eyebrow={meta.eyebrow}
          isDirty={section.isDirty}
          title={meta.title}
        />
        {body}
      </section>
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
      <p className="panel__meta">
        当前参数 {visibleFields.length} 项
        {advancedFields.length > 0 ? ` · 高级参数 ${advancedFields.length} 项` : ''}
        {modifiedSectionCount > 0 ? ` · 已修改分组 ${modifiedSectionCount} 个` : ''}
      </p>
      <details className="help-drawer">
        <summary>说明与帮助</summary>
        <div className="help-drawer__body">
          <p className="panel__hint">{template.summary}</p>
          {template.previewFacts.length > 0 ? (
            <ul className="help-list">
              {template.previewFacts.map((fact) => (
                <li key={fact}>{fact}</li>
              ))}
            </ul>
          ) : null}
          {helpItems.length > 0 ? (
            <div className="help-drawer__section">
              <strong>当前可见参数</strong>
              <ul className="help-list help-list--detail">
                {helpItems.map((item) => (
                  <li key={item.id}>
                    <span>{item.label}</span>
                    <small>{item.description}</small>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="panel__hint">X / Y / Z 颜色与预览坐标轴同步。</p>
        </div>
      </details>
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
      <div className="parameter-sections">
        {sections.map((section) => renderSection(section))}
      </div>
    </section>
  )
}

interface SectionHeaderProps {
  eyebrow: string
  title: string
  isDirty: boolean
  count: number
}

function SectionHeader({ eyebrow, title, isDirty, count }: SectionHeaderProps) {
  return (
    <div className="parameter-section__header">
      <div>
        <p className="parameter-section__eyebrow">{eyebrow}</p>
        <h3>{title}</h3>
      </div>
      <span className={isDirty ? 'parameter-section__badge parameter-section__badge--dirty' : 'parameter-section__badge'}>
        {isDirty ? '已修改' : `${count} 项`}
      </span>
    </div>
  )
}

interface FieldGroupBlock {
  kind: 'group'
  group: ParameterFieldGroup
  fields: AnyParameterField[]
}

interface FieldValueBlock {
  kind: 'field'
  field: AnyParameterField
}

interface PanelSection {
  id: ParameterPanelSectionId
  blocks: FieldBlock[]
  isDirty: boolean
}

type FieldBlock = FieldGroupBlock | FieldValueBlock

function buildFieldBlocks(fields: AnyParameterField[]) {
  const blocks: FieldBlock[] = []

  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index]

    if (field.group?.presentation === 'axis' && field.axis) {
      const groupedFields = [field]

      while (index + 1 < fields.length) {
        const nextField = fields[index + 1]

        if (nextField.group?.id !== field.group.id) {
          break
        }

        groupedFields.push(nextField)
        index += 1
      }

      blocks.push({
        kind: 'group',
        group: field.group,
        fields: groupedFields,
      })
      continue
    }

    blocks.push({
      kind: 'field',
      field,
    })
  }

  return blocks
}

function resolvePanelSection(field: AnyParameterField): ParameterPanelSectionId {
  if (field.panelSection) {
    return field.panelSection
  }

  if (field.section === 'advanced') {
    return 'advanced'
  }

  return 'general'
}

function resolveBlockClassName(block: FieldBlock) {
  const layout =
    block.kind === 'group'
      ? 'full'
      : block.field.layout ??
        (block.field.kind === 'boolean' ||
        block.field.presentation === 'cards' ||
        block.field.presentation === 'segmented'
          ? 'full'
          : 'half')

  return layout === 'full'
    ? 'parameter-control parameter-control--full'
    : 'parameter-control parameter-control--half'
}

function isFieldDirty(
  field: AnyParameterField,
  currentValue: unknown,
  defaultValue: unknown,
) {
  if (field.kind === 'boolean') {
    return Boolean(currentValue) !== Boolean(defaultValue)
  }

  if (field.kind === 'number') {
    const currentNumber = Number(currentValue)
    const defaultNumber = Number(defaultValue)

    if (Number.isFinite(currentNumber) && Number.isFinite(defaultNumber)) {
      return currentNumber !== defaultNumber
    }
  }

  return String(currentValue ?? '') !== String(defaultValue ?? '')
}
