import React from 'react';

export default class ErrorBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error, info) { console.error('UI crashed:', error, info?.componentStack); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="splash-screen" role="alert">
        <b>Something went wrong</b>
        <span style={{ letterSpacing: 0, fontSize: 13, margin: '10px 0 18px' }}>The page hit an unexpected error. Your data is safe.</span>
        <button className="primary-btn" onClick={() => window.location.reload()}>Reload HostelBuddy</button>
      </div>
    );
  }
}
