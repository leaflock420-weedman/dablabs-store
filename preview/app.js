(() => {
  const { products, taxonomy } = window.DABLABS_CATALOG;
  const PRODUCT_TYPES = taxonomy?.productTypes || [
    'Glass Tops', 'Chambers', 'Carb Caps', 'Pearls', 'Joysticks & Tethers', 'Limited Edition',
  ];
  const DEVICE_TAGS = taxonomy?.deviceTags || ['Peak OG', 'Peak Pro', 'Proxy'];
  const CHECKOUT = window.DABLABS_CHECKOUT || {};
  const SALE = CHECKOUT.sale || {};
  const SALE_ENDS = SALE.endsAt ? new Date(SALE.endsAt).getTime() : 0;
  const SALE_PERCENT = SALE.percentOff ?? 0;
  const FREE_SHIP = CHECKOUT.freeShippingThreshold ?? 100;
  const SHIPPING = {
    standard: CHECKOUT.standardShipping ?? 9.95,
    express: CHECKOUT.expressShipping ?? 14.95,
  };
  const ICONS = {
    'Glass Tops': '💎', 'Chambers': '🔥', 'Pearls': '⚪', 'Carb Caps': '🌀',
    'Joysticks & Tethers': '🎮', 'Peak Pro': '⛰️', 'Peak OG': '🏔️', 'Proxy': '📱',
    'Limited Edition': '✨',
  };

  function countInCategory(name) {
    return products.filter((p) => p.collections.includes(name)).length;
  }

  function getProductTypeTags(cols) {
    return PRODUCT_TYPES.filter((t) => cols.includes(t));
  }

  function getDeviceTags(cols) {
    return DEVICE_TAGS.filter((t) => cols.includes(t));
  }

  let cart = [];
  try {
    cart = JSON.parse(localStorage.getItem('dablabs-cart') || '[]');
    if (!Array.isArray(cart)) cart = [];
  } catch {
    cart = [];
    localStorage.removeItem('dablabs-cart');
  }
  let currentFilter = 'all';
  let currentProduct = null;
  let selectedVariant = null;
  let searchQuery = '';
  let viewTransitionId = 0;
  let shippingMethod = 'standard';
  let lastPaypalUrl = '';

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  const views = {
    home: $('#view-home'),
    shop: $('#view-shop'),
    product: $('#view-product'),
    checkout: $('#view-checkout'),
  };

  function saveCart() {
    localStorage.setItem('dablabs-cart', JSON.stringify(cart));
    updateCartUI();
  }

  function formatPrice(n) {
    return `$${n.toFixed(2)}`;
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function isSaleActive() {
    return SALE_PERCENT > 0 && SALE_ENDS > Date.now();
  }

  function getEffectivePrice(price) {
    if (!isSaleActive()) return price;
    return Math.round(price * (1 - SALE_PERCENT / 100) * 100) / 100;
  }

  function priceHTML(price, opts = {}) {
    const suffix = opts.suffix ?? '';
    if (!isSaleActive()) {
      return `<span class="price--regular">${formatPrice(price)}</span>${suffix}`;
    }
    const sale = getEffectivePrice(price);
    return `<span class="price--was">${formatPrice(price)}</span> <span class="price--now">${formatPrice(sale)}</span>${suffix}`;
  }

  function getCartOriginalSubtotal() {
    return cart.reduce((s, i) => s + i.price * i.qty, 0);
  }

  function getCartSubtotal() {
    return cart.reduce((s, i) => s + getEffectivePrice(i.price) * i.qty, 0);
  }

  function getSaleSavings() {
    if (!isSaleActive()) return 0;
    return Math.round((getCartOriginalSubtotal() - getCartSubtotal()) * 100) / 100;
  }

  function getShippingCost(subtotal = getCartSubtotal()) {
    const freeStandard = subtotal >= FREE_SHIP;
    if (shippingMethod === 'express') return SHIPPING.express;
    return freeStandard ? 0 : SHIPPING.standard;
  }

  function getOrderTotal(subtotal = getCartSubtotal()) {
    return subtotal + getShippingCost(subtotal);
  }

  function isRestPayPal() {
    return (CHECKOUT.paypal?.mode || 'rest') === 'rest';
  }

  function getApiBase() {
    return CHECKOUT.paypal?.apiBase ?? '';
  }

  function isPayPalConfigured() {
    if (isRestPayPal()) return true;
    const p = CHECKOUT.paypal || {};
    if (p.mode === 'business') {
      return p.businessEmail && !String(p.businessEmail).includes('YOUR');
    }
    if (p.mode === 'link') {
      return p.paymentLink && !String(p.paymentLink).includes('YOUR');
    }
    const user = p.paypalMeUsername || '';
    return user && !user.includes('YOUR');
  }

  function buildPayPalUrl(total, orderId) {
    const p = CHECKOUT.paypal || {};
    const currency = CHECKOUT.currency || 'AUD';
    const amount = total.toFixed(2);

    if (p.mode === 'business') {
      const params = new URLSearchParams({
        cmd: '_xclick',
        business: p.businessEmail,
        amount,
        currency_code: currency,
        item_name: `${CHECKOUT.storeName || 'Dab Labs'} Order ${orderId}`,
        custom: orderId,
        no_note: '0',
      });
      return `https://www.paypal.com/cgi-bin/webscr?${params}`;
    }

    if (p.mode === 'link') {
      return String(p.paymentLink)
        .replace(/\{amount\}/g, amount)
        .replace(/\{currency\}/g, currency)
        .replace(/\{orderId\}/g, orderId);
    }

    const user = String(p.paypalMeUsername || '').replace(/^@/, '').trim();
    return `https://paypal.me/${user}/${amount}${currency}`;
  }

  function generateOrderId() {
    return `DL-${Date.now().toString(36).toUpperCase()}`;
  }

  function saveOrder(order) {
    let orders = [];
    try {
      orders = JSON.parse(localStorage.getItem('dablabs-orders') || '[]');
      if (!Array.isArray(orders)) orders = [];
    } catch {
      orders = [];
    }
    orders.unshift(order);
    localStorage.setItem('dablabs-orders', JSON.stringify(orders.slice(0, 20)));
  }

  function getCheckoutFormData() {
    const form = $('#checkoutForm');
    if (!form) return null;
    const data = Object.fromEntries(new FormData(form).entries());
    data.shippingMethod = shippingMethod;
    return data;
  }

  const CHECKOUT_REQUIRED = [
    { name: 'email', label: 'Email', test: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) },
    { name: 'phone', label: 'Phone', test: (v) => v.replace(/\D/g, '').length >= 8 },
    { name: 'name', label: 'Full name', test: (v) => v.length >= 2 },
    { name: 'address', label: 'Street address', test: (v) => v.length >= 3 },
    { name: 'suburb', label: 'Suburb', test: (v) => v.length >= 2 },
    { name: 'state', label: 'State', test: (v) => v.length >= 2 },
    { name: 'postcode', label: 'Postcode', test: (v) => /^\d{4}$/.test(v) },
  ];

  function validateCheckoutForm(opts = {}) {
    const { silent = false, markInvalid = !silent } = opts;
    const data = getCheckoutFormData();
    if (!data) return { valid: false, missing: ['Form'] };

    const missing = [];
    const form = $('#checkoutForm');

    CHECKOUT_REQUIRED.forEach(({ name, label, test }) => {
      const raw = String(data[name] ?? '').trim();
      const ok = test(raw);
      const el = form?.elements[name];
      if (el && markInvalid) el.classList.toggle('is-invalid', !ok);
      if (!ok) missing.push(label);
    });

    if (missing.length && form && !silent) {
      const firstBad = CHECKOUT_REQUIRED.find(({ name, label }) => missing.includes(label));
      const el = firstBad && form.elements[firstBad.name];
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el?.focus?.();
    }

    return { valid: missing.length === 0, missing };
  }

  function updateCheckoutPayState() {
    const result = validateCheckoutForm({ silent: true, markInvalid: false });
    const gate = $('#paypalGate');
    const gateMsg = $('#paypalGateMsg');
    const hint = $('#checkoutPayHint');
    const ready = result.valid && cart.length > 0;

    if (gate) {
      gate.classList.toggle('is-active', !ready);
      gate.setAttribute('aria-hidden', ready ? 'true' : 'false');
    }
    if (gateMsg && !ready && result.missing.length) {
      gateMsg.textContent = `Complete: ${result.missing.join(', ')}`;
    } else if (gateMsg) {
      gateMsg.textContent = 'Complete your details above to unlock PayPal.';
    }
    if (hint) {
      hint.textContent = ready
        ? 'You\'re all set — click PayPal below to pay securely.'
        : 'Fill in your details above, then pay with PayPal.';
    }
    return result;
  }

  function renderCheckoutShippingOptions() {
    const subtotal = getCartSubtotal();
    const freeStandard = subtotal >= FREE_SHIP;
    const standardCost = freeStandard ? 0 : SHIPPING.standard;
    const expressCost = SHIPPING.express;
    const el = $('#shippingOptions');
    if (!el) return;
    el.innerHTML = `
      <label class="checkout__ship-option">
        <input type="radio" name="ship" value="standard" ${shippingMethod === 'standard' ? 'checked' : ''}>
        <div>
          <strong>Standard shipping</strong>
          <span>3–7 business days AU-wide</span>
        </div>
        <em>${freeStandard ? 'Free' : formatPrice(standardCost)}</em>
      </label>
      <label class="checkout__ship-option">
        <input type="radio" name="ship" value="express" ${shippingMethod === 'express' ? 'checked' : ''}>
        <div>
          <strong>Express shipping</strong>
          <span>1–3 business days metro</span>
        </div>
        <em>${formatPrice(expressCost)}</em>
      </label>`;
    el.querySelectorAll('input[name="ship"]').forEach((input) => {
      input.addEventListener('change', () => {
        shippingMethod = input.value;
        renderCheckoutSummary();
      });
    });
  }

  function renderCheckoutSummary() {
    const lines = $('#checkoutLines');
    const totals = $('#checkoutTotals');
    if (!lines || !totals) return;

    if (!cart.length) {
      lines.innerHTML = '<p class="checkout__empty">Your cart is empty.</p>';
      totals.innerHTML = '';
      $('#paypalPayBtn')?.setAttribute('disabled', 'true');
      return;
    }

    lines.innerHTML = cart.map((item) => `
      <div class="checkout__line">
        <img src="${item.image}" alt="">
        <div>
          <div class="checkout__line-name">${item.name}</div>
          <div class="checkout__line-meta">${item.variant ? `${item.variant} · ` : ''}Qty ${item.qty}</div>
        </div>
        <div class="checkout__line-price">${formatPrice(getEffectivePrice(item.price) * item.qty)}</div>
      </div>`).join('');

    const subtotal = getCartSubtotal();
    const savings = getSaleSavings();
    const shipping = getShippingCost(subtotal);
    const total = subtotal + shipping;
    const discountRow = savings > 0
      ? `<div class="checkout__total-row checkout__total-row--discount"><span>${SALE.label || 'Sale'} (${SALE_PERCENT}% off)</span><span>−${formatPrice(savings)}</span></div>`
      : '';

    totals.innerHTML = `
      ${savings > 0 ? `<div class="checkout__total-row checkout__total-row--was"><span>Was</span><span class="price--was">${formatPrice(getCartOriginalSubtotal())}</span></div>` : ''}
      <div class="checkout__total-row"><span>Subtotal</span><span>${formatPrice(subtotal)}</span></div>
      ${discountRow}
      <div class="checkout__total-row"><span>Shipping</span><span>${shipping === 0 ? 'Free' : formatPrice(shipping)}</span></div>
      <div class="checkout__total-row checkout__total-row--grand"><span>Total</span><strong>${formatPrice(total)} AUD</strong></div>`;

    if (!isRestPayPal()) {
      $('#paypalPayBtn')?.removeAttribute('hidden');
      $('#paypalButtonContainer').innerHTML = '';
      $('#paypalConfigWarn').hidden = isPayPalConfigured();
    } else if (!cart.length) {
      window.DabLabsPayPal?.reset($('#paypalButtonContainer'));
    }
    updateCheckoutPayState();
  }

  function buildOrderPayload() {
    const customer = getCheckoutFormData();
    const subtotal = getCartSubtotal();
    const shipping = getShippingCost(subtotal);
    return {
      orderId: generateOrderId(),
      customer,
      items: cart.map((i) => ({
        key: i.key,
        slug: i.slug,
        name: i.name,
        price: getEffectivePrice(i.price),
        originalPrice: i.price,
        qty: i.qty,
        image: i.image,
        variant: i.variant,
      })),
      subtotal,
      shipping,
      discount: getSaleSavings(),
      discountLabel: isSaleActive() ? `${SALE.label || 'Sale'} ${SALE_PERCENT}%` : null,
      total: subtotal + shipping,
      currency: CHECKOUT.currency || 'AUD',
      shippingMethod,
      notes: customer?.notes || '',
      returnUrl: window.location.href,
      cancelUrl: window.location.href,
    };
  }

  function updateModeBadge(config) {
    const badge = $('#paypalModeBadge');
    if (!badge || !config) return;
    badge.hidden = false;
    badge.textContent = config.mode === 'live' ? 'Live payments' : 'Sandbox test mode';
    badge.className = `checkout__mode-badge checkout__mode-badge--${config.mode}`;
  }

  let paypalCheckoutReady = false;

  function initCheckoutPayPal() {
    const container = $('#paypalButtonContainer');
    const legacyBtn = $('#paypalPayBtn');
    const warn = $('#paypalConfigWarn');
    if (legacyBtn) legacyBtn.hidden = true;
    if (!container || !cart.length) return;

    window.DabLabsPayPal?.init({
      apiBase: getApiBase(),
      container,
      getOrderPayload: () => {
        persistCheckoutForm();
        return buildOrderPayload();
      },
      onValidate: () => {
        if (!cart.length) {
          if (warn) { warn.hidden = false; warn.textContent = 'Your cart is empty.'; }
          return { valid: false, message: 'Your cart is empty.' };
        }
        const result = updateCheckoutPayState();
        if (!result.valid) {
          validateCheckoutForm();
          if (warn) {
            warn.hidden = false;
            warn.textContent = `Please complete: ${result.missing.join(', ')}`;
          }
        }
        return result;
      },
      onSuccess: (result) => {
        paypalCheckoutReady = false;
        if (warn) warn.hidden = true;
        const order = result.order || { id: result.orderId, status: 'paid' };
        saveOrder({ ...order, status: 'paid' });
        cart = [];
        saveCart();
        showCheckoutSuccess(order, result.captureId);
      },
      onError: (msg) => {
        if (warn && msg) {
          warn.hidden = false;
          warn.textContent = msg;
        }
      },
    }).then(() => {
      const cfg = window.DabLabsPayPal?.getConfig?.();
      if (cfg?.configured) {
        paypalCheckoutReady = true;
        if (warn) warn.hidden = true;
      }
      updateModeBadge(cfg);
    });
  }

  function showCheckoutSuccess(order, captureId) {
    $('#checkoutMain').hidden = true;
    $('#checkoutPending').hidden = true;
    $('#checkoutSuccess').hidden = false;
    $('#successOrderId').textContent = order.id;
    $('#successCaptureId').textContent = captureId ? `PayPal ref: ${captureId}` : '';
    $('#successEmailLink').href = `mailto:${CHECKOUT.storeEmail || 'hello@dablabs.com.au'}?subject=${encodeURIComponent(`Order ${order.id}`)}`;
  }

  function showCheckoutPending(order) {
    $('#checkoutMain').hidden = true;
    $('#checkoutPending').hidden = false;
    $('#checkoutSuccess').hidden = true;
    $('#pendingOrderId').textContent = order.id;
    $('#pendingInstructions').textContent = CHECKOUT.paymentInstructions || 'Add your order number in the PayPal note.';
    $('#pendingPaypalBtn').href = order.paypalUrl;
    $('#pendingEmailLink').href = `mailto:${CHECKOUT.storeEmail || 'hello@dablabs.com.au'}?subject=${encodeURIComponent(`Order ${order.id}`)}`;
  }

  function resetCheckoutView() {
    $('#checkoutMain').hidden = false;
    $('#checkoutPending').hidden = true;
    $('#checkoutSuccess').hidden = true;
    paypalCheckoutReady = false;
    window.DabLabsPayPal?.reset($('#paypalButtonContainer'));
  }

  function showCheckout() {
    if (!cart.length) {
      openCart();
      return;
    }
    closeCart();
    resetCheckoutView();
    shippingMethod = 'standard';
    renderCheckoutShippingOptions();
    renderCheckoutSummary();
    showView('checkout');
    restoreCheckoutForm();
    setupCheckoutFormListeners();
    updateCheckoutPayState();
    if (isRestPayPal()) {
      $('#checkoutSecureNote').textContent = 'PayPal balance or linked bank only · No guest card · AUD';
      initCheckoutPayPal();
    }
  }

  function restoreCheckoutForm() {
    try {
      const saved = JSON.parse(localStorage.getItem('dablabs-checkout-details') || 'null');
      if (!saved) return;
      const form = $('#checkoutForm');
      Object.entries(saved).forEach(([k, v]) => {
        const el = form?.elements[k];
        if (el && k !== 'shippingMethod') el.value = v;
      });
      if (saved.shippingMethod) {
        shippingMethod = saved.shippingMethod;
        renderCheckoutShippingOptions();
        renderCheckoutSummary();
      }
    } catch { /* ignore */ }
  }

  function persistCheckoutForm() {
    const data = getCheckoutFormData();
    if (data) localStorage.setItem('dablabs-checkout-details', JSON.stringify(data));
  }

  function setupCheckoutFormListeners() {
    const form = $('#checkoutForm');
    if (!form || form.dataset.listeners) return;
    form.dataset.listeners = '1';
    const onFormChange = () => {
      const warn = $('#paypalConfigWarn');
      if (warn) warn.hidden = true;
      form.querySelectorAll('.is-invalid').forEach((el) => {
        const name = el.name;
        const rule = CHECKOUT_REQUIRED.find((r) => r.name === name);
        if (rule && rule.test(String(el.value).trim())) el.classList.remove('is-invalid');
      });
      updateCheckoutPayState();
    };
    form.addEventListener('input', onFormChange);
    form.addEventListener('change', onFormChange);
  }

  function submitCheckout(e) {
    e.preventDefault();
    if (isRestPayPal()) return;
    if (!cart.length) return;
    if (!validateCheckoutForm().valid) return;

    if (!isPayPalConfigured()) {
      const warn = $('#paypalConfigWarn');
      warn.hidden = false;
      warn.textContent = 'Configure PayPal in checkout-config.js';
      warn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }

    const customer = getCheckoutFormData();
    persistCheckoutForm();
    const subtotal = getCartSubtotal();
    const shipping = getShippingCost(subtotal);
    const total = subtotal + shipping;
    const orderId = generateOrderId();
    const paypalUrl = buildPayPalUrl(total, orderId);
    lastPaypalUrl = paypalUrl;

    const order = {
      id: orderId,
      createdAt: new Date().toISOString(),
      status: 'pending_payment',
      customer,
      items: cart.map((i) => ({ ...i, price: getEffectivePrice(i.price) })),
      subtotal,
      discount: getSaleSavings(),
      shipping,
      total,
      currency: CHECKOUT.currency || 'AUD',
      paypalUrl,
    };
    saveOrder(order);

    window.open(paypalUrl, '_blank', 'noopener');
    showCheckoutPending(order);
  }

  function getBestsellers() {
    return [...products].sort((a, b) => b.price - a.price).slice(0, 8);
  }

  function getLimited() {
    return products.filter((p) => p.limited || p.collections.includes('Limited Edition'));
  }

  function filterProducts(filter, query = searchQuery) {
    let list = [...products];
    if (filter && filter !== 'all') {
      list = list.filter((p) => p.collections.includes(filter));
    }
    if (query) {
      const q = query.toLowerCase();
      list = list.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        p.collections.some((c) => c.toLowerCase().includes(q)) ||
        p.description.toLowerCase().includes(q)
      );
    }
    return list;
  }

  function sortProducts(list, sort) {
    const arr = [...list];
    switch (sort) {
      case 'price-asc': return arr.sort((a, b) => a.price - b.price);
      case 'price-desc': return arr.sort((a, b) => b.price - a.price);
      case 'name': return arr.sort((a, b) => a.name.localeCompare(b.name));
      default: return arr.sort((a, b) => (b.limited ? 1 : 0) - (a.limited ? 1 : 0) || b.price - a.price);
    }
  }

  function productCardHTML(p, showAtc = true) {
    const badges = [];
    if (p.limited) badges.push('<span class="badge badge--limited">Limited</span>');
    if (isSaleActive()) badges.push('<span class="badge badge--eofy">30% OFF</span>');
    if (p.price >= 200) badges.push('<span class="badge badge--heady">Heady</span>');
    if (p.images.length > 3) badges.push('<span class="badge badge--new">New</span>');
    const variantText = p.variantCount > 0 ? `+ ${p.variantCount} colours` : '';
    return `
      <article class="product-card" data-slug="${p.slug}">
        <div class="product-card__img-wrap">
          ${badges.length ? `<div class="product-card__badges">${badges.join('')}</div>` : ''}
          <img src="${p.image}" alt="${p.name}" loading="lazy">
        </div>
        <div class="product-card__body">
          <div class="product-card__brand">${p.brand}</div>
          <h3 class="product-card__title">${p.name}</h3>
          ${variantText ? `<div class="product-card__variants">${variantText}</div>` : ''}
          <div class="product-card__footer">
            <div class="product-card__price">${priceHTML(p.price, { suffix: ' <small>AUD</small>' })}</div>
            ${showAtc ? `<button class="product-card__atc" data-atc="${p.slug}">Add</button>` : ''}
          </div>
        </div>
      </article>`;
  }

  function renderGrid(el, list) {
    el.innerHTML = list.map((p, i) => {
      const html = productCardHTML(p);
      return html.replace('class="product-card"', `class="product-card reveal" style="--i:${i % 8}"`);
    }).join('');
    bindProductCards(el);
    window.DabLabsFX?.observeReveals(el);
  }

  function bindProductCards(container) {
    container.querySelectorAll('.product-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('[data-atc]')) return;
        showProduct(card.dataset.slug);
      });
    });
    container.querySelectorAll('[data-atc]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const p = products.find((x) => x.slug === btn.dataset.atc);
        if (p) {
          const rect = btn.getBoundingClientRect();
          window.DabLabsFX?.burstSmoke(rect.left + rect.width / 2, rect.top);
          addToCart(p);
        }
      });
    });
  }

  function showView(name) {
    const current = Object.entries(views).find(([, el]) => !el.hidden);
    const next = views[name];
    if (!next) return;
    if (current && current[1] === next) return;

    const transitionId = ++viewTransitionId;

    if (current) {
      current[1].classList.add('is-exiting');
      setTimeout(() => {
        if (transitionId !== viewTransitionId) return;
        Object.entries(views).forEach(([k, el]) => {
          el.hidden = k !== name;
          el.classList.remove('is-exiting');
        });
        window.DabLabsFX?.observeReveals(next);
      }, 280);
    } else {
      Object.entries(views).forEach(([k, el]) => { el.hidden = k !== name; });
      window.DabLabsFX?.observeReveals(next);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showHome() {
    showView('home');
    currentFilter = 'all';
    syncSearchInputs('');
    updateNavActive('all');
  }

  function showShop(filter = 'all') {
    currentFilter = filter;
    showView('shop');
    $('#shopTitle').textContent = filter === 'all' ? 'All Products' : filter;
    const list = sortProducts(filterProducts(filter), $('#sortSelect').value);
    $('#shopCount').textContent = `${list.length} product${list.length !== 1 ? 's' : ''}`;
    renderGrid($('#shopGrid'), list);
    renderFilterChips(filter);
    updateNavActive(filter);
  }

  function showProduct(slug) {
    const p = products.find((x) => x.slug === slug);
    if (!p) return;
    currentProduct = p;
    selectedVariant = p.variants[0] || null;
    showView('product');

    const thumbs = p.images.map((img, i) =>
      `<button class="pdp__thumb${i === 0 ? ' active' : ''}" data-idx="${i}">
        <img src="${img}" alt="">
      </button>`
    ).join('');

    const swatches = p.variants.length ? `
      <div class="pdp__variants">
        <label>Colour</label>
        <div class="variant-swatches">
          ${p.variants.map((v, i) => `
            <button class="variant-swatch${i === 0 ? ' active' : ''}" data-idx="${i}">
              <span class="variant-swatch__dot" style="background:${v.hex || '#ccc'}"></span>
              ${v.label}
            </button>`).join('')}
        </div>
      </div>` : '';

    $('#pdp').innerHTML = `
      <div class="pdp__gallery">
        <div class="pdp__main-img"><img id="pdpMainImg" src="${p.images[0]}" alt="${p.name}"></div>
        ${p.images.length > 1 ? `<div class="pdp__thumbs">${thumbs}</div>` : ''}
      </div>
      <div class="pdp__info">
        <div class="pdp__brand">${p.brand}</div>
        <h1 class="pdp__title">${p.name}</h1>
        <div class="pdp__price">${priceHTML(p.price, { suffix: ' <span>AUD inc. GST</span>' })}</div>
        <div class="pdp__tags">
          ${getProductTypeTags(p.collections).map((c) => `<span class="pdp__tag pdp__tag--type">${c}</span>`).join('')}
          ${getDeviceTags(p.collections).length ? `<span class="pdp__tag pdp__tag--fits">Fits ${getDeviceTags(p.collections).join(' · ')}</span>` : ''}
        </div>
        ${swatches}
        <button class="btn btn--cart" id="pdpAtc">Add to Cart — ${formatPrice(getEffectivePrice(p.price))}</button>
        <div class="pdp__trust">
          <div>🚚 AU Shipping</div>
          <div>💳 PayPal checkout</div>
          <div>↩️ 30-Day Returns</div>
          <div>✓ In Stock</div>
        </div>
        <div class="pdp__desc">${p.description}</div>
      </div>`;

    $('#pdpMainImg')?.closest('.pdp')?.querySelectorAll('.pdp__thumb').forEach((t) => {
      t.addEventListener('click', () => {
        $('#pdpMainImg').src = p.images[+t.dataset.idx];
        $$('.pdp__thumb').forEach((x) => x.classList.remove('active'));
        t.classList.add('active');
      });
    });

    $$('.variant-swatch').forEach((s) => {
      s.addEventListener('click', () => {
        selectedVariant = p.variants[+s.dataset.idx];
        $$('.variant-swatch').forEach((x) => x.classList.remove('active'));
        s.classList.add('active');
      });
    });

    $('#pdpAtc')?.addEventListener('click', (e) => {
      const rect = e.target.getBoundingClientRect();
      window.DabLabsFX?.burstSmoke(rect.left + rect.width / 2, rect.top);
      addToCart(p, selectedVariant);
    });
    window.DabLabsFX?.observeReveals($('#pdp'));
  }

  function addToCart(product, variant = null) {
    const key = product.slug + (variant ? `-${variant.label}` : '');
    const existing = cart.find((i) => i.key === key);
    if (existing) existing.qty++;
    else cart.push({ key, slug: product.slug, name: product.name, price: product.price, image: product.image, variant: variant?.label || null, qty: 1 });
    saveCart();
    openCart();
  }

  function updateCartUI() {
    const count = cart.reduce((s, i) => s + i.qty, 0);
    $('#cartCount').textContent = count;
    const subtotal = getCartSubtotal();
    const savings = getSaleSavings();
    $('#cartTotal').textContent = savings > 0
      ? `${formatPrice(subtotal)} AUD (saved ${formatPrice(savings)})`
      : `${formatPrice(subtotal)} AUD`;

    const remaining = Math.max(0, FREE_SHIP - subtotal);
    const pct = Math.min(100, (subtotal / FREE_SHIP) * 100);
    $('#shippingFill').style.width = `${pct}%`;
    $('#shippingMsg').innerHTML = remaining > 0
      ? `Add <strong>${formatPrice(remaining)}</strong> for free shipping!`
      : '🎉 You qualify for <strong>free shipping</strong>!';

    const items = $('#cartItems');
    if (!cart.length) {
      items.innerHTML = '<div class="cart-empty"><p>Your cart is empty</p><p style="margin-top:0.8rem;font-size:1.3rem">Browse our Puffco accessories →</p></div>';
      return;
    }
    items.innerHTML = cart.map((item, idx) => `
      <div class="cart-item">
        <div class="cart-item__img"><img src="${item.image}" alt=""></div>
        <div>
          <div class="cart-item__name">${item.name}</div>
          ${item.variant ? `<div class="cart-item__variant">${item.variant}</div>` : ''}
          <div class="cart-item__price">${isSaleActive() ? priceHTML(item.price) + ' × ' : formatPrice(item.price) + ' × '}${item.qty}</div>
        </div>
        <button class="cart-item__remove" data-rm="${idx}">×</button>
      </div>`).join('');

    items.querySelectorAll('[data-rm]').forEach((btn) => {
      btn.addEventListener('click', () => { cart.splice(+btn.dataset.rm, 1); saveCart(); });
    });
  }

  function openCart() {
    const overlay = $('#cartOverlay');
    overlay.hidden = false;
    requestAnimationFrame(() => overlay.classList.add('is-open'));
    $('#cartDrawer').classList.add('open');
    $('#cartDrawer').setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeCart() {
    const overlay = $('#cartOverlay');
    overlay.classList.remove('is-open');
    $('#cartDrawer').classList.remove('open');
    $('#cartDrawer').setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    setTimeout(() => { overlay.hidden = true; }, 350);
  }

  function updateNavActive(filter) {
    $$('.nav-chip[data-filter]').forEach((c) => {
      c.classList.toggle('active', c.dataset.filter === filter);
    });
    $$('.nav-chip[data-chip]').forEach((c) => {
      c.classList.toggle('active', c.dataset.chip === filter);
    });
  }

  function renderNav() {
    const nav = $('#mainNav');
    PRODUCT_TYPES.forEach((cat) => {
      if (!countInCategory(cat)) return;
      const btn = document.createElement('button');
      btn.className = 'nav-chip';
      btn.dataset.filter = cat;
      btn.textContent = cat;
      nav.appendChild(btn);
    });

    const mobileNav = $('#mobileNav');
    const footerNav = $('#footerNav');

    const addMobileLink = (cat, label) => {
      const mb = document.createElement('button');
      mb.textContent = label;
      mb.addEventListener('click', () => { closeDrawer(); cat === 'all' ? showHome() : showShop(cat); });
      mobileNav.appendChild(mb);
    };

    addMobileLink('all', 'Shop All');
    PRODUCT_TYPES.forEach((cat) => {
      if (!countInCategory(cat)) return;
      addMobileLink(cat, cat);
      const fa = document.createElement('a');
      fa.href = '#';
      fa.textContent = cat;
      fa.className = 'footer__link';
      fa.addEventListener('click', (e) => { e.preventDefault(); showShop(cat); });
      footerNav.appendChild(fa);
    });

    const deviceLabel = document.createElement('p');
    deviceLabel.className = 'mobile-drawer__label';
    deviceLabel.textContent = 'Fits your rig';
    mobileNav.appendChild(deviceLabel);
    DEVICE_TAGS.forEach((cat) => {
      if (!countInCategory(cat)) return;
      addMobileLink(cat, cat);
    });
  }

  function renderCatTiles() {
    const tiles = PRODUCT_TYPES
      .map((name) => ({ name, count: countInCategory(name) }))
      .filter((c) => c.count > 0);
    $('#catTiles').innerHTML = tiles.map((c, i) => `
      <button class="cat-tile reveal" data-filter="${c.name}" style="--i:${i}">
        <div class="cat-tile__icon">${ICONS[c.name] || '🔥'}</div>
        <h3>${c.name}</h3>
        <span>${c.count} item${c.count !== 1 ? 's' : ''}</span>
      </button>`).join('');
    window.DabLabsFX?.observeReveals($('#catTiles'));
  }

  function renderFilterChips(active) {
    const typeChips = PRODUCT_TYPES.filter((c) => countInCategory(c));
    const deviceChips = DEVICE_TAGS.filter((c) => countInCategory(c));
    const chips = [
      { id: 'all', label: 'All' },
      ...typeChips.map((c) => ({ id: c, label: c })),
      ...deviceChips.map((c) => ({ id: c, label: c, device: true })),
    ];
    $('#filterChips').innerHTML = chips.map((c) =>
      `<button class="nav-chip${c.device ? ' nav-chip--device' : ''}${c.id === active ? ' active' : ''}" data-chip="${c.id}">${c.label}</button>`
    ).join('');
    $('#filterChips').querySelectorAll('[data-chip]').forEach((btn) => {
      btn.addEventListener('click', () => showShop(btn.dataset.chip));
    });
  }

  function closeDrawer() {
    $('#mobileDrawer').hidden = true;
    if (!$('#cartDrawer').classList.contains('open')) {
      document.body.style.overflow = '';
    }
  }

  function handleFilterClick(filter) {
    showShop(filter);
  }

  function syncSearchInputs(value) {
    searchQuery = value;
    $('#searchInput').value = value;
    const mobileSearch = $('#mobileSearchInput');
    if (mobileSearch) mobileSearch.value = value;
  }

  function initEofyCountdown() {
    const banner = $('#eofyBanner');
    const el = $('#eofyCountdown');
    const heroSale = $('#heroSaleTag');
    if (!banner || !el || !SALE_ENDS) return;

    function syncSaleUI() {
      const active = isSaleActive();
      banner.hidden = !active;
      if (heroSale) heroSale.hidden = !active;
      document.body.classList.toggle('sale-active', active);
      if (!active) {
        el.textContent = 'Ended';
        return false;
      }
      return true;
    }

    function tick() {
      if (!syncSaleUI()) return;
      const left = Math.max(0, SALE_ENDS - Date.now());
      const s = Math.floor(left / 1000);
      const d = Math.floor(s / 86400);
      const h = Math.floor((s % 86400) / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = s % 60;
      el.textContent = d > 0
        ? `${d}d ${pad2(h)}h ${pad2(m)}m ${pad2(sec)}s`
        : `${pad2(h)}h ${pad2(m)}m ${pad2(sec)}s`;
    }

    tick();
    setInterval(tick, 1000);
  }

  // Init
  initEofyCountdown();
  renderNav();
  renderCatTiles();
  renderGrid($('#limitedGrid'), getLimited().length ? getLimited() : products.slice(0, 4));
  renderGrid($('#bestsellerGrid'), getBestsellers());
  updateCartUI();

  // Events — single delegated handler for filter buttons (banner, nav, links)
  document.addEventListener('click', (e) => {
    const filterBtn = e.target.closest('[data-filter]');
    if (filterBtn && !filterBtn.closest('#filterChips')) {
      e.preventDefault();
      handleFilterClick(filterBtn.dataset.filter);
    }
  });

  document.querySelectorAll('[data-nav="home"]').forEach((el) => {
    el.addEventListener('click', (e) => { e.preventDefault(); showHome(); });
  });

  function onSearchInput(value) {
    syncSearchInputs(value);
    if (searchQuery) {
      if (!$('#mobileDrawer').hidden) closeDrawer();
      showShop(currentFilter);
    } else if (!views.shop.hidden) {
      showShop(currentFilter);
    }
  }

  $('#searchInput')?.addEventListener('input', (e) => onSearchInput(e.target.value));
  $('#mobileSearchInput')?.addEventListener('input', (e) => onSearchInput(e.target.value));

  $('#sortSelect')?.addEventListener('change', () => showShop(currentFilter));

  $('#cartBtn')?.addEventListener('click', openCart);
  $('#cartClose')?.addEventListener('click', closeCart);
  $('#cartOverlay')?.addEventListener('click', closeCart);
  $('#checkoutBtn')?.addEventListener('click', showCheckout);
  $('#checkoutForm')?.addEventListener('submit', submitCheckout);
  $('#checkoutBackBtn')?.addEventListener('click', () => { showView('shop'); openCart(); });
  $('#pendingHomeBtn')?.addEventListener('click', () => {
    resetCheckoutView();
    showHome();
  });
  $('#successHomeBtn')?.addEventListener('click', () => {
    resetCheckoutView();
    showHome();
  });
  $('#backBtn')?.addEventListener('click', () => showShop(currentFilter));

  $('#menuBtn')?.addEventListener('click', () => {
    $('#mobileDrawer').hidden = false;
    document.body.style.overflow = 'hidden';
  });
  $('#drawerClose')?.addEventListener('click', closeDrawer);
  $('#mobileDrawer')?.addEventListener('click', (e) => { if (e.target === $('#mobileDrawer')) closeDrawer(); });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if ($('#cartDrawer').classList.contains('open')) closeCart();
    else if (!$('#mobileDrawer').hidden) closeDrawer();
  });

  // Duplicate promo track for seamless scroll
  const track = $('.promo-bar__track');
  if (track) track.innerHTML += track.innerHTML;
})();