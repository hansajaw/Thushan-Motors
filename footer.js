/* ══════════════════════════════════════
   THUSHAN MOTORS — footer.js
   Shared Footer for All Pages
══════════════════════════════════════ */

(function(){
  function loadFooter(){
    const footerHTML = `
<footer>
  <div class="footer-inner">

    <div class="footer-brand">
      <div class="foot-logo">
        <img src="images/Logo/tmLogo.png" alt="Thushan Motors Logo">
        <div><span>THUSHAN</span> MOTORS</div>
      </div>

      <p>
        Thushan Motors is a local motorcycle spare parts shop in Panadura, Sri Lanka.
        Buy quality spare parts online with islandwide delivery.
      </p>

      <div class="foot-socials">
        <a href="https://www.facebook.com/share/1Bm116LRkQ/?mibextid=wwXIfr" class="foot-social" title="Facebook">
          <i class="fa-brands fa-facebook-f"></i>
        </a>

        <a href="https://wa.me/94715755349" class="foot-social" title="WhatsApp">
          <i class="fa-brands fa-whatsapp"></i>
        </a>

        <a href="https://m.me/thushanmotorspanadura" class="foot-social" title="Messenger">
          <i class="fa-brands fa-facebook-messenger"></i>
        </a>
      </div>
    </div>

    <div class="footer-col">
      <h4>Quick Links</h4>
      <ul>
        <li><a href="index.html">Home</a></li>
        <li><a href="shop.html">Shop</a></li>
        <li><a href="about.html">About Us</a></li>
        <li><a href="contact.html">Contact Us</a></li>
        <li><a href="orders.html">My Orders</a></li>
      </ul>
    </div>

    <div class="footer-col">
      <h4>Categories</h4>
      <ul>
        <li><a href="shop.html?category=engine">Engine Parts</a></li>
        <li><a href="shop.html?category=electrical">Electrical</a></li>
        <li><a href="shop.html?category=tyres">Tyres</a></li>
        <li><a href="shop.html?category=lights">Lights</a></li>
        <li><a href="shop.html?category=suspension">Suspension</a></li>
        <li><a href="shop.html?category=accessories">Accessories</a></li>
      </ul>
    </div>

    <div class="footer-col">
      <h4>Contact</h4>
      <ul>
        <li>
          <a href="contact.html">
            <i class="fa-solid fa-location-dot"></i> Panadura, Sri Lanka
          </a>
        </li>

        <li>
          <a href="tel:+94382244155">
            <i class="fa-solid fa-phone"></i> +94 38 224 4155
          </a>
        </li>

        <li>
          <a href="mailto:info@thushanmotors.lk">
            <i class="fa-solid fa-envelope"></i> info@thushanmotors.lk
          </a>
        </li>

        <li>
          <a href="shop.html">
            <i class="fa-solid fa-truck-fast"></i> Islandwide Delivery
          </a>
        </li>
      </ul>
    </div>

  </div>

  <hr class="foot-divider">

  <p class="foot-copy">
    © ${new Date().getFullYear()} Thushan Motors. All Rights Reserved.
    <br>
    <a href="privacy.html">Privacy Policy</a> |
    <a href="terms.html">Terms & Conditions</a>
  </p>
</footer>
`;

    let container = document.getElementById('footer-container');

    if(!container){
      container = document.createElement('div');
      container.id = 'footer-container';
      document.body.appendChild(container);
    }

    container.innerHTML = footerHTML;
  }

  window.loadFooter = loadFooter;

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', loadFooter);
  }else{
    loadFooter();
  }
})();