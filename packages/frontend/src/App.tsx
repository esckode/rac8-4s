import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ResponsiveLayout } from './components/shared'
import './styles/tokens.css'

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

const Landing = () => (
  <div className="flex flex-col items-center justify-center min-h-[60vh] gap-[--s-6]">
    <h1 className="text-4xl font-bold text-[--ink-900]">Doubles Pickleball Cup</h1>
    <p className="text-lg text-[--ink-600] text-center max-w-md">
      Manage and track tournament brackets, standings, and matches.
    </p>
    <div className="flex flex-col sm:flex-row gap-[--s-4]">
      <a
        href="/standings"
        className={`
          px-[--s-6]
          py-[--s-3]
          bg-[--court-500]
          text-white
          rounded-[--r-lg]
          font-medium
          text-center
          transition-all
          duration-[--duration-normal]
          hover:bg-[--court-600]
          focus:outline-none
          focus:ring-2
          focus:ring-[--court-400]
          focus:ring-offset-2
        `}
      >
        View Tournament
      </a>
      <a
        href="/matches"
        className={`
          px-[--s-6]
          py-[--s-3]
          bg-[--ink-100]
          text-[--ink-900]
          rounded-[--r-lg]
          font-medium
          text-center
          transition-all
          duration-[--duration-normal]
          hover:bg-[--ink-200]
          focus:outline-none
          focus:ring-2
          focus:ring-[--court-400]
          focus:ring-offset-2
        `}
      >
        Browse Matches
      </a>
    </div>
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
