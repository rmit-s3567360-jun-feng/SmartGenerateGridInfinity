import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Suspense, useState } from 'react'
import { Link, MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import { vi } from 'vitest'

vi.mock('./pages/GeneratorPage', () => ({
  GeneratorPage: function MockedGeneratorPage() {
    const { templateId } = useParams()
    const [mountedTemplateId] = useState(templateId ?? 'unknown')

    return <div>{mountedTemplateId}</div>
  },
}))

import { GeneratorRouteShell } from './App'

function GeneratorRouteHarness() {
  return (
    <>
      <Link to="/generator/parametric-cavity-bin">切换模板</Link>
      <GeneratorRouteShell />
    </>
  )
}

describe('GeneratorRouteShell', () => {
  it('remounts the generator page when the template route changes', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter initialEntries={['/generator/generic-bin']}>
        <Suspense fallback={<div>加载中...</div>}>
          <Routes>
            <Route element={<GeneratorRouteHarness />} path="/generator/:templateId" />
          </Routes>
        </Suspense>
      </MemoryRouter>,
    )

    expect(await screen.findByText('generic-bin')).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: '切换模板' }))

    expect(await screen.findByText('parametric-cavity-bin')).toBeInTheDocument()
    expect(screen.queryByText('generic-bin')).not.toBeInTheDocument()
  })
})
