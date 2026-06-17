import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './hooks/useAuth'
import { ProtectedRoute } from './components/ProtectedRoute'
import { PublicRoute } from './components/PublicRoute'
import { ResponsiveLayout } from './components/shared'
import { Landing } from './pages/Landing'
import { Login } from './pages/Login'
import { Signup } from './pages/Signup'
import { ForgotPassword } from './pages/ForgotPassword'
import { ResetPassword } from './pages/ResetPassword'
import { Signout } from './pages/Signout'
import { BrowseTournaments } from './pages/BrowseTournaments'
import { TournamentBrowse } from './pages/TournamentBrowse'
import { TournamentDetail } from './pages/TournamentDetail'
import { MyTournamentsHub } from './pages/MyTournamentsHub'
import { PartnerRequestConfirm } from './pages/PartnerRequestConfirm'
import { OrganizerManage } from './pages/OrganizerManage'
import { ROUTES } from './constants/routes'
import './styles/globals.css'



export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public routes (no auth required) */}
          <Route path={ROUTES.HOME} element={<Landing />} />

          {/* Auth routes (public, but redirected if already authenticated) */}
          <Route path={ROUTES.LOGIN} element={<PublicRoute><Login /></PublicRoute>} />
          <Route path={ROUTES.SIGNUP} element={<PublicRoute><Signup /></PublicRoute>} />
          <Route path={ROUTES.FORGOT_PASSWORD} element={<PublicRoute><ForgotPassword /></PublicRoute>} />
          <Route path={ROUTES.RESET_PASSWORD} element={<PublicRoute><ResetPassword /></PublicRoute>} />
          <Route path="/signout" element={<Signout />} />

          {/* Public discovery (no auth required) — per rac8-4s-HL.md */}
          <Route
            path={ROUTES.BROWSE}
            element={
              <ResponsiveLayout showHeader showNav>
                <BrowseTournaments />
              </ResponsiveLayout>
            }
          />
          <Route
            path="/tournament/:tournamentId/browse"
            element={<TournamentBrowse />}
          />

          {/* Protected routes (require authentication) */}
          <Route
            path={ROUTES.MATCHES}
            element={
              <ProtectedRoute>
                <ResponsiveLayout showHeader showNav>
                  <MyTournamentsHub tab="matches" />
                </ResponsiveLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path={ROUTES.TOURNAMENT_MANAGE}
            element={
              <ProtectedRoute>
                <ResponsiveLayout showHeader showNav>
                  <OrganizerManage />
                </ResponsiveLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path={ROUTES.TOURNAMENT_TAB}
            element={
              <ProtectedRoute>
                <ResponsiveLayout showHeader showNav>
                  <TournamentDetail />
                </ResponsiveLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path={ROUTES.TOURNAMENT_DETAIL}
            element={
              <Navigate to={`/tournament/:tournamentId/standings`} replace />
            }
          />
          <Route
            path={ROUTES.STANDINGS}
            element={
              <ProtectedRoute>
                <ResponsiveLayout showHeader showNav>
                  <MyTournamentsHub tab="standings" />
                </ResponsiveLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path={ROUTES.REGISTRATION_CONFIRM}
            element={
              <ProtectedRoute>
                <PartnerRequestConfirm />
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
