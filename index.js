const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('railway.internal') ? false : { rejectUnauthorized: false }
});

// Init table au démarrage
async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      sku TEXT PRIMARY KEY,
      name TEXT,
      config JSONB,
      margin FLOAT DEFAULT 2.5,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('✅ Table products OK');
}

// GET /products/:sku — charger une config produit
app.get('/products/:sku', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM products WHERE sku = $1', [req.params.sku]);
    if (!rows.length) return res.status(404).json({ error: 'Produit non trouvé' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /products — sauvegarder une config produit
app.post('/products', async (req, res) => {
  try {
    const { sku, name, config, margin } = req.body;
    if (!sku) return res.status(400).json({ error: 'SKU requis' });
    await pool.query(`
      INSERT INTO products (sku, name, config, margin, updated_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (sku) DO UPDATE SET name=$2, config=$3, margin=$4, updated_at=NOW()
    `, [sku, name || '', config || {}, margin || 2.5]);
    res.json({ ok: true, sku });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /products — lister tous les produits
app.get('/products', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT sku, name, margin, updated_at FROM products ORDER BY updated_at DESC');
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /products/:sku
app.delete('/products/:sku', async (req, res) => {
  try {
    await pool.query('DELETE FROM products WHERE sku = $1', [req.params.sku]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Health check
app.get('/', (req, res) => res.json({ status: 'GOODS API OK' }));

const PORT = process.env.PORT || 3000;
init().then(() => {
  app.listen(PORT, () => console.log(`🚀 GOODS API sur port ${PORT}`));
});
