import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'

import { HomePage } from './pages/HomePage'

const GeneratorPage = lazy(async () => {
  const module = await import('./pages/GeneratorPage')
  return { default: module.GeneratorPage }
})

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<main className="landing-page">加载生成器...</main>}>
        <Routes>
          <Route element={<HomePage />} path="/" />
          <Route element={<GeneratorPage />} path="/generator/:templateId" />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default App
