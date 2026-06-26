const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(ORDERS_FILE)) fs.writeFileSync(ORDERS_FILE, '[]');
}

function readOrders() {
  ensureStore();
  try {
    const list = JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeOrders(orders) {
  ensureStore();
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
}

function saveOrder(order) {
  const orders = readOrders();
  const idx = orders.findIndex((o) => o.id === order.id);
  if (idx >= 0) orders[idx] = { ...orders[idx], ...order };
  else orders.unshift(order);
  writeOrders(orders.slice(0, 500));
  return order;
}

function findOrder(id) {
  return readOrders().find((o) => o.id === id) || null;
}

function updateOrderByPayPalId(paypalOrderId, patch) {
  const orders = readOrders();
  const idx = orders.findIndex((o) => o.paypalOrderId === paypalOrderId);
  if (idx < 0) return null;
  orders[idx] = { ...orders[idx], ...patch, updatedAt: new Date().toISOString() };
  writeOrders(orders);
  return orders[idx];
}

function updateOrderById(orderId, patch) {
  const orders = readOrders();
  const idx = orders.findIndex((o) => o.id === orderId);
  if (idx < 0) return null;
  orders[idx] = { ...orders[idx], ...patch, updatedAt: new Date().toISOString() };
  writeOrders(orders);
  return orders[idx];
}

module.exports = {
  saveOrder,
  findOrder,
  updateOrderByPayPalId,
  updateOrderById,
  readOrders,
};