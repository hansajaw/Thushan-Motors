/* ══════════════════════════════════════
   THUSHAN MOTORS — script.js
   Multi-page shop + cart + auth + checkout
══════════════════════════════════════ */

/* ── API BASE URL ──
   server.js serves BOTH the API (/api/...) AND these HTML/JS files from
   the exact same Express app, so the shop pages and the backend are
   ALWAYS on the same origin — this should stay '' (empty) unless you
   deliberately host the frontend on a different domain than the backend.
── */
const API_BASE =
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : 'https://thushan-motors.vercel.app';

const GOOGLE_CLIENT_ID = '727542561981-cc0ivqbgb2f27hqk8h04h7tjrc2js1vr.apps.googleusercontent.com'; 

let pendingVerifyEmail = '';
/* ── PRODUCTS DATA ──
   IMPORTANT: products now come from the REAL database via the backend
   API (/api/products) — the exact same data admin.html reads and writes
   through /api/admin/products. This is what makes "add / edit / delete
   in admin" instantly show up on the real shop pages: both sides talk
   to the same MySQL table, nobody reads from localStorage anymore.
── */
let selectedReviewRating = 5;

let products = [];

/* Loads products from the real backend/database. Called once on page
   load (see window.onload at the bottom), before anything tries to
   render a product list. */
async function loadProductsFromServer() {
  try {
    const res = await fetch(API_BASE + '/api/products');
    if (!res.ok) throw new Error('Server returned ' + res.status);
    const data = await res.json();
    products = Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('Could not load products from the server:', err);
    products = [];
  }
}

/* ── MOTORCYCLE BRANDS ── */
const brands = [
  {name:'Honda', logo:'images/brands/honda.png'},
  {name:'Yamaha', logo:'images/brands/yamaha.png'},
  {name:'Bajaj', logo:'images/brands/bajaj.png'},
  {name:'TVS', logo:'images/brands/tvs.png'},
  {name:'Hero', logo:'images/brands/hero.png'},
  {name:'Suzuki', logo:'images/brands/suzuki.png'}
];

/* ── SETTINGS ── */
const FIXED_DELIVERY_CHARGE = 500;

/* ── HELPERS ── */
function fmt(n){
  return 'Rs. ' + Number(n || 0).toLocaleString('en-LK');
}

function $(id){
  return document.getElementById(id);
}

/* ══ CART STATE ══ */
let cart = [];

function saveCart(){
  localStorage.setItem('tm_cart', JSON.stringify(cart));
}

function loadCart(){
  try{
    cart = JSON.parse(localStorage.getItem('tm_cart') || '[]');
  }catch(e){
    cart = [];
  }
}

function updateCartBadge(){
  const el = $('cartCount');

  if(el){
    el.textContent = cart.reduce(function(sum,item){
      return sum + Number(item.qty || 0);
    }, 0);
  }
}

/* ── ADD TO CART ── */
function addCart(id){
  const product = products.find(function(p){
    return p.id === id;
  });

  if(!product || (!product.stock && !(product.stockQty > 0))){
    return;
  }

  const existing = cart.find(function(i){
    return i.id === id;
  });

  if(existing){
    existing.qty++;
  }else{
    cart.push({
      id: product.id,
      name: product.name,
      price: Number(product.price),
      img: product.img,
      qty: 1
    });
  }

  saveCart();
  updateCartBadge();
  renderCartDrawer();

  showToast('<i class="fa-solid fa-circle-check" style="color:var(--red)"></i> Added: ' + product.name);
}

function changeQty(id, delta){
  const item = cart.find(function(i){
    return i.id === id;
  });

  if(!item){
    return;
  }

  item.qty = Number(item.qty || 0) + delta;

  if(item.qty <= 0){
    cart = cart.filter(function(i){
      return i.id !== id;
    });
  }

  saveCart();
  updateCartBadge();
  renderCartDrawer();
}

function removeFromCart(id){
  cart = cart.filter(function(i){
    return i.id !== id;
  });

  saveCart();
  updateCartBadge();
  renderCartDrawer();
}

function cartTotal(){
  return cart.reduce(function(sum,item){
    return sum + (Number(item.price || 0) * Number(item.qty || 0));
  }, 0);
}

/* ── RENDER CART DRAWER ── */
function renderCartDrawer(){
  const container = $('cartItems');
  const empty = $('cartEmpty');
  const footer = $('cartFooter');
  const totalEl = $('cartTotal');

  if(!container || !empty || !footer || !totalEl){
    return;
  }

  if(cart.length === 0){
    container.innerHTML = '';
    empty.classList.add('visible');
    footer.style.display = 'none';
    totalEl.textContent = fmt(0);
    return;
  }

  empty.classList.remove('visible');
  footer.style.display = 'block';

  container.innerHTML = cart.map(function(item){
    return `
      <div class="cart-item">
        <div class="cart-item-img">
          <img src="${item.img}" alt="${item.name}" loading="lazy">
        </div>

        <div class="cart-item-info">
          <div class="cart-item-name">${item.name}</div>
          <div class="cart-item-price">${fmt(item.price)}</div>

          <div class="cart-qty-row">
            <div class="qty-controls">
              <button class="qty-btn" onclick="changeQty(${item.id},-1)">
                <i class="fa-solid fa-minus" style="font-size:10px"></i>
              </button>

              <span class="qty-val">${item.qty}</span>

              <button class="qty-btn" onclick="changeQty(${item.id},1)">
                <i class="fa-solid fa-plus" style="font-size:10px"></i>
              </button>
            </div>

            <button class="cart-remove" onclick="removeFromCart(${item.id})" title="Remove">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  totalEl.textContent = fmt(cartTotal());
}

function openCart(){
  renderCartDrawer();

  if($('cartDrawer')){
    $('cartDrawer').classList.add('open');
  }

  if($('cartOverlay')){
    $('cartOverlay').classList.add('active');
  }

  document.body.style.overflow = 'hidden';
}

function closeCart(){
  if($('cartDrawer')){
    $('cartDrawer').classList.remove('open');
  }

  if($('cartOverlay')){
    $('cartOverlay').classList.remove('active');
  }

  document.body.style.overflow = '';
}

function clearCart(render){
  if(render === undefined){
    render = true;
  }

  cart = [];
  saveCart();
  updateCartBadge();

  if(render){
    renderCartDrawer();
  }
}

/* ══ AUTH STATE ══ */
function getUsers(){
  try{
    return JSON.parse(localStorage.getItem('tm_users') || '[]');
  }catch(e){
    return [];
  }
}

function saveUsers(users){
  localStorage.setItem('tm_users', JSON.stringify(users));
}

function getCurrentUser(){
  try{
    return JSON.parse(localStorage.getItem('tm_current_user') || 'null');
  }catch(e){
    return null;
  }
}

function setCurrentUser(user){
  if(user){
    localStorage.setItem('tm_current_user', JSON.stringify(user));
  }else{
    localStorage.removeItem('tm_current_user');
  }
}

function updateNavAuth(){
  const user = getCurrentUser();

  const guest = $('guestButtons');
  const userInfo = $('userInfo');
  const avatarEl = $('userAvatarNav');
  const nameEl = $('userNameNav');

  if(!guest || !userInfo){
    return;
  }

  if(user){
    guest.classList.add('hidden');
    userInfo.classList.remove('hidden');

    if(avatarEl){
      avatarEl.textContent = (user.name || 'U').charAt(0).toUpperCase();
    }

    if(nameEl){
      nameEl.textContent = (user.name || 'User').split(' ')[0];
    }
  }else{
    guest.classList.remove('hidden');
    userInfo.classList.add('hidden');
  }
}

function ensureAuthExtraUI(){
  const loginForm = $('loginForm');
  const registerForm = $('registerForm');
  const modal = $('authModal');

  if(loginForm && !$('googleLoginBtn')){
    const loginBtn = loginForm.querySelector('.auth-submit-btn');

    if(loginBtn){
      loginBtn.insertAdjacentHTML('afterend', `
        <div class="auth-divider"><span></span><em>or</em><span></span></div>
        <div id="googleLoginBtn" class="google-btn-box"></div>
      `);
    }
  }

  if(registerForm && !$('googleRegisterBtn')){
    const registerBtn = registerForm.querySelector('.auth-submit-btn');

    if(registerBtn){
      registerBtn.insertAdjacentHTML('afterend', `
        <div class="auth-divider"><span></span><em>or</em><span></span></div>
        <div id="googleRegisterBtn" class="google-btn-box"></div>
      `);
    }
  }

  if(modal && !$('otpForm')){
    modal.insertAdjacentHTML('beforeend', `
      <div class="auth-form hidden" id="otpForm">
        <button class="modal-close" onclick="closeModal()" aria-label="Close modal">
          <i class="fa-solid fa-xmark"></i>
        </button>

        <div class="auth-logo">
          <div class="auth-logo-icon">
            <i class="fa-solid fa-envelope-circle-check"></i>
          </div>

          <h2>Verify Email</h2>
          <p>Enter the 6-digit OTP sent to your email.</p>
        </div>

        <div class="form-group">
          <label>OTP Code</label>
          <input type="text" id="otpCode" placeholder="Enter 6-digit OTP" maxlength="6" inputmode="numeric">
        </div>

        <div class="auth-error" id="otpError"></div>

        <button class="auth-submit-btn" onclick="verifyOtp()">
          Verify Email <i class="fa-solid fa-circle-check"></i>
        </button>

        <p class="auth-switch" style="margin-bottom:8px">
          Didn't receive the code? <a onclick="resendOtp()">Resend OTP</a>
        </p>

        <p class="auth-switch">
          Back to <a onclick="switchToLogin()">Login</a>
        </p>
      </div>
    `);
  }
}

function renderGoogleButtons(){
  ensureAuthExtraUI();

  if(!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID.includes('PASTE_YOUR_GOOGLE_CLIENT_ID')){
    return;
  }

  if(!window.google || !google.accounts || !google.accounts.id){
    setTimeout(renderGoogleButtons, 400);
    return;
  }

  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: handleGoogleCredential
  });

  const loginBtn = $('googleLoginBtn');
  const registerBtn = $('googleRegisterBtn');

  if(loginBtn){
    loginBtn.innerHTML = '';
    google.accounts.id.renderButton(loginBtn, {
      theme: 'outline',
      size: 'large',
      width: 300,
      text: 'signin_with'
    });
  }

  if(registerBtn){
    registerBtn.innerHTML = '';
    google.accounts.id.renderButton(registerBtn, {
      theme: 'outline',
      size: 'large',
      width: 300,
      text: 'signup_with'
    });
  }
}

async function handleGoogleCredential(response){
  try{
    const res = await fetch(API_BASE + '/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: response.credential })
    });

    const data = await res.json();

    if(!res.ok){
      showToast('❌ ' + (data.message || 'Google login failed.'));
      return;
    }

    setCurrentUser({
      id: data.user.id,
      name: data.user.name,
      email: data.user.email,
      phone: data.user.phone || '',
      role: data.user.role
    });

    localStorage.setItem('thushanUserToken', data.token);

    updateNavAuth();
    closeModal();

    if(data.user.role === 'admin'){
      showToast('🔓 Admin login successful!');
      setTimeout(function(){
        window.location.href = 'admin.html';
      }, 500);
      return;
    }

    showToast('<i class="fa-solid fa-circle-check" style="color:var(--red)"></i> Google login successful!');
    renderOrdersPage();
  }catch(err){
    console.error('Google login error:', err);
    showToast('⚠️ Google login failed. Please try again.');
  }
}

function openLogin(){
  if(!$('authModal')){
    return;
  }

  ensureAuthExtraUI();

  $('loginForm').classList.remove('hidden');
  $('registerForm').classList.add('hidden');

  if($('otpForm')){
    $('otpForm').classList.add('hidden');
  }

  clearAuthErrors();

  $('modalOverlay').classList.add('active');
  $('authModal').classList.add('active');

  document.body.style.overflow = 'hidden';

  setTimeout(function(){
    if($('loginEmail')){
      $('loginEmail').focus();
    }

    renderGoogleButtons();
  }, 300);
}

function openRegister(){
  if(!$('authModal')){
    return;
  }

  ensureAuthExtraUI();

  $('registerForm').classList.remove('hidden');
  $('loginForm').classList.add('hidden');

  if($('otpForm')){
    $('otpForm').classList.add('hidden');
  }

  clearAuthErrors();

  $('modalOverlay').classList.add('active');
  $('authModal').classList.add('active');

  document.body.style.overflow = 'hidden';

  setTimeout(function(){
    if($('regName')){
      $('regName').focus();
    }

    renderGoogleButtons();
  }, 300);
}

function closeModal(){
  if($('modalOverlay')){
    $('modalOverlay').classList.remove('active');
  }

  if($('authModal')){
    $('authModal').classList.remove('active');
  }

  document.body.style.overflow = '';
  clearAuthErrors();
}

function switchToRegister(){
  openRegister();
}

function switchToLogin(){
  openLogin();
}

function clearAuthErrors(){
  ['loginError','registerError','otpError','loginSuccess','registerSuccess'].forEach(function(id){
    const el = $(id);

    if(el){
      el.classList.remove('visible');
      el.textContent = '';
    }
  });
}

function togglePass(inputId, icon){
  const inp = $(inputId);

  if(!inp){
    return;
  }

  if(inp.type === 'password'){
    inp.type = 'text';
    icon.className = 'fa-solid fa-eye-slash';
  }else{
    inp.type = 'password';
    icon.className = 'fa-solid fa-eye';
  }
}

function switchToOtp(email){
  ensureAuthExtraUI();

  pendingVerifyEmail = email || pendingVerifyEmail || '';
  sessionStorage.setItem('tm_pending_verify_email', pendingVerifyEmail);

  if($('loginForm')){
    $('loginForm').classList.add('hidden');
  }

  if($('registerForm')){
    $('registerForm').classList.add('hidden');
  }

  if($('otpForm')){
    $('otpForm').classList.remove('hidden');
  }

  clearAuthErrors();

  setTimeout(function(){
    if($('otpCode')){
      $('otpCode').focus();
    }
  }, 250);
}

async function verifyOtp(){
  const otp = $('otpCode') ? $('otpCode').value.trim() : '';
  const errEl = $('otpError');

  pendingVerifyEmail = pendingVerifyEmail || sessionStorage.getItem('tm_pending_verify_email') || '';

  if(!errEl){
    return;
  }

  if(!pendingVerifyEmail){
    errEl.textContent = 'Email not found. Please register again.';
    errEl.classList.add('visible');
    return;
  }

  if(!otp){
    errEl.textContent = 'Please enter the OTP code.';
    errEl.classList.add('visible');
    return;
  }

  try{
    const response = await fetch(API_BASE + '/api/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: pendingVerifyEmail,
        otp: otp
      })
    });

    const data = await response.json();

    if(!response.ok){
      errEl.textContent = '❌ ' + (data.message || 'OTP verification failed.');
      errEl.classList.add('visible');
      return;
    }

    setCurrentUser({
      id: data.user.id,
      name: data.user.name,
      email: data.user.email,
      phone: data.user.phone || '',
      role: data.user.role
    });

    localStorage.setItem('thushanUserToken', data.token);

    updateNavAuth();
    closeModal();

    showToast('<i class="fa-solid fa-circle-check" style="color:var(--red)"></i> Email verified successfully!');

    if($('otpCode')){
      $('otpCode').value = '';
    }

    pendingVerifyEmail = '';
    sessionStorage.removeItem('tm_pending_verify_email');

    renderOrdersPage();
  }catch(err){
    console.error('OTP verify error:', err);
    errEl.textContent = '⚠️ Server error. Please try again.';
    errEl.classList.add('visible');
  }
}

async function resendOtp(){
  pendingVerifyEmail = pendingVerifyEmail || sessionStorage.getItem('tm_pending_verify_email') || '';

  if(!pendingVerifyEmail){
    showToast('Email not found. Please try again.');
    return;
  }

  try{
    const response = await fetch(API_BASE + '/api/auth/resend-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: pendingVerifyEmail })
    });

    const data = await response.json();

    if(!response.ok){
      showToast('❌ ' + (data.message || 'Failed to resend OTP.'));
      return;
    }

    showToast('📧 New OTP sent to your email.');
  }catch(err){
    console.error('Resend OTP error:', err);
    showToast('⚠️ Failed to resend OTP.');
  }
}

async function doLogin(){
  clearAuthErrors();

  const email = $('loginEmail').value.trim();
  const password = $('loginPassword').value;
  const errEl = $('loginError');

  if(!email || !password){
    errEl.textContent = '📧 Please enter both email and password.';
    errEl.classList.add('visible');
    return;
  }

  if(!/\S+@\S+\.\S+/.test(email)){
    errEl.textContent = '❌ Please enter a valid email address.';
    errEl.classList.add('visible');
    return;
  }

  try {
    const response = await fetch(API_BASE + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();

    if (!response.ok) {
      if(data.needsVerification){
        switchToOtp(data.email || email);
        showToast('📧 Please verify your email first.');
        return;
      }

      errEl.textContent = '❌ ' + (data.message || 'Login failed.');
      errEl.classList.add('visible');
      return;
    }

    setCurrentUser({
      id: data.user.id,
      name: data.user.name,
      email: data.user.email,
      phone: data.user.phone || '',
      role: data.user.role
    });

    localStorage.setItem('thushanUserToken', data.token);

    if (data.user.role === 'admin') {
      closeModal();
      setTimeout(() => {
        window.location.href = 'admin.html';
      }, 500);
      showToast('🔓 Admin login successful!');
      return;
    }

    updateNavAuth();
    closeModal();
    showToast('<i class="fa-solid fa-circle-check" style="color:var(--red)"></i> Welcome ' + data.user.name.split(' ')[0] + '!');

    $('loginEmail').value = '';
    $('loginPassword').value = '';

    renderOrdersPage();
  } catch (err) {
    errEl.textContent = '⚠️ Cannot connect to server. Please try again.';
    errEl.classList.add('visible');
    console.error('Login error:', err);
  }
}

async function doRegister(){
  clearAuthErrors();

  const name = $('regName').value.trim();
  const email = $('regEmail').value.trim();
  const phone = $('regPhone').value.trim();
  const password = $('regPassword').value;
  const confirm = $('regConfirm').value;
  const errEl = $('registerError');

  if(!name || !email || !password || !confirm){
    errEl.textContent = '⚠️ Please fill all required fields.';
    errEl.classList.add('visible');
    return;
  }

  if(!/\S+@\S+\.\S+/.test(email)){
    errEl.textContent = '❌ Please enter a valid email address.';
    errEl.classList.add('visible');
    return;
  }

  if(password.length < 8){
    errEl.textContent = 'Password must be at least 8 characters.';
    errEl.classList.add('visible');
    return;
  }

  if(password !== confirm){
    errEl.textContent = 'Passwords do not match. Please try again.';
    errEl.classList.add('visible');
    return;
  }

  try {
    const response = await fetch(API_BASE + '/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, phone, password })
    });

    const data = await response.json();

    if (!response.ok) {
      errEl.textContent = '❌ ' + (data.message || 'Account creation failed.');
      errEl.classList.add('visible');
      return;
    }

    if(data.needsVerification){
      switchToOtp(data.email || email);
      showToast('📧 OTP sent to your email. Please verify your account.');

      ['regPassword','regConfirm'].forEach(function(id){
        if($(id)){
          $(id).value = '';
        }
      });

      return;
    }

    setCurrentUser({
      id: data.user.id,
      name: data.user.name,
      email: data.user.email,
      phone: data.user.phone || '',
      role: data.user.role
    });

    localStorage.setItem('thushanUserToken', data.token);

    updateNavAuth();
    closeModal();

    showToast('<i class="fa-solid fa-circle-check" style="color:var(--red)"></i> Account created successfully!');

    ['regName','regEmail','regPhone','regPassword','regConfirm'].forEach(function(id){
      if($(id)){
        $(id).value = '';
      }
    });

    renderOrdersPage();
  } catch (err) {
    errEl.textContent = '⚠️ Cannot connect to server.';
    errEl.classList.add('visible');
    console.error('Register error:', err);
  }
}

function doLogout(){
  setCurrentUser(null);
  localStorage.removeItem('thushanUserToken');

  if(window.google && google.accounts && google.accounts.id){
    google.accounts.id.disableAutoSelect();
  }

  updateNavAuth();
  showToast('You have been logged out.');
  renderOrdersPage();
}

/* ══ CHECKOUT ══ */
function getSavedDeliveryDetails(){
  try{
    return JSON.parse(localStorage.getItem('tm_delivery_details') || 'null');
  }catch(e){
    return null;
  }
}

function normalizePaymentMethod(method){
  if(method === 'card'){
    return 'card';
  }

  return 'cash_on_delivery';
}

function getDeliveryCharge(){
  return FIXED_DELIVERY_CHARGE;
}

function updateCheckoutTotals(){
  const subtotal = cartTotal();
  const deliveryCharge = cart.length > 0 ? getDeliveryCharge() : 0;
  const total = subtotal + deliveryCharge;

  if($('checkoutSubtotal')){
    $('checkoutSubtotal').textContent = fmt(subtotal);
  }

  if($('checkoutDeliveryCharge')){
    $('checkoutDeliveryCharge').textContent = fmt(deliveryCharge);
  }

  if($('checkoutModalTotal')){
    $('checkoutModalTotal').textContent = fmt(total);
  }
}

function saveDeliveryDetails(details){
  const safeDetails = {
    name: details.name || '',
    phone: details.phone || '',
    province: details.province || '',
    district: details.district || '',
    city: details.city || '',
    street: details.street || '',
    landmark: details.landmark || '',
    address: details.address || '',
    label: details.label || 'home',
    paymentMethod: normalizePaymentMethod(details.paymentMethod),
    notes: details.notes || ''
  };

  localStorage.setItem('tm_delivery_details', JSON.stringify(safeDetails));
}

function checkout(){
  const user = getCurrentUser();

  if(!user){
    closeCart();
    openLogin();
    showToast('Please login to checkout');
    return;
  }

  if(cart.length === 0){
    showToast('Your cart is empty!');
    return;
  }

  openCheckoutModal();
}

function openCheckoutModal(){
  const user = getCurrentUser() || {};
  const saved = getSavedDeliveryDetails() || {};

  closeCart();

  if($('checkoutItemsCount')){
    $('checkoutItemsCount').textContent = cart.reduce(function(sum,item){
      return sum + Number(item.qty || 0);
    }, 0);
  }

  const values = {
    checkoutName: saved.name || user.name || '',
    checkoutPhone: saved.phone || user.phone || '',
    checkoutProvince: saved.province || '',
    checkoutDistrict: saved.district || '',
    checkoutCity: saved.city || '',
    checkoutStreet: saved.street || '',
    checkoutLandmark: saved.landmark || '',
    checkoutAddress: saved.address || '',
    checkoutNotes: saved.notes || ''
  };

  Object.keys(values).forEach(function(id){
    if($(id)){
      $(id).value = values[id];
    }
  });

  selectDeliveryLabel(saved.label || 'home');
  setPaymentMethod(normalizePaymentMethod(saved.paymentMethod));

  ['checkoutCardNumber','checkoutCardName','checkoutCardExpiry','checkoutCardCvv'].forEach(function(id){
    if($(id)){
      $(id).value = '';
    }
  });

  updateCheckoutTotals();
  clearCheckoutError();

  if($('checkoutOverlay')){
    $('checkoutOverlay').classList.add('active');
  }

  if($('checkoutModal')){
    $('checkoutModal').classList.add('active');
  }

  document.body.style.overflow = 'hidden';

  setTimeout(function(){
    if($('checkoutName')){
      $('checkoutName').focus();
    }
  }, 250);
}

function closeCheckoutModal(){
  if($('checkoutOverlay')){
    $('checkoutOverlay').classList.remove('active');
  }

  if($('checkoutModal')){
    $('checkoutModal').classList.remove('active');
  }

  document.body.style.overflow = '';
  clearCheckoutError();
}

function clearCheckoutError(){
  const errEl = $('checkoutError');

  if(errEl){
    errEl.classList.remove('visible');
    errEl.textContent = '';
  }
}

function getCheckoutDetails(){
  function val(id){
    return $(id) ? $(id).value.trim() : '';
  }

  return {
    name: val('checkoutName'),
    phone: val('checkoutPhone'),
    province: val('checkoutProvince'),
    district: val('checkoutDistrict'),
    city: val('checkoutCity'),
    street: val('checkoutStreet'),
    landmark: val('checkoutLandmark'),
    address: val('checkoutAddress'),
    label: $('checkoutLabel') ? $('checkoutLabel').value : 'home',
    paymentMethod: normalizePaymentMethod($('checkoutPayment') ? $('checkoutPayment').value : 'cash_on_delivery'),
    notes: val('checkoutNotes'),
    cardNumber: val('checkoutCardNumber'),
    cardName: val('checkoutCardName'),
    cardExpiry: val('checkoutCardExpiry'),
    cardCvv: val('checkoutCardCvv')
  };
}

function validateCheckoutDetails(details){
  if(!details.name) return 'Please enter your full name.';
  if(!details.phone) return 'Please enter your phone number.';
  if(!/^[0-9+\-\s()]{7,20}$/.test(details.phone)) return 'Please enter a valid phone number.';
  if(!details.province) return 'Please select your province.';
  if(!details.district) return 'Please enter your district.';
  if(!details.city) return 'Please enter your city.';
  if(!details.address) return 'Please enter your full delivery address.';

  details.paymentMethod = normalizePaymentMethod(details.paymentMethod);

  if(details.paymentMethod === 'card'){
    const cleanCardNumber = details.cardNumber.replace(/\s/g, '');

    if(!cleanCardNumber) return 'Please enter your card number.';
    if(!/^\d{13,19}$/.test(cleanCardNumber)) return 'Please enter a valid card number.';
    if(!details.cardName) return 'Please enter the name on card.';
    if(!/^(0[1-9]|1[0-2])\/\d{2}$/.test(details.cardExpiry)) return 'Please enter expiry date as MM/YY.';
    if(!/^\d{3,4}$/.test(details.cardCvv)) return 'Please enter a valid CVV.';
  }

  return '';
}

function selectDeliveryLabel(label){
  if($('checkoutLabel')){
    $('checkoutLabel').value = label;
  }

  if($('labelHomeBtn')){
    $('labelHomeBtn').classList.toggle('active', label !== 'office');
  }

  if($('labelOfficeBtn')){
    $('labelOfficeBtn').classList.toggle('active', label === 'office');
  }
}

function setPaymentMethod(method){
  method = normalizePaymentMethod(method);

  if($('checkoutPayment')){
    $('checkoutPayment').value = method;
  }

  if($('payCodBtn')){
    $('payCodBtn').classList.toggle('active', method === 'cash_on_delivery');
  }

  if($('payCardBtn')){
    $('payCardBtn').classList.toggle('active', method === 'card');
  }

  if($('payBankBtn')){
    $('payBankBtn').classList.remove('active');
  }

  toggleCardPaymentBox();
}

function toggleCardPaymentBox(){
  const box = $('cardPaymentBox');

  if(!box || !$('checkoutPayment')){
    return;
  }

  box.classList.toggle('active', $('checkoutPayment').value === 'card');
}

function formatCardNumberInput(value){
  return value
    .replace(/\D/g, '')
    .substring(0, 19)
    .replace(/(.{4})/g, '$1 ')
    .trim();
}

function formatExpiryInput(value){
  const clean = value.replace(/\D/g, '').substring(0, 4);

  if(clean.length <= 2){
    return clean;
  }

  return clean.substring(0, 2) + '/' + clean.substring(2, 4);
}

function detectCardBrand(number){
  const clean = number.replace(/\s/g, '');

  if(/^4/.test(clean)){
    return 'Visa';
  }

  if(/^(5[1-5]|2[2-7])/.test(clean)){
    return 'MasterCard';
  }

  return 'Card';
}

function maskCardNumber(number){
  const clean = number.replace(/\D/g, '');

  if(clean.length < 4){
    return '****';
  }

  return '**** **** **** ' + clean.slice(-4);
}

async function confirmOrder(){
  const errEl = $('checkoutError');
  const btn = $('confirmOrderBtn');

  const details = getCheckoutDetails();
  details.paymentMethod = normalizePaymentMethod(details.paymentMethod);

  const error = validateCheckoutDetails(details);

  clearCheckoutError();

  if(error){
    errEl.textContent = error;
    errEl.classList.add('visible');
    return;
  }

  try{
    if(btn){
      btn.disabled = true;
      btn.innerHTML = 'Placing Order... <i class="fa-solid fa-spinner fa-spin"></i>';
    }

    const subtotal = cartTotal();
    const deliveryCharge = getDeliveryCharge();
    const total = subtotal + deliveryCharge;

    const paymentData = {
      method: details.paymentMethod
    };

    if(details.paymentMethod === 'card'){
      paymentData.cardBrand = detectCardBrand(details.cardNumber);
      paymentData.cardName = details.cardName;
      paymentData.cardLast4 = details.cardNumber.replace(/\D/g, '').slice(-4);
      paymentData.maskedCard = maskCardNumber(details.cardNumber);
      paymentData.expiry = details.cardExpiry;
    }

    const orderPayload = {
      items: cart.map(function(item){
        return {
          productId: item.id,
          name: item.name,
          price: Number(item.price),
          quantity: Number(item.qty),
          img: item.img
        };
      }),

      subtotal: subtotal,
      deliveryCharge: deliveryCharge,
      total: total,

      delivery: {
        name: details.name,
        phone: details.phone,
        province: details.province,
        district: details.district,
        city: details.city,
        street: details.street,
        landmark: details.landmark,
        address: details.address,
        label: details.label,
        notes: details.notes
      },

      paymentMethod: details.paymentMethod,
      payment: paymentData
    };

    const order = createLocalOrder(orderPayload);

    saveDeliveryDetails(details);
    closeCheckoutModal();
    showOrderSuccess(order);

  }catch(err){
    errEl.textContent = err.message;
    errEl.classList.add('visible');
  }finally{
    if(btn){
      btn.disabled = false;
      btn.innerHTML = 'Confirm Order <i class="fa-solid fa-circle-check"></i>';
    }
  }
}

function createLocalOrder(orderPayload){
  const orders = JSON.parse(localStorage.getItem('tm_orders') || '[]');
  const orderId = orders.length + 1;
  const user = getCurrentUser();

  const subtotal = Number(orderPayload.subtotal || 0);
  const deliveryCharge = Number(orderPayload.deliveryCharge || FIXED_DELIVERY_CHARGE);
  const total = subtotal + deliveryCharge;

  const order = {
    id: orderId,
    orderNo: 'TM-' + String(orderId).padStart(5, '0'),
    customer: user || null,
    items: orderPayload.items || [],
    subtotal: subtotal,
    deliveryCharge: deliveryCharge,
    total: total,
    delivery: orderPayload.delivery || {},
    paymentMethod: normalizePaymentMethod(orderPayload.paymentMethod),
    payment: orderPayload.payment || {},
    status: 'pending',
    createdAt: new Date().toISOString()
  };

  orders.push(order);
  localStorage.setItem('tm_orders', JSON.stringify(orders));

  return order;
}

function showOrderSuccess(order){
  const container = $('cartItems');
  const footer = $('cartFooter');
  const empty = $('cartEmpty');

  if(!container || !footer || !empty){
    return;
  }

  const city = order.delivery && order.delivery.city ? order.delivery.city : '';
  const district = order.delivery && order.delivery.district ? order.delivery.district : '';
  const paymentText = formatPaymentMethod(order.paymentMethod, order.payment);

  clearCart(false);
  openCart();

  empty.classList.remove('visible');
  footer.style.display = 'none';

  container.innerHTML =
    '<div class="checkout-success">' +
      '<i class="fa-solid fa-circle-check"></i>' +
      '<h3>Order Placed!</h3>' +
      '<p>' +
        'Order No: <strong>' + (order.orderNo || 'Pending') + '</strong><br>' +
        'Subtotal: <strong>' + fmt(order.subtotal) + '</strong><br>' +
        'Delivery Charge: <strong>' + fmt(order.deliveryCharge) + '</strong><br>' +
        'Total Amount: <strong>' + fmt(order.total) + '</strong><br>' +
        'Payment: <strong>' + paymentText + '</strong><br>' +
        'Delivery Area: <strong>' + city + (district ? ', ' + district : '') + '</strong>' +
      '</p>' +
      '<button class="btn-red" onclick="location.href=\'orders.html\'" style="margin:auto;padding:12px 28px;display:flex;align-items:center;gap:8px;border-radius:10px">' +
        '<i class="fa-solid fa-receipt"></i> View Receipt' +
      '</button>' +
    '</div>';
}

function formatPaymentMethod(method, payment){
  method = normalizePaymentMethod(method);

  if(method === 'cash_on_delivery'){
    return 'Cash on Delivery';
  }

  if(method === 'card'){
    if(payment && payment.maskedCard){
      return 'Credit / Debit Card (' + payment.maskedCard + ')';
    }

    return 'Credit / Debit Card';
  }

  return 'Cash on Delivery';
}

/* ── TOAST / CONTACT ── */
function showToast(msg){
  const t = $('toast');
  const msgEl = $('toastMsg');

  if(!t || !msgEl){
    return;
  }

  msgEl.innerHTML = msg;
  t.classList.add('show');

  clearTimeout(t._timeout);

  t._timeout = setTimeout(function(){
    t.classList.remove('show');
  }, 2800);
}

async function sendMessage(){
  const name = document.getElementById('contactName')?.value.trim();
  const phone = document.getElementById('contactPhone')?.value.trim();
  const email = document.getElementById('contactEmail')?.value.trim();
  const message = document.getElementById('contactMessage')?.value.trim();

  if (!name) {
    showToast('Please enter your name.', 'error');
    return;
  }
  if (!message) {
    showToast('Please enter a message.', 'error');
    return;
  }

  try {
    const response = await fetch(API_BASE + '/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, email, message })
    });

    if (!response.ok) {
      const err = await response.json();
      showToast('Error: ' + (err.message || 'Failed to send message'), 'error');
      return;
    }

    showToast('<i class="fa-solid fa-paper-plane" style="color:var(--red)"></i> Message sent! We will contact you soon.', 'success');

    ['contactName','contactPhone','contactEmail','contactMessage'].forEach(function(id){
      const el = document.getElementById(id);
      if(el) el.value = '';
    });
  } catch (err) {
    console.error('Message send error:', err);
    showToast('Failed to send message. Please try again.', 'error');
  }
}

/* ── NAVIGATION / SEARCH ── */
function showPage(name){
  if(name === 'home'){
    location.href = 'index.html';
  }else if(name === 'shop'){
    location.href = 'shop.html';
  }else if(name === 'about'){
    location.href = 'about.html';
  }else if(name === 'contact'){
    location.href = 'contact.html';
  }else if(name === 'orders'){
    location.href = 'orders.html';
  }
}

function goToShop(category, search, brand){
  let url = 'shop.html';
  const params = new URLSearchParams();

  if(category && category !== 'all'){
    params.set('category', category);
  }

  if(search && search.trim()){
    params.set('search', search.trim());
  }

  if(brand && brand !== 'all'){
    params.set('brand', brand);
  }

  const q = params.toString();

  if(q){
    url += '?' + q;
  }

  location.href = url;
}

function doHeroSearch(){
  const input = $('heroSearch');
  goToShop('all', input ? input.value.trim() : '');
}

function doNavSearch(){
  const input = $('navSearch');
  const q = input ? input.value.trim() : '';

  if($('shopProducts')){
    if($('shopSearch')){
      $('shopSearch').value = q;
    }

    applyFilters();
  }else{
    goToShop('all', q);
  }
}

function openCategory(category){
  goToShop(category, '');
}

function openBrand(brand){
  goToShop('all', '', brand);
}

function renderBrandGrid(){
  const grid = $('brandGrid');

  if(!grid){
    return;
  }

  grid.innerHTML = brands.map(function(brand){
    return (
      '<div class="brand-card" onclick="openBrand(\'' + brand.name.replace(/'/g, "\\'") + '\')">' +
        '<div class="brand-img brand-logo-box">' +
          '<span class="brand-logo-fallback">' + brand.name + '</span>' +
          '<img src="' + brand.logo + '" alt="' + brand.name + ' Logo" loading="lazy" onerror="this.style.display=\'none\'; this.previousElementSibling.style.display=\'flex\';">' +
        '</div>' +
        '<div class="brand-label">' + brand.name + '</div>' +
      '</div>'
    );
  }).join('');
}

function populateBrandSelect(){
  const select = $('shopBrand');

  if(!select){
    return;
  }

  const currentValue = select.value || 'all';

  select.innerHTML =
    '<option value="all">All Brands</option>' +
    brands.map(function(brand){
      return '<option value="' + brand.name + '">' + brand.name + '</option>';
    }).join('');

  const hasCurrent = Array.from(select.options).some(function(option){
    return option.value === currentValue;
  });

  select.value = hasCurrent ? currentValue : 'all';
}

/* ── PRODUCT CARDS / SHOP ── */
function productCard(p){
  const discount = p.oldPrice ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
  const categoryName = p.category.charAt(0).toUpperCase() + p.category.slice(1);

  return `
    <div class="product-card">
      <div class="product-img">
        <img src="${p.img}" alt="${p.name}" loading="lazy">
      </div>

      <div class="product-body">
        <div class="product-meta">
          ${p.brand ? `<span>${p.brand}</span><span class="dot"></span>` : ''}
          <span>${categoryName}</span>
        </div>

        <h3>${p.name}</h3>

        <div class="product-price-row">
          <div>
            ${p.oldPrice ? `<div class="product-old">${fmt(p.oldPrice)}</div>` : ''}
            <div class="product-price">${fmt(p.price)}</div>
            ${discount ? `<div class="product-discount">Save ${fmt(p.oldPrice - p.price)}</div>` : ''}
          </div>

          <span class="stock-badge ${p.stock ? 'in-stock' : 'out-stock'}">
            ${p.stock ? 'In Stock' : 'Out of Stock'}
          </span>
        </div>

        ${p.stock
          ? `<button class="add-to-cart-btn" onclick="addCart(${p.id})"><i class="fa-solid fa-cart-plus"></i> Add To Cart</button>`
          : `<button class="add-to-cart-btn" style="opacity:.45;cursor:not-allowed;background:#999" disabled>Out of Stock</button>`
        }
      </div>
    </div>
  `;
}

function renderFeatured(){
  const c = $('featuredProducts');

  if(!c){
    return;
  }

  c.innerHTML = products.filter(function(p){
    return p.featured;
  }).map(function(p){
    return productCard(p);
  }).join('');
}

let filtered = [...products];

function applyFilters(){
  if(!$('shopProducts')){
    return;
  }

  const q = $('shopSearch') ? $('shopSearch').value.toLowerCase() : '';
  const cat = $('shopCategory') ? $('shopCategory').value : 'all';
  const brand = $('shopBrand') ? $('shopBrand').value : 'all';
  const maxPrice = $('shopPrice') ? parseInt($('shopPrice').value) : 50000;
  const inStock = $('shopInStock') ? $('shopInStock').checked : false;
  const sort = $('shopSort') ? $('shopSort').value : 'featured';

  filtered = products.filter(function(p){
    if(q && !p.name.toLowerCase().includes(q) && !(p.brand || '').toLowerCase().includes(q)){
      return false;
    }

    if(cat !== 'all' && p.category !== cat){
      return false;
    }

    if(brand !== 'all' && p.brand !== brand){
      return false;
    }

    if(p.price > maxPrice){
      return false;
    }

    if(inStock && !p.stock){
      return false;
    }

    return true;
  });

  if(sort === 'price-asc'){
    filtered.sort(function(a,b){
      return a.price - b.price;
    });
  }else if(sort === 'price-desc'){
    filtered.sort(function(a,b){
      return b.price - a.price;
    });
  }else if(sort === 'name'){
    filtered.sort(function(a,b){
      return a.name.localeCompare(b.name);
    });
  }

  renderShop();
}

function clearFilters(){
  if($('shopSearch')){
    $('shopSearch').value = '';
  }

  if($('shopCategory')){
    $('shopCategory').value = 'all';
  }

  if($('shopBrand')){
    $('shopBrand').value = 'all';
  }

  if($('shopPrice')){
    $('shopPrice').value = 50000;
  }

  if($('shopInStock')){
    $('shopInStock').checked = false;
  }

  if($('shopSort')){
    $('shopSort').value = 'featured';
  }

  if($('priceLabel')){
    $('priceLabel').textContent = '50,000';
  }

  filtered = [...products]; /* products already loaded from admin localStorage */
  renderShop();
}

function updatePriceLabel(){
  if($('shopPrice') && $('priceLabel')){
    $('priceLabel').textContent = parseInt($('shopPrice').value).toLocaleString();
  }
}

function renderShop(){
  const shopCount = $('shopCount');
  const shopProducts = $('shopProducts');

  if(!shopCount || !shopProducts){
    return;
  }

  shopCount.textContent = filtered.length;

  shopProducts.innerHTML = filtered.length
    ? filtered.map(function(p){
        return productCard(p);
      }).join('')
    : `<div style="grid-column:1/-1;text-align:center;color:var(--muted);padding:60px;font-family:'Montserrat',sans-serif">No products match your filters.</div>`;
}

function loadShopFromUrl(){
  if(!$('shopProducts')){
    return;
  }

  const params = new URLSearchParams(window.location.search);

  const category = params.get('category');
  const search = params.get('search');
  const brand = params.get('brand');

  if(category && $('shopCategory')){
    $('shopCategory').value = category;
  }

  if(search && $('shopSearch')){
    $('shopSearch').value = search;
  }

  if(brand && $('shopBrand')){
    const select = $('shopBrand');

    const hasBrand = Array.from(select.options).some(function(option){
      return option.value === brand;
    });

    if(!hasBrand){
      const option = document.createElement('option');
      option.value = brand;
      option.textContent = brand;
      select.appendChild(option);
    }

    select.value = brand;
  }

  applyFilters();
}

function escapeHTML(text){
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderStars(rating){
  const full = Math.max(0, Math.min(5, Number(rating || 0)));
  let html = '';

  for(let i = 1; i <= 5; i++){
    html += i <= full
      ? '<i class="fa-solid fa-star"></i>'
      : '<i class="fa-regular fa-star"></i>';
  }

  return html;
}

function setReviewRating(rating){
  selectedReviewRating = Number(rating || 5);

  const starBox = $('reviewStarInput');
  const text = $('selectedRatingText');

  if(starBox){
    const buttons = starBox.querySelectorAll('button');

    buttons.forEach(function(btn, index){
      const icon = btn.querySelector('i');

      if(icon){
        icon.className = index < selectedReviewRating
          ? 'fa-solid fa-star'
          : 'fa-regular fa-star';
      }

      btn.classList.toggle('active', index < selectedReviewRating);
    });
  }

  if(text){
    text.textContent = selectedReviewRating + ' Star' + (selectedReviewRating === 1 ? '' : 's');
  }
}

function openReviewForm(){
  const user = getCurrentUser();

  if(!user){
    openLogin();
    showToast('Please login to write a feedback.');
    return;
  }

  const box = $('reviewFormBox');

  if(box){
    box.classList.remove('hidden');
    setReviewRating(selectedReviewRating || 5);
    updateReviewFormState();

    setTimeout(function(){
      box.scrollIntoView({ behavior: 'smooth', block: 'center' });

      if($('reviewMessage')){
        $('reviewMessage').focus();
      }
    }, 100);
  }
}

function closeReviewForm(){
  const box = $('reviewFormBox');

  if(box){
    box.classList.add('hidden');
  }
}

async function loadReviewsSummary(){
  if(!$('reviewsAvg') || !$('reviewsCount') || !$('reviewsStars')){
    return;
  }

  try{
    const res = await fetch(API_BASE + '/api/reviews/summary');
    const data = await res.json();

    const average = Number(data.average || 0);
    const count = Number(data.count || 0);

    $('reviewsAvg').textContent = average.toFixed(1);
    $('reviewsCount').textContent = count > 0
      ? 'Based on ' + count + ' real customer review' + (count === 1 ? '' : 's')
      : 'No reviews yet';

    $('reviewsStars').innerHTML = renderStars(Math.round(average));
  }catch(err){
    console.error('Review summary error:', err);
  }
}

async function loadReviewsFromServer(){
  const grid = $('reviewsGrid');

  if(!grid){
    return;
  }

  try{
    const res = await fetch(API_BASE + '/api/reviews');
    const reviews = await res.json();

    if(!Array.isArray(reviews) || reviews.length === 0){
      grid.innerHTML = `
        <div class="reviews-empty">
          <i class="fa-solid fa-comment-dots"></i>
          <h3>No customer reviews yet</h3>
          <p>Be the first customer to share your experience.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = reviews.map(function(review){
      const firstLetter = (review.name || 'C').charAt(0).toUpperCase();

      return `
        <div class="customer-review-card">
          <div class="review-top">
            <div class="review-avatar">${escapeHTML(firstLetter)}</div>
            <div>
              <h4>${escapeHTML(review.name || 'Customer')}</h4>
              <span>Verified Customer</span>
            </div>
          </div>

          <div class="review-stars">
            ${renderStars(review.rating)}
          </div>

          <p>${escapeHTML(review.message)}</p>
        </div>
      `;
    }).join('');
  }catch(err){
    console.error('Load reviews error:', err);
    grid.innerHTML = `
      <div class="reviews-empty">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <h3>Could not load reviews</h3>
        <p>Please refresh the page and try again.</p>
      </div>
    `;
  }
}

function updateReviewFormState(){
  const user = getCurrentUser();
  const note = $('reviewLoginNote');

  if(!note){
    return;
  }

  if(!user){
    note.innerHTML = 'Please <a onclick="openLogin()">login</a> to write real feedback.';
  }else{
    note.textContent = 'Posting as ' + (user.name || 'Customer');
  }
}

async function submitReview(){
  const user = getCurrentUser();

  if(!user){
    openLogin();
    showToast('Please login to write feedback.');
    return;
  }

  const token = localStorage.getItem('thushanUserToken');

  if(!token){
    openLogin();
    showToast('Please login again to submit your feedback.');
    return;
  }

  const message = $('reviewMessage') ? $('reviewMessage').value.trim() : '';

  if(message.length < 10){
    showToast('Please write at least 10 characters.');
    return;
  }

  try{
    const res = await fetch(API_BASE + '/api/reviews', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({
        rating: selectedReviewRating,
        message: message
      })
    });

    const data = await res.json();

    if(!res.ok){
      showToast('❌ ' + (data.message || 'Could not submit feedback.'));
      return;
    }

    if($('reviewMessage')){
      $('reviewMessage').value = '';
    }

    closeReviewForm();

    showToast('<i class="fa-solid fa-circle-check" style="color:var(--red)"></i> Feedback added. Thank you!');

    await loadReviewsSummary();
    await loadReviewsFromServer();
    updateReviewFormState();
  }catch(err){
    console.error('Submit review error:', err);
    showToast('⚠️ Server error. Please try again.');
  }
}

/* ── PASSWORD STRENGTH ── */
function checkPassStrength(val){
  const bar = $('passStrengthBar');
  const hint = $('passHint');

  if(!bar){
    return;
  }

  let score = 0;

  if(val.length >= 6) score++;
  if(val.length >= 10) score++;
  if(/[A-Z]/.test(val)) score++;
  if(/[0-9]/.test(val)) score++;
  if(/[^A-Za-z0-9]/.test(val)) score++;

  const colors = ['#dc2626','#f97316','#eab308','#22c55e','#16a34a'];
  const labels = ['Very Weak','Weak','Fair','Strong','Very Strong'];

  bar.style.width = (score * 20) + '%';
  bar.style.background = colors[Math.max(0, score - 1)];

  if(hint){
    hint.textContent = val.length > 0 ? labels[Math.max(0, score - 1)] : '';
  }
}

/* ── KEYBOARD SUPPORT ── */
document.addEventListener('keydown', function(e){
  if(e.key === 'Escape'){
    closeCart();
    closeModal();

    if($('checkoutModal') && $('checkoutModal').classList.contains('active')){
      closeCheckoutModal();
    }
  }

  if(e.key === 'Enter'){
    const modal = $('authModal');

    if(!modal || !modal.classList.contains('active')){
      return;
    }

    if($('otpForm') && !$('otpForm').classList.contains('hidden')){
      verifyOtp();
    }else if(!$('loginForm').classList.contains('hidden')){
      doLogin();
    }else{
      doRegister();
    }
  }
});

/* ══ ORDERS / RECEIPTS PAGE ══ */
function getStoredOrders(){
  try{
    return JSON.parse(localStorage.getItem('tm_orders') || '[]');
  }catch(e){
    return [];
  }
}

function formatDateTime(dateText){
  try{
    return new Date(dateText).toLocaleString('en-LK', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }catch(e){
    return dateText || '';
  }
}

function getOrderItemData(item){
  const product = products.find(function(p){
    return p.id === item.productId || p.id === item.id;
  }) || {};

  const qty = Number(item.quantity || item.qty || 1);
  const price = Number(item.price || product.price || 0);
  const name = item.name || product.name || 'Spare Part';

  return {
    name: name,
    qty: qty,
    price: price,
    total: price * qty
  };
}

function calculateOrderSubtotal(items){
  return (items || []).reduce(function(sum,item){
    const data = getOrderItemData(item);
    return sum + data.total;
  }, 0);
}

function renderOrdersPage(){
  const ordersList = $('ordersList');

  if(!ordersList){
    return;
  }

  const user = getCurrentUser();

  if(!user){
    ordersList.innerHTML =
      '<div class="orders-empty">' +
        '<i class="fa-solid fa-user-lock"></i>' +
        '<h3>Please login to view your orders</h3>' +
        '<p>Login with the account you used to place your order.</p>' +
        '<button class="btn-red" onclick="openLogin()" style="margin-top:18px;padding:12px 24px;border-radius:10px">' +
          '<i class="fa-solid fa-right-to-bracket"></i> Login Now' +
        '</button>' +
      '</div>';

    return;
  }

  let orders = getStoredOrders();

  orders = orders.filter(function(order){
    if(!order.customer || !order.customer.email){
      return true;
    }

    return order.customer.email === user.email;
  });

  if(orders.length === 0){
    ordersList.innerHTML =
      '<div class="orders-empty">' +
        '<i class="fa-solid fa-receipt"></i>' +
        '<h3>No orders yet</h3>' +
        '<p>Your online receipts will appear here after you place an order.</p>' +
        '<button class="btn-red" onclick="location.href=\'shop.html\'" style="margin-top:18px;padding:12px 24px;border-radius:10px">' +
          '<i class="fa-solid fa-shop"></i> Shop Now' +
        '</button>' +
      '</div>';

    return;
  }

  orders = orders.slice().reverse();

  ordersList.innerHTML = orders.map(function(order){
    const delivery = order.delivery || {};
    const customer = order.customer || {};
    const paymentText = formatPaymentMethod(order.paymentMethod, order.payment);
    const items = order.items || [];
    const orderNo = order.orderNo || ('TM-' + String(order.id || 1).padStart(5,'0'));

    const itemRows = items.map(function(item){
      const data = getOrderItemData(item);

      return (
        '<tr>' +
          '<td>' + data.name + '</td>' +
          '<td>' + data.qty + '</td>' +
          '<td>' + fmt(data.price) + '</td>' +
          '<td>' + fmt(data.total) + '</td>' +
        '</tr>'
      );
    }).join('');

    const calculatedSubtotal = calculateOrderSubtotal(items);
    const subtotal = Number(order.subtotal || calculatedSubtotal || 0);
    const deliveryCharge = Number(order.deliveryCharge !== undefined ? order.deliveryCharge : FIXED_DELIVERY_CHARGE);
    const total = Number(order.total || subtotal + deliveryCharge);

    return (
      '<div class="receipt-card" id="receipt-' + orderNo + '">' +

        '<div class="receipt-header">' +
          '<div class="receipt-brand">' +
            '<img src="images/Logo/tmLogo.png" alt="Thushan Motors Logo">' +
            '<div>' +
              '<h2><span>THUSHAN</span> MOTORS</h2>' +
              '<p style="color:var(--muted);font-size:13px">Online Order Receipt</p>' +
            '</div>' +
          '</div>' +

          '<div class="receipt-meta">' +
            '<div>Receipt No: <strong>' + orderNo + '</strong></div>' +
            '<div>Date: <strong>' + formatDateTime(order.createdAt) + '</strong></div>' +
            '<div>Status: <strong>' + (order.status || 'pending') + '</strong></div>' +
          '</div>' +
        '</div>' +

        '<div class="receipt-info-grid">' +
          '<div class="receipt-info-box">' +
            '<h4>Customer</h4>' +
            '<p>' +
              '<strong>' + (delivery.name || customer.name || 'Customer') + '</strong><br>' +
              (customer.email || user.email || '') + '<br>' +
              (delivery.phone || customer.phone || '') +
            '</p>' +
          '</div>' +

          '<div class="receipt-info-box">' +
            '<h4>Delivery Address</h4>' +
            '<p>' +
              (delivery.street || '') + '<br>' +
              (delivery.address || '') + '<br>' +
              (delivery.city || '') + ', ' + (delivery.district || '') + '<br>' +
              (delivery.province || '') + ' Province' +
            '</p>' +
          '</div>' +
        '</div>' +

        '<table class="receipt-table">' +
          '<thead>' +
            '<tr>' +
              '<th>Item</th>' +
              '<th>Qty</th>' +
              '<th>Price</th>' +
              '<th>Total</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody>' +
            itemRows +
          '</tbody>' +
        '</table>' +

        '<div class="receipt-total-box">' +
          '<div class="receipt-total-row">' +
            '<span>Subtotal</span>' +
            '<strong>' + fmt(subtotal) + '</strong>' +
          '</div>' +

          '<div class="receipt-total-row">' +
            '<span>Delivery Charge</span>' +
            '<strong>' + fmt(deliveryCharge) + '</strong>' +
          '</div>' +

          '<div class="receipt-total-row">' +
            '<span>Payment Method</span>' +
            '<strong>' + paymentText + '</strong>' +
          '</div>' +

          '<div class="receipt-total-row grand">' +
            '<span>Total Amount</span>' +
            '<strong>' + fmt(total) + '</strong>' +
          '</div>' +
        '</div>' +

        '<div class="receipt-actions">' +
          '<button class="btn-ghost" onclick="printReceipt(\'' + orderNo + '\')">' +
            '<i class="fa-solid fa-print"></i> Print Receipt' +
          '</button>' +

          '<button class="btn-red" onclick="location.href=\'shop.html\'">' +
            '<i class="fa-solid fa-shop"></i> Buy Again' +
          '</button>' +
        '</div>' +

      '</div>'
    );
  }).join('');
}

function printReceipt(orderNo){
  document.querySelectorAll('.receipt-card').forEach(function(card){
    card.classList.remove('print-selected');
  });

  const card = document.getElementById('receipt-' + orderNo);

  if(card){
    card.classList.add('print-selected');
  }

  document.body.classList.add('printing-receipt');

  window.print();

  setTimeout(function(){
    document.body.classList.remove('printing-receipt');

    if(card){
      card.classList.remove('print-selected');
    }
  }, 500);
}

/* ── INIT ── */
window.onload = async function(){
  loadCart();
  updateCartBadge();
  updateNavAuth();

  /* Real database products — must finish loading BEFORE we render
     anything, otherwise the page would flash empty/stale content. */
  await loadProductsFromServer();

  filtered = [...products];

  renderFeatured();
  renderBrandGrid();
  populateBrandSelect();
  loadShopFromUrl();

  const regPass = $('regPassword');

  if(regPass){
    regPass.addEventListener('input', function(e){
      checkPassStrength(e.target.value);
    });
  }

  const cardNumberInput = $('checkoutCardNumber');

  if(cardNumberInput){
    cardNumberInput.addEventListener('input', function(){
      this.value = formatCardNumberInput(this.value);
    });
  }

  const cardExpiryInput = $('checkoutCardExpiry');

  if(cardExpiryInput){
    cardExpiryInput.addEventListener('input', function(){
      this.value = formatExpiryInput(this.value);
    });
  }

    ensureAuthExtraUI();
  renderGoogleButtons();

  if($('checkoutStreet')){
    const streetGroup = $('checkoutStreet').closest('.form-group');

    if(streetGroup){
      streetGroup.style.display = 'none';
    }
  }

  updateReviewFormState();
  setReviewRating(5);
  await loadReviewsSummary();
  await loadReviewsFromServer();

  renderOrdersPage();
};