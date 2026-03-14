import { fireEvent, render, screen } from '@testing-library/react'
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
    expect(screen.getByText('X 内壁厚度')).toBeInTheDocument()
    expect(screen.getByText('Y 内壁厚度')).toBeInTheDocument()
    expect(screen.getByText('Z 内壁厚度')).toBeInTheDocument()
    expect(screen.getByText('隔板厚度')).toBeInTheDocument()
    expect(screen.getByText('隔板高度')).toBeInTheDocument()
    expect(screen.getAllByRole('slider').length).toBeGreaterThan(0)
  })

  it('shows custom divider controls for the generic bin when compartment count increases', () => {
    render(
      <MemoryRouter initialEntries={['/generator/generic-bin']}>
        <Routes>
          <Route element={<GeneratorPage />} path="/generator/:templateId" />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('横向隔板 1 距离')).toBeInTheDocument()
    expect(screen.queryByText('横向隔板 2 距离')).not.toBeInTheDocument()

    const compartmentLabel = screen.getByText('横向隔仓').closest('label')
    const compartmentInput = compartmentLabel?.querySelector('input')

    expect(compartmentInput).not.toBeNull()
    fireEvent.change(compartmentInput as HTMLInputElement, {
      target: { value: '3' },
    })

    expect(screen.getByText('横向隔板 2 距离')).toBeInTheDocument()
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
    expect(screen.getByText('宽度单元')).toBeInTheDocument()
    expect(screen.getByText('深度单元')).toBeInTheDocument()
    expect(screen.getByText('高度单元')).toBeInTheDocument()
  })

  it('redirects removed template routes back to the generic generator', () => {
    render(
      <MemoryRouter initialEntries={['/generator/screwdriver-rack']}>
        <Routes>
          <Route element={<GeneratorPage />} path="/generator/:templateId" />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getAllByText('通用收纳盒').length).toBeGreaterThan(0)
    expect(screen.queryByText('螺丝刀收纳')).not.toBeInTheDocument()
  })

  it('renders the photo outline workflow for the dedicated template', () => {
    render(
      <MemoryRouter initialEntries={['/generator/photo-outline-bin']}>
        <Routes>
          <Route element={<GeneratorPage />} path="/generator/:templateId" />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getAllByText('照片轮廓收纳').length).toBeGreaterThan(0)
    expect(screen.getByText('上传俯拍照片')).toBeInTheDocument()
    expect(screen.getByText('图像叠加')).toBeInTheDocument()
    expect(screen.getByText('物体高度')).toBeInTheDocument()
    expect(screen.getByText('轮廓模式')).toBeInTheDocument()
    expect(screen.queryByText('取物凹槽')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '下载 L 形标尺 STL' })).toHaveAttribute(
      'href',
      '/downloads/photo-outline-l-ruler-80x60mm.stl',
    )
  })
})
