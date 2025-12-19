import React from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

type Props = { children: React.ReactNode }
type State = { hasError: boolean, error?: Error }

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center border border-red-100">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6 text-red-600">
              <AlertTriangle size={32}/>
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">Something went wrong</h3>
            <p className="text-gray-500 text-sm mb-6 bg-gray-50 p-3 rounded-lg font-mono break-all">
              {this.state.error?.message || 'Unknown Error'}
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => window.location.href = '/'}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-bold hover:bg-gray-200 transition-colors"
              >
                Back Home
              </button>
              <button 
                onClick={() => window.location.reload()}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
              >
                <RefreshCw size={16}/> Reload
              </button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
