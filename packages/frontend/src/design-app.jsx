import React from 'react'
import ReactDOM from 'react-dom/client'
import DesignCanvas from './design/design-canvas'
import TweaksPanel from './design/tweaks-panel'
import LibComponents from './ui/lib'
import './design/data'
import FoundationSection from './ui/section-foundation'
import ComponentsSection from './ui/section-components'
import MobileSection from './ui/section-mobile'
import AuthSection from './ui/section-auth'
import OrganizerMobileSection from './ui/section-organizer-mobile'
import DesktopSection from './ui/section-desktop'
import LandingSection from './ui/section-landing'

// Re-export all components to window for JSX access
if (typeof window !== 'undefined') {
  Object.assign(window, {
    DesignCanvas,
    TweaksPanel,
    ...LibComponents,
    FoundationSection,
    ComponentsSection,
    MobileSection,
    AuthSection,
    OrganizerMobileSection,
    DesktopSection,
    LandingSection,
  })
}

function DesignApp() {
  const [tweaks, setTweaks] = React.useState({
    palette: 'sky',
    density: 'comfort',
    glass: true,
    gradient: 'heavy',
    darkMode: false,
    viewMode: 'organizer',
  })

  React.useEffect(() => {
    const html = document.documentElement
    html.dataset.palette = tweaks.palette
    html.dataset.density = tweaks.density
    html.dataset.glass = tweaks.glass ? 'on' : 'off'
    html.dataset.gradient = tweaks.gradient
    html.dataset.mode = tweaks.darkMode ? 'dark' : 'light'
  }, [tweaks])

  const handleTweak = (key, value) => {
    setTweaks(prev => ({ ...prev, [key]: value }))
  }

  return (
    <>
      <DesignCanvas viewMode={tweaks.viewMode}>
        <AuthSection />
        <MobileSection />
        <FoundationSection />
        <ComponentsSection />
        <OrganizerMobileSection />
        <DesktopSection />
        <LandingSection />
      </DesignCanvas>
      <TweaksPanel tweaks={tweaks} onTweak={handleTweak} />
    </>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <DesignApp />
  </React.StrictMode>
)
