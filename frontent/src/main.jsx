import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './pageStyles'
import App from './App.jsx'
import { applyFontSize, storedFontSize } from './utils/fontSize'

// Use this device's last font size before the first paint; the account's setting follows on sign-in
applyFontSize(storedFontSize())

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
