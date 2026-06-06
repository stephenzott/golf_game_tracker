import React from 'react';
import ReactDOM from 'react-dom/client';
import GolfTrackerApp from '../GolfTrackerApp.jsx';
import './index.css';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const prevController = navigator.serviceWorker.controller;
    navigator.serviceWorker.register('/sw.js');
    // Reload silently when a new SW takes over (only on updates, not first install)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (prevController) window.location.reload();
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <GolfTrackerApp />
  </React.StrictMode>
);
