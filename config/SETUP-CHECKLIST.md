# Dab Labs — Shopify Store Setup Checklist

Replace the old Wix site at **dablabs.com.au** with a proper Shopify store for Puffco accessories.

## 1. Create the Shopify store

1. Go to [shopify.com/au](https://www.shopify.com/au) → Start free trial
2. Store name: **Dab Labs**
3. Set country: **Australia**, currency: **AUD** (auto-set)
4. Your admin URL will be something like `dablabs-au.myshopify.com`

## 2. Upload branding

**Settings → General → Store details**

| Field | Value |
|-------|-------|
| Store name | Dab Labs |
| Contact email | hello@dablabs.com.au |
| Timezone | (GMT+10:00) Sydney |

**Upload files from `brand/` folder:**

- **Logo** → `logo-canva.png` (or `logo.svg` converted to PNG)
- **Favicon** → `favicon.png` (Settings → General → scroll to favicon, or Online Store → Themes → Customize → Theme settings)

**Theme colors** (Online Store → Themes → Customize → Theme settings → Colors):

| Role | Hex |
|------|-----|
| Background | `#F5F0E8` |
| Text | `#1A1A1A` |
| Button / accent | `#E07A3D` |
| Secondary | `#1B4332` |

## 3. Currency (AUD)

Already set if you chose Australia. Verify:

**Settings → Store details → Store currency** = Australian Dollar (AUD)

## 4. Shipping zones

**Settings → Shipping and delivery**

### Profile: General shipping rates

**Zone: Australia**
- Add rate: **Standard Shipping** — $9.95 flat (orders under $100)
- Add rate: **Standard Shipping** — Free (orders $100+)
- Add rate: **Express Shipping** — $14.95 flat

Set your **shipping origin** address (where the products at your house ship from).

### Zone: International (optional, disabled for now)

When ready, add zone with NZ, US, UK, CA at $24.95 flat. See `store-settings.json` for full config.

## 5. Payment providers (critical for AU)

**Settings → Payments**

### Shopify Payments (primary)
1. Click **Complete account setup**
2. Enter ABN, business details, Australian bank account
3. Enable: **Shop Pay**, **Apple Pay**, **Google Pay**

### Afterpay
1. **Settings → Payments → Add payment method**
2. Search **Afterpay** → Install app
3. Connect your Afterpay merchant account (or apply at afterpay.com/au)
4. Enable at checkout

### Zip
1. **Settings → Payments → Add payment method**
2. Search **Zip - Buy Now Pay Later** → Install
3. Connect Zip merchant account (zip.co/business)
4. Enable at checkout

### PayPal (optional backup)
Enable PayPal Express Checkout for customers who prefer it.

## 6. Connect domain dablabs.com.au

**Settings → Domains → Connect existing domain**

1. Enter `dablabs.com.au`
2. Shopify gives you DNS records (usually CNAME `www` → `shops.myshopify.com`, A record for apex)
3. Log into your domain registrar (where you helped Michael register it)
4. Update DNS records — allow 24-48 hrs propagation
5. Set `www.dablabs.com.au` as primary domain
6. Enable **Force HTTPS**

## 7. Collections (match old Wix categories)

**Products → Collections → Create collection**

| Collection | Handle |
|------------|--------|
| Peak Tops | peak-tops |
| Proxy | proxy |
| Chambers | chambers |
| Joysticks & Tethers | joysticks-tethers |
| Limited Editions | limited-editions |
| Best Sellers | best-sellers (automated: inventory > 0, sort by best selling) |

## 8. Add products from inventory

For each item at your house:

1. **Products → Add product**
2. Title, description, photos (phone camera is fine to start)
3. Price in AUD, weight in kg (for shipping calc)
4. Inventory: set quantity, enable tracking
5. Assign to collection(s)
6. Tags: `puffco`, `peak`, `proxy`, etc.

## 9. Launch theme

From this project folder, connect and push the custom theme:

```bash
cd C:\Users\wordo\Documents\dablabs-store\theme
shopify theme dev --store dablabs-au.myshopify.com
```

Or upload `theme/` as a zip via **Online Store → Themes → Add theme → Upload zip**.

## 10. Go live

- [ ] Remove Wix site / point domain to Shopify
- [ ] Test checkout with Shopify's bogus gateway (Settings → Payments → test mode)
- [ ] Test Afterpay + Zip in sandbox mode
- [ ] Add privacy policy, refund policy, terms (Settings → Policies → auto-generate)
- [ ] Disable password protection (Online Store → Preferences)

---

**Canva logo (editable):** https://www.canva.com/d/6LVlw3h3Frj9qK4