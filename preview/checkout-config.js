/**
 * CHECKOUT CONFIG
 *
 * PayPal REST API (recommended):
 *   1. Copy .env.example → .env in project root
 *   2. Add Sandbox Client ID + Client Secret from developer.paypal.com
 *   3. Run: npm install && npm start
 *   4. Open http://localhost:3000
 *
 * Client Secret stays in .env on the server — never put it in this file.
 */
window.DABLABS_CHECKOUT = {
  storeName: 'Dab Labs',
  storeEmail: 'hello@dablabs.com.au',
  currency: 'AUD',

  freeShippingThreshold: 100,
  standardShipping: 9.95,
  expressShipping: 14.95,

  paypal: {
    // 'rest' = PayPal REST API + JS SDK (requires npm start)
    // 'paypalme' | 'link' | 'business' = simple redirect fallback
    mode: 'rest',
    apiBase: '',
  },

  paymentInstructions:
    'Your payment is processed securely by PayPal. We will email you when your order ships.',

  sale: {
    label: 'EOFY SALE',
    percentOff: 30,
    endsAt: '2026-06-30T23:59:59+10:00',
  },
};