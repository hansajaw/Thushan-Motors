/* ══════════════════════════════════════
   THUSHAN MOTORS — navbar.js
   Shared Navbar + Cart + Checkout + Auth UI
══════════════════════════════════════ */

(function(){
  function loadNavbar(){
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';

    const isHome = currentPage === 'index.html' || currentPage === '';
    const isShop = currentPage === 'shop.html';
    const isOrders = currentPage === 'orders.html';
    const isAbout = currentPage === 'about.html';
    const isContact = currentPage === 'contact.html';

    const navbarHTML = `
<header>
  <nav class="navbar">
    <a class="nav-logo" href="index.html">
      <div class="logo-mark">
        <img src="images/Logo/tmLogo.png" alt="Thushan Motors Logo">
      </div>
      <div class="brand-name"><span>THUSHAN</span> MOTORS</div>
    </a>

    <ul class="nav-links">
      <li>
        <a href="index.html" class="${isHome ? 'active' : ''}">
          <i class="fa-solid fa-house"></i> Home
        </a>
      </li>

      <li>
        <a href="shop.html" class="${isShop ? 'active' : ''}">
          <i class="fa-solid fa-shop"></i> Shop
        </a>
      </li>

      <li>
        <a href="orders.html" class="${isOrders ? 'active' : ''}">
          <i class="fa-solid fa-receipt"></i> My Orders
        </a>
      </li>

      <li>
        <a href="about.html" class="${isAbout ? 'active' : ''}">
          <i class="fa-solid fa-circle-info"></i> About
        </a>
      </li>

      <li>
        <a href="contact.html" class="${isContact ? 'active' : ''}">
          <i class="fa-solid fa-phone"></i> Contact
        </a>
      </li>
    </ul>

    <div class="nav-search">
      <i class="fa-solid fa-magnifying-glass"></i>

      <input
        type="text"
        id="navSearch"
        placeholder="Search spare parts, brands..."
        onkeydown="if(event.key==='Enter') doNavSearch()">

      <button class="nav-search-btn" onclick="doNavSearch()">Search</button>
    </div>

    <div class="nav-actions">
      <div class="nav-cart" onclick="openCart()" title="View Cart">
        <i class="fa-solid fa-cart-shopping"></i>
        <span class="cart-badge" id="cartCount">0</span>
      </div>

      <div id="guestButtons" class="guest-buttons">
        <button class="btn-ghost" onclick="openLogin()">
          <i class="fa-solid fa-right-to-bracket" style="font-size:11px"></i> Login
        </button>

        <button class="btn-red" onclick="openRegister()">
          <i class="fa-solid fa-user-plus" style="font-size:11px"></i> Register
        </button>
      </div>

      <div id="userInfo" class="user-info hidden">
        <div class="user-avatar-nav" id="userAvatarNav">U</div>
        <span class="user-name-nav" id="userNameNav">User</span>

        <button class="btn-logout" onclick="doLogout()">
          <i class="fa-solid fa-right-from-bracket" style="font-size:11px"></i> Logout
        </button>
      </div>
    </div>
  </nav>
</header>

<!-- ── TOAST ── -->
<div class="toast" id="toast">
  <i class="fa-solid fa-circle-check"></i>
  <span id="toastMsg">Added to cart!</span>
</div>

<!-- ── CART OVERLAY + DRAWER ── -->
<div class="cart-overlay" id="cartOverlay" onclick="closeCart()"></div>

<div class="cart-drawer" id="cartDrawer">
  <div class="cart-header">
    <h3>
      <i class="fa-solid fa-cart-shopping"></i> Shopping Cart
    </h3>

    <button
      class="cart-close"
      onclick="closeCart()"
      aria-label="Close shopping cart">
      <i class="fa-solid fa-xmark"></i>
    </button>
  </div>

  <div class="cart-items" id="cartItems"></div>

  <div class="cart-empty" id="cartEmpty">
    <i class="fa-solid fa-cart-shopping"></i>
    <p>Your cart is empty</p>

    <button
      class="btn-red"
      onclick="location.href='shop.html'"
      style="margin:auto;padding:12px 24px;border-radius:10px;display:flex;align-items:center;gap:8px;font-family:'Montserrat',sans-serif;font-weight:700;font-size:14px;border:none;cursor:pointer;transition:background .2s">
      <i class="fa-solid fa-shop"></i> Browse Parts
    </button>
  </div>

  <div class="cart-footer" id="cartFooter" style="display:none">
    <div class="cart-total">
      <span>Subtotal</span>
      <strong id="cartTotal">Rs. 0</strong>
    </div>

    <button class="btn-checkout" onclick="checkout()">
      <i class="fa-solid fa-lock"></i> Proceed to Checkout
    </button>

    <button class="btn-continue" onclick="closeCart()">
      <i class="fa-solid fa-arrow-left"></i> Continue Shopping
    </button>
  </div>
</div>

<!-- ── CHECKOUT DETAILS MODAL ── -->
<div class="checkout-overlay" id="checkoutOverlay" onclick="closeCheckoutModal()"></div>

<div class="checkout-modal" id="checkoutModal">
  <button
    class="modal-close"
    onclick="closeCheckoutModal()"
    aria-label="Close checkout"
    title="Close checkout">
    <i class="fa-solid fa-xmark"></i>
  </button>

  <div class="auth-logo">
    <div class="auth-logo-icon">
      <i class="fa-solid fa-truck-fast"></i>
    </div>

    <h2>Delivery & Payment Details</h2>
    <p>Please complete your shipping and payment details to confirm the order.</p>
  </div>

  <div class="checkout-summary-box">
    <div>
      <span>Items</span>
      <strong id="checkoutItemsCount">0</strong>
    </div>

    <div>
      <span>Subtotal</span>
      <strong id="checkoutSubtotal">Rs. 0</strong>
    </div>

    <div>
      <span>Delivery</span>
      <strong id="checkoutDeliveryCharge">Rs. 0</strong>
    </div>

    <div>
      <span>Total</span>
      <strong id="checkoutModalTotal">Rs. 0</strong>
    </div>
  </div>

  <div class="checkout-section-title">Shipping Information</div>

  <div class="checkout-grid-2">
    <div class="form-group">
      <label>Full Name <span style="color:var(--red)">*</span></label>
      <input type="text" id="checkoutName" placeholder="Enter your full name">
    </div>

    <div class="form-group">
      <label>Phone Number <span style="color:var(--red)">*</span></label>
      <input type="text" id="checkoutPhone" placeholder="Enter your phone number">
    </div>

    <div class="form-group">
      <label>Province <span style="color:var(--red)">*</span></label>
      <select id="checkoutProvince">
        <option value="">Select Province</option>
        <option>Western</option>
        <option>Central</option>
        <option>Southern</option>
        <option>Northern</option>
        <option>Eastern</option>
        <option>North Western</option>
        <option>North Central</option>
        <option>Uva</option>
        <option>Sabaragamuwa</option>
      </select>
    </div>

    <div class="form-group">
      <label>District <span style="color:var(--red)">*</span></label>
      <input type="text" id="checkoutDistrict" placeholder="Enter district">
    </div>

    <div class="form-group">
      <label>City <span style="color:var(--red)">*</span></label>
      <input type="text" id="checkoutCity" placeholder="Enter city">
    </div>

    <div class="form-group">
      <label>Building / House No / Street <span style="color:var(--red)">*</span></label>
      <input type="text" id="checkoutStreet" placeholder="House no, street name">
    </div>
  </div>

  <div class="checkout-grid-2">
    <div class="form-group">
      <label>Landmark / Suburb / Locality</label>
      <input type="text" id="checkoutLandmark" placeholder="Nearby landmark or suburb">
    </div>

    <div class="form-group">
      <label>Full Delivery Address <span style="color:var(--red)">*</span></label>
      <textarea id="checkoutAddress" placeholder="Full address for delivery"></textarea>
    </div>
  </div>

  <div class="form-group">
    <label>Select Address Label</label>

    <div class="delivery-label-row">
      <button
        type="button"
        class="delivery-label-btn active"
        id="labelHomeBtn"
        onclick="selectDeliveryLabel('home')">
        <i class="fa-solid fa-house"></i> Home
      </button>

      <button
        type="button"
        class="delivery-label-btn"
        id="labelOfficeBtn"
        onclick="selectDeliveryLabel('office')">
        <i class="fa-solid fa-briefcase"></i> Office
      </button>
    </div>

    <input type="hidden" id="checkoutLabel" value="home">
  </div>

  <div class="checkout-section-title">Payment Method</div>

  <div class="payment-method-grid two-options">
    <button
      type="button"
      class="payment-method-card active"
      id="payCodBtn"
      onclick="setPaymentMethod('cash_on_delivery')">
      <i class="fa-solid fa-money-bill-wave"></i>
      <div>
        <strong>Cash on Delivery</strong>
        <span>Pay when your order arrives</span>
      </div>
    </button>

    <button
      type="button"
      class="payment-method-card"
      id="payCardBtn"
      onclick="setPaymentMethod('card')">
      <i class="fa-solid fa-credit-card"></i>
      <div>
        <strong>Credit / Debit Card</strong>
        <span>Visa / MasterCard style checkout</span>
      </div>
    </button>
  </div>

  <input type="hidden" id="checkoutPayment" value="cash_on_delivery">

  <div class="card-payment-box" id="cardPaymentBox">
    <div class="checkout-section-title" style="margin-top:4px">
      Card Details
    </div>

    <div class="card-brand-row">
      <span class="card-brand-badge">VISA</span>
      <span class="card-brand-badge">MASTERCARD</span>
      <span class="card-brand-note">Secure card-style checkout form</span>
    </div>

    <div class="form-group">
      <label>Card Number <span style="color:var(--red)">*</span></label>
      <input
        type="text"
        id="checkoutCardNumber"
        placeholder="1234 5678 9012 3456"
        maxlength="23">
    </div>

    <div class="form-group">
      <label>Name on Card <span style="color:var(--red)">*</span></label>
      <input
        type="text"
        id="checkoutCardName"
        placeholder="Name exactly as on card">
    </div>

    <div class="checkout-grid-2">
      <div class="form-group">
        <label>Expiry Date <span style="color:var(--red)">*</span></label>
        <input
          type="text"
          id="checkoutCardExpiry"
          placeholder="MM/YY"
          maxlength="5">
      </div>

      <div class="form-group">
        <label>CVV <span style="color:var(--red)">*</span></label>
        <input
          type="password"
          id="checkoutCardCvv"
          placeholder="CVV"
          maxlength="4">
      </div>
    </div>

    <div class="card-note">
      Demo card form only. For live payments, connect a payment gateway and never store CVV.
    </div>
  </div>

  <div class="form-group">
    <label>Order Notes</label>
    <textarea id="checkoutNotes" placeholder="Optional notes for delivery"></textarea>
  </div>

  <div class="auth-error" id="checkoutError"></div>

  <button
    class="auth-submit-btn"
    id="confirmOrderBtn"
    onclick="confirmOrder()">
    Confirm Order <i class="fa-solid fa-circle-check"></i>
  </button>
</div>

<!-- ── AUTH MODAL ── -->
<div class="modal-overlay" id="modalOverlay" onclick="closeModal()"></div>

<div class="auth-modal" id="authModal">

  <!-- LOGIN FORM -->
  <div class="auth-form" id="loginForm">
    <button
      class="modal-close"
      onclick="closeModal()"
      aria-label="Close modal">
      <i class="fa-solid fa-xmark"></i>
    </button>

    <div class="auth-logo">
      <div class="auth-logo-icon">
        <i class="fa-solid fa-shield-halved"></i>
      </div>

      <h2>Welcome Back</h2>
      <p>Sign in to your Thushan Motors account</p>
    </div>

    <div class="form-group">
      <label>Email Address</label>
      <input type="email" id="loginEmail" placeholder="you@example.com">
    </div>

    <div class="form-group">
      <label>Password</label>

      <div class="input-pass">
        <input type="password" id="loginPassword" placeholder="Enter your password">
        <i class="fa-solid fa-eye" onclick="togglePass('loginPassword',this)"></i>
      </div>
    </div>

    <div class="auth-error" id="loginError"></div>

    <button class="auth-submit-btn" onclick="doLogin()">
      Sign In <i class="fa-solid fa-arrow-right"></i>
    </button>

    <p class="auth-switch">
      Don't have an account? <a onclick="switchToRegister()">Register now</a>
    </p>
  </div>

  <!-- REGISTER FORM -->
  <div class="auth-form hidden" id="registerForm">
    <button
      class="modal-close"
      onclick="closeModal()"
      aria-label="Close modal">
      <i class="fa-solid fa-xmark"></i>
    </button>

    <div class="auth-logo">
      <div class="auth-logo-icon">
        <i class="fa-solid fa-user-plus"></i>
      </div>

      <h2>Create Account</h2>
      <p>Join Thushan Motors today</p>
    </div>

    <div class="form-group">
      <label>Full Name <span style="color:var(--red)">*</span></label>
      <input type="text" id="regName" placeholder="Your full name">
    </div>

    <div class="form-group">
      <label>Email Address <span style="color:var(--red)">*</span></label>
      <input type="email" id="regEmail" placeholder="you@example.com">
    </div>

    <div class="form-group">
      <label>Phone Number <span style="color:var(--muted);font-weight:400">(Optional)</span></label>
      <input type="text" id="regPhone" placeholder="+94 70 000 0000">
    </div>

    <div class="form-group">
      <label>Password <span style="color:var(--red)">*</span></label>

      <div class="input-pass">
        <input type="password" id="regPassword" placeholder="Create a password">
        <i class="fa-solid fa-eye" onclick="togglePass('regPassword',this)"></i>
      </div>

      <div class="pass-strength">
        <div class="pass-strength-bar" id="passStrengthBar"></div>
      </div>

      <div class="pass-hint" id="passHint"></div>
    </div>

    <div class="form-group">
      <label>Confirm Password <span style="color:var(--red)">*</span></label>

      <div class="input-pass">
        <input type="password" id="regConfirm" placeholder="Repeat your password">
        <i class="fa-solid fa-eye" onclick="togglePass('regConfirm',this)"></i>
      </div>
    </div>

    <div class="auth-error" id="registerError"></div>

    <button class="auth-submit-btn" onclick="doRegister()">
      Create Account <i class="fa-solid fa-arrow-right"></i>
    </button>

    <p class="auth-switch">
      Already have an account? <a onclick="switchToLogin()">Sign in</a>
    </p>
  </div>
</div>
`;

    let container = document.getElementById('navbar-container');

    if(!container){
      container = document.createElement('div');
      container.id = 'navbar-container';
      document.body.prepend(container);
    }

    container.innerHTML = navbarHTML;
  }

  window.loadNavbar = loadNavbar;

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', loadNavbar);
  }else{
    loadNavbar();
  }
})();