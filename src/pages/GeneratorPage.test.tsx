import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'

vi.mock('../components/PreviewCanvas', () => ({
  PreviewCanvas: () => <div>preview-canvas-mock</div>,
}))

vi.mock('../hooks/useModelGenerator', () => ({
  useModelGenerator: () => ({
    generation: {
      bounds: {
        min: [0, 0, 0],
        max: [83, 41.5, 28],
        size: [83, 41.5, 28],
      },
      geometry: { cacheKey: 'mock' },
      meshData: {
        positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      },
      warnings: [],
    },
    isGenerating: false,
    isExporting: false,
    runtimeError: null,
    validationErrors: [],
    exportModel: vi.fn(async () => new ArrayBuffer(128)),
  }),
}))

import { GeneratorPage } from './GeneratorPage'

describe('GeneratorPage', () => {
  it('renders generator workspace for a template route', () => {
    render(
      <MemoryRouter initialEntries={['/generator/generic-bin']}>
        <Routes>
          <Route element={<GeneratorPage />} path="/generator/:templateId" />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getAllByText('通用收纳盒').length).toBeGreaterThan(0)
    expect(screen.getByText('preview-canvas-mock')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '导出 STL' })).toBeEnabled()
  })

  it('shows the memory card v2 recommendation summary', () => {
    render(
      <MemoryRouter initialEntries={['/generator/memory-card-tray']}>
        <Routes>
          <Route element={<GeneratorPage />} path="/generator/:templateId" />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getAllByText('内存卡托盘').length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: '自动推荐尺寸' })).toBeInTheDocument()
    expect(screen.getByText(/推荐尺寸: 2 x 1 x 2/)).toBeInTheDocument()
    expect(screen.getByText(/总卡数: 12/)).toBeInTheDocument()
  })
})
