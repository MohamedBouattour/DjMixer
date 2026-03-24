import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import './styles/shared.css'

import { SettingsProvider } from './contexts/SettingsContext'
import { AuthProvider } from './contexts/AuthContext'

createRoot(document.getElementById('root')!).render(
  <AuthProvider>
    <SettingsProvider>
      <App />
    </SettingsProvider>
  </AuthProvider>
)
