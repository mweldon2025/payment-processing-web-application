// ----------------------------------------------------------------------------
// src/App.jsx
// Main application component for the warehouse admin portal.
// Manages view state and renders the appropriate component
// for payment processing, warehouse settlement, or order history.
// Utilizes React hooks for state management.
// ----------------------------------------------------------------------------
import React, { useState } from 'react';
import WarehouseSettlement from './components/WarehouseSettlement.jsx';
import PaymentProcessingUI from './components/PaymentProcessingUI.jsx';
import OrderHistory from './components/OrderHistory.jsx';

export default function App() {
  // 'checkout' | 'warehouse' | 'orders'
  const [view, setView] = useState('checkout');

  return (
    <div>
      {/* Global top bar shared look */}
      <div className="top-bar">
        <div className="container-fluid px-4 d-flex justify-content-between align-items-center">
          <div className="brand-container">
            <div className="brand-icon-box">
              <img src="/src/assets/ma-logo.png" alt="MA Logo" className="brand-logo" />
            </div>
            <div>
              <h1 className="brand-title">Manhattan Associates</h1>
              <p className="brand-subtitle">Supply Chain Commerce Platform</p>
            </div>
          </div>

          {/* View toggle buttons */}
          <div className="btn-group" role="group" aria-label="Views">
            <button
              className={`btn ${view === 'checkout' ? 'btn-dark' : 'btn-outline-dark'}`}
              onClick={() => setView('checkout')}
              type="button"
            >
              Checkout (Authorize)
            </button>
            <button
              className={`btn ${view === 'warehouse' ? 'btn-dark' : 'btn-outline-dark'}`}
              onClick={() => setView('warehouse')}
              type="button"
            >
              Warehouse Settlement
            </button>
            <button
              className={`btn ${view === 'orders' ? 'btn-dark' : 'btn-outline-dark'}`}
              onClick={() => setView('orders')}
              type="button"
            >
              Orders Viewer
            </button>
          </div>
        </div>
      </div>

      <div className="main-content">
        <div className="content-container">
          {view === 'checkout' && <PaymentProcessingUI />}
          {view === 'warehouse' && <WarehouseSettlement />}
          {view === 'orders' && <OrderHistory />}
        </div>
      </div>
    </div>
  );
}
