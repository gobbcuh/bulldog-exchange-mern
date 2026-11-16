
import "./Footer.css";

function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-container">
        <div className="footer-grid">
          <div className="footer-about">
            <a href="/" className="footer-brand">
              <span>BULLDOG</span>EXCHANGE
            </a>

            <p>
              The official merchandise store of National University
              Philippines. Wear your pride.
            </p>
          </div>

          <div className="footer-column">
            <h3>QUICK LINKS</h3>
            <a href="/shop">Shop All</a>
            <a href="/about">About Us</a>
            <a href="/cart">Cart</a>
          </div>

          <div className="footer-column">
            <h3>SUPPORT</h3>
            <p>bulldogexchange@nu.edu.ph</p>
            <p>National University, Manila</p>
          </div>
        </div>

        <div className="footer-bottom">
          © 2026 Bulldog Exchange. All rights reserved.
        </div>
      </div>
    </footer>
  );
}

export default Footer;
