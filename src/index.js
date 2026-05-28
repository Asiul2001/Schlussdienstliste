import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

class RootErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      error: null,
    };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={errorShellStyle}>
          <div style={errorCardStyle}>
            <p style={errorLabelStyle}>App Error</p>
            <h1 style={errorTitleStyle}>The checklist UI crashed while loading.</h1>
            <pre style={errorPreStyle}>{String(this.state.error.message || this.state.error)}</pre>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const errorShellStyle = {
  minHeight: '100vh',
  display: 'grid',
  placeItems: 'center',
  padding: '24px',
  background: '#f6efe5',
  color: '#1f1a17',
};

const errorCardStyle = {
  width: 'min(720px, 100%)',
  padding: '24px',
  borderRadius: '20px',
  background: '#fffaf2',
  boxShadow: '0 20px 60px rgba(31, 26, 23, 0.12)',
  border: '1px solid rgba(31, 26, 23, 0.1)',
};

const errorLabelStyle = {
  margin: '0 0 8px',
  textTransform: 'uppercase',
  letterSpacing: '0.14em',
  color: '#0f766e',
  fontSize: '0.8rem',
};

const errorTitleStyle = {
  margin: '0 0 16px',
  fontFamily: 'Georgia, serif',
};

const errorPreStyle = {
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  margin: 0,
  fontFamily: 'Consolas, monospace',
};

function renderFatalError(message) {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    return;
  }

  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <div style={errorShellStyle}>
      <div style={errorCardStyle}>
        <p style={errorLabelStyle}>Runtime Error</p>
        <h1 style={errorTitleStyle}>The checklist UI could not finish starting.</h1>
        <pre style={errorPreStyle}>{message}</pre>
      </div>
    </div>
  );
}

window.addEventListener('error', (event) => {
  renderFatalError(event.error?.stack || event.message || 'Unknown browser error');
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason?.stack || event.reason?.message || String(event.reason);
  renderFatalError(reason);
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>
);

reportWebVitals();
