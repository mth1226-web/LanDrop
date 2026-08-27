import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import SettingsWindowApp from './windows/SettingsWindowApp'
import ChatWindowApp from './windows/ChatWindowApp'
import UpdateWindowApp from './windows/UpdateWindowApp'
import PreviewWindowApp from './windows/PreviewWindowApp'
import './App.css'

const route = window.location.hash.replace(/^#/, '')

function RootByRoute(): JSX.Element {
  switch (route) {
    case 'settings':
      return <SettingsWindowApp />
    case 'chat':
      return <ChatWindowApp />
    case 'update':
      return <UpdateWindowApp />
    case 'preview':
      return <PreviewWindowApp />
    default:
      return <App />
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootByRoute />
  </React.StrictMode>
)
