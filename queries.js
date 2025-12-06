// Shared benchmark query definitions for SQLite and DuckDB
// DuckDB variants include casts to avoid BigInt serialization issues

function getAnalyticTests(db) {
  if (db === "duckdb") {
    return [
      {
        name: "Total Revenue by Country",
        query: `
          SELECT c.country,
                 CAST(COUNT(o.order_id) AS DOUBLE) as order_count,
                 CAST(SUM(o.total_amount) AS DOUBLE) as total_revenue,
                 CAST(AVG(o.total_amount) AS DOUBLE) as avg_order_value
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
                 CAST(COUNT(o.order_id) AS DOUBLE) as times_ordered,
                 CAST(SUM(o.quantity) AS DOUBLE) as total_quantity,
                 CAST(SUM(o.total_amount) AS DOUBLE) as revenue
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
          SELECT
            strftime(order_date, '%Y-%m') AS month,
            CAST(COUNT(DISTINCT customer_id) AS DOUBLE) as unique_customers,
            CAST(COUNT(order_id) AS DOUBLE) as total_orders,
            CAST(SUM(total_amount) AS DOUBLE) as revenue
          FROM orders
          WHERE order_date >= current_date - INTERVAL '24 months'
          GROUP BY month
          ORDER BY month DESC
          LIMIT 24
        `,
      },
      {
        name: "Customer Lifetime Value",
        query: `
          SELECT c.country,
                 CAST(COUNT(DISTINCT c.customer_id) AS DOUBLE) as customer_count,
                 CAST(AVG(customer_stats.order_count) AS DOUBLE) as avg_orders_per_customer,
                 CAST(AVG(customer_stats.total_spent) AS DOUBLE) as avg_lifetime_value
          FROM customers c
          JOIN (
            SELECT customer_id,
                   CAST(COUNT(*) AS DOUBLE) as order_count,
                   CAST(SUM(total_amount) AS DOUBLE) as total_spent
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
                 CAST(COUNT(DISTINCT o.customer_id) AS DOUBLE) as unique_buyers,
                 CAST(COUNT(o.order_id) AS DOUBLE) as total_orders,
                 CAST(SUM(o.quantity) AS DOUBLE) as units_sold,
                 CAST(SUM(o.total_amount) AS DOUBLE) as total_revenue,
                 CAST(AVG(o.total_amount) AS DOUBLE) as avg_order_value,
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
      //            CAST(COUNT(o.order_id) AS DOUBLE) as order_count,
      //            CAST(SUM(o.quantity) AS DOUBLE) as total_units,
      //            CAST(SUM(o.total_amount) AS DOUBLE) as revenue,
      //            CAST(AVG(o.total_amount) AS DOUBLE) as avg_order,
      //            CAST(COUNT(DISTINCT o.customer_id) AS DOUBLE) as unique_customers
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
  }

  // SQLite queries
  return [
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
        SELECT
          month,
          unique_customers,
          total_orders,
          revenue
        FROM monthly_sales_summary
        WHERE month >= strftime('%Y-%m', date('now', '-24 months'))
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
}

function getFTSTests(db) {
  if (db === "duckdb") {
    return [
      {
        name: "Search Customers by Name",
        searchTerm: "Customer",
        query: `
          SELECT CAST(customer_id AS DOUBLE) as customer_id, name, email, country
          FROM customers
          WHERE name ILIKE '%Customer%'
          LIMIT 100
        `,
      },
      {
        name: "Search Products by Name",
        searchTerm: "Product",
        query: `
          SELECT CAST(product_id AS DOUBLE) as product_id, name, category
          FROM products
          WHERE name ILIKE '%Product%'
          LIMIT 100
        `,
      },
      {
        name: "Search Products by Category",
        searchTerm: "Electronics",
        query: `
          SELECT CAST(product_id AS DOUBLE) as product_id, name, category
          FROM products
          WHERE category ILIKE '%Elec%'
          LIMIT 100
        `,
      },
      {
        name: "Search Orders by Customer Name",
        searchTerm: "Customer1000",
        query: `
          SELECT CAST(o.order_id AS DOUBLE) as order_id, c.name as customer_name,
                 p.name as product_name, o.order_date
          FROM orders o
          JOIN customers c ON o.customer_id = c.customer_id
          JOIN products p ON o.product_id = p.product_id
          WHERE c.name ILIKE '%Customer1000%'
          LIMIT 100
        `,
      },
      {
        name: "Search Orders by Product Name",
        searchTerm: "Product1000",
        query: `
          SELECT CAST(o.order_id AS DOUBLE) as order_id, c.name as customer_name,
                 p.name as product_name, o.order_date
          FROM orders o
          JOIN customers c ON o.customer_id = c.customer_id
          JOIN products p ON o.product_id = p.product_id
          WHERE p.name ILIKE '%Product1000%'
          LIMIT 100
        `,
      },
    ];
  }

  // SQLite queries
  return [
    {
      name: "Search Customers by Name",
      searchTerm: "Customer",
      query: `
        SELECT customer_id, name, email, country
        FROM customers
        WHERE name LIKE '%Customer%'
        LIMIT 100
      `,
    },
    {
      name: "Search Products by Name",
      searchTerm: "Product",
      query: `
        SELECT product_id, name, category
        FROM products
        WHERE name LIKE '%Product%'
        LIMIT 100
      `,
    },
    {
      name: "Search Products by Category",
      searchTerm: "Electronics",
      query: `
        SELECT product_id, name, category
        FROM products
        WHERE category LIKE '%Elec%'
        LIMIT 100
      `,
    },
    {
      name: "Search Orders by Customer Name",
      searchTerm: "Customer1000",
      query: `
        SELECT o.order_id, c.name as customer_name, p.name as product_name, o.order_date
        FROM orders o
        JOIN customers c ON o.customer_id = c.customer_id
        JOIN products p ON o.product_id = p.product_id
        WHERE c.name LIKE '%Customer1000%'
        LIMIT 100
      `,
    },
    {
      name: "Search Orders by Product Name",
      searchTerm: "Product1000",
      query: `
        SELECT o.order_id, c.name as customer_name, p.name as product_name, o.order_date
        FROM orders o
        JOIN customers c ON o.customer_id = c.customer_id
        JOIN products p ON o.product_id = p.product_id
        WHERE p.name LIKE '%Product1000%'
        LIMIT 100
      `,
    },
  ];
}

// FTS benchmark queries (SQLite FTS5 vs DuckDB ILIKE) with parameterized patterns
function getFtsBenchmarkTests() {
  return [
    {
      name: "Search Customers by Name",
      searchTerm: "Customer*", // FTS5 prefix match
      duckLike: "%Customer%", // SQL LIKE pattern
      sqlite: `
        SELECT customer_id, name, email, country
        FROM customers_fts
        WHERE name MATCH ?
        ORDER BY rank
        LIMIT 5
      `,
      duckdb: `
        SELECT customer_id, name, email, country
        FROM customers
        WHERE name ILIKE ?
        LIMIT 5
      `,
    },
    {
      name: "Search Products by Name",
      searchTerm: "Product*",
      duckLike: "%Product%",
      sqlite: `
        SELECT product_id, name, category
        FROM products_fts
        WHERE name MATCH ?
        ORDER BY rank
        LIMIT 5
      `,
      duckdb: `
        SELECT product_id, name, category
        FROM products
        WHERE name ILIKE ?
        LIMIT 5
      `,
    },
    {
      name: "Search Products by Category",
      searchTerm: "Elec*", // Match "Electronics"
      duckLike: "%Elec%",
      sqlite: `
        SELECT product_id, name, category
        FROM products_fts
        WHERE category MATCH ?
        ORDER BY rank
        LIMIT 5
      `,
      duckdb: `
        SELECT product_id, name, category
        FROM products
        WHERE category ILIKE ?
        LIMIT 5
      `,
    },
    {
      name: "Search Orders by Customer Name",
      searchTerm: "Customer1000*", // More specific search
      duckLike: "%Customer1000%",
      sqlite: `
        SELECT o.order_id, c.name as customer_name, p.name as product_name, o.order_date
        FROM orders o
        JOIN customers c ON o.customer_id = c.customer_id
        JOIN products p ON o.product_id = p.product_id
        WHERE c.customer_id IN (
          SELECT customer_id FROM customers_fts WHERE name MATCH ?
        )
        LIMIT 5
      `,
      duckdb: `
        SELECT o.order_id, c.name as customer_name, p.name as product_name, o.order_date
        FROM orders o
        JOIN customers c ON o.customer_id = c.customer_id
        JOIN products p ON o.product_id = p.product_id
        WHERE c.name ILIKE ?
        LIMIT 5
      `,
    },
    {
      name: "Search Orders by Product Name",
      searchTerm: "Product1000*", // More specific search
      duckLike: "%Product1000%",
      sqlite: `
        SELECT o.order_id, c.name as customer_name, p.name as product_name, o.order_date
        FROM orders o
        JOIN customers c ON o.customer_id = c.customer_id
        JOIN products p ON o.product_id = p.product_id
        WHERE p.product_id IN (
          SELECT product_id FROM products_fts WHERE name MATCH ?
        )
        LIMIT 5
      `,
      duckdb: `
        SELECT o.order_id, c.name as customer_name, p.name as product_name, o.order_date
        FROM orders o
        JOIN customers c ON o.customer_id = c.customer_id
        JOIN products p ON o.product_id = p.product_id
        WHERE p.name ILIKE ?
        LIMIT 5
      `,
    },
  ];
}

module.exports = {
  getAnalyticTests,
  getFTSTests,
  getFtsBenchmarkTests,
};
