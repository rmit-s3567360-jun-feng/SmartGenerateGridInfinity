interface ModelSummaryItem {
  label: string
  value: string
}

interface ModelSummaryPanelProps {
  statusLabel?: string
  items: ModelSummaryItem[]
  warnings?: string[]
}

export function ModelSummaryPanel({
  statusLabel,
  items,
  warnings = [],
}: ModelSummaryPanelProps) {
  return (
    <section className="panel model-summary-panel">
      <div className="panel__header">
        <div>
          <p className="panel__eyebrow">模型摘要</p>
          <h2>关键信息</h2>
        </div>
        {statusLabel ? <span className="value-chip model-summary__status">{statusLabel}</span> : null}
      </div>

      <div className="model-summary__grid">
        {items.map((item) => (
          <div className="stat-card model-summary__card" key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>

      {warnings.length > 0 ? (
        <div className="warning-box">
          <strong>自动调整</strong>
          <ul>
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
