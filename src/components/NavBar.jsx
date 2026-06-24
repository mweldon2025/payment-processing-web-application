// --------------------------------------------------------------
// src/components/NavBar.jsx
//  NavBar component for the Manhattan Associates Warehouse Portal
//  Displays a navigation bar with branding and version info
// currently unused in favor of mariah-theme.css styles
// --------------------------------------------------------------
export default function NavBar() {
  return (
    <nav className="navbar navbar-dark" style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(6px)' }}>
      <div className="container d-flex justify-content-between align-items-center">
        <span className="navbar-brand mb-0 h1">MA Portal</span>
        <span className="text-light-50 small">Warehouse • v1.0</span>
      </div>
    </nav>
  );
}
