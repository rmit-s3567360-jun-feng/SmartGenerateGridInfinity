import { Link } from 'react-router-dom'

import type { TemplateCatalogItem } from '../lib/gridfinity/types'

interface TemplateCardProps {
  template: TemplateCatalogItem
}

export function TemplateCard({ template }: TemplateCardProps) {
  return (
    <article className="template-card">
      <div className="template-card__eyebrow">模板</div>
      <h3>{template.name}</h3>
      <p className="template-card__tagline">{template.tagline}</p>
      <p className="template-card__summary">{template.description}</p>
      <ul className="template-card__facts">
        {template.previewFacts.map((fact) => (
          <li key={fact}>{fact}</li>
        ))}
      </ul>
      <Link className="button button--ghost" to={`/generator/${template.id}`}>
        打开生成器
      </Link>
    </article>
  )
}
