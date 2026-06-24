// --------------------------------------------------------------
// src/components/Hero.jsx
//  Hero component for the Manhattan Associates Warehouse Portal
//  Displays a banner with title and subtitle
// Currently unused in favor of mariah-theme.css styles
// --------------------------------------------------------------
export default function Hero() {
  return (
    <header className="py-5 hero-banner" style={{ background: 'transparent' }}>
      {/* Use same centered width as content; force center + white */}
      <div className="portal-container">
        <div className="text-center" style={{ color: '#ffffff', textAlign: 'center' }}>
          <h1 className="portal-title mb-3" style={{ color: '#ffffff' }}>
            Manhattan Associates — Warehouse Portal
          </h1>
          <p className="lead" style={{ color: 'rgba(255,255,255,0.9)' }}>
            Settle Shipments Against Authorized Payments
          </p>
        </div>
      </div>
    </header>
  );
}
