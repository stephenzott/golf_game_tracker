import React from 'react';
import ReactDOM from 'react-dom/client';
import GolfTrackerApp from '../GolfTrackerApp.jsx';
import './index.css';

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const prevController = navigator.serviceWorker.controller;
    navigator.serviceWorker.register('/sw.js');
    // Reload silently when a new SW takes over (only on updates, not first install)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (prevController) window.location.reload();
    });
  });
} else if ('serviceWorker' in navigator) {
  // Unregister any stale SW in dev mode to avoid cached-asset conflicts
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(reg => reg.unregister());
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <GolfTrackerApp />
  </React.StrictMode>
);
