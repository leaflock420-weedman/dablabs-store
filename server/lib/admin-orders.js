function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function money(n, currency = 'AUD') {
  return `${Number(n).toFixed(2)} ${currency}`;
}

function renderOrdersPage(orders, { mailConfigured }) {
  const rows = orders.map((o) => {
    const items = (o.items || []).map((i) => `${escapeHtml(i.name)} ×${i.qty}`).join('<br>');
    const paid = o.paidAt ? new Date(o.paidAt).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }) : '—';
    const notified = o.ownerNotifiedAt ? '✓' : '—';
    return `<tr>
      <td><strong>${escapeHtml(o.id)}</strong><br><small>${escapeHtml(o.status)}</small></td>
      <td>${paid}</td>
      <td>${escapeHtml(o.customer?.name)}<br><small>${escapeHtml(o.customer?.email)}</small></td>
      <td>${items}</td>
      <td><strong>${money(o.total, o.currency)}</strong></td>
      <td>${notified}</td>
    </tr>`;
  }).join('');

  const empty = orders.length
    ? ''
    : '<p style="color:#6B6B6B">No orders saved yet. Orders appear here after checkout.</p>';

  return `<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dab Labs — Orders</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Inter, system-ui, sans-serif; margin: 0; padding: 16px; background: #F0EBE3; color: #1A1A1A; }
    h1 { color: #1B4332; font-size: 1.5rem; margin: 0 0 8px; }
    .meta { color: #6B6B6B; font-size: 0.9rem; margin-bottom: 16px; }
    .warn { background: #fff3cd; border: 1px solid #ffc107; padding: 12px; border-radius: 8px; margin-bottom: 16px; font-size: 0.9rem; }
    .table-wrap { overflow-x: auto; background: #fff; border-radius: 12px; border: 1px solid #E0DAD0; }
    table { width: 100%; border-collapse: collapse; min-width: 720px; font-size: 0.9rem; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #E0DAD0; vertical-align: top; }
    th { background: #1B4332; color: #fff; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; }
    tr:last-child td { border-bottom: none; }
    @media (max-width: 767px) {
      body { padding: 12px; }
      h1 { font-size: 1.25rem; }
    }
  </style>
</head>
<body>
  <h1>Dab Labs orders</h1>
  <p class="meta">${orders.length} order(s) · ${mailConfigured ? 'Email alerts on' : 'Email not configured — set SMTP on Render'}</p>
  ${mailConfigured ? '' : '<div class="warn">Add SMTP_HOST, SMTP_USER, SMTP_PASS and ORDER_NOTIFY_EMAIL in Render environment variables to get emailed for each order.</div>'}
  <div class="table-wrap">
    <table>
      <thead>
        <tr><th>Order</th><th>Paid</th><th>Customer</th><th>Items</th><th>Total</th><th>Emailed</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
  ${empty}
</body>
</html>`;
}

module.exports = { renderOrdersPage };