// --------------------------------------------------------------
// src/components/PaymentProcessingUI.jsx
//  PaymentProcessingUI component for the Manhattan Associates Warehouse Portal
//  Displays a payment form to authorize payments against orders
//  Handles form state, validation, submission, and session transaction history
//  Interacts with backend API via lib/api.js
// --------------------------------------------------------------
import { useEffect, useState, useRef } from 'react';
import { getNextOrder, postAuthorize } from '../lib/api.js';

function resolveOutcome(resp) {
  if (!resp || typeof resp !== 'object') return 'SERVER_ERROR';
  if (resp.outcome) return String(resp.outcome);
  if (resp.authorization?.outcome) return String(resp.authorization.outcome);
  if (resp.code) return String(resp.code);
  return 'SUCCESS';
}

/* ---------- Card brand detection ---------- */
function detectCardType(input) {
  const n = String(input || '').replace(/\D/g, '');

  // Visa
  if (/^4/.test(n)) return 'Visa';

  // Mastercard (51–55, 2221–2720)
  if (/^(5[1-5]|2(2[2-9]|[3-6][0-9]|7[01]|720))/.test(n)) return 'Mastercard';

  // American Express (34, 37)
  if (/^3[47]/.test(n)) return 'American Express';

  // Discover (common BIN ranges: 6011, 65, 64[4-9], 622xxx)
  if (/^6(?:011|5|4[4-9]|22)/.test(n)) return 'Discover';

  return null;
}

/* ---------- Luhn checksum ---------- */
function isValidLuhn(pan) {
  const digits = String(pan || '').replace(/\D/g, '');
  if (!digits) return false;

  let sum = 0;
  let shouldDouble = false;

  // Walk from right to left
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (Number.isNaN(d)) return false;

    if (shouldDouble) {
      d = d * 2;
      if (d > 9) d -= 9;
    }

    sum += d;
    shouldDouble = !shouldDouble;
  }

  return sum % 10 === 0;
}

/* ---------- Expiry helpers (MM/YY) ---------- */
function fmtExpiry(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}
function isFutureExpiry(mmYY) {
  const m = (mmYY || '').match(/^(\d{2})\/(\d{2})$/);
  if (!m) return false;
  const [, mm, yy] = m;
  const month = Number(mm);
  if (month < 1 || month > 12) return false;
  const year = 2000 + Number(yy);
  const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);
  return endOfMonth >= new Date();
}
function splitExpiry(mmYY) {
  const m = (mmYY || '').match(/^(\d{2})\/(\d{2})$/);
  if (!m) return { expMonth: '', expYear: '' };
  const [, mm, yy] = m;
  return { expMonth: mm, expYear: `20${yy}` };
}

/* ---------- Card number formatting ---------- */
function getCardFormat(type) {
  switch (type) {
    case 'American Express':
      return { max: 15, groups: [4, 6, 5] };
    case 'Mastercard':
    case 'Visa':
    case 'Discover':
    default:
      return { max: 16, groups: [4, 4, 4, 4] };
  }
}
function formatWithGroups(digits, groups) {
  let out = '', idx = 0;
  for (let i = 0; i < groups.length; i++) {
    const size = groups[i];
    const chunk = digits.slice(idx, idx + size);
    if (!chunk) break;
    if (out) out += ' ';
    out += chunk;
    idx += size;
  }
  return out;
}
function formatCardNumberForType(input, type) {
  const digits = String(input || '').replace(/\D/g, '');
  const { max, groups } = getCardFormat(type);
  const trimmed = digits.slice(0, max);
  return formatWithGroups(trimmed, groups);
}

/* ---------- CVV validation ---------- */
function isValidCvvForType(rawCvv, cardType) {
  const digits = String(rawCvv || '').replace(/\D/g, '');
  if (!digits) return false;

  if (cardType === 'American Express') {
    // Amex: 4-digit security code
    return digits.length === 4;
  }

  if (cardType === 'Visa' || cardType === 'Mastercard' || cardType === 'Discover') {
    // Visa / MC / Discover: 3-digit CVV
    return digits.length === 3;
  }

  // Unknown brand → accept 3 or 4 digits
  return digits.length === 3 || digits.length === 4;
}

/* ---------- Card type icon (visual only) ---------- */
function cardTypeIcon(type) {
  switch (type) {
    case 'Visa':
      return '🅥';
    case 'Mastercard':
      return 'Ⓜ️';
    case 'American Express':
      return '🅰️';
    case 'Discover':
      return '🅓';
    default:
      return '💳';
  }
}

/* ---------- US States (front-end only, not sent to backend) ---------- */
const US_STATES = [
  { code: '', name: 'Select state' },
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
];

/* ---------- UI ---------- */
export default function PaymentProcessingUI() {
  const [loadingInit, setLoadingInit] = useState(true);
  const [errorInit, setErrorInit] = useState(null);

  const [orderId, setOrderId] = useState('');
  const [amount, setAmount] = useState(0);

  // Customer / shipping fields (per MA brief, plus front-end-only state)
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName]   = useState('');
  const [address, setAddress]     = useState('');
  const [city, setCity]           = useState('');
  const [shippingState, setShippingState] = useState('');
  const [zip, setZip]             = useState('');

  // Billing fields (front-end only; NOT sent to backend)
  const [billingSameAsShipping, setBillingSameAsShipping] = useState(true);
  const [billingFirstName, setBillingFirstName] = useState('');
  const [billingLastName, setBillingLastName] = useState('');
  const [billingAddress, setBillingAddress] = useState('');
  const [billingCity, setBillingCity] = useState('');
  const [billingState, setBillingState] = useState('');
  const [billingZip, setBillingZip] = useState('');

  // Card fields
  const [nameOnCard, setNameOnCard] = useState('');
  const [cardNumber, setCardNumber] = useState(''); // formatted display value
  const [cardType, setCardType]     = useState(null);
  const [expiry, setExpiry]         = useState('');
  const [cvv, setCvv]               = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice]         = useState(null); // {type, title, detail}

  // Field-level error flags for a11y
  const [zipError, setZipError] = useState(false);
  const [expiryError, setExpiryError] = useState(false);
  const [cvvError, setCvvError] = useState(false);

  // Right-panel: this-session activity (no backend storage)
  const [sessionTxns, setSessionTxns] = useState([]);

  // Ref for CVV (for auto-advance from expiry)
  const cvvInputRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { orderId, amount } = await getNextOrder();
        if (!mounted) return;
        setOrderId(orderId);
        setAmount(amount);
        setLoadingInit(false);
      } catch (err) {
        console.error(err);
        if (!mounted) return;
        setErrorInit('Failed to initialize checkout.');
        setLoadingInit(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const appendSessionTxn = (entry) =>
    setSessionTxns((prev) => [{ id: crypto.randomUUID(), ...entry }, ...prev].slice(0, 8));

  const outcomeBadgeClass = (o) => {
    const s = String(o || '').toUpperCase();
    if (s.includes('SUCCESS') || s.includes('AUTHORIZED')) return 'badge bg-success';
    if (s.includes('INSUFFICIENT')) return 'badge bg-warning';
    if (s.includes('INCORRECT') || s.includes('ERROR') || s.includes('SERVER')) return 'badge bg-danger';
    return 'badge bg-secondary';
  };
  const fmtMoney = (n) => `$${Number(n ?? 0).toFixed(2)}`;
  const fmtTime = (iso) => {
    try { return new Date(iso).toLocaleString(); } catch { return iso; }
  };

  /* ---- Input handlers ---- */
  const onCardNumberChange = (e) => {
    const raw = e.target.value;
    const detected = detectCardType(raw);
    setCardType(detected);
    setCardNumber(formatCardNumberForType(raw, detected));
  };
  const onCardNumberPaste = (e) => {
    const text = (e.clipboardData || window.clipboardData).getData('text');
    const detected = detectCardType(text);
    setCardType(detected);
    e.preventDefault();
    setCardNumber(formatCardNumberForType(text, detected));
  };

  // ZIP: force numeric and max 5 digits
  const onZipChange = (e) => {
    const digits = String(e.target.value || '').replace(/\D/g, '').slice(0, 5);
    setZip(digits);
    if (digits.length === 5) {
      setZipError(false);
    }
  };

  // when billingSameAsShipping toggles from true → false or back,
  // mirror shipping values into billing fields when turning it ON
  const toggleBillingSameAsShipping = () => {
    setBillingSameAsShipping((prev) => {
      const next = !prev;
      if (next) {
        setBillingFirstName(firstName);
        setBillingLastName(lastName);
        setBillingAddress(address);
        setBillingCity(city);
        setBillingState(shippingState);
        setBillingZip(zip);
      }
      return next;
    });
  };

  // Expiry: format + auto-advance when MM/YY complete
  const onExpiryChange = (e) => {
    const formatted = fmtExpiry(e.target.value);
    setExpiry(formatted);
    setExpiryError(false);
    if (formatted.length === 5 && /^\d{2}\/\d{2}$/.test(formatted)) {
      if (cvvInputRef.current) {
        cvvInputRef.current.focus();
      }
    }
  };

  const onCvvChange = (e) => {
    setCvv(e.target.value);
    setCvvError(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setNotice(null);
    setZipError(false);
    setExpiryError(false);
    setCvvError(false);

    // ZIP validation (5 digits)
    const zipDigits = String(zip || '').replace(/\D/g, '');
    if (zipDigits.length !== 5) {
      setZipError(true);
      setNotice({
        type: 'danger',
        title: 'Invalid ZIP code',
        detail: 'Please enter a 5-digit ZIP code.',
      });
      setSubmitting(false);
      return;
    }

    // Expiry validation
    if (!isFutureExpiry(expiry)) {
      setExpiryError(true);
      setNotice({
        type: 'danger',
        title: 'Card is expired',
        detail: 'Please check the expiry date (MM/YY) and try again.'
      });
      setSubmitting(false);
      return;
    }

    // CVV validation (brand-specific)
    const cvvDigits = String(cvv || '').replace(/\D/g, '');
    if (!isValidCvvForType(cvvDigits, cardType)) {
      let detail;
      if (cardType === 'American Express') {
        detail = 'American Express cards require a 4-digit security code.';
      } else if (cardType === 'Visa' || cardType === 'Mastercard' || cardType === 'Discover') {
        detail = `${cardType} cards require a 3-digit security code.`;
      } else {
        detail = 'Please enter a valid 3- or 4-digit security code.';
      }

      setCvvError(true);
      setNotice({
        type: 'danger',
        title: 'Invalid CVV',
        detail,
      });
      setSubmitting(false);
      return;
    }

    // Card number (PAN) validation using Luhn
    const pan = String(cardNumber || '').replace(/\D/g, '');
    // Basic length sanity check, then Luhn
    if (pan.length < 13 || pan.length > 19 || !isValidLuhn(pan)) {
      setNotice({
        type: 'danger',
        title: 'Invalid card number',
        detail: 'Please check the card number and try again.'
      });
      setSubmitting(false);
      return;
    }

    try {
      const { expMonth, expYear } = splitExpiry(expiry);

      const payload = {
        orderId,
        amount,
        // canonical customer object (MA brief)
        // IMPORTANT: do NOT add new fields here (no backend contract change)
        customer: {
          firstName,
          lastName,
          address,
          city,
          zip
        },
        // canonical card object (plus we also include legacy aliases for safety)
        card: {
          number: pan,
          expMonth,
          expYear,
          cvv: cvvDigits,   // sanitized
          name: nameOnCard
        },
        // legacy aliases kept for compatibility
        cardNumber: pan,
        nameOnCard,
        expiry,
        expiryDate: expiry
      };

      const resp = await postAuthorize(payload);

      const outcome = resolveOutcome(resp);
      appendSessionTxn({ orderId, amount, outcome, when: new Date().toISOString() });

      // Success banner
      const maskedLast4 = pan.slice(-4).padStart(4, '•');
      setNotice({
        type: 'success',
        title: 'Payment authorized',
        detail: `Order ${orderId} authorized for ${fmtMoney(amount)} (Card •••• ${maskedLast4}).`
      });

      // Fetch next suggested order/amount for rapid testing
      try {
        const next = await getNextOrder();
        setOrderId(next.orderId);
        setAmount(next.amount);
      } catch {}
    } catch (err) {
      console.error(err);
      const code =
        err?.response?.data?.code ||
        err?.code ||
        'SERVER_ERROR';

      let title = 'Authorization failed';
      let detail = 'Please verify your details and try again.';
      const up = String(code).toUpperCase();
      if (up.includes('INSUFFICIENT')) {
        title = 'Insufficient funds';
        detail = 'The issuing bank declined the charge due to insufficient funds.';
      } else if (up.includes('INCORRECT')) {
        title = 'Incorrect card details';
        detail = 'One or more card fields appear invalid. Please double-check and retry.';
      } else if (up.includes('PROVIDER')) {
        title = 'Payment provider error';
        detail = 'There was a temporary problem with the payment service. Please try again.';
      }

      setNotice({ type: 'danger', title, detail });

      appendSessionTxn({
        orderId,
        amount,
        outcome: String(code),
        when: new Date().toISOString()
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingInit) {
    return (
      <div className="container py-4">
        <div className="alert alert-info mb-0">Preparing checkout…</div>
      </div>
    );
  }
  if (errorInit) {
    return (
      <div className="container py-4">
        <div className="alert alert-danger mb-3">{errorInit}</div>
        <button className="btn btn-outline-light" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="container py-4">
      <h3 className="mb-3 text-on-dark">Checkout</h3>

      {/* Friendly banner (replaces raw JSON) */}
      {notice && (
        <div className={`alert alert-${notice.type} alert-custom ${notice.type === 'success' ? 'success' : 'error'} mb-3`}>
          <strong>{notice.title}</strong>
          {notice.detail && <div className="mt-1">{notice.detail}</div>}
        </div>
      )}

      <div className="row g-4">
        {/* LEFT: Payment Form */}
        <div className="col-lg-8">
          <form
            onSubmit={handleSubmit}
            className="card portal-card shadow-sm position-relative"
            aria-busy={submitting}
          >
            <div className="card-body">
              {/* Section: Order summary */}
              <div className="row g-3 mb-2">
                <div className="col-md-6">
                  <label className="form-label form-label-custom">Order ID</label>
                  <input className="form-control" value={orderId} disabled aria-readonly="true" />
                </div>
                <div className="col-md-6">
                  <label className="form-label form-label-custom">Amount</label>
                  <div className="input-group">
                    <span className="input-group-text">$</span>
                    <input className="form-control" value={amount.toFixed(2)} disabled aria-readonly="true" />
                  </div>
                </div>
              </div>

              {/* Section: Customer & Shipping Details */}
              <h5 className="mt-2 mb-3">Customer &amp; Shipping Details</h5>
              <div className="row g-3">
                <div className="col-md-6">
                  <label className="form-label form-label-custom">First Name</label>
                  <input
                    className="form-control"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label form-label-custom">Last Name</label>
                  <input
                    className="form-control"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                  />
                </div>
                <div className="col-12">
                  <label className="form-label form-label-custom">Address</label>
                  <input
                    className="form-control"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    required
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label form-label-custom">City</label>
                  <input
                    className="form-control"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    required
                  />
                </div>
                <div className="col-md-3">
                  <label className="form-label form-label-custom">State</label>
                  <select
                    className="form-select"
                    value={shippingState}
                    onChange={(e) => setShippingState(e.target.value)}
                    required
                  >
                    {US_STATES.map((s) => (
                      <option key={s.code || 'blank'} value={s.code}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-md-3">
                  <label className="form-label form-label-custom">ZIP</label>
                  <input
                    className={`form-control${zipError ? ' is-invalid' : ''}`}
                    value={zip}
                    onChange={onZipChange}
                    required
                    inputMode="numeric"
                    aria-invalid={zipError ? 'true' : undefined}
                  />
                  {zipError && (
                    <div className="invalid-feedback d-block">
                      Please enter a 5-digit ZIP code.
                    </div>
                  )}
                </div>

                {/* Billing same as shipping toggle */}
                <div className="col-12">
                  <div className="form-check">
                    <input
                      type="checkbox"
                      id="billingSameCheckbox"
                      className="form-check-input"
                      checked={billingSameAsShipping}
                      onChange={toggleBillingSameAsShipping}
                    />
                    <label
                      className="form-check-label"
                      htmlFor="billingSameCheckbox"
                    >
                      Billing address is the same as shipping
                    </label>
                  </div>
                </div>
              </div>

              {/* Section: Billing Details (purely for UI; not sent to backend) */}
              {!billingSameAsShipping && (
                <div className="mt-3">
                  <h5 className="mb-3">Billing Details</h5>
                  <div className="row g-3">
                    <div className="col-md-6">
                      <label className="form-label form-label-custom">First Name</label>
                      <input
                        className="form-control"
                        value={billingFirstName}
                        onChange={(e) => setBillingFirstName(e.target.value)}
                        required
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label form-label-custom">Last Name</label>
                      <input
                        className="form-control"
                        value={billingLastName}
                        onChange={(e) => setBillingLastName(e.target.value)}
                        required
                      />
                    </div>
                    <div className="col-12">
                      <label className="form-label form-label-custom">Address</label>
                      <input
                        className="form-control"
                        value={billingAddress}
                        onChange={(e) => setBillingAddress(e.target.value)}
                        required
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label form-label-custom">City</label>
                      <input
                        className="form-control"
                        value={billingCity}
                        onChange={(e) => setBillingCity(e.target.value)}
                        required
                      />
                    </div>
                    <div className="col-md-3">
                      <label className="form-label form-label-custom">State</label>
                      <select
                        className="form-select"
                        value={billingState}
                        onChange={(e) => setBillingState(e.target.value)}
                        required
                      >
                        {US_STATES.map((s) => (
                          <option key={s.code || 'blank-billing'} value={s.code}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-md-3">
                      <label className="form-label form-label-custom">ZIP</label>
                      <input
                        className="form-control"
                        value={billingZip}
                        onChange={(e) =>
                          setBillingZip(
                            String(e.target.value || '').replace(/\D/g, '').slice(0, 5)
                          )
                        }
                        required
                        inputMode="numeric"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Section: Payment Details */}
              <h5 className="mt-4 mb-3">Payment Details</h5>
              <div className="row g-3">
                {/* Cardholder Name */}
                <div className="col-md-6">
                  <label className="form-label form-label-custom">Name on Card</label>
                  <input
                    className="form-control"
                    value={nameOnCard}
                    onChange={(e) => setNameOnCard(e.target.value)}
                    required
                    placeholder=""
                    autoComplete="cc-name"
                  />
                </div>

                {/* Card Number + brand badge */}
                <div className="col-md-6">
                  <label className="form-label form-label-custom d-flex align-items-center justify-content-between">
                    <span>Card Number</span>
                    <span className="small" style={{ opacity: 0.9 }}>
                      {cardType && (
                        <span className="d-inline-flex align-items-center gap-1">
                          <span aria-hidden="true">{cardTypeIcon(cardType)}</span>
                          <span className="badge bg-secondary">{cardType}</span>
                        </span>
                      )}
                    </span>
                  </label>
                  <input
                    className="form-control"
                    value={cardNumber}
                    onChange={onCardNumberChange}
                    onPaste={onCardNumberPaste}
                    required
                    inputMode="numeric"
                    placeholder=""
                    autoComplete="cc-number"
                  />
                </div>

                {/* Expiry */}
                <div className="col-md-6">
                  <label className="form-label form-label-custom">Expiry (MM/YY)</label>
                  <input
                    className={`form-control${expiryError ? ' is-invalid' : ''}`}
                    value={expiry}
                    onChange={onExpiryChange}
                    required
                    placeholder="MM/YY"
                    inputMode="numeric"
                    autoComplete="cc-exp"
                    aria-invalid={expiryError ? 'true' : undefined}
                  />
                  {expiryError && (
                    <div className="invalid-feedback d-block">
                      Please enter a valid, non-expired date in MM/YY format.
                    </div>
                  )}
                </div>

                {/* CVV */}
                <div className="col-md-6">
                  <label className="form-label form-label-custom">CVV</label>
                  <input
                    ref={cvvInputRef}
                    type="password"
                    className={`form-control${cvvError ? ' is-invalid' : ''}`}
                    value={cvv}
                    onChange={onCvvChange}
                    required
                    inputMode="numeric"
                    placeholder=""
                    autoComplete="cc-csc"
                    aria-invalid={cvvError ? 'true' : undefined}
                  />
                  {cvvError && (
                    <div className="invalid-feedback d-block">
                      Please enter a valid security code for this card.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="card-footer d-flex gap-2">
              <button
                type="submit"
                className="btn btn-primary btn-process-payment"
                disabled={submitting}
              >
                {submitting ? 'Authorizing…' : 'Pay Now'}
              </button>
            </div>

            {/* Subtle loading overlay while submitting */}
            {submitting && (
              <div
                className="position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
                style={{
                  background: 'rgba(0,0,0,0.45)',
                  borderRadius: 'inherit',
                  zIndex: 10,
                }}
              >
                <div className="d-flex align-items-center">
                  <div
                    className="spinner-border me-2"
                    role="status"
                    aria-hidden="true"
                  />
                  <span>Authorizing payment…</span>
                </div>
              </div>
            )}
          </form>
        </div>

        {/* RIGHT: This Session */}
        <div className="col-lg-4">
          <div className="card portal-card shadow-sm">
            <div className="card-body">
              <h5 className="mb-3">This Session</h5>
              {sessionTxns.length === 0 ? (
                <div className="text-muted" style={{ opacity: 0.8 }}>No attempts yet.</div>
              ) : (
                <div style={{ maxHeight: 340, overflowY: 'auto' }}>
                  {sessionTxns.map((t) => (
                    <div
                      key={t.id}
                      className="mb-3 p-3"
                      style={{
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: 6,
                      }}
                    >
                      <div className="d-flex justify-content-between align-items-start">
                        <div>
                          <div className="fw-semibold">{t.orderId}</div>
                          <div className="text-muted small">{fmtTime(t.when)}</div>
                        </div>
                        <span className={outcomeBadgeClass(t.outcome)}>{t.outcome}</span>
                      </div>
                      <div className="mt-2">
                        <span className="text-muted me-2">Amount:</span>
                        <span className="fw-semibold">{fmtMoney(t.amount)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
