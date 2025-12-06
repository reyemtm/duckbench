const Database = require("better-sqlite3");

console.log("\n🔧 Adding/Updating SQLite Indexes\n");
console.log("=".repeat(80));

const sqliteDb = new Database("./analytics.db");

// Ensure month column exists for monthly trends query
const hasOrderMonth = sqliteDb
  .prepare("PRAGMA table_info(orders);")
  .all()
  .some((col) => col.name === "order_month");

if (!hasOrderMonth) {
  console.log("\n🛠  Adding order_month column to orders (with backfill)...");
  try {
    // Adding a generated column via ALTER is not supported in SQLite; fall back to plain column and backfill
    sqliteDb.exec("ALTER TABLE orders ADD COLUMN order_month TEXT;");
    sqliteDb.exec("UPDATE orders SET order_month = strftime('%Y-%m', order_date);");
  } catch (err) {
    console.error("Failed to add/backfill order_month:", err.message);
    process.exit(1);
  }
} else {
  console.log("\n🔄 Refreshing order_month backfill (ensure no NULLs)...");
  sqliteDb.exec(
    "UPDATE orders SET order_month = strftime('%Y-%m', order_date) WHERE order_month IS NULL;"
  );
}

// Get all existing indexes (excluding primary key and internal indexes)
const existingIndexes = sqliteDb
  .prepare(
    `
    SELECT name FROM sqlite_master
    WHERE type='index'
    AND name NOT LIKE 'sqlite_%'
    AND sql IS NOT NULL
  `
  )
  .all();

console.log(`\n📋 Found ${existingIndexes.length} existing indexes`);
existingIndexes.forEach((idx) => {
  console.log(`  • ${idx.name}`);
});

console.log("\n📊 Creating missing indexes (if any)...");
console.time("Create indexes");

sqliteDb.exec(`
  -- Single column indexes for foreign keys
  CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
  CREATE INDEX IF NOT EXISTS idx_orders_product ON orders(product_id);
  CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(order_date);
  CREATE INDEX IF NOT EXISTS idx_customers_country ON customers(country);
  CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);

  -- Multi-column covering indexes for specific queries
  -- For joins with customers and aggregations by country
  CREATE INDEX IF NOT EXISTS idx_orders_customer_date_amount ON orders(customer_id, order_date, total_amount);

  -- For joins with products and aggregations by category
  CREATE INDEX IF NOT EXISTS idx_orders_product_qty_amount ON orders(product_id, quantity, total_amount);

  -- For date-range queries with aggregations
  CREATE INDEX IF NOT EXISTS idx_orders_date_customer_amount ON orders(order_date, customer_id, total_amount);

  -- For complex multi-join queries
  CREATE INDEX IF NOT EXISTS idx_orders_date_customer_product ON orders(order_date, customer_id, product_id);

  -- Covering index for product category joins
  CREATE INDEX IF NOT EXISTS idx_products_category_name ON products(category, name, product_id);

  -- Comprehensive covering index for Category Performance Analysis query
  CREATE INDEX IF NOT EXISTS idx_orders_product_complete ON orders(product_id, customer_id, quantity, total_amount, order_date);

  -- Optimized covering index for Monthly Sales Trends query
  CREATE INDEX IF NOT EXISTS idx_orders_date_customer_id_amount ON orders(order_date DESC, customer_id, total_amount);

  -- Generated month column index for Monthly Sales Trends query
  CREATE INDEX IF NOT EXISTS idx_orders_month_customer ON orders(order_month, customer_id);
  CREATE INDEX IF NOT EXISTS idx_orders_month_customer_order_amount ON orders(order_month, customer_id, order_id, total_amount);
`);

console.timeEnd("Create indexes");

console.log("\n📊 Rebuilding monthly_sales_summary (pre-aggregated)...");
console.time("Monthly summary");
sqliteDb.exec(`
  DROP TABLE IF EXISTS monthly_sales_summary;
  CREATE TABLE monthly_sales_summary AS
    SELECT
      order_month AS month,
      COUNT(DISTINCT customer_id) AS unique_customers,
      COUNT(order_id) AS total_orders,
      SUM(total_amount) AS revenue
    FROM orders
    GROUP BY order_month;

  CREATE INDEX idx_monthly_sales_summary_month ON monthly_sales_summary(month DESC);
`);
console.timeEnd("Monthly summary");

console.log("\n📈 Running ANALYZE for query optimization...");
console.time("ANALYZE");
sqliteDb.exec("ANALYZE;");
console.timeEnd("ANALYZE");

console.log("\n🔄 Creating FTS5 indexes (if missing)...");
console.time("FTS5 creation");

// Create FTS5 tables only if they don't exist
try {
  sqliteDb.exec(`
    -- Create FTS5 virtual tables (will skip if already exist)
    CREATE VIRTUAL TABLE IF NOT EXISTS customers_fts USING fts5(
      customer_id UNINDEXED,
      name,
      email,
      country,
      content=customers,
      content_rowid=customer_id
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS products_fts USING fts5(
      product_id UNINDEXED,
      name,
      category,
      content=products,
      content_rowid=product_id
    );

    -- For orders, we'll search by combining customer and product info
    CREATE VIRTUAL TABLE IF NOT EXISTS orders_fts USING fts5(
      order_id UNINDEXED,
      customer_name,
      product_name,
      order_date
    );
  `);
  console.log("  ✓ FTS5 tables created/verified");
} catch (err) {
  console.log("  ℹ FTS5 tables already exist");
}

// Check if FTS tables need to be populated
const customersFtsCount = sqliteDb.prepare("SELECT COUNT(*) as count FROM customers_fts").get();

if (customersFtsCount.count === 0) {
  console.log("  📝 Populating FTS tables...");
  sqliteDb.exec(`
    INSERT INTO customers_fts(customer_id, name, email, country)
      SELECT customer_id, name, email, country FROM customers;

    INSERT INTO products_fts(product_id, name, category)
      SELECT product_id, name, category FROM products;

    INSERT INTO orders_fts(order_id, customer_name, product_name, order_date)
      SELECT o.order_id, c.name, p.name, o.order_date
      FROM orders o
      JOIN customers c ON o.customer_id = c.customer_id
      JOIN products p ON o.product_id = p.product_id;
  `);
  console.log("  ✓ FTS tables populated");
} else {
  console.log("  ✓ FTS tables already populated");
}

console.timeEnd("FTS5 creation");

// Get final index count and database stats
const finalIndexes = sqliteDb
  .prepare(
    `
    SELECT COUNT(*) as count
    FROM sqlite_master
    WHERE type='index'
    AND name NOT LIKE 'sqlite_%'
    AND sql IS NOT NULL
  `
  )
  .get();

const ftsCount = sqliteDb
  .prepare(
    `
    SELECT COUNT(*) as count
    FROM sqlite_master
    WHERE type='table'
    AND name LIKE '%_fts'
  `
  )
  .get();

const dbStats = sqliteDb
  .prepare(
    `
    SELECT
      (SELECT COUNT(*) FROM customers) as customers,
      (SELECT COUNT(*) FROM products) as products,
      (SELECT COUNT(*) FROM orders) as orders
  `
  )
  .get();

console.log("\n" + "=".repeat(80));
console.log("✅ Index Update Complete!");
console.log("=".repeat(80));
console.log(
  `\nStandard Indexes: ${finalIndexes.count} (${finalIndexes.count - existingIndexes.length} new)`
);
console.log(`FTS5 Tables: ${ftsCount.count}`);
console.log("\nRecord counts:");
console.log(`  Customers: ${dbStats.customers.toLocaleString()}`);
console.log(`  Products: ${dbStats.products.toLocaleString()}`);
console.log(`  Orders: ${dbStats.orders.toLocaleString()}`);
console.log("\n" + "=".repeat(80) + "\n");

sqliteDb.close();
