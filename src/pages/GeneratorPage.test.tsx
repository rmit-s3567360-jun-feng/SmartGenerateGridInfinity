import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, vi } from 'vitest'

vi.mock('../components/PreviewCanvas', () => ({
  PreviewCanvas: ({ actionSlot }: { actionSlot?: ReactNode }) => (
    <div>
      {actionSlot}
      <div>preview-canvas-mock</div>
    </div>
  ),
}))

const { useModelGeneratorMock } = vi.hoisted(() => ({
  useModelGeneratorMock: vi.fn(
    (templateId: unknown, generationParams: unknown, options?: unknown) => {
      void templateId
      void generationParams
      void options

      return {
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
        isImporting: false,
        isPreviewPending: false,
        runtimeError: null,
        validationErrors: [],
        exportModel: vi.fn(async () => new ArrayBuffer(128)),
        importStlSource: vi.fn(async () => ({
          assetId: 'asset-1',
          name: 'fixture.stl',
          format: 'binary',
          sizeBytes: 1024,
          triangleCount: 12,
          originalBounds: {
            min: [0, 0, 0],
            max: [20, 20, 20],
            size: [20, 20, 20],
          },
          originalSizeMm: [20, 20, 20],
        })),
      }
    },
  ),
}))

vi.mock('../hooks/useModelGenerator', () => ({
  useModelGenerator: useModelGeneratorMock,
}))

import { GeneratorPage } from './GeneratorPage'

describe('GeneratorPage', () => {
  beforeEach(() => {
    useModelGeneratorMock.mockClear()
  })

  function getLastGeneratorCall() {
    const call = useModelGeneratorMock.mock.calls.at(-1) as
      | [
          unknown,
        {
          arrangementMode?: string
          gridX?: number
          shapeEntries: Array<{
            label?: string
            quantity?: number
            rotationX?: number
            rotationY?: number
            rotationZ?: number
          }>
        },
          { autoGenerate?: boolean }?,
        ]
      | undefined

    expect(call).toBeDefined()
    return call!
  }

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
    expect(screen.getByText('基础尺寸')).toBeInTheDocument()
    expect(screen.getByText('内部结构 / 排布')).toBeInTheDocument()
    expect(screen.getByText('附加功能')).toBeInTheDocument()
    expect(screen.getAllByText('外部尺寸').length).toBeGreaterThan(0)
    expect(screen.getAllByText('内部实体厚度').length).toBeGreaterThan(0)
    expect(screen.getByRole('spinbutton', { name: '隔板厚' })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: '隔板高' })).toBeInTheDocument()
    expect(screen.getByText('说明与帮助')).toBeInTheDocument()
    expect(screen.queryAllByRole('slider')).toHaveLength(0)
  })

  it('shows custom divider controls for the generic bin when compartment count increases', () => {
    render(
      <MemoryRouter initialEntries={['/generator/generic-bin']}>
        <Routes>
          <Route element={<GeneratorPage />} path="/generator/:templateId" />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getAllByText('隔板 X1').length).toBeGreaterThan(0)
    expect(screen.queryAllByText('隔板 X2')).toHaveLength(0)

    const compartmentInput = screen.getByRole('spinbutton', { name: '隔仓 X' })

    fireEvent.change(compartmentInput, {
      target: { value: '3' },
    })

    expect(screen.getAllByText('隔板 X2').length).toBeGreaterThan(0)
  })

  it('renders the dedicated parametric cavity workflow', () => {
    render(
      <MemoryRouter initialEntries={['/generator/parametric-cavity-bin']}>
        <Routes>
          <Route element={<GeneratorPage />} path="/generator/:templateId" />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getAllByText('参数化型腔盒').length).toBeGreaterThan(0)
    expect(screen.getByText('基础形状')).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'XY 清隙' })).toBeInTheDocument()
    expect(screen.getByDisplayValue('形状 1')).toBeInTheDocument()
    expect(screen.queryByText('布局模式')).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: '尺寸模式' })).not.toBeInTheDocument()
  })

  it('keeps shape-cavity edits as draft until the user clicks generate', () => {
    render(
      <MemoryRouter initialEntries={['/generator/parametric-cavity-bin']}>
        <Routes>
          <Route element={<GeneratorPage />} path="/generator/:templateId" />
        </Routes>
      </MemoryRouter>,
    )

    const nameLabel = screen.getByText('名称').closest('label')
    const nameInput = nameLabel?.querySelector('input')

    expect(nameInput).not.toBeNull()
    fireEvent.change(nameInput as HTMLInputElement, {
      target: { value: '卡块 A' },
    })

    const afterEditArgs = getLastGeneratorCall()

    expect(afterEditArgs[2]).toMatchObject({ autoGenerate: false })
    expect(afterEditArgs[1].shapeEntries[0].label).toBe('形状 1')
    expect(screen.getByText('当前草稿尚未生成')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '导出 STL' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: '生成图形' }))

    const afterGenerateArgs = getLastGeneratorCall()

    expect(afterGenerateArgs[1].shapeEntries[0].label).toBe('卡块 A')
    expect(screen.getByRole('button', { name: '导出 STL' })).toBeEnabled()
  })

  it('allows clearing and re-entering numeric shape inputs before manual generation', () => {
    render(
      <MemoryRouter initialEntries={['/generator/parametric-cavity-bin']}>
        <Routes>
          <Route element={<GeneratorPage />} path="/generator/:templateId" />
        </Routes>
      </MemoryRouter>,
    )

    const quantityInput = screen.getByRole('spinbutton', { name: '数量' })

    fireEvent.change(quantityInput, {
      target: { value: '' },
    })

    expect((quantityInput as HTMLInputElement).value).toBe('')

    fireEvent.change(quantityInput, {
      target: { value: '5' },
    })

    expect((quantityInput as HTMLInputElement).value).toBe('5')

    const afterEditArgs = getLastGeneratorCall()

    expect(afterEditArgs[2]).toMatchObject({ autoGenerate: false })
    expect(afterEditArgs[1].shapeEntries[0].quantity).toBe(1)
    expect(screen.getByText('当前草稿尚未生成')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '生成图形' }))

    const afterGenerateArgs = getLastGeneratorCall()

    expect(afterGenerateArgs[1].shapeEntries[0].quantity).toBe(5)
  })

  it('keeps numeric shape inputs focused while typing multiple digits', () => {
    render(
      <MemoryRouter initialEntries={['/generator/parametric-cavity-bin']}>
        <Routes>
          <Route element={<GeneratorPage />} path="/generator/:templateId" />
        </Routes>
      </MemoryRouter>,
    )

    const quantityInput = screen.getByRole('spinbutton', { name: '数量' })

    fireEvent.change(quantityInput, {
      target: { value: '2' },
    })

    expect(quantityInput.isConnected).toBe(true)

    fireEvent.change(quantityInput, {
      target: { value: '25' },
    })

    expect(quantityInput.isConnected).toBe(true)
    expect((quantityInput as HTMLInputElement).value).toBe('25')
  })

  it('supports manual XYZ rotation before generating the cavity draft', () => {
    render(
      <MemoryRouter initialEntries={['/generator/parametric-cavity-bin']}>
        <Routes>
          <Route element={<GeneratorPage />} path="/generator/:templateId" />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.queryByRole('button', { name: /高级姿态/ })).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox', { name: '旋转 X' }), {
      target: { value: '1' },
    })

    fireEvent.click(screen.getByRole('button', { name: '生成图形' }))

    const afterGenerateArgs = getLastGeneratorCall()

    expect(afterGenerateArgs[1].shapeEntries[0].rotationX).toBe(1)
    expect(afterGenerateArgs[1].shapeEntries[0].rotationY).toBe(0)
    expect(afterGenerateArgs[1].shapeEntries[0].rotationZ).toBe(0)
  })

  it('keeps arrangement mode edits as draft until manual generation', () => {
    render(
      <MemoryRouter initialEntries={['/generator/parametric-cavity-bin']}>
        <Routes>
          <Route element={<GeneratorPage />} path="/generator/:templateId" />
        </Routes>
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: '纵向优先' }))

    const afterEditArgs = getLastGeneratorCall()

    expect(afterEditArgs[1].arrangementMode).toBe('x-first')
    expect(screen.getByText('当前草稿尚未生成')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '生成图形' }))

    const afterGenerateArgs = getLastGeneratorCall()

    expect(afterGenerateArgs[1].arrangementMode).toBe('y-first')
  })

  it('keeps manual box-size edits as draft without a size mode selector', () => {
    render(
      <MemoryRouter initialEntries={['/generator/parametric-cavity-bin']}>
        <Routes>
          <Route element={<GeneratorPage />} path="/generator/:templateId" />
        </Routes>
      </MemoryRouter>,
    )

    const gridXInput = screen.getByRole('spinbutton', { name: 'X 方向单元数' })

    expect(screen.queryByRole('combobox', { name: '尺寸模式' })).not.toBeInTheDocument()

    fireEvent.change(gridXInput, {
      target: { value: '3' },
    })

    const afterEditArgs = getLastGeneratorCall()

    expect(afterEditArgs[1].gridX).toBe(2)
    expect(screen.getByText('当前草稿尚未生成')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '生成图形' }))

    const afterGenerateArgs = getLastGeneratorCall()

    expect(Number(afterGenerateArgs[1].gridX)).toBe(3)
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
    expect(screen.getByText('自动推荐')).toBeInTheDocument()
    expect(screen.getAllByText('外部尺寸').length).toBeGreaterThan(0)
    expect(screen.getByText('内部有效尺寸')).toBeInTheDocument()
    expect(screen.getByText(/12 张 ·/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /microSD 极限收纳/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /SD 紧凑收纳/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /混合收纳/ })).toBeInTheDocument()
    expect(screen.getByText('说明与帮助')).toBeInTheDocument()
  })

  it('keeps memory-card advanced parameters collapsed until expanded', () => {
    render(
      <MemoryRouter initialEntries={['/generator/memory-card-tray']}>
        <Routes>
          <Route element={<GeneratorPage />} path="/generator/:templateId" />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.queryByRole('spinbutton', { name: '壁厚' })).not.toBeInTheDocument()
    expect(screen.queryByRole('spinbutton', { name: '底厚' })).not.toBeInTheDocument()
    expect(screen.queryByRole('spinbutton', { name: '卡槽公差' })).not.toBeInTheDocument()
    expect(screen.queryByRole('spinbutton', { name: '最小间距' })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: '磁铁孔' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('高级设置'))

    expect(screen.getByRole('spinbutton', { name: '壁厚' })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: '底厚' })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: '卡槽公差' })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: '最小间距' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: '磁铁孔' })).toBeInTheDocument()
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
    expect(screen.getByRole('spinbutton', { name: '识别阈值' })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: '关键点简化' })).toBeInTheDocument()
    expect(screen.queryByText('取物凹槽')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '下载 L 形标尺 STL' })).toHaveAttribute(
      'href',
      '/downloads/photo-outline-l-ruler-80x60mm.stl',
    )
  })

  it('renders the STL retrofit workflow for the dedicated template', () => {
    render(
      <MemoryRouter initialEntries={['/generator/stl-retrofit']}>
        <Routes>
          <Route element={<GeneratorPage />} path="/generator/:templateId" />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getAllByText('STL 改底适配').length).toBeGreaterThan(0)
    expect(screen.getByText('上传 STL 模型')).toBeInTheDocument()
    expect(screen.getByText('旋转')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'X 轴旋转' })).toBeInTheDocument()
    expect(screen.getByText('切除深度')).toBeInTheDocument()
    expect(screen.getByText('尺寸模式')).toBeInTheDocument()
    expect(screen.getByText('标准堆叠口')).toBeInTheDocument()
    expect(screen.getByText('改底规则')).toBeInTheDocument()
  })

  it('renders the STL cavity workflow for the dedicated template', () => {
    render(
      <MemoryRouter initialEntries={['/generator/stl-cavity-bin']}>
        <Routes>
          <Route element={<GeneratorPage />} path="/generator/:templateId" />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getAllByText('STL 型腔收纳').length).toBeGreaterThan(0)
    expect(screen.getByText('上传物品 STL')).toBeInTheDocument()
    expect(screen.getByText('旋转')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'X 轴旋转' })).toBeInTheDocument()
    expect(screen.getByText('XY 清隙')).toBeInTheDocument()
    expect(screen.getByText('顶部余量')).toBeInTheDocument()
    expect(screen.getByText('壁厚')).toBeInTheDocument()
    expect(screen.getByText('型腔规则')).toBeInTheDocument()
  })
})
