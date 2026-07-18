import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { wipePlayerData } from '../pwa/sw-bridge'

export const Signout: React.FC = () => {
  const navigate = useNavigate()
  const { logout } = useAuth()

  useEffect(() => {
    const handleLogout = async () => {
      try {
        // D5 — wipe the offline venue cache + sync queue before clearing the JWT.
        await wipePlayerData()
        await logout()
      } catch (err) {
        console.error('Logout error:', err)
      } finally {
        // Always redirect to landing page
        navigate('/')
      }
    }

    handleLogout()
  }, [logout, navigate])

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <p>Signing out...</p>
    </div>
  )
}
