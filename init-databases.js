const Database = require("better-sqlite3");
const duckdb = require("duckdb");
const fs = require("fs");
const path = require("path");

async function initializeDatabases() {
  return new Promise((resolve, reject) => {
    console.log("Initializing databases...\n");

    try {
      // Initialize SQLite
      console.log("=== SQLite Setup ===");
      console.time("SQLite total setup");

      const sqliteDb = new Database("./db/analytics.db");
      sqliteDb.pragma("journal_mode = WAL");
      sqliteDb.pragma("synchronous = NORMAL");
      sqliteDb.pragma("cache_size = -64000"); // 64MB cache

      console.log("Creating SQLite tables...");
      sqliteDb.exec(`
  DROP TABLE IF EXISTS orders;
  DROP TABLE IF EXISTS customers;
  DROP TABLE IF EXISTS products;

  CREATE TABLE customers (
    customer_id INTEGER PRIMARY KEY,
    name TEXT,
    email TEXT,
    country TEXT,
    signup_date DATE
  );

  CREATE TABLE products (
    product_id INTEGER PRIMARY KEY,
    name TEXT,
    category TEXT,
    price REAL
  );

  CREATE TABLE orders (
    order_id INTEGER PRIMARY KEY,
    customer_id INTEGER,
    product_id INTEGER,
    quantity INTEGER,
    order_date DATE,
    total_amount REAL,
    order_month TEXT GENERATED ALWAYS AS (strftime('%Y-%m', order_date)) STORED,
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id),
    FOREIGN KEY (product_id) REFERENCES products(product_id)
  );
`);

      // Load data into SQLite
      console.log("Loading customers into SQLite...");
      console.time("SQLite customers");
      const customersData = fs.readFileSync("./data/customers.csv", "utf-8").split("\n").slice(1);
      const insertCustomer = sqliteDb.prepare("INSERT INTO customers VALUES (?, ?, ?, ?, ?)");
      const insertManyCustomers = sqliteDb.transaction((customers) => {
        for (const line of customers) {
          if (line.trim()) {
            const [id, name, email, country, date] = line.split(",");
            insertCustomer.run(parseInt(id), name, email, country, date);
          }
        }
      });
      insertManyCustomers(customersData);
      console.timeEnd("SQLite customers");

      console.log("Loading products into SQLite...");
      console.time("SQLite products");
      const productsData = fs.readFileSync("./data/products.csv", "utf-8").split("\n").slice(1);
      const insertProduct = sqliteDb.prepare("INSERT INTO products VALUES (?, ?, ?, ?)");
      const insertManyProducts = sqliteDb.transaction((products) => {
        for (const line of products) {
          if (line.trim()) {
            const [id, name, category, price] = line.split(",");
            insertProduct.run(parseInt(id), name, category, parseFloat(price));
          }
        }
      });
      insertManyProducts(productsData);
      console.timeEnd("SQLite products");

      console.log("Loading orders into SQLite (this will take a while)...");
      console.time("SQLite orders");
      const insertOrder = sqliteDb.prepare(
        "INSERT INTO orders (order_id, customer_id, product_id, quantity, order_date, total_amount) VALUES (?, ?, ?, ?, ?, ?)"
      );
      const insertManyOrders = sqliteDb.transaction((orders) => {
        for (const line of orders) {
          if (line.trim()) {
            const [id, custId, prodId, qty, date, amount] = line.split(",");
            insertOrder.run(
              parseInt(id),
              parseInt(custId),
              parseInt(prodId),
              parseInt(qty),
              date,
              parseFloat(amount)
            );
          }
        }
      });

      // Process orders in chunks to avoid memory issues
      const ordersFile = fs.readFileSync("./data/orders.csv", "utf-8");
      const ordersLines = ordersFile.split("\n").slice(1);
      const CHUNK_SIZE = 100000;
      for (let i = 0; i < ordersLines.length; i += CHUNK_SIZE) {
        const chunk = ordersLines.slice(i, i + CHUNK_SIZE);
        insertManyOrders(chunk);
        console.log(
          `  Loaded ${Math.min(i + CHUNK_SIZE, ordersLines.length).toLocaleString()} orders...`
        );
      }
      console.timeEnd("SQLite orders");

      console.log("Creating SQLite indexes...");
      console.time("SQLite indexes");
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

  -- Comprehensive covering index for Category Performance Analysis query
  CREATE INDEX idx_orders_product_complete ON orders(product_id, customer_id, quantity, total_amount, order_date);

  -- Optimized covering index for Monthly Sales Trends query
  CREATE INDEX idx_orders_date_customer_id_amount ON orders(order_date DESC, customer_id, total_amount);

  -- Generated month column index for Monthly Sales Trends
  CREATE INDEX idx_orders_month_customer ON orders(order_month, customer_id);
  CREATE INDEX idx_orders_month_customer_order_amount ON orders(order_month, customer_id, order_id, total_amount);
`);
      console.timeEnd("SQLite indexes");

      console.log("Building monthly sales summary (pre-aggregated)...");
      console.time("SQLite monthly summary");
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
      console.timeEnd("SQLite monthly summary");

      console.log("Running ANALYZE for query optimization...");
      sqliteDb.exec("ANALYZE;");

      console.log("Creating FTS5 virtual tables for full-text search...");
      console.time("FTS5 index creation");
      sqliteDb.exec(`
  -- Drop existing FTS tables if they exist
  DROP TABLE IF EXISTS customers_fts;
  DROP TABLE IF EXISTS products_fts;
  DROP TABLE IF EXISTS orders_fts;

  -- Create FTS5 virtual tables
  CREATE VIRTUAL TABLE customers_fts USING fts5(
    customer_id UNINDEXED,
    name,
    email,
    country,
    content=customers,
    content_rowid=customer_id
  );

  CREATE VIRTUAL TABLE products_fts USING fts5(
    product_id UNINDEXED,
    name,
    category,
    content=products,
    content_rowid=product_id
  );

  -- For orders, we'll search by combining customer and product info
  CREATE VIRTUAL TABLE orders_fts USING fts5(
    order_id UNINDEXED,
    customer_name,
    product_name,
    order_date
  );

  -- Populate FTS tables
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
      console.timeEnd("FTS5 index creation");

      console.timeEnd("SQLite total setup");

      sqliteDb.close();

      // Initialize DuckDB
      console.log("\n=== DuckDB Setup ===");
      console.time("DuckDB total setup");

      const duckDb = new duckdb.Database("./db/analytics.duckdb");

      duckDb.all("SELECT 1", (err) => {
        if (err) throw err;

        console.log("Creating DuckDB tables and loading data...");
        console.time("DuckDB data load");

        const setupQueries = `
    DROP TABLE IF EXISTS orders;
    DROP TABLE IF EXISTS customers;
    DROP TABLE IF EXISTS products;

    CREATE TABLE customers AS
      SELECT * FROM read_csv_auto('./data/customers.csv');

    CREATE TABLE products AS
      SELECT * FROM read_csv_auto('./data/products.csv');

    CREATE TABLE orders AS
      SELECT
        *,
        strftime(order_date::DATE, '%Y-%m') AS order_month
      FROM read_csv_auto('./data/orders.csv');

    DROP TABLE IF EXISTS monthly_sales_summary;
    CREATE TABLE monthly_sales_summary AS
      SELECT
        order_month AS month,
        COUNT(DISTINCT customer_id) AS unique_customers,
        COUNT(order_id) AS total_orders,
        SUM(total_amount) AS revenue
      FROM orders
      GROUP BY order_month;
  `;

        duckDb.exec(setupQueries, (err) => {
          if (err) throw err;
          console.timeEnd("DuckDB data load");

          // Get row counts
          duckDb.all(
            `
      SELECT
        (SELECT COUNT(*) FROM customers) as customers,
        (SELECT COUNT(*) FROM products) as products,
        (SELECT COUNT(*) FROM orders) as orders
    `,
            (err, result) => {
              if (err) throw err;
              console.timeEnd("DuckDB total setup");

              console.log("\n=== Database Initialization Complete ===");
              console.log("SQLite database: analytics.db");
              console.log("DuckDB database: analytics.duckdb");
              console.log("\nRecord counts:");
              console.log(`  Customers: ${result[0].customers.toLocaleString()}`);
              console.log(`  Products: ${result[0].products.toLocaleString()}`);
              console.log(`  Orders: ${result[0].orders.toLocaleString()}`);

              duckDb.close();
              resolve();
            }
          );
        });
      });
    } catch (error) {
      reject(error);
    }
  });
}

// Run if called directly
if (require.main === module) {
  initializeDatabases()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Database initialization failed:", err);
      process.exit(1);
    });
}

module.exports = { initializeDatabases };
