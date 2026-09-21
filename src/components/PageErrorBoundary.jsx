import { Component } from 'react'

export default class PageErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('page crashed', error, info?.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="empty-state">
          <i className="fas fa-triangle-exclamation" style={{ color: '#e74c3c' }} />
          <p>Something went wrong showing this page</p>
          <p className="text-xs text-text-muted mt-1">{this.state.error.message || 'Unknown error'}</p>
          <button onClick={() => this.setState({ error: null })} className="btn-primary text-sm mt-3">
            Try again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
