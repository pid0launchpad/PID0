import React from 'react'
import ReactDOM from 'react-dom/client'
import { Buffer } from 'buffer'
import './terminal.css'
import './product.css'
import './polish.css'
import './triple.css'
import './nodium-theme.css'

globalThis.Buffer = Buffer

const { default: App } = await import('./App')

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>,
)