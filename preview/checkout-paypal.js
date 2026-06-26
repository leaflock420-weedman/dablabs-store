/* PayPal REST checkout — PayPal wallet + debit/credit card */
window.DabLabsPayPal = (() => {
  let sdkPromise = null;
  let buttonInstances = [];
  let publicConfig = null;
  let initToken = 0;

  async function fetchConfig(apiBase) {
    const res = await fetch(`${apiBase}/api/paypal/config`);
    publicConfig = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(publicConfig.error || 'PayPal API not available — run npm start');
    }
    if (!publicConfig.configured) {
      throw new Error('PayPal is not configured on the server. Check Render environment variables.');
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
        'disable-funding': 'paylater,venmo,bancontact,blik,eps,giropay,ideal,mercadopago,mybank,p24,sepa,sofort',
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

  function destroyButton() {
    buttonInstances.forEach((btn) => {
      try { btn.close(); } catch { /* ignore */ }
    });
    buttonInstances = [];
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

    const token = ++initToken;
    destroyButton();
    container.innerHTML = '<p class="checkout__paypal-loading">Loading PayPal…</p>';

    try {
      const config = await fetchConfig(apiBase);
      if (token !== initToken) return;

      const paypal = await loadSdk(config);
      if (token !== initToken) return;

      container.innerHTML = '';

      const handlers = {
        createOrder: async () => {
          if (onValidate) {
            const result = onValidate();
            const check = result?.valid !== undefined ? result : { valid: !!result, missing: [] };
            if (!check.valid) {
              const msg = check.message
                || (check.missing?.length
                  ? `Please complete: ${check.missing.join(', ')}`
                  : 'Please complete all required checkout fields.');
              onError?.(msg);
              throw new Error(msg);
            }
          }

          const payload = getOrderPayload();
          const res = await fetch(`${apiBase}/api/paypal/create-order`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          const data = await res.json();
          if (!res.ok) {
            const msg = data.error || 'Could not create PayPal order';
            onError?.(msg);
            throw new Error(msg);
          }
          container.dataset.orderId = data.orderId || payload.orderId || '';
          return data.id;
        },
        onApprove: async (data) => {
          container.innerHTML = '<p class="checkout__paypal-loading">Confirming payment…</p>';
          const res = await fetch(`${apiBase}/api/paypal/capture-order`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              orderID: data.orderID,
              orderId: container.dataset.orderId || undefined,
            }),
          });
          const result = await res.json();
          if (!res.ok) {
            const msg = result.error || 'Payment capture failed';
            onError?.(msg);
            throw new Error(msg);
          }
          destroyButton();
          onSuccess(result);
        },
        onError: (err) => {
          console.error('[PayPal]', err);
          const msg = typeof err === 'string' ? err : (err?.message || 'PayPal error — please try again');
          if (!/please complete/i.test(msg)) onError?.(msg);
        },
        onCancel: () => {
          onError?.('Payment cancelled — choose PayPal or Pay with card when you\'re ready.');
        },
      };

      const buttonStyle = { layout: 'vertical', shape: 'rect', height: 48 };
      const sources = [
        { source: paypal.FUNDING.PAYPAL, style: { ...buttonStyle, color: 'gold', label: 'paypal' } },
        { source: paypal.FUNDING.CARD, style: { ...buttonStyle, color: 'black', label: 'pay' } },
      ];

      let rendered = 0;
      for (const { source, style } of sources) {
        const btn = paypal.Buttons({ ...handlers, fundingSource: source, style });
        if (!btn.isEligible()) continue;
        await btn.render(container);
        buttonInstances.push(btn);
        rendered += 1;
      }

      if (!rendered) {
        container.innerHTML = '<p class="checkout__config-warn">PayPal checkout is not available in this browser. Try Chrome or Safari.</p>';
        return;
      }
    } catch (err) {
      if (token !== initToken) return;
      container.innerHTML = `<p class="checkout__config-warn">${err.message}</p>`;
      onError?.(err.message);
    }
  }

  function reset(container) {
    initToken++;
    destroyButton();
    if (container) container.innerHTML = '';
  }

  return { init, reset, getConfig: () => publicConfig };
})();