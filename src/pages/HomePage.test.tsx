import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { HomePage } from './HomePage'

describe('HomePage', () => {
  it('renders the main entry CTA and template cards', () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    )

    expect(
      screen.getByRole('heading', { name: '用参数直接生成可打印的 Gridfinity 收纳模型' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '立即开始' })).toHaveAttribute(
      'href',
      '/generator/generic-bin',
    )
    expect(screen.getByText('通用收纳盒')).toBeInTheDocument()
    expect(screen.getByText('参数化型腔盒')).toBeInTheDocument()
    expect(screen.getByText('内存卡托盘')).toBeInTheDocument()
    expect(screen.getByText('照片轮廓收纳')).toBeInTheDocument()
    expect(screen.getByText('STL 型腔收纳')).toBeInTheDocument()
    expect(screen.getByText('STL 改底适配')).toBeInTheDocument()
    expect(screen.getByText('自动推荐最小尺寸')).toBeInTheDocument()
    expect(screen.getByText('输入形状后自动排布并生成独立型腔')).toBeInTheDocument()
    expect(screen.getByText('导入物品 STL 后生成标准矩形 Gridfinity 型腔盒')).toBeInTheDocument()
    expect(screen.getByText('导入模型后规整为 Gridfinity 标准矩形实体')).toBeInTheDocument()
    expect(screen.queryByText('螺丝刀收纳')).not.toBeInTheDocument()
    expect(screen.queryByText('钳子收纳')).not.toBeInTheDocument()
  })
})
