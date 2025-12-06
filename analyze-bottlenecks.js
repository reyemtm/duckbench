const Database = require("better-sqlite3");

console.log("\n🔍 SQLite Query Analysis - Identifying Bottlenecks\n");
console.log("=".repeat(80));

const sqliteDb = new Database("./analytics.db");

// Enable query plan analysis
sqliteDb.pragma("query_only = OFF");

function formatTime(ms) {
  if (ms < 1) return `${ms.toFixed(3)} ms`;
  if (ms < 1000) return `${ms.toFixed(2)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function analyzeQuery(name, query) {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`\n📊 ${name}\n`);

  // Get query plan
  console.log("Query Plan:");
  const plan = sqliteDb.prepare(`EXPLAIN QUERY PLAN ${query}`).all();
  plan.forEach((row) => {
    const indent = "  ".repeat(row.detail ? 0 : 0);
    console.log(`  ${indent}${row.detail || row.notused}`);
  });

  // Execute and time the query
  console.log("\nExecution:");
  const start = process.hrtime.bigint();
  const stmt = sqliteDb.prepare(query);
  const result = stmt.all();
  const end = process.hrtime.bigint();
  const timeMs = Number(end - start) / 1000000;

  console.log(`  Time: ${formatTime(timeMs)}`);
  console.log(`  Rows returned: ${result.length}`);

  // Get statistics
  const stats = sqliteDb
    .prepare("SELECT * FROM sqlite_stat1 WHERE tbl IN ('orders', 'customers', 'products')")
    .all();

  return { name, timeMs, rowCount: result.length, plan };
}

const queries = [
  {
    name: "Total Revenue by Country",
    query: `
      SELECT c.country,
             COUNT(o.order_id) as order_count,
             SUM(o.total_amount) as total_revenue,
             AVG(o.total_amount) as avg_order_value
      FROM orders o
      JOIN customers c ON o.customer_id = c.customer_id
      GROUP BY c.country
      ORDER BY total_revenue DESC
      LIMIT 10
    `,
  },
  {
    name: "Top Products by Category",
    query: `
      SELECT p.category,
             p.name as product_name,
             COUNT(o.order_id) as times_ordered,
             SUM(o.quantity) as total_quantity,
             SUM(o.total_amount) as revenue
      FROM orders o
      JOIN products p ON o.product_id = p.product_id
      GROUP BY p.category, p.name
      ORDER BY revenue DESC
      LIMIT 20
    `,
  },
  {
    name: "Monthly Sales Trends",
    query: `
      SELECT strftime('%Y-%m', o.order_date) as month,
             COUNT(DISTINCT o.customer_id) as unique_customers,
             COUNT(o.order_id) as total_orders,
             SUM(o.total_amount) as revenue
      FROM orders o
      GROUP BY month
      ORDER BY month DESC
      LIMIT 24
    `,
  },
  {
    name: "Customer Lifetime Value",
    query: `
      SELECT c.country,
             COUNT(DISTINCT c.customer_id) as customer_count,
             AVG(customer_stats.order_count) as avg_orders_per_customer,
             AVG(customer_stats.total_spent) as avg_lifetime_value
      FROM customers c
      JOIN (
        SELECT customer_id,
               COUNT(*) as order_count,
               SUM(total_amount) as total_spent
        FROM orders
        GROUP BY customer_id
      ) customer_stats ON c.customer_id = customer_stats.customer_id
      GROUP BY c.country
      ORDER BY avg_lifetime_value DESC
    `,
  },
  {
    name: "Category Performance Analysis",
    query: `
      SELECT p.category,
             COUNT(DISTINCT o.customer_id) as unique_buyers,
             COUNT(o.order_id) as total_orders,
             SUM(o.quantity) as units_sold,
             SUM(o.total_amount) as total_revenue,
             AVG(o.total_amount) as avg_order_value,
             MIN(o.order_date) as first_sale,
             MAX(o.order_date) as last_sale
      FROM orders o
      JOIN products p ON o.product_id = p.product_id
      GROUP BY p.category
      ORDER BY total_revenue DESC
    `,
  },
  // {
  //   name: "Complex Multi-Join Aggregation",
  //   query: `
  //     SELECT c.country,
  //            p.category,
  //            COUNT(o.order_id) as order_count,
  //            SUM(o.quantity) as total_units,
  //            SUM(o.total_amount) as revenue,
  //            AVG(o.total_amount) as avg_order,
  //            COUNT(DISTINCT o.customer_id) as unique_customers
  //     FROM orders o
  //     JOIN customers c ON o.customer_id = c.customer_id
  //     JOIN products p ON o.product_id = p.product_id
  //     WHERE o.order_date >= '2024-01-01'
  //     GROUP BY c.country, p.category
  //     HAVING revenue > 10000
  //     ORDER BY revenue DESC
  //     LIMIT 50
  //   `,
  // },
];

console.log("\nAnalyzing all queries...\n");

const results = [];
for (const q of queries) {
  const result = analyzeQuery(q.name, q.query);
  results.push(result);
}

// Summary
console.log("\n" + "=".repeat(80));
console.log("\n📈 BOTTLENECK ANALYSIS SUMMARY\n");
console.log("=".repeat(80) + "\n");

// Check table sizes
const orderCount = sqliteDb.prepare("SELECT COUNT(*) as count FROM orders").get();
const customerCount = sqliteDb.prepare("SELECT COUNT(*) as count FROM customers").get();
const productCount = sqliteDb.prepare("SELECT COUNT(*) as count FROM products").get();

console.log("Table Sizes:");
console.log(`  Orders: ${orderCount.count.toLocaleString()} rows`);
console.log(`  Customers: ${customerCount.count.toLocaleString()} rows`);
console.log(`  Products: ${productCount.count.toLocaleString()} rows`);

// Check indexes
console.log("\nIndexes:");
const indexes = sqliteDb
  .prepare(
    `
  SELECT name, tbl_name, sql
  FROM sqlite_master
  WHERE type='index' AND name NOT LIKE 'sqlite_%'
  ORDER BY tbl_name, name
`
  )
  .all();

const indexByTable = {};
indexes.forEach((idx) => {
  if (!indexByTable[idx.tbl_name]) indexByTable[idx.tbl_name] = [];
  indexByTable[idx.tbl_name].push(idx.name);
});

Object.keys(indexByTable).forEach((table) => {
  console.log(`  ${table}: ${indexByTable[table].length} indexes`);
  indexByTable[table].forEach((idx) => console.log(`    - ${idx}`));
});

// Identify bottlenecks
console.log("\n" + "=".repeat(80));
console.log("\n🎯 BOTTLENECK IDENTIFICATION:\n");

results.forEach((result) => {
  console.log(`${result.name}:`);
  console.log(`  Time: ${formatTime(result.timeMs)}`);

  // Analyze what's causing slowness
  if (result.timeMs > 5000) {
    console.log(`  ⚠️  SEVERE BOTTLENECK - Multiple issues:`);
    console.log(`     • Scanning 10M rows in orders table`);
    console.log(`     • Multiple aggregations (COUNT DISTINCT, SUM, AVG)`);
    console.log(`     • Row-by-row processing (row-oriented storage)`);
  } else if (result.timeMs > 1000) {
    console.log(`  ⚠️  BOTTLENECK - Full table scan with aggregation`);
    console.log(`     • Processing millions of rows`);
    console.log(`     • Aggregation overhead on large dataset`);
  } else if (result.timeMs > 200) {
    console.log(`  ⚡ Acceptable - Small overhead from joins/subqueries`);
  } else {
    console.log(`  ✅ Fast - Efficient use of indexes`);
  }
  console.log();
});

console.log("=".repeat(80));
console.log("\n💡 KEY FINDINGS:\n");
console.log("1. PRIMARY ISSUE: Row-oriented storage");
console.log("   - SQLite reads entire rows even when only few columns needed");
console.log("   - 10M rows × ~50 bytes/row = ~500MB to scan");
console.log("   - Cannot leverage columnar compression\n");

console.log("2. AGGREGATION OVERHEAD: ");
console.log("   - COUNT DISTINCT requires building hash tables");
console.log("   - Multiple aggregations = multiple passes over data");
console.log("   - No vectorized processing\n");

console.log("3. QUERY PATTERNS:");
console.log("   - Queries scanning entire orders table (10M rows)");
console.log("   - GROUP BY operations create intermediate result sets");
console.log("   - Joins force nested loop or hash join strategies\n");

console.log("4. WHEN SQLITE IS GOOD:");
console.log("   - Queries with selective WHERE clauses (< 1% of data)");
console.log("   - Point lookups using primary keys");
console.log("   - Single-row inserts/updates (OLTP)\n");

console.log("5. WHEN DUCKDB EXCELS:");
console.log("   - Full table scans for analytics");
console.log("   - Multiple aggregations (vectorized execution)");
console.log("   - Reading few columns from wide tables");
console.log("   - OLAP workloads\n");

console.log("=".repeat(80));
console.log("\n📋 RECOMMENDATION MATRIX:\n");
console.log("=".repeat(80) + "\n");

console.log("Choose SQLITE when:");
console.log("  ✅ Query filters data to < 100K rows");
console.log("  ✅ Using indexed lookups (primary/foreign keys)");
console.log("  ✅ Simple queries on small-medium tables");
console.log("  ✅ Need ACID transactions for writes");
console.log("  ✅ Embedded/serverless deployment\n");

console.log("Choose DUCKDB when:");
console.log("  ✅ Aggregating millions of rows");
console.log("  ✅ Multiple JOINs and GROUP BYs");
console.log("  ✅ Scanning large portions of tables");
console.log("  ✅ Dashboard/analytics workloads");
console.log("  ✅ Read-heavy analytical queries\n");

console.log("Hybrid Approach:");
console.log("  💡 SQLite for transactional data (writes/updates)");
console.log("  💡 Export to DuckDB/Parquet for analytics");
console.log("  💡 Use both: SQLite for app, DuckDB for reporting\n");

console.log("=".repeat(80) + "\n");

sqliteDb.close();
