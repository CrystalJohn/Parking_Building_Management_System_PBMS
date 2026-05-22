import { Component, type ReactNode } from 'react'
import { BrowserRouter } from 'react-router-dom'
import './App.css'
import AppRoutes from './routes/AppRoutes'

// Error boundary to catch runtime errors and show a readable message
// instead of a blank page
class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-red-50 p-8">
          <div className="max-w-lg">
            <h1 className="text-xl font-bold text-red-700 mb-2">Lỗi khởi động ứng dụng</h1>
            <pre className="text-sm text-red-600 bg-red-100 p-4 rounded overflow-auto">
              {(this.state.error as Error).message}
              {'\n'}
              {(this.state.error as Error).stack}
            </pre>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </ErrorBoundary>
  )
}
