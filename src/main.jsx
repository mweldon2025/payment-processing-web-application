// ----------------------------------------------------------------------------
// src/main.jsx
// Entry point for the warehouse admin portal React application.
// Renders the main App component into the root DOM element.
// Imports global styles including Bootstrap and custom themes.
// ----------------------------------------------------------------------------
import React from 'react';
import ReactDOM from 'react-dom/client';

// Load Bootstrap once for entire app
import 'bootstrap/dist/css/bootstrap.min.css';
// Load Mariah's global theme
import './styles/mariah-theme.css';

import App from './App.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
