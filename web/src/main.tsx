import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'sonner'
import { TooltipProvider } from './components/ui/tooltip'
import './index.css'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TooltipProvider delayDuration={200}>
      <App />
      <Toaster
        position="bottom-right"
        richColors
        toastOptions={{
          style: {
            background: 'var(--bg)',
            border: '1px solid var(--line)',
            color: 'var(--ink)',
          },
        }}
      />
    </TooltipProvider>
  </StrictMode>,
)
