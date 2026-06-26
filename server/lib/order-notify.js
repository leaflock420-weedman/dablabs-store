const { sendOrderNotifications, getMailConfig } = require('./mail');
const { updateOrderById } = require('./orders-store');

const pending = new Set();

function shouldNotify(order) {
  return order && order.status === 'paid' && !order.ownerNotifiedAt;
}

function queueOrderNotifications(order) {
  if (!shouldNotify(order) || pending.has(order.id)) return;
  pending.add(order.id);

  sendOrderNotifications(order)
    .then((result) => {
      if (result.owner) {
        updateOrderById(order.id, {
          ownerNotifiedAt: new Date().toISOString(),
          customerNotifiedAt: result.customer ? new Date().toISOString() : null,
        });
        console.log(`[mail] Order ${order.id} — owner notified${result.customer ? ', customer receipt sent' : ''}`);
      } else if (result.reason === 'not_configured') {
        console.warn(`[mail] Order ${order.id} paid but SMTP not configured on server`);
      }
    })
    .catch((err) => {
      console.error(`[mail] Order ${order.id} notification failed:`, err.message);
    })
    .finally(() => {
      pending.delete(order.id);
    });
}

module.exports = {
  queueOrderNotifications,
  getMailConfig,
};