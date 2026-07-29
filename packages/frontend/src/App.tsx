import React from 'react'
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
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
import { TournamentJoin } from './pages/TournamentJoin'
import { PartnerInviteAcceptPage } from './pages/PartnerInviteAcceptPage'
import { TournamentDetail } from './pages/TournamentDetail'
import { PlayHub } from './pages/PlayHub'
import { GroupList, GroupDetail, GroupSettings } from './pages/MyGroups'
import { InviteAcceptPage } from './pages/InviteAcceptPage'
import { Notifications } from './pages/Notifications'
import { Profile } from './pages/Profile'
import { CoachChat } from './pages/CoachChat'
import { PrivacyPolicy } from './pages/PrivacyPolicy'
import { PartnerRequestConfirm } from './pages/PartnerRequestConfirm'
import { OrganizerManage } from './pages/OrganizerManage'
import { OrganizerDashboard } from './pages/OrganizerDashboard'
import { About } from './pages/About'
import { Settings } from './pages/Settings'
import { ServiceUnavailable } from './pages/ServiceUnavailable'
import { useServiceUnavailable } from './context/ServiceUnavailableContext'
import { AppConfigProvider, useAppConfig } from './context/AppConfigContext'
import { NotFound } from './pages/NotFound'
import { OfflineBanner } from './pwa/OfflineBanner'
import { UpdateToast } from './pwa/UpdateToast'
import { ROUTES } from './constants/routes'
import './styles/globals.css'



// ISSUE-30: the bare /tournament/:id route redirects to the standings tab.
// useParams() substitutes the real id — a template literal alone does not
// interpolate route params, so the old inline <Navigate> sent users to a
// URL containing the literal string ':tournamentId'.
export const TournamentDetailRedirect: React.FC = () => {
  const { tournamentId } = useParams()
  return (
    <Navigate
      to={ROUTES.TOURNAMENT_TAB.replace(':tournamentId', tournamentId ?? '').replace(':tab', 'standings')}
      replace
    />
  )
}

// UAT ISSUE-29: gates /browse and /tournament/:id/browse behind
// publicDiscoveryEnabled. Renders nothing while the flag is still loading
// (avoids a flash of the real page before the server-authoritative answer
// arrives) — brief and blocking real content either way.
export const DiscoveryGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { publicDiscoveryEnabled, loading } = useAppConfig()
  if (loading) return null
  if (!publicDiscoveryEnabled) return <NotFound />
  return <>{children}</>
}

export const App: React.FC = () => {
  const { serviceUnavailable } = useServiceUnavailable()

  if (serviceUnavailable) {
    return <ServiceUnavailable />
  }

  return (
    <BrowserRouter>
      <OfflineBanner />
      <UpdateToast />
      <AppConfigProvider>
      <AuthProvider>
        <Routes>
          {/* Public routes (no auth required) */}
          <Route path={ROUTES.HOME} element={<Landing />} />

          {/* Public — clears the A9.2 launch gate (COACH_1TO1_IMPLEMENTATION.md §S9) */}
          <Route path={ROUTES.PRIVACY} element={<PrivacyPolicy />} />

          {/* Auth routes (public, but redirected if already authenticated) */}
          <Route path={ROUTES.LOGIN} element={<PublicRoute><Login /></PublicRoute>} />
          <Route path={ROUTES.SIGNUP} element={<PublicRoute><Signup /></PublicRoute>} />
          <Route path={ROUTES.FORGOT_PASSWORD} element={<PublicRoute><ForgotPassword /></PublicRoute>} />
          <Route path={ROUTES.RESET_PASSWORD} element={<PublicRoute><ResetPassword /></PublicRoute>} />
          <Route path="/signout" element={<Signout />} />

          {/* Public discovery (no auth required) — per rac8-4s-HL.md.
              ISSUE-29: gated behind publicDiscoveryEnabled (default off) —
              blocked routes render NotFound rather than being deleted, so
              the machinery and its specs come back with one flag flip. */}
          <Route
            path={ROUTES.BROWSE}
            element={
              <DiscoveryGate>
                <ResponsiveLayout showHeader showNav>
                  <BrowseTournaments />
                </ResponsiveLayout>
              </DiscoveryGate>
            }
          />
          <Route
            path="/tournament/:tournamentId/browse"
            element={
              <DiscoveryGate>
                <TournamentBrowse />
              </DiscoveryGate>
            }
          />
          <Route
            path="/tournament/:tournamentId/join"
            element={<TournamentJoin />}
          />
          <Route
            path="/tournament/:tournamentId/partner-invite"
            element={<PartnerInviteAcceptPage />}
          />

          {/* Protected routes (require authentication) */}
          <Route
            path={ROUTES.ORGANIZER}
            element={
              <ProtectedRoute>
                <ResponsiveLayout showHeader showNav>
                  <OrganizerDashboard />
                </ResponsiveLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path={ROUTES.PLAY}
            element={
              <ProtectedRoute>
                <ResponsiveLayout showHeader showNav>
                  <PlayHub />
                </ResponsiveLayout>
              </ProtectedRoute>
            }
          />
          {/* ISSUE-28: /matches and /standings are now redirects — Play replaced
              MyTournamentsHub as the nav destination, but both routes must keep
              working (linked from emails, notifications, auth.spec.ts). */}
          <Route path={ROUTES.MATCHES} element={<Navigate to={ROUTES.PLAY} replace />} />
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
            element={<TournamentDetailRedirect />}
          />
          <Route path={ROUTES.STANDINGS} element={<Navigate to={ROUTES.PLAY} replace />} />
          <Route
            path={ROUTES.GROUP_INVITE}
            element={<InviteAcceptPage />}
          />
          <Route
            path={ROUTES.GROUPS}
            element={
              <ProtectedRoute>
                <ResponsiveLayout showHeader showNav>
                  <GroupList />
                </ResponsiveLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path={ROUTES.GROUP_SETTINGS}
            element={
              <ProtectedRoute>
                <ResponsiveLayout showHeader showNav>
                  <GroupSettings />
                </ResponsiveLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path={ROUTES.GROUP_DETAIL}
            element={
              <ProtectedRoute>
                <ResponsiveLayout showHeader showNav>
                  <GroupDetail />
                </ResponsiveLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path={ROUTES.NOTIFICATIONS}
            element={
              <ProtectedRoute>
                <ResponsiveLayout showHeader showNav>
                  <Notifications />
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
          <Route
            path={ROUTES.PROFILE}
            element={
              <ProtectedRoute>
                <ResponsiveLayout showHeader showNav>
                  <Profile />
                </ResponsiveLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path={ROUTES.COACH}
            element={
              <ProtectedRoute>
                <ResponsiveLayout showHeader showNav>
                  <CoachChat />
                </ResponsiveLayout>
              </ProtectedRoute>
            }
          />
          {/* ISSUE-36: the More menu's Account/Settings/About items had no
              matching route at all — Account is repointed at /profile below,
              About and Settings are new. */}
          <Route
            path={ROUTES.ABOUT}
            element={
              <ProtectedRoute>
                <ResponsiveLayout showHeader showNav>
                  <About />
                </ResponsiveLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path={ROUTES.SETTINGS}
            element={
              <ProtectedRoute>
                <ResponsiveLayout showHeader showNav>
                  <Settings />
                </ResponsiveLayout>
              </ProtectedRoute>
            }
          />

          {/* ISSUE-29: catch-all — previously no path="*" route existed at all,
              so any typo'd or blocked URL rendered a blank router outlet. */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
      </AppConfigProvider>
    </BrowserRouter>
  )
}

export default App
