import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import SettingsWindowApp from './windows/SettingsWindowApp'
import ChatWindowApp from './windows/ChatWindowApp'
import UpdateWindowApp from './windows/UpdateWindowApp'
import PreviewWindowApp from './windows/PreviewWindowApp'
import BrowseWindowApp from './windows/BrowseWindowApp'
import './App.css'

const rawRoute = window.location.hash.replace(/^#/, '')
const [route, routeQuery] = rawRoute.split('?')

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
    case 'browse': {
      const params = new URLSearchParams(routeQuery)
      return <BrowseWindowApp peerDeviceId={params.get('peer') ?? ''} initialPath={params.get('path') ?? ''} />
    }
    default:
      return <App />
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootByRoute />
  </React.StrictMode>
)
