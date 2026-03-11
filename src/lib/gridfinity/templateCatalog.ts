import type { TemplateCatalogItem } from './types'
import { templateList } from './templates'

export const templateCatalog: TemplateCatalogItem[] = templateList.map((template) => ({
  id: template.id,
  name: template.name,
  tagline: template.tagline,
  summary: template.summary,
  description: template.description,
  previewFacts: template.previewFacts,
}))
