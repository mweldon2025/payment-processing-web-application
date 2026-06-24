// --------------------------------------------------------------
// src/components/OrderHistory.jsx
//  OrderHistory component for the Manhattan Associates Warehouse Portal
//  Displays a list of orders with filtering, sorting, pagination, and detail view
//  Fetches data from backend API via lib/api.js
// --------------------------------------------------------------
import { useEffect, useMemo, useState } from 'react';
import { listOrders, getOrderDetails } from '../lib/api.js';

// Map status → badge class using existing visual cues
function badgeClass(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'AUTHORIZED' || s === 'SUCCESS') return 'badge bg-success';
  if (s === 'SETTLED') return 'badge bg-primary';
  if (s === 'PENDING') return 'badge bg-secondary';
  if (s === 'ERROR') return 'badge bg-danger';
  return 'badge bg-secondary';
}

// helpers
const cmpStr = (a = '', b = '') => a.localeCompare(b, undefined, { sensitivity: 'base' });
const cmpNum = (a = 0, b = 0) => a - b;
const cmpDate = (a, b) => {
  const da = a ? new Date(a).getTime() : 0;
  const db = b ? new Date(b).getTime() : 0;
  return da - db;
};

const CURRENT_STATUSES = new Set(['PENDING', 'AUTHORIZED']);
const PAST_STATUSES = new Set(['SETTLED', 'ERROR']);

export default function OrderHistory() {
  const [tab, setTab] = useState('current'); // "current" | "past"
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Search (debounced)
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('date');   // default sort by date
  const [sortDir, setSortDir] = useState('desc');   // 'asc' | 'desc'

  // Date range filters (client-side)
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Status filter (only applied on "past" tab)
  const [statusFilter, setStatusFilter] = useState('');

  // Detail panel state
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [selectedOrderDetails, setSelectedOrderDetails] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);

  // Pagination state (client-side)
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);

  // Load orders once from backend
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const resp = await listOrders({});
        const body = resp && resp.data ? resp.data : resp;

        const raw = Array.isArray(body) ? body : body?.data || [];
        if (!mounted) return;

        const mapped = raw.map((o) => ({
          id: o.order_id || o.id,
          orderNumber: o.order_id || o.order_number || o.id,
          date: o.created_at || o.date,
          total: o.amount ?? o.total ?? 0,
          status: o.status,
          customer: o.customer_name || '',
          cardLast4: o.card_last4 || o.cardLast4 || '',
        }));

        setOrders(mapped);
      } catch (e) {
        console.error('Failed to load orders', e);
        if (!mounted) return;
        setError('Unable to load orders from the server.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // Debounce search input → search query
  useEffect(() => {
    const handle = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const formatMoney = (n) => `$${Number(n ?? 0).toFixed(2)}`;
  const formatDate = (d) => {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleString();
    } catch {
      return d;
    }
  };

  // Tab counts (based on full orders list)
  const currentCount = useMemo(
    () =>
      orders.filter((o) =>
        CURRENT_STATUSES.has(String(o.status || '').toUpperCase())
      ).length,
    [orders]
  );

  const pastCount = useMemo(
    () =>
      orders.filter((o) =>
        PAST_STATUSES.has(String(o.status || '').toUpperCase())
      ).length,
    [orders]
  );

  // Available statuses for "past" tab status filter
  const pastStatusOptions = useMemo(() => {
    const set = new Set();
    orders.forEach((o) => {
      const s = String(o.status || '').toUpperCase();
      if (PAST_STATUSES.has(s)) {
        set.add(s);
      }
    });
    return Array.from(set);
  }, [orders]);

  // Filter + search + sort derived list
  const filteredAndSorted = useMemo(() => {
    let rows = [...orders];

    // Tab filter (current vs past)
    rows = rows.filter((o) => {
      const s = String(o.status || '').toUpperCase();
      if (tab === 'current') return CURRENT_STATUSES.has(s);
      return PAST_STATUSES.has(s);
    });

    // Status filter (only for "past" tab)
    if (tab === 'past' && statusFilter) {
      const target = statusFilter.toUpperCase();
      rows = rows.filter(
        (o) => String(o.status || '').toUpperCase() === target
      );
    }

    // Date range filter (inclusive)
    if (fromDate) {
      const fromTime = new Date(fromDate).getTime();
      rows = rows.filter((o) => {
        const t = o.date ? new Date(o.date).getTime() : 0;
        return t >= fromTime;
      });
    }
    if (toDate) {
      // Treat toDate as end-of-day for that date
      const to = new Date(toDate);
      to.setHours(23, 59, 59, 999);
      const toTime = to.getTime();
      rows = rows.filter((o) => {
        const t = o.date ? new Date(o.date).getTime() : 0;
        return t <= toTime;
      });
    }

    // Text search (order #, customer, status)
    if (search.trim()) {
      const needle = search.trim().toLowerCase();
      rows = rows.filter((o) => {
        return (
          String(o.orderNumber || '').toLowerCase().includes(needle) ||
          String(o.customer || '').toLowerCase().includes(needle) ||
          String(o.status || '').toLowerCase().includes(needle)
        );
      });
    }

    // Sort
    const dirSign = sortDir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      let delta = 0;
      switch (sortKey) {
        case 'orderNumber':
          delta = cmpStr(String(a.orderNumber), String(b.orderNumber));
          break;
        case 'customer':
          delta = cmpStr(String(a.customer), String(b.customer));
          break;
        case 'date':
          delta = cmpDate(a.date, b.date);
          break;
        case 'total':
          delta = cmpNum(Number(a.total || 0), Number(b.total || 0));
          break;
        case 'status':
          delta = cmpStr(String(a.status), String(b.status));
          break;
        default:
          delta = cmpDate(a.date, b.date);
      }
      return dirSign * delta;
    });

    return rows;
  }, [orders, tab, search, sortKey, sortDir, fromDate, toDate, statusFilter]);

  // When filters / tab change, reset to first page
  useEffect(() => {
    setPage(1);
  }, [tab, search, fromDate, toDate, statusFilter, sortKey, sortDir]);

  // Pagination: derive page slice from filteredAndSorted
  const totalRows = filteredAndSorted.length;
  const totalPages = totalRows > 0 ? Math.ceil(totalRows / pageSize) : 1;
  const currentPage = Math.min(page, totalPages);
  const startIndex = totalRows === 0 ? 0 : (currentPage - 1) * pageSize;
  const endIndex = totalRows === 0 ? 0 : Math.min(startIndex + pageSize, totalRows);

  const paginatedRows = useMemo(
    () => filteredAndSorted.slice(startIndex, endIndex),
    [filteredAndSorted, startIndex, endIndex]
  );

  // Sort header click handler — simple + reliable toggle
  const handleSort = (key) => {
    if (sortKey === key) {
      // Same column: just flip direction
      setSortDir((prevDir) => (prevDir === 'asc' ? 'desc' : 'asc'));
    } else {
      // New column: set key and reset to ascending
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const getAriaSort = (key) => {
    if (sortKey !== key) return 'none';
    return sortDir === 'asc' ? 'ascending' : 'descending';
  };

  // CSV export of current filtered + sorted list (all rows, not just current page)
  const handleExportCsv = () => {
    if (!filteredAndSorted.length) return;

    const header = [
      'Order ID',
      'Customer',
      'Date',
      'Total',
      'Status',
      'Card Last4',
    ];

    const rows = filteredAndSorted.map((o) => [
      o.orderNumber || '',
      o.customer || '',
      formatDate(o.date),
      Number(o.total ?? 0).toFixed(2),
      o.status || '',
      o.cardLast4 ? `****${o.cardLast4}` : '',
    ]);

    const escapeCell = (val) => {
      const s = String(val ?? '');
      const escaped = s.replace(/"/g, '""');
      return `"${escaped}"`;
    };

    const csvLines = [
      header.map(escapeCell).join(','),
      ...rows.map((r) => r.map(escapeCell).join(',')),
    ];

    const blob = new Blob([csvLines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    a.download = `orders-export-${tab}-${ts}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const renderSortIcon = (key) => {
    if (sortKey !== key) return null;
    return sortDir === 'asc' ? ' ▲' : ' ▼';
  };

  // Clicking a row → load detail panel
  const handleRowClick = async (orderId) => {
    if (!orderId) return;

    setSelectedOrderId(orderId);
    setSelectedOrderDetails(null);
    setDetailError(null);
    setDetailLoading(true);

    try {
      const resp = await getOrderDetails(orderId);
      const data = resp && resp.data ? resp.data : resp;
      setSelectedOrderDetails(data);
    } catch (e) {
      console.error('Failed to load order details', e);
      setDetailError('Unable to load order details.');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleRowKeyDown = (e, orderId) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleRowClick(orderId);
    }
  };

  const clearSearch = () => setSearchInput('');

  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setFromDate('');
    setToDate('');
    setStatusFilter('');
  };

  const handlePageSizeChange = (e) => {
    const nextSize = Number(e.target.value) || 20;
    setPageSize(nextSize);
    setPage(1);
  };

  const detail = selectedOrderDetails || {};
  const detailOrder = detail.order;
  const detailAuth = detail.authorization;
  const detailSettlements = detail.settlements || [];
  const detailAvailable = detail.availableToSettle;

  const canPrev = currentPage > 1;
  const canNext = currentPage < totalPages;

  return (
    <div className="container py-4">
      <div className="panel mb-3">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Orders</h2>
            <p className="panel-description">
              View current and past orders with their payment status.
            </p>
          </div>
        </div>

        {/* Tabs: Current vs Past */}
        <ul className="nav nav-pills mb-3">
          <li className="nav-item">
            <button
              type="button"
              className={`nav-link ${tab === 'current' ? 'active' : ''}`}
              onClick={() => {
                setTab('current');
                setStatusFilter('');
              }}
            >
              Current
              {typeof currentCount === 'number' && (
                <span className="badge bg-light text-dark ms-2">
                  {currentCount}
                </span>
              )}
            </button>
          </li>
          <li className="nav-item">
            <button
              type="button"
              className={`nav-link ${tab === 'past' ? 'active' : ''}`}
              onClick={() => {
                setTab('past');
                setStatusFilter('');
              }}
            >
              Past
              {typeof pastCount === 'number' && (
                <span className="badge bg-light text-dark ms-2">
                  {pastCount}
                </span>
              )}
            </button>
          </li>
        </ul>

        {/* Filters + Search + Export row */}
        <div className="d-flex flex-wrap gap-2 justify-content-between align-items-center mb-2">
          <div className="d-flex flex-wrap gap-2 align-items-center">
            {/* Date range filters */}
            <div className="d-flex flex-wrap gap-2">
              <div>
                <label className="form-label form-label-custom mb-1 small">
                  From
                </label>
                <input
                  type="date"
                  className="form-control form-control-sm"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                />
              </div>
              <div>
                <label className="form-label form-label-custom mb-1 small">
                  To
                </label>
                <input
                  type="date"
                  className="form-control form-control-sm"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                />
              </div>
            </div>

            {/* Status filter (Past tab only) */}
            {tab === 'past' && pastStatusOptions.length > 0 && (
              <div>
                <label className="form-label form-label-custom mb-1 small">
                  Status
                </label>
                <select
                  className="form-select form-select-sm"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="">All</option>
                  {pastStatusOptions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Clear all filters (only shown when something is set) */}
            {(fromDate || toDate || statusFilter || search) && (
              <button
                type="button"
                className="btn btn-outline-light btn-sm align-self-end"
                onClick={clearFilters}
              >
                Clear filters
              </button>
            )}
          </div>

          {/* Search + Export */}
          <div className="d-flex flex-wrap gap-2 align-items-center">
            <div style={{ maxWidth: 320, width: '100%' }}>
              <div className="input-group input-group-sm">
                <input
                  type="text"
                  className="form-control"
                  placeholder="Search by order, customer, or status"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
                {searchInput && (
                  <button
                    type="button"
                    className="btn btn-outline-light"
                    onClick={clearSearch}
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-outline-light btn-sm"
              onClick={handleExportCsv}
              disabled={!filteredAndSorted.length}
            >
              Export CSV
            </button>
          </div>
        </div>
      </div>

      <div className="card portal-card">
        <div className="card-body">
          {loading ? (
            <div className="d-flex align-items-center justify-content-center py-4">
              <div className="spinner-border me-2" role="status" aria-hidden="true" />
              <span>Loading orders…</span>
            </div>
          ) : error ? (
            <div className="alert alert-danger mb-0">{error}</div>
          ) : totalRows === 0 ? (
            <div className="text-center text-muted py-4">
              No {tab === 'current' ? 'current' : 'past'} orders to display.
            </div>
          ) : (
            <>
              {/* Detail panel ABOVE table */}
              {selectedOrderId && (
                <div className="mb-3 pb-3 border-bottom">
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <h5 className="mb-0">
                      Order Details
                      <span className="ms-2 text-muted small">
                        #{selectedOrderId}
                      </span>
                    </h5>
                    <button
                      type="button"
                      className="btn btn-outline-light btn-sm"
                      onClick={() => {
                        setSelectedOrderId(null);
                        setSelectedOrderDetails(null);
                        setDetailError(null);
                        setDetailLoading(false);
                      }}
                    >
                      Close
                    </button>
                  </div>

                  {detailLoading ? (
                    <div className="d-flex align-items-center py-2">
                      <div
                        className="spinner-border spinner-border-sm me-2"
                        role="status"
                        aria-hidden="true"
                      />
                      <span>Loading order details…</span>
                    </div>
                  ) : detailError ? (
                    <div className="alert alert-danger mb-0">{detailError}</div>
                  ) : detailOrder ? (
                    <div className="row g-3">
                      {/* Left: Order summary */}
                      <div className="col-md-4">
                        <div
                          style={{
                            border: '1px solid rgba(255,255,255,0.12)',
                            borderRadius: 6,
                            padding: '0.75rem',
                          }}
                        >
                          <h6 className="mb-2">Order</h6>
                          <div className="small">
                            <div>
                              <span className="text-muted">Customer: </span>
                              {detailOrder.customer_name || '—'}
                            </div>
                            <div>
                              <span className="text-muted">Total: </span>
                              {formatMoney(detailOrder.amount)}
                            </div>
                            <div>
                              <span className="text-muted">Status: </span>
                              <span className={badgeClass(detailOrder.status)}>
                                {detailOrder.status}
                              </span>
                            </div>
                            <div className="mt-1">
                              <span className="text-muted">Created: </span>
                              {formatDate(detailOrder.created_at)}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Middle: Authorization */}
                      <div className="col-md-4">
                        <div
                          style={{
                            border: '1px solid rgba(255,255,255,0.12)',
                            borderRadius: 6,
                            padding: '0.75rem',
                          }}
                        >
                          <h6 className="mb-2">Authorization</h6>
                          {detailAuth ? (
                            <div className="small">
                              <div>
                                <span className="text-muted">Outcome: </span>
                                <span className={badgeClass(detailAuth.outcome)}>
                                  {detailAuth.outcome}
                                </span>
                              </div>
                              <div>
                                <span className="text-muted">Amount: </span>
                                {formatMoney(detailAuth.amount)}
                              </div>
                              <div className="mt-1">
                                <span className="text-muted">Token: </span>
                                <span
                                  className="text-truncate d-inline-block"
                                  style={{ maxWidth: '12rem' }}
                                >
                                  {detailAuth.provider_token || '—'}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="text-muted small">
                              No authorization recorded.
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right: Settlements */}
                      <div className="col-md-4">
                        <div
                          style={{
                            border: '1px solid rgba(255,255,255,0.12)',
                            borderRadius: 6,
                            padding: '0.75rem',
                          }}
                        >
                          <h6 className="mb-2">Settlements</h6>
                          <div className="small mb-2">
                            <span className="text-muted">Available to settle: </span>
                            {typeof detailAvailable === 'number'
                              ? formatMoney(detailAvailable)
                              : '—'}
                          </div>
                          {detailSettlements.length === 0 ? (
                            <div className="text-muted small">
                              No settlements recorded.
                            </div>
                          ) : (
                            <div
                              style={{
                                maxHeight: 160,
                                overflowY: 'auto',
                              }}
                            >
                              {detailSettlements.map((s) => (
                                <div
                                  key={s.id || `${s.amount}-${s.created_at}`}
                                  className="d-flex justify-content-between align-items-center mb-1"
                                >
                                  <div className="small">
                                    <div>
                                      <span className="text-muted">Amount: </span>
                                      {formatMoney(s.amount)}
                                    </div>
                                    <div className="text-muted small">
                                      {formatDate(s.created_at)}
                                    </div>
                                  </div>
                                  <span className={badgeClass(s.outcome)}>
                                    {s.outcome}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-muted small">
                      Select an order row above to view details.
                    </div>
                  )}
                </div>
              )}

              {/* Table */}
              <div className="table-responsive">
                <table className="table table-hover order-history-table">
                  <thead>
                    <tr>
                      <th
                        scope="col"
                        className="sortable-header"
                        onClick={() => handleSort('orderNumber')}
                        onKeyDown={(e) => e.key === 'Enter' && handleSort('orderNumber')}
                        aria-sort={getAriaSort('orderNumber')}
                        style={{ cursor: 'pointer' }}
                        tabIndex={0}
                      >
                        Order # {renderSortIcon('orderNumber')}
                      </th>
                      <th
                        scope="col"
                        className="sortable-header"
                        onClick={() => handleSort('customer')}
                        onKeyDown={(e) => e.key === 'Enter' && handleSort('customer')}
                        aria-sort={getAriaSort('customer')}
                        style={{ cursor: 'pointer' }}
                        tabIndex={0}
                      >
                        Customer{renderSortIcon('customer')}
                      </th>
                      <th
                        scope="col"
                        className="sortable-header"
                        onClick={() => handleSort('date')}
                        onKeyDown={(e) => e.key === 'Enter' && handleSort('date')}
                        aria-sort={getAriaSort('date')}
                        style={{ cursor: 'pointer' }}
                        tabIndex={0}
                      >
                        Date{renderSortIcon('date')}
                      </th>
                      <th
                        scope="col"
                        className="sortable-header text-end"
                        onClick={() => handleSort('total')}
                        onKeyDown={(e) => e.key === 'Enter' && handleSort('total')}
                        aria-sort={getAriaSort('total')}
                        style={{ cursor: 'pointer' }}
                        tabIndex={0}
                      >
                        Total{renderSortIcon('total')}
                      </th>
                      <th
                        scope="col"
                        className="sortable-header"
                        onClick={() => handleSort('status')}
                        onKeyDown={(e) => e.key === 'Enter' && handleSort('status')}
                        aria-sort={getAriaSort('status')}
                        style={{ cursor: 'pointer' }}
                        tabIndex={0}
                      >
                        Status{renderSortIcon('status')}
                      </th>
                      <th scope="col">Payment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedRows.map((o) => {
                      const rowId = o.id || o.orderNumber;
                      return (
                        <tr
                          key={rowId}
                          className={selectedOrderId === rowId ? 'table-active' : ''}
                          style={{ cursor: 'pointer' }}
                          onClick={() => handleRowClick(rowId)}
                          onKeyDown={(e) => handleRowKeyDown(e, rowId)}
                          tabIndex={0}
                        >
                          <td className="fw-semibold">{o.orderNumber}</td>
                          <td>{o.customer || '—'}</td>
                          <td>{formatDate(o.date)}</td>
                          <td className="text-end">{formatMoney(o.total)}</td>
                          <td>
                            <span className={badgeClass(o.status)}>{o.status}</span>
                          </td>
                          <td className="text-muted">
                            {o.cardLast4 ? <>•••• {o.cardLast4}</> : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination controls */}
              <div className="d-flex flex-wrap justify-content-between align-items-center mt-2">
                <div className="small text-muted mb-2 mb-sm-0">
                  {totalRows > 0 && (
                    <>
                      Showing <strong>{startIndex + 1}</strong>–
                      <strong>{endIndex}</strong> of{' '}
                      <strong>{totalRows}</strong> orders
                    </>
                  )}
                </div>
                <div className="d-flex flex-wrap gap-2 align-items-center">
                  <div className="d-flex align-items-center">
                    <span className="small me-2">Rows per page</span>
                    <select
                      className="form-select form-select-sm"
                      value={pageSize}
                      onChange={handlePageSizeChange}
                    >
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>
                  <div className="d-flex align-items-center gap-1">
                    <button
                      type="button"
                      className="btn btn-outline-light btn-sm"
                      disabled={!canPrev}
                      onClick={() => canPrev && setPage(currentPage - 1)}
                    >
                      Previous
                    </button>
                    <span className="small text-muted px-1">
                      Page <strong>{currentPage}</strong> of{' '}
                      <strong>{totalPages}</strong>
                    </span>
                    <button
                      type="button"
                      className="btn btn-outline-light btn-sm"
                      disabled={!canNext}
                      onClick={() => canNext && setPage(currentPage + 1)}
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
