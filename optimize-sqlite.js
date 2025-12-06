const Database = require("better-sqlite3");

console.log("🔧 Optimizing SQLite database...\n");

const sqliteDb = new Database("./analytics.db");

// Drop existing indexes first (except primary keys)
console.log("Dropping old indexes...");
sqliteDb.exec(`
  DROP INDEX IF EXISTS idx_orders_customer;
  DROP INDEX IF EXISTS idx_orders_product;
  DROP INDEX IF EXISTS idx_orders_date;
  DROP INDEX IF EXISTS idx_customers_country;
  DROP INDEX IF EXISTS idx_products_category;
  DROP INDEX IF EXISTS idx_orders_customer_date_amount;
  DROP INDEX IF EXISTS idx_orders_product_qty_amount;
  DROP INDEX IF EXISTS idx_orders_date_customer_amount;
  DROP INDEX IF EXISTS idx_orders_date_customer_product;
  DROP INDEX IF EXISTS idx_products_category_name;
`);

console.log("Creating optimized indexes...");
console.time("Index creation");

sqliteDb.exec(`
  -- Single column indexes for foreign keys
  CREATE INDEX idx_orders_customer ON orders(customer_id);
  CREATE INDEX idx_orders_product ON orders(product_id);
  CREATE INDEX idx_orders_date ON orders(order_date);
  CREATE INDEX idx_customers_country ON customers(country);
  CREATE INDEX idx_products_category ON products(category);

  -- Multi-column covering indexes for specific queries
  -- For joins with customers and aggregations by country
  CREATE INDEX idx_orders_customer_date_amount ON orders(customer_id, order_date, total_amount);

  -- For joins with products and aggregations by category
  CREATE INDEX idx_orders_product_qty_amount ON orders(product_id, quantity, total_amount);

  -- For date-range queries with aggregations
  CREATE INDEX idx_orders_date_customer_amount ON orders(order_date, customer_id, total_amount);

  -- For complex multi-join queries
  CREATE INDEX idx_orders_date_customer_product ON orders(order_date, customer_id, product_id);

  -- Covering index for product category joins
  CREATE INDEX idx_products_category_name ON products(category, name, product_id);
`);

console.timeEnd("Index creation");

console.log("Running ANALYZE for query optimization...");
console.time("ANALYZE");
sqliteDb.exec("ANALYZE;");
console.timeEnd("ANALYZE");

console.log("Running VACUUM to optimize database file...");
console.time("VACUUM");
sqliteDb.exec("VACUUM;");
console.timeEnd("VACUUM");

// Show index information
console.log("\n📊 Index Summary:");
const indexes = sqliteDb
  .prepare(
    `
  SELECT name, tbl_name
  FROM sqlite_master
  WHERE type='index' AND name NOT LIKE 'sqlite_%'
  ORDER BY tbl_name, name
`
  )
  .all();

const byTable = {};
indexes.forEach((idx) => {
  if (!byTable[idx.tbl_name]) byTable[idx.tbl_name] = [];
  byTable[idx.tbl_name].push(idx.name);
});

Object.keys(byTable).forEach((table) => {
  console.log(`\n  ${table}: ${byTable[table].length} indexes`);
  byTable[table].forEach((idx) => console.log(`    - ${idx}`));
});

sqliteDb.close();

console.log("\n✅ SQLite optimization complete!\n");
console.log("Run 'npm run benchmark' to test the performance improvement.");
