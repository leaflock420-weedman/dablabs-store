/* PayPal REST checkout — loads SDK and renders Smart Payment Buttons */
window.DabLabsPayPal = (() => {
  let sdkPromise = null;
  let buttonInstances = [];
  let publicConfig = null;

  async function fetchConfig(apiBase) {
    const res = await fetch(`${apiBase}/api/paypal/config`);
    publicConfig = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(publicConfig.error || 'PayPal API not available — run npm start');
    }
    if (!publicConfig.configured) {
      throw new Error('Add PayPal Sandbox Client ID + Client Secret to .env (see config/PAYPAL-SETUP.md)');
    }
    return publicConfig;
  }

  function loadSdk(config) {
    if (window.paypal) return Promise.resolve(window.paypal);
    if (sdkPromise) return sdkPromise;

    sdkPromise = new Promise((resolve, reject) => {
      const params = new URLSearchParams({
        'client-id': config.clientId,
        currency: config.currency || 'AUD',
        intent: 'capture',
        components: 'buttons',
        'enable-funding': 'card',
        'disable-funding': 'paylater,venmo',
      });
      const script = document.createElement('script');
      script.src = `${config.sdkBase}?${params}`;
      script.async = true;
      script.onload = () => resolve(window.paypal);
      script.onerror = () => reject(new Error('Failed to load PayPal SDK'));
      document.head.appendChild(script);
    });

    return sdkPromise;
  }

  async function init({
    apiBase = '',
    container,
    getOrderPayload,
    onSuccess,
    onError,
    onValidate,
  }) {
    if (!container) return;

    container.innerHTML = '<p class="checkout__paypal-loading">Loading PayPal…</p>';

    try {
      const config = await fetchConfig(apiBase);
      const paypal = await loadSdk(config);
      container.innerHTML = '';

      buttonInstances.forEach((btn) => { try { btn.close(); } catch { /* ignore */ } });
      buttonInstances = [];

      const sharedHandlers = {
        onClick: (_data, actions) => {
          if (onValidate && !onValidate()) return actions.reject();
          return actions.resolve();
        },
        createOrder: async () => {
          const payload = getOrderPayload();
          const res = await fetch(`${apiBase}/api/paypal/create-order`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Could not create PayPal order');
          return data.id;
        },
        onApprove: async (data) => {
          container.innerHTML = '<p class="checkout__paypal-loading">Confirming payment…</p>';
          const res = await fetch(`${apiBase}/api/paypal/capture-order`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderID: data.orderID }),
          });
          const result = await res.json();
          if (!res.ok) throw new Error(result.error || 'Payment capture failed');
          onSuccess(result);
        },
        onError: (err) => {
          console.error('[PayPal]', err);
          onError(err?.message || 'PayPal error — try again');
        },
        onCancel: () => {
          container.innerHTML = '';
          init({ apiBase, container, getOrderPayload, onSuccess, onError, onValidate });
        },
      };

      const btn = paypal.Buttons({
        ...sharedHandlers,
        style: { layout: 'vertical', color: 'blue', shape: 'rect', label: 'paypal', height: 48 },
      });

      if (!btn.isEligible()) {
        container.innerHTML = '<p class="checkout__config-warn">PayPal checkout is not available in this browser.</p>';
        return;
      }

      await btn.render(container);
      buttonInstances.push(btn);
    } catch (err) {
      container.innerHTML = `<p class="checkout__config-warn">${err.message}</p>`;
      onError?.(err.message);
    }
  }

  function reset(container) {
    buttonInstances.forEach((btn) => { try { btn.close(); } catch { /* ignore */ } });
    buttonInstances = [];
    if (container) container.innerHTML = '';
  }

  return { init, reset, getConfig: () => publicConfig };
})();