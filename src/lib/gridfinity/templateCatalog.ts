import type { TemplateCatalogItem } from './types'

export const templateCatalog: TemplateCatalogItem[] = [
  {
    id: 'generic-bin',
    name: '通用收纳盒',
    tagline: '最稳的 Gridfinity 起点',
    summary: '标准开口 bin，支持分仓、磁铁孔和标签 lip。',
    description:
      '适合装零件、螺丝、电子小件，按 Gridfinity 常见尺寸生成可直接打印的收纳盒。',
    previewFacts: ['开口 bin', '支持隔仓', '标签 lip 可选'],
  },
  {
    id: 'screwdriver-rack',
    name: '螺丝刀收纳',
    tagline: '带倾角的孔位排布',
    summary: '顶部开孔、内部留空，适合批量放置精密螺丝刀。',
    description:
      '通过孔径、行数和倾角快速生成螺丝刀收纳 rack，兼顾可打印性与密度。',
    previewFacts: ['顶部孔位', '支持多排', '自动压缩孔距'],
  },
  {
    id: 'memory-card-tray',
    name: '内存卡托盘',
    tagline: 'SD / microSD 双模式',
    summary: '浅托盘 + 卡槽布局，可快速生成 SD 或 microSD 收纳托盘。',
    description:
      '支持 SD 与 microSD 两种卡型，带可选抓取缺口和标签区，适合桌面或抽屉整理。',
    previewFacts: ['SD / microSD', '浅槽托盘', '标签区可选'],
  },
  {
    id: 'pliers-holder',
    name: '钳子收纳',
    tagline: '宽槽 + 前开口',
    summary: '适合尖嘴钳、斜口钳等常见手工具的槽道式支撑。',
    description:
      '通过槽宽、槽深和前部开口尺寸快速生成钳子类工具的托槽式收纳盒。',
    previewFacts: ['托槽式', '前开口', '自动压缩槽距'],
  },
]
