// ------------------------------------------------------------------------------
// src/components/WarehouseSettlement.jsx
// Component for handling warehouse settlements in the admin portal.
// Allows users to input order ID and settlement amount, fetch order details,
// and submit settlements while providing real-time feedback.
// Utilizes React hooks for state management and side effects.
// ------------------------------------------------------------------------------
import { useMemo, useState } from 'react';
import { postSettlement, getOrderDetails } from '../lib/api.js';

export default function WarehouseSettlement() {
  const [orderId, setOrderId] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [details, setDetails] = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);
  const [shake, setShake] = useState(false);

  const toMoney = (n) => Number(Number(n).toFixed(2));
  const formatMoney = (n) => `$${toMoney(n ?? 0).toFixed(2)}`;

  const isValidAmountForInput = useMemo(() => {
    if (!orderId.trim()) return false;
    const num = Number(amount);
    if (!Number.isFinite(num) || num <= 0) return false;
    return Math.round(num * 100) === num * 100;
  }, [orderId, amount]);

  const normalizeDetails = (resp) => (resp && resp.data ? resp.data : resp);

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 300);
  };

  const fetchDetails = async (id) => {
    const trimmedId = id.trim();
    if (!trimmedId) return;

    setDetailsLoading(true);
    try {
      const resp = await getOrderDetails(trimmedId);
      const normalized = normalizeDetails(resp);

      if (!normalized || !normalized.order) {
        setDetails(null);
        setMsg({ type: 'danger', text: 'Order not found.' });
        triggerShake();
      } else {
        setDetails(normalized);
        const loadedId =
          normalized.order.order_id || normalized.order.id || trimmedId;

        setRecentOrders((prev) => {
          const next = [loadedId, ...prev.filter((v) => v !== loadedId)];
          return next.slice(0, 5);
        });
        // NOTE: do NOT clear msg here; lets success messages persist after settlement
      }
    } catch (err) {
      const code = err?.response?.data?.code;
      if (err?.response?.status === 404 || code === 'ORDER_NOT_FOUND') {
        setMsg({ type: 'danger', text: 'Order not found.' });
        triggerShake();
      } else {
        setMsg({ type: 'danger', text: 'Unable to load order details.' });
      }
      setDetails(null);
    } finally {
      setDetailsLoading(false);
    }
  };

  const isAuthorized =
    !!details &&
    (details.authorization?.outcome === 'SUCCESS' ||
      details.order?.status === 'AUTHORIZED');

  // Normalize availableToSettle to a number so type differences (string vs number)
  // don't accidentally disable the Settle button.
  const rawAvailable = details?.availableToSettle ?? null;
  const available =
    rawAvailable == null || rawAvailable === ''
      ? null
      : Number(rawAvailable);

  const hasRemaining =
    Number.isFinite(available) && available > 0;

  const canSettle = isValidAmountForInput && !!details && isAuthorized && hasRemaining;

  // Live preview of remaining after this settlement
  const numericAmount = Number(amount);
  const hasNumericAmount =
    Number.isFinite(numericAmount) &&
    numericAmount > 0 &&
    Math.round(numericAmount * 100) === numericAmount * 100;

  const canPreviewRemaining =
    hasRemaining && hasNumericAmount;

  const remainingAfter =
    canPreviewRemaining ? toMoney(available - numericAmount) : null;

  const willExceedAvailable =
    canPreviewRemaining && numericAmount > available;

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!canSettle) {
      if (!details)
        setMsg({ type: 'danger', text: 'Load order details before settling.' });
      else if (!isAuthorized)
        setMsg({ type: 'danger', text: 'Order is not authorized for settlement.' });
      else if (!hasRemaining)
        setMsg({ type: 'danger', text: 'There is no remaining amount to settle.' });
      return;
    }

    setLoading(true);
    try {
      const resp = await postSettlement({
        orderId: orderId.trim(),
        amount: Number(amount),
      });
      const data = resp && resp.data ? resp.data : resp;
      const remaining = toMoney(data.availableToSettle).toFixed(2);

      const text =
        remaining === '0.00'
          ? `Order ${orderId.trim()} fully settled.`
          : `Settlement recorded. Remaining $${remaining}.`;
      setMsg({ type: 'success', text });

      // Refresh details AFTER setting success (and fetchDetails no longer clears msg)
      await fetchDetails(orderId);
      setAmount('');
    } catch (errObj) {
      const code = errObj?.response?.data?.code || 'SERVER_ERROR';
      const avail = errObj?.response?.data?.availableToSettle;
      let text = 'Something went wrong—try again.';

      if (code === 'AMOUNT_EXCEEDS_AVAILABLE') {
        text = `Amount exceeds available ($${toMoney(avail).toFixed(2)}).`;
      } else if (code === 'NO_APPROVED_AUTH') {
        text = 'No approved authorization found for this order.';
      } else if (code === 'ORDER_NOT_FOUND') {
        text = 'Order not found.';
        setDetails(null);
        triggerShake();
      } else if (
        code === 'INVALID_AMOUNT' ||
        code === 'INVALID_AMOUNT_PRECISION'
      ) {
        text = 'Invalid amount. Use a positive number with ≤ 2 decimals.';
      }

      setMsg({ type: 'danger', text });
    } finally {
      setLoading(false);
    }
  };

  const handleFetchKey = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (orderId.trim()) fetchDetails(orderId.trim());
    }
  };

  const handleFetchClick = () => {
    if (orderId.trim()) fetchDetails(orderId.trim());
  };

  const onAmountChange = (e) => {
    let val = e.target.value;
    val = val.replace(/[^0-9.]/g, '');
    const parts = val.split('.');
    if (parts.length > 2) parts.splice(2);
    if (parts[1]?.length > 2) parts[1] = parts[1].slice(0, 2);
    val = parts.join('.');
    setAmount(val);
  };

  // Return only the bg-* class; JSX will add "badge"
  const outcomeBadgeClass = (outcome) => {
    const s = String(outcome || '').toUpperCase();
    if (s.includes('SETTLED') || s.includes('SUCCESS') || s.includes('AUTHORIZED'))
      return 'bg-success';
    if (s.includes('INSUFFICIENT')) return 'bg-warning';
    if (s.includes('INCORRECT') || s.includes('ERROR') || s.includes('SERVER'))
      return 'bg-danger';
    return 'bg-secondary';
  };

  const statusValue =
    details?.order?.status || details?.authorization?.outcome || '—';
  const statusBadgeClass = `badge ${outcomeBadgeClass(statusValue)}`;

  return (
    <div>
      {msg && (
        <div className={`alert alert-${msg.type} text-center`} role="alert">
          {msg.text}
        </div>
      )}

      {/* Top: Warehouse Settlement card */}
      <div className="card portal-card mb-4">
        <div className="card-body">
          <h4 className="mb-3 text-center">Warehouse Settlement</h4>

          <form onSubmit={onSubmit} className="mt-2">
            <div className="mx-auto text-start" style={{ maxWidth: '420px' }}>
              <div className="mb-3">
                <label className="form-label" htmlFor="orderId">
                  Order ID:
                </label>
                <div
                  className={`input-group ${shake ? 'shake' : ''}`}
                >
                  <input
                    id="orderId"
                    className="form-control"
                    value={orderId}
                    onChange={(e) => setOrderId(e.target.value)}
                    onKeyDown={handleFetchKey}
                    placeholder="ORDER NUMBER"
                  />
                  <button
                    type="button"
                    className="btn settlement-load-btn"
                    onClick={handleFetchClick}
                    disabled={detailsLoading || !orderId.trim()}
                  >
                    {detailsLoading ? (
                      <>
                        <span
                          className="spinner-border spinner-border-sm me-2"
                          role="status"
                          aria-hidden="true"
                        />
                        Loading
                      </>
                    ) : (
                      'Load'
                    )}
                  </button>
                </div>

                {/* Recent orders quick-pick */}
                {recentOrders.length > 0 && (
                  <div className="mt-2 small">
                    <span className="text-muted me-2">Recent:</span>
                    {recentOrders.map((id) => (
                      <button
                        key={id}
                        type="button"
                        className="btn recent-order-btn"
                        onClick={() => {
                          setOrderId(id);
                          fetchDetails(id);
                        }}
                      >
                        {id}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="mb-2">
                <label className="form-label" htmlFor="amount">
                  Amount:
                </label>
                <input
                  id="amount"
                  className="form-control"
                  value={amount}
                  onChange={onAmountChange}
                  placeholder="00.00"
                  inputMode="decimal"
                />
                <div className="form-text text-muted">
                  Enter up to two decimals (e.g. 125.75)
                </div>

                {/* Live remaining preview */}
                {canPreviewRemaining && !willExceedAvailable && (
                  <div className="small text-muted mt-1">
                    Remaining if submitted:{' '}
                    <span className="fw-semibold">
                      {formatMoney(remainingAfter)}
                    </span>
                  </div>
                )}
                {willExceedAvailable && (
                  <div className="small text-warning mt-1">
                    Amount exceeds available{' '}
                    <span className="fw-semibold">
                      {formatMoney(available)}
                    </span>
                    .
                  </div>
                )}
              </div>

              <div className="mb-3 small" style={{ minHeight: 18 }}>
                {!details && orderId.trim() && (
                  <span className="text-muted">
                    Load order details to continue.
                  </span>
                )}
                {details && !isAuthorized && (
                  <span className="text-warning">
                    Order is not authorized for settlement.
                  </span>
                )}
                {details && isAuthorized && !hasRemaining && (
                  <span className="text-warning">
                    Nothing left to settle for this order.
                  </span>
                )}
              </div>

              <div className="d-grid">
                <button
                  className="btn btn-dark btn-lg"
                  type="submit"
                  disabled={loading || !canSettle}
                >
                  {loading ? (
                    <>
                      <span
                        className="spinner-border spinner-border-sm me-2"
                        role="status"
                        aria-hidden="true"
                      />
                      Submitting…
                    </>
                  ) : (
                    'Settle'
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Order details card */}
      <h5 className="mb-2 text-center">Order Details</h5>
      <div className="card portal-card">
        <div className="card-body">
          {detailsLoading ? (
            <div className="d-flex align-items-center justify-content-center">
              <div
                className="spinner-border me-2"
                role="status"
                aria-hidden="true"
              />
              <span>Loading order details…</span>
            </div>
          ) : !details ? (
            <p className="text-muted mb-0 text-center">
              Enter an Order ID to view details.
            </p>
          ) : (
            <>
              {/* Order ID + Status row */}
              <div className="d-flex justify-content-between align-items-center mb-3">
                <div>
                  <div className="text-muted small">Order ID</div>
                  <div className="fw-semibold">
                    {details.order?.order_id}
                  </div>
                </div>
                <div className="text-end">
                  <div className="text-muted small">Status</div>
                  <span className={statusBadgeClass}>{statusValue}</span>
                </div>
              </div>

              <div className="mt-3 text-center">
                <div className="text-muted small">Card (last 4)</div>
                <div className="fw-semibold">
                  **** **** **** {details.order?.card_last4 || '—'}
                </div>
              </div>

              <div className="mt-3 text-center">
                <div className="text-muted small">Authorized Amount</div>
                <div className="fw-semibold">
                  {(() => {
                    const authAmount =
                      details.authorization?.amount ?? details.order?.amount;
                    return authAmount == null
                      ? '—'
                      : formatMoney(authAmount);
                  })()}
                </div>
              </div>

              <div className="mt-3 text-center">
                <div className="text-muted small">Available to Settle</div>
                <div className="display-6">
                  {details.availableToSettle == null
                    ? '—'
                    : formatMoney(details.availableToSettle)}
                </div>
              </div>

              <div className="mt-3">
                <div className="text-muted small mb-2 text-center">
                  Settlements
                </div>
                {!details.settlements || details.settlements.length === 0 ? (
                  <p className="text-muted mb-0 text-center">
                    No settlements yet.
                  </p>
                ) : (
                  <ul className="list-group list-group-flush">
                    {details.settlements.map((s) => (
                      <li
                        key={s.settlement_id || s.id}
                        className="list-group-item d-flex justify-content-between"
                      >
                        <span>
                          {new Date(
                            s.created_at || s.createdAt
                          ).toLocaleString()}
                        </span>
                        <span className="fw-semibold">
                          {formatMoney(s.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
