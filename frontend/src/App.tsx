import { Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import { Layout } from './components/Layout'
import { Spinner } from './components/ui'
import { homePathFor, modulesFor } from './config/modules'
import LoginPage from './pages/LoginPage'

export default function App() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <Spinner />

  if (!user) {
    return (
      <Routes>
        <Route path="/log-masuk" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/log-masuk" replace state={{ from: location.pathname }} />} />
      </Routes>
    )
  }

  const mods = modulesFor(user.role)
  const home = homePathFor(user.role)

  return (
    <Routes>
      <Route path="/log-masuk" element={<LoginPage />} />
      {mods
        .filter((m) => m.bare)
        .map((m) => (
          <Route
            key={m.key}
            path={m.path}
            element={
              <Suspense fallback={<Spinner />}>
                <m.component />
              </Suspense>
            }
          />
        ))}
      <Route element={<Layout />}>
        {mods
          .filter((m) => !m.bare)
          .map((m) => (
            <Route key={m.key} path={m.path} element={<m.component />} />
          ))}
        {!mods.some((m) => m.path === '/') && <Route path="/" element={<Navigate to={home} replace />} />}
        <Route path="*" element={<Navigate to={home} replace />} />
      </Route>
    </Routes>
  )
}
