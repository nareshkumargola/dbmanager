import { Component, Suspense } from 'react';
import { useLocation } from 'react-router-dom';

class Boundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error('Page failed to load:', error);
  }

  componentDidUpdate(previous) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-6" style={{ minHeight: '60vh' }} role="alert">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">This page could not load</h2>
        <p className="text-sm text-gray-500 mb-4">Check your connection and try again.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-[#0d9488] hover:bg-[#0f766e]"
        >
          Reload
        </button>
      </div>
    );
  }
}

// Wraps pages whose code loads on demand. It stays put when the route changes,
// so pages keep their state, and an error clears on moving to another page.
export default function PageBoundary({ children }) {
  const { pathname } = useLocation();
  return (
    <Boundary resetKey={pathname}>
      <Suspense
        fallback={(
          <div className="flex-1 flex items-center justify-center" style={{ minHeight: '60vh' }}>
            <p className="text-gray-500 text-sm">Loading...</p>
          </div>
        )}
      >
        {children}
      </Suspense>
    </Boundary>
  );
}
