import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ResponsiveLayout } from './components/shared'
import { Landing } from './pages/Landing'
import { BrowseTournaments } from './pages/BrowseTournaments'
import './styles/globals.css'

const Standings = () => (
  <div className="text-center py-12">
    <h2 className="text-2xl font-bold text-[--ink-900]">Standings</h2>
    <p className="text-[--ink-600] mt-2">Standings page coming soon</p>
  </div>
)

const Matches = () => (
  <div className="text-center py-12">
    <h2 className="text-2xl font-bold text-[--ink-900]">Matches</h2>
    <p className="text-[--ink-600] mt-2">Matches page coming soon</p>
  </div>
)

const Bracket = () => (
  <div className="text-center py-12">
    <h2 className="text-2xl font-bold text-[--ink-900]">Bracket</h2>
    <p className="text-[--ink-600] mt-2">Bracket page coming soon</p>
  </div>
)

const More = () => (
  <div className="text-center py-12">
    <h2 className="text-2xl font-bold text-[--ink-900]">More</h2>
    <p className="text-[--ink-600] mt-2">More options coming soon</p>
  </div>
)

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route
          element={
            <ResponsiveLayout showHeader showNav>
              <Routes>
                <Route path="/browse" element={<BrowseTournaments />} />
                <Route path="/standings" element={<Standings />} />
                <Route path="/matches" element={<Matches />} />
                <Route path="/bracket" element={<Bracket />} />
                <Route path="/more" element={<More />} />
                <Route path="*" element={<Navigate to="/standings" replace />} />
              </Routes>
            </ResponsiveLayout>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App
