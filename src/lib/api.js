// ----------------------------------------------------------------------------
// src/lib/api.js
// API helper functions for interacting with the backend service.
// Provides methods for authorizing payments, retrieving order details,
// posting settlements, listing orders, and fetching the next order to process.
// Utilizes Axios for HTTP requests.
// ----------------------------------------------------------------------------
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || 'http://localhost:3001',
  headers: { 'Content-Type': 'application/json' },
});

// ---------- Existing helpers ----------
export async function postAuthorize(payload) {
  // expects: { orderId, amount, cardNumber, expiry, cvv, nameOnCard }
  const { data } = await api.post('/api/authorize', payload);
  return data;
}

export async function getOrderDetails(orderId) {
  const { data } = await api.get(`/api/orders/${encodeURIComponent(orderId)}`);
  // expected shape:
  // {
  //   order: {...},
  //   authorization: {...},
  //   settlements: [...],
  //   availableToSettle: number
  // }
  return data;
}

export async function postSettlement(payload) {
  // expects: { orderId: string, amount: number }
  const { data } = await api.post('/api/settlements', payload);
  return data;
}

export async function listOrders(params = {}) {
  // supports: { status, q, sort, dir, page, pageSize }
  const { data } = await api.get('/api/orders', { params });
  return data;
}

// ---------- New helper ----------
export async function getNextOrder() {
  // returns: { orderId, amount }
  const { data } = await api.get('/api/orders/next');
  return data;
}
