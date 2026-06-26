const fs = require('fs');
const path = require('path');

const csvPath = process.argv[2] || path.join(process.env.USERPROFILE, 'Downloads', 'catalog_products (10).csv');
const outDir = path.join(__dirname, '..', 'data');
const raw = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '');

const lines = [];
let cur = '';
let inQ = false;
for (let i = 0; i < raw.length; i++) {
  const c = raw[i];
  if (c === '"') { inQ = !inQ; cur += c; continue; }
  if ((c === '\n' || c === '\r') && !inQ) {
    if (cur.trim()) lines.push(cur);
    cur = '';
    if (c === '\r' && raw[i + 1] === '\n') i++;
    continue;
  }
  cur += c;
}
if (cur.trim()) lines.push(cur);

function parseRow(line) {
  const out = [];
  let f = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (q && line[i + 1] === '"') { f += '"'; i++; }
      else q = !q;
    } else if (c === ',' && !q) { out.push(f); f = ''; }
    else f += c;
  }
  out.push(f);
  return out;
}

const header = parseRow(lines[0]);
const idx = (n) => header.indexOf(n);

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80);
}

function stripHtml(html) {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

const PRODUCT_TYPES = [
  'Glass Tops',
  'Chambers',
  'Carb Caps',
  'Pearls',
  'Joysticks & Tethers',
  'Limited Edition',
];
const DEVICE_TAGS = ['Peak OG', 'Peak Pro', 'Proxy'];

/** Wix CSV tags that need correction (slug → primary product type). */
const SLUG_TYPE_FIXES = {
  'diamondpeak-opal-3dxl-cap': 'Carb Caps',
  'voozer-3dxl-chamber-kit-peak-pro': 'Chambers',
  'wigwag-sherlock-for-puffco-proxy': 'Glass Tops',
};

function inferProductType(name) {
  const n = name.toLowerCase();
  if (/chamber/.test(n)) return 'Chambers';
  if (/pearl/.test(n)) return 'Pearls';
  if (/joystick|tether/.test(n)) return 'Joysticks & Tethers';
  if (/\bcap\b|carb/.test(n) && !/joystick/.test(n)) return 'Carb Caps';
  if (/glass|top|recycler|attachment|sherlock|perc/.test(n)) return 'Glass Tops';
  return null;
}

function normalizeCollections(rawCols, slug, name) {
  const cols = [...new Set(rawCols.filter(Boolean))];
  let types = cols.filter((c) => PRODUCT_TYPES.includes(c));
  const devices = cols.filter((c) => DEVICE_TAGS.includes(c));

  if (SLUG_TYPE_FIXES[slug]) {
    const primary = SLUG_TYPE_FIXES[slug];
    types = types.filter((t) => t !== 'Joysticks & Tethers' || primary === 'Joysticks & Tethers');
    if (!types.includes(primary)) types.unshift(primary);
  }

  if (!types.length) {
    const inferred = inferProductType(name);
    if (inferred) types.push(inferred);
  }

  if (cols.some((c) => /limited/i.test(c)) && !types.includes('Limited Edition')) {
    types.push('Limited Edition');
  }

  return [...new Set([...types, ...devices])];
}

const products = [];
for (let i = 1; i < lines.length; i++) {
  const r = parseRow(lines[i]);
  const name = r[idx('name')];
  if (!name) continue;

  const imgs = (r[idx('productImageUrl')] || '').split(';').filter(Boolean);
  const rawCols = (r[idx('collection')] || '').split(';').filter(Boolean);
  const slug = slugify(name);
  const cols = normalizeCollections(rawCols, slug, name);
  const price = parseFloat(r[idx('price')] || '0');
  const optName = r[idx('productOptionName1')];
  const optDesc = r[idx('productOptionDescription1')];
  let variants = [];
  if (optName && optDesc) {
    variants = optDesc.split(';').map((s) => {
      const [hex, label] = s.split(':');
      return { hex: hex || '', label: label || s };
    });
  }

  const descriptionHtml = r[idx('description')] || '';
  products.push({
    id: r[idx('handleId')],
    name,
    slug,
    price,
    description: stripHtml(descriptionHtml).slice(0, 280),
    descriptionHtml,
    collections: cols,
    images: imgs.map((f) => `https://static.wixstatic.com/media/${f}/v1/fill/w_800,h_800,al_c,q_85/${f}`),
    image: imgs[0] ? `https://static.wixstatic.com/media/${imgs[0]}/v1/fill/w_600,h_600,al_c,q_85/${imgs[0]}` : null,
    variants,
    variantCount: variants.length,
    weight: parseFloat(r[idx('weight')] || '0') || 0.2,
    brand: r[idx('brand')] || 'Dab Labs',
    limited: cols.some((c) => /limited/i.test(c)),
    ribbon: r[idx('ribbon')] || '',
    inStock: (r[idx('inventory')] || 'InStock') === 'InStock',
  });
}

const collections = {};
products.forEach((p) => {
  p.collections.forEach((c) => {
    if (!collections[c]) {
      collections[c] = { name: c, handle: slugify(c), count: 0, products: [] };
    }
    collections[c].count++;
    collections[c].products.push(p.slug);
  });
});

const collectionList = [
  ...PRODUCT_TYPES.map((name) => collections[name]).filter(Boolean),
  ...DEVICE_TAGS.map((name) => collections[name]).filter(Boolean),
];

// Shopify CSV import
const shopifyRows = [['Handle', 'Title', 'Body (HTML)', 'Vendor', 'Type', 'Tags', 'Published', 'Option1 Name', 'Option1 Value', 'Variant SKU', 'Variant Grams', 'Variant Inventory Tracker', 'Variant Inventory Qty', 'Variant Inventory Policy', 'Variant Price', 'Variant Requires Shipping', 'Variant Taxable', 'Image Src', 'Image Position', 'Image Alt Text', 'Collection']];

products.forEach((p) => {
  const tags = [...p.collections, p.limited ? 'Limited Edition' : ''].filter(Boolean).join(', ');
  const type = p.collections[0] || 'Accessories';
  if (p.variants.length) {
    p.variants.forEach((v, vi) => {
      shopifyRows.push([
        p.slug,
        vi === 0 ? p.name : '',
        vi === 0 ? p.descriptionHtml : '',
        p.brand,
        type,
        tags,
        'TRUE',
        p.variants[0] ? (products.find(x => x.slug === p.slug) && 'Colour') : '',
        v.label,
        '',
        Math.round(p.weight * 1000),
        'shopify',
        '10',
        'deny',
        p.price.toFixed(2),
        'TRUE',
        'TRUE',
        vi === 0 ? p.images[0] : '',
        vi === 0 ? '1' : '',
        vi === 0 ? p.name : '',
        p.collections.join(';'),
      ]);
    });
  } else {
    shopifyRows.push([
      p.slug,
      p.name,
      p.descriptionHtml,
      p.brand,
      type,
      tags,
      'TRUE',
      '', '',
      '',
      Math.round(p.weight * 1000),
      'shopify',
      '10',
      'deny',
      p.price.toFixed(2),
      'TRUE',
      'TRUE',
      p.images[0] || '',
      '1',
      p.name,
      p.collections.join(';'),
    ]);
    p.images.slice(1).forEach((img, ii) => {
      shopifyRows.push([p.slug, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', img, String(ii + 2), p.name, '']);
    });
  }
});

function csvEscape(v) {
  const s = String(v ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const shopifyCsv = shopifyRows.map((row) => row.map(csvEscape).join(',')).join('\n');

fs.mkdirSync(outDir, { recursive: true });
const catalog = {
  products,
  collections: collectionList,
  taxonomy: { productTypes: PRODUCT_TYPES, deviceTags: DEVICE_TAGS },
};
fs.writeFileSync(path.join(outDir, 'products.json'), JSON.stringify(catalog, null, 2));
fs.writeFileSync(path.join(outDir, 'shopify-import.csv'), shopifyCsv);
fs.writeFileSync(
  path.join(__dirname, '..', 'preview', 'products-data.js'),
  `window.DABLABS_CATALOG = ${JSON.stringify(catalog)};`
);
console.log(`Parsed ${products.length} products, ${collectionList.length} collections`);