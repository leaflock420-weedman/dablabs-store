require('dotenv').config();
const express = require('express');
const path = require('path');
const {
  getPublicConfig,
  createPayPalOrder,
  capturePayPalOrder,
  verifyWebhookSignature,
} = require('./lib/paypal');
const {
  saveOrder,
  findOrder,
  updateOrderByPayPalId,
  updateOrderById,
} = require('./lib/orders-store');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const PREVIEW_DIR = path.join(__dirname, '..', 'preview');

app.use(express.json({ limit: '1mb' }));
app.use(express.static(PREVIEW_DIR));

function generateOrderId() {
  return `DL-${Date.now().toString(36).toUpperCase()}`;
}

function validateCheckoutPayload(body) {
  const errors = [];
  if (!body?.customer?.email) errors.push('Email required');
  if (!body?.customer?.name) errors.push('Name required');
  if (!body?.customer?.address) errors.push('Address required');
  if (!body?.customer?.suburb) errors.push('Suburb required');
  if (!body?.customer?.state) errors.push('State required');
  if (!body?.customer?.postcode) errors.push('Postcode required');
  if (!Array.isArray(body?.items) || !body.items.length) errors.push('Cart is empty');
  body.items?.forEach((item, i) => {
    if (!item.name || !item.price || !item.qty) errors.push(`Invalid item at index ${i}`);
  });
  if (!body?.subtotal || !body?.total) errors.push('Order totals required');
  return errors;
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'dablabs-checkout' });
});

app.get('/api/paypal/config', (_req, res) => {
  res.json(getPublicConfig());
});

app.post('/api/paypal/create-order', async (req, res) => {
  try {
    const body = req.body || {};
    const errors = validateCheckoutPayload(body);
    if (errors.length) return res.status(400).json({ error: errors.join(', ') });

    const orderId = body.orderId || generateOrderId();
    const order = {
      id: orderId,
      createdAt: new Date().toISOString(),
      status: 'created',
      customer: body.customer,
      items: body.items,
      subtotal: body.subtotal,
      shipping: body.shipping,
      total: body.total,
      currency: body.currency || 'AUD',
      shippingMethod: body.shippingMethod || 'standard',
      notes: body.notes || '',
      returnUrl: body.returnUrl,
      cancelUrl: body.cancelUrl,
    };

    const paypalOrder = await createPayPalOrder(order);
    order.paypalOrderId = paypalOrder.id;
    order.status = 'paypal_created';
    saveOrder(order);

    res.json({
      id: paypalOrder.id,
      orderId: order.id,
      status: paypalOrder.status,
    });
  } catch (err) {
    console.error('[create-order]', err.message, err.paypal || '');
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post('/api/paypal/capture-order', async (req, res) => {
  try {
    const { orderID, orderId } = req.body || {};
    if (!orderID) return res.status(400).json({ error: 'orderID required' });

    const capture = await capturePayPalOrder(orderID);
    const captureStatus = capture.status;
    const purchaseUnit = capture.purchase_units?.[0];
    const captureDetail = purchaseUnit?.payments?.captures?.[0];
    const customId = purchaseUnit?.reference_id || purchaseUnit?.custom_id || orderId;

    const patch = {
      status: captureStatus === 'COMPLETED' ? 'paid' : captureStatus.toLowerCase(),
      paypalOrderId: orderID,
      paypalCaptureId: captureDetail?.id || null,
      paidAt: captureStatus === 'COMPLETED' ? new Date().toISOString() : null,
      payer: capture.payer || null,
    };

    let order = updateOrderByPayPalId(orderID, patch);
    if (!order && customId) order = updateOrderById(customId, patch);

    res.json({
      status: captureStatus,
      orderId: order?.id || customId,
      captureId: captureDetail?.id,
      order,
    });
  } catch (err) {
    console.error('[capture-order]', err.message, err.paypal || '');
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post('/api/paypal/webhook', async (req, res) => {
  const event = req.body;
  const eventType = event?.event_type;
  console.log('[webhook]', eventType, event?.id);

  try {
    const verification = await verifyWebhookSignature(req);
    if (!verification.verified) {
      console.warn('[webhook] signature not verified:', verification.reason);
      if (process.env.PAYPAL_WEBHOOK_ID) {
        return res.status(401).json({ error: 'Webhook verification failed' });
      }
    }

    const resource = event?.resource || {};
    const paypalOrderId = resource.id || resource.supplementary_data?.related_ids?.order_id;

    if (eventType === 'CHECKOUT.ORDER.APPROVED' && paypalOrderId) {
      updateOrderByPayPalId(paypalOrderId, { status: 'approved', webhookAt: new Date().toISOString() });
    }

    if (eventType === 'PAYMENT.CAPTURE.COMPLETED') {
      const customId = resource.custom_id || resource.invoice_id;
      const captureId = resource.id;
      if (paypalOrderId) {
        updateOrderByPayPalId(paypalOrderId, {
          status: 'paid',
          paypalCaptureId: captureId,
          paidAt: resource.create_time || new Date().toISOString(),
        });
      } else if (customId) {
        updateOrderById(customId, {
          status: 'paid',
          paypalCaptureId: captureId,
          paidAt: resource.create_time || new Date().toISOString(),
        });
      }
    }

    if (eventType === 'PAYMENT.CAPTURE.DENIED' || eventType === 'PAYMENT.CAPTURE.DECLINED') {
      if (paypalOrderId) {
        updateOrderByPayPalId(paypalOrderId, { status: 'payment_failed' });
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('[webhook]', err.message);
    res.sendStatus(500);
  }
});

app.get('/api/orders/:id', (req, res) => {
  const order = findOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json(order);
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(PREVIEW_DIR, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  let config;
  try {
    config = getPublicConfig();
  } catch (err) {
    config = { configured: false, error: err.message };
  }

  console.log(`\n  Dab Labs store → http://0.0.0.0:${PORT}`);
  console.log(`  PayPal mode: ${config.mode || 'not configured'}`);
  console.log(`  Webhook URL: http://localhost:${PORT}/api/paypal/webhook`);
  if (!config.configured) {
    console.log('\n  ⚠  Copy .env.example → .env and add PayPal Sandbox credentials\n');
  }
});