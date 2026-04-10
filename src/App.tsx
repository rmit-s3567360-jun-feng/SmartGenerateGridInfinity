import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes, useParams } from 'react-router-dom'

import { HomePage } from './pages/HomePage'

const GeneratorPage = lazy(async () => {
  const module = await import('./pages/GeneratorPage')
  return { default: module.GeneratorPage }
})

export function GeneratorRouteShell() {
  const { templateId } = useParams()

  return <GeneratorPage key={templateId ?? 'generic-bin'} />
}

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<main className="landing-page">加载生成器...</main>}>
        <Routes>
          <Route element={<HomePage />} path="/" />
          <Route element={<GeneratorRouteShell />} path="/generator/:templateId" />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default App
