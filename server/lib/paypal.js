const PAYPAL_API = {
  sandbox: 'https://api-m.sandbox.paypal.com',
  live: 'https://api-m.paypal.com',
};

let tokenCache = { token: null, expiresAt: 0 };

function getCredentials() {
  const mode = (process.env.PAYPAL_MODE || 'sandbox').toLowerCase();
  const isLive = mode === 'live';
  const clientId = isLive
    ? process.env.PAYPAL_LIVE_CLIENT_ID
    : process.env.PAYPAL_SANDBOX_CLIENT_ID;
  const clientSecret = isLive
    ? process.env.PAYPAL_LIVE_CLIENT_SECRET
    : process.env.PAYPAL_SANDBOX_CLIENT_SECRET;
  const baseUrl = PAYPAL_API[isLive ? 'live' : 'sandbox'];

  if (!clientId || !clientSecret) {
    throw new Error(
      `PayPal ${isLive ? 'live' : 'sandbox'} credentials missing. Copy .env.example to .env and add Client ID + Secret.`
    );
  }

  return { mode: isLive ? 'live' : 'sandbox', clientId, clientSecret, baseUrl };
}

function getPublicConfig() {
  const mode = (process.env.PAYPAL_MODE || 'sandbox').toLowerCase();
  const isLive = mode === 'live';
  const clientId = isLive
    ? process.env.PAYPAL_LIVE_CLIENT_ID
    : process.env.PAYPAL_SANDBOX_CLIENT_ID;
  const clientSecret = isLive
    ? process.env.PAYPAL_LIVE_CLIENT_SECRET
    : process.env.PAYPAL_SANDBOX_CLIENT_SECRET;
  const configured = Boolean(
    clientId && clientSecret
    && !String(clientId).startsWith('your_')
    && !String(clientSecret).startsWith('your_')
  );

  return {
    mode: isLive ? 'live' : 'sandbox',
    clientId: clientId || '',
    currency: 'AUD',
    configured,
    webhookPath: '/api/paypal/webhook',
    sdkBase: isLive
      ? 'https://www.paypal.com/sdk/js'
      : 'https://www.sandbox.paypal.com/sdk/js',
  };
}

async function getAccessToken() {
  const { clientId, clientSecret, baseUrl } = getCredentials();
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.token;
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || data.message || 'PayPal OAuth failed');
  }

  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  };
  return data.access_token;
}

async function paypalRequest(path, options = {}) {
  const { baseUrl } = getCredentials();
  const token = await getAccessToken();
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.message || data.error_description
      || data.details?.map((d) => d.description).join('; ')
      || `PayPal API error ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.paypal = data;
    throw err;
  }
  return data;
}

function money(value) {
  return Number(value).toFixed(2);
}

function buildPurchaseUnit(order) {
  const currency = order.currency || 'AUD';
  const itemTotal = order.items.reduce((s, i) => s + Number(i.price) * Number(i.qty), 0);
  const shipping = Number(order.shipping) || 0;
  const total = Math.round((itemTotal + shipping) * 100) / 100;

  return {
    reference_id: order.id,
    description: `Dab Labs order ${order.id}`,
    custom_id: order.id,
    soft_descriptor: 'DABLABS',
    amount: {
      currency_code: currency,
      value: money(total),
      breakdown: {
        item_total: { currency_code: currency, value: money(itemTotal) },
        shipping: { currency_code: currency, value: money(shipping) },
      },
    },
    items: order.items.map((item) => ({
      name: item.name.slice(0, 127),
      unit_amount: { currency_code: currency, value: money(item.price) },
      quantity: String(item.qty),
      sku: item.slug || item.key,
      category: 'PHYSICAL_GOODS',
    })),
    shipping: order.customer ? {
      name: { full_name: order.customer.name },
      address: {
        address_line_1: order.customer.address,
        admin_area_2: order.customer.suburb,
        admin_area_1: order.customer.state,
        postal_code: order.customer.postcode,
        country_code: 'AU',
      },
    } : undefined,
  };
}

async function createPayPalOrder(order) {
  const body = {
    intent: 'CAPTURE',
    purchase_units: [buildPurchaseUnit(order)],
    application_context: {
      brand_name: 'Dab Labs',
      landing_page: 'LOGIN',
      shipping_preference: 'SET_PROVIDED_ADDRESS',
      user_action: 'PAY_NOW',
    },
  };

  return paypalRequest('/v2/checkout/orders', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

async function capturePayPalOrder(paypalOrderId) {
  return paypalRequest(`/v2/checkout/orders/${paypalOrderId}/capture`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

async function verifyWebhookSignature(req) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) return { verified: false, reason: 'PAYPAL_WEBHOOK_ID not set' };

  const headers = req.headers;
  const body = req.body;

  try {
    const result = await paypalRequest('/v1/notifications/verify-webhook-signature', {
      method: 'POST',
      body: JSON.stringify({
        auth_algo: headers['paypal-auth-algo'],
        cert_url: headers['paypal-cert-url'],
        transmission_id: headers['paypal-transmission-id'],
        transmission_sig: headers['paypal-transmission-sig'],
        transmission_time: headers['paypal-transmission-time'],
        webhook_id: webhookId,
        webhook_event: body,
      }),
    });
    return { verified: result.verification_status === 'SUCCESS', result };
  } catch (err) {
    return { verified: false, reason: err.message };
  }
}

module.exports = {
  getPublicConfig,
  getCredentials,
  createPayPalOrder,
  capturePayPalOrder,
  verifyWebhookSignature,
};