# PayPal REST API Setup — Dab Labs

## 1. PayPal Business account

Use a **PayPal Business** account at [paypal.com](https://www.paypal.com).

## 2. Create a REST app

1. Go to [developer.paypal.com](https://developer.paypal.com)
2. **Dashboard → Apps & Credentials**
3. **Create App** → name it e.g. `Dab Labs Website Checkout`
4. Start with **Sandbox** (test mode)

## 3. Copy credentials into `.env`

```bash
cd dablabs-store
copy .env.example .env
```

Edit `.env`:

```env
PAYPAL_MODE=sandbox
PAYPAL_SANDBOX_CLIENT_ID=paste_sandbox_client_id_here
PAYPAL_SANDBOX_CLIENT_SECRET=paste_sandbox_client_secret_here
```

**Never** put Client Secret in `checkout-config.js` or any frontend file.

## 4. Run the store

```bash
npm install
npm start
```

Open **http://localhost:3000** — checkout uses the PayPal Smart Payment Buttons.

## 5. Webhook (payment completed callbacks)

PayPal needs a **public HTTPS URL** to notify your server when payment completes.

### Local testing (ngrok)

```bash
ngrok http 3000
```

In PayPal Developer → your app → **Webhooks → Add Webhook**:

| Field | Value |
|-------|--------|
| URL | `https://YOUR-ID.ngrok-free.app/api/paypal/webhook` |
| Events | `Checkout order approved`, `Payment capture completed`, `Payment capture denied` |

Copy the **Webhook ID** into `.env`:

```env
PAYPAL_WEBHOOK_ID=your_webhook_id
```

### Production (dablabs.com.au)

```
https://dablabs.com.au/api/paypal/webhook
```

## 6. Go live

1. Test a full Sandbox checkout (use PayPal sandbox buyer account)
2. In Developer Dashboard, switch to **Live** credentials
3. Update `.env`:

```env
PAYPAL_MODE=live
PAYPAL_LIVE_CLIENT_ID=...
PAYPAL_LIVE_CLIENT_SECRET=...
```

4. Register the live webhook URL
5. Deploy the Node server (Vercel, Railway, VPS, etc.) with `.env` set

## API endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/paypal/config` | Public Client ID + mode (safe for browser) |
| `POST /api/paypal/create-order` | Creates PayPal order (server uses Client Secret) |
| `POST /api/paypal/capture-order` | Captures payment after buyer approves |
| `POST /api/paypal/webhook` | PayPal payment status callbacks |

Orders are saved to `server/data/orders.json`.

## Card payments (Visa, Mastercard, Amex)

**Do not** build your own card number form — that requires PCI DSS compliance.

This store uses **PayPal hosted checkout** for cards:
- Customer clicks **Debit or Credit Card**
- Card details are entered on **PayPal's secure popup** (not your site)
- Your server only creates/captures the order via REST API

### Enable cards on your PayPal Business account

1. Log into [paypal.com](https://www.paypal.com) (business account)
2. **Settings → Payments → Website payments**
3. Ensure **PayPal Checkout** and **Advanced Credit and Debit Card Payments** are enabled
4. In Sandbox, test with PayPal's sandbox card numbers

If the card button doesn't appear, your PayPal account may need card processing approved for AU.

### Other options later

| Option | Best for |
|--------|----------|
| **PayPal (current)** | PayPal balance + cards + Pay in 4 — one integration |
| **Shopify Payments** | When you move to Shopify — cards, Afterpay, Zip built-in |
| **Stripe Checkout** | Separate add-on if you want Stripe-specific features |