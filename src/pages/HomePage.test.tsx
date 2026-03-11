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
    expect(screen.getByText('螺丝刀收纳')).toBeInTheDocument()
    expect(screen.getByText('内存卡托盘')).toBeInTheDocument()
    expect(screen.getByText('自动推荐最小尺寸')).toBeInTheDocument()
  })
})
