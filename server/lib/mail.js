const nodemailer = require('nodemailer');

let transporter = null;

function getMailConfig() {
  const host = process.env.SMTP_HOST || '';
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASS || '';
  const port = Number(process.env.SMTP_PORT || 587);
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'Dab Labs Store';
  const notifyRaw = process.env.ORDER_NOTIFY_EMAIL || process.env.STORE_EMAIL || '';
  const notifyTo = notifyRaw.split(',').map((s) => s.trim()).filter(Boolean);

  return {
    configured: Boolean(host && user && pass && notifyTo.length),
    host,
    user,
    pass,
    port,
    secure: process.env.SMTP_SECURE === 'true' || port === 465,
    from,
    notifyTo,
    sendCustomerReceipt: process.env.SEND_CUSTOMER_RECEIPT !== 'false',
  };
}

function getTransporter() {
  const cfg = getMailConfig();
  if (!cfg.configured) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: { user: cfg.user, pass: cfg.pass },
    });
  }
  return transporter;
}

function money(n, currency = 'AUD') {
  return `${Number(n).toFixed(2)} ${currency}`;
}

function formatAddress(customer = {}) {
  return [
    customer.name,
    customer.address,
    `${customer.suburb || ''} ${customer.state || ''} ${customer.postcode || ''}`.trim(),
    customer.phone,
    customer.email,
  ].filter(Boolean).join('\n');
}

function buildOrderLines(order) {
  return (order.items || []).map((item) => {
    const line = money(item.price * item.qty, order.currency);
    const variant = item.variant ? ` (${item.variant})` : '';
    return `• ${item.name}${variant} × ${item.qty} — ${line}`;
  }).join('\n');
}

function buildOrderHtml(order) {
  const items = (order.items || []).map((item) => {
    const variant = item.variant ? ` <span style="color:#6B6B6B">(${item.variant})</span>` : '';
    return `<tr>
      <td style="padding:8px 0;border-bottom:1px solid #E0DAD0">${item.name}${variant}<br><small>Qty ${item.qty}</small></td>
      <td style="padding:8px 0;border-bottom:1px solid #E0DAD0;text-align:right;font-weight:700">${money(item.price * item.qty, order.currency)}</td>
    </tr>`;
  }).join('');

  const discount = order.discount > 0
    ? `<tr><td style="padding:6px 0;color:#6B6B6B">${order.discountLabel || 'Discount'}</td><td style="text-align:right;color:#E07A3D">−${money(order.discount, order.currency)}</td></tr>`
    : '';

  return `<!DOCTYPE html><html><body style="font-family:Inter,Arial,sans-serif;background:#F0EBE3;padding:24px;color:#1A1A1A">
    <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #E0DAD0;border-radius:12px;padding:28px">
      <h1 style="margin:0 0 8px;color:#1B4332;font-size:24px">New paid order — ${order.id}</h1>
      <p style="margin:0 0 20px;color:#6B6B6B">${new Date(order.paidAt || order.createdAt).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })} AEST</p>
      <h2 style="font-size:16px;color:#1B4332;margin:24px 0 8px">Customer</h2>
      <pre style="white-space:pre-wrap;font-family:inherit;background:#F0EBE3;padding:12px;border-radius:8px;margin:0">${formatAddress(order.customer)}</pre>
      ${order.notes ? `<p style="margin:16px 0 0"><strong>Notes:</strong> ${order.notes}</p>` : ''}
      <h2 style="font-size:16px;color:#1B4332;margin:24px 0 8px">Items</h2>
      <table style="width:100%;border-collapse:collapse">${items}</table>
      <table style="width:100%;margin-top:12px">
        <tr><td style="padding:6px 0;color:#6B6B6B">Subtotal</td><td style="text-align:right">${money(order.subtotal, order.currency)}</td></tr>
        ${discount}
        <tr><td style="padding:6px 0;color:#6B6B6B">Shipping (${order.shippingMethod || 'standard'})</td><td style="text-align:right">${order.shipping === 0 ? 'Free' : money(order.shipping, order.currency)}</td></tr>
        <tr><td style="padding:12px 0 0;font-size:18px;font-weight:700">Total</td><td style="padding:12px 0 0;text-align:right;font-size:22px;font-weight:800;color:#1B4332">${money(order.total, order.currency)}</td></tr>
      </table>
      ${order.paypalCaptureId ? `<p style="margin-top:20px;font-size:13px;color:#6B6B6B">PayPal ref: ${order.paypalCaptureId}</p>` : ''}
    </div>
  </body></html>`;
}

function buildOrderText(order) {
  return [
    `New paid order — ${order.id}`,
    `Paid: ${new Date(order.paidAt || order.createdAt).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })} AEST`,
    '',
    'CUSTOMER',
    formatAddress(order.customer),
    order.notes ? `\nNotes: ${order.notes}` : '',
    '',
    'ITEMS',
    buildOrderLines(order),
    '',
    `Subtotal: ${money(order.subtotal, order.currency)}`,
    order.discount > 0 ? `Discount: −${money(order.discount, order.currency)}` : '',
    `Shipping: ${order.shipping === 0 ? 'Free' : money(order.shipping, order.currency)}`,
    `TOTAL: ${money(order.total, order.currency)}`,
    order.paypalCaptureId ? `PayPal ref: ${order.paypalCaptureId}` : '',
  ].filter(Boolean).join('\n');
}

function buildCustomerHtml(order) {
  return `<!DOCTYPE html><html><body style="font-family:Inter,Arial,sans-serif;background:#F0EBE3;padding:24px">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:28px">
      <h1 style="color:#1B4332">Thanks for your order!</h1>
      <p>Hi ${order.customer?.name || 'there'}, we've received your payment for order <strong>${order.id}</strong>.</p>
      <p>We'll pack and ship your order soon. Total paid: <strong>${money(order.total, order.currency)}</strong></p>
      <p style="color:#6B6B6B;font-size:14px">Questions? Reply to this email or contact hello@dablabs.com.au</p>
    </div>
  </body></html>`;
}

async function sendMail({ to, subject, text, html }) {
  const cfg = getMailConfig();
  const transport = getTransporter();
  if (!transport) {
    console.warn('[mail] SMTP not configured — email not sent:', subject);
    return { sent: false, reason: 'not_configured' };
  }

  await transport.sendMail({
    from: cfg.from,
    to,
    subject,
    text,
    html,
  });
  return { sent: true };
}

async function sendOrderNotifications(order) {
  const cfg = getMailConfig();
  if (!cfg.configured) {
    return { owner: false, customer: false, reason: 'not_configured' };
  }

  const subject = `Dab Labs order ${order.id} — ${money(order.total, order.currency)} paid`;
  const text = buildOrderText(order);
  const html = buildOrderHtml(order);

  const results = { owner: false, customer: false };

  await sendMail({ to: cfg.notifyTo.join(', '), subject, text, html });
  results.owner = true;

  const customerEmail = order.customer?.email;
  if (cfg.sendCustomerReceipt && customerEmail && !/@(business|personal)\.example\.com$/i.test(customerEmail)) {
    try {
      await sendMail({
        to: customerEmail,
        subject: `Your Dab Labs order ${order.id} is confirmed`,
        text: `Thanks ${order.customer.name}! Your order ${order.id} is confirmed. Total: ${money(order.total, order.currency)}. We'll email when it ships.`,
        html: buildCustomerHtml(order),
      });
      results.customer = true;
    } catch (err) {
      console.error('[mail] customer receipt failed:', err.message);
    }
  }

  return results;
}

module.exports = {
  getMailConfig,
  sendOrderNotifications,
};