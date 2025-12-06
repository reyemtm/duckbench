const fs = require("fs");
const path = require("path");

// Load CSV data into memory with optimized lookups
let orders = [];
let customers = [];
let products = [];

// Index structures for fast lookups
let customerById = new Map();
let productById = new Map();
let ordersByCustomer = new Map();
let ordersByProduct = new Map();
let ordersByDate = new Map();
let ordersByMonth = new Map();

function loadData() {
  return;
  console.log("Loading data from CSV files...");
  const start = Date.now();

  // Load customers
  const customersData = fs.readFileSync(path.join(__dirname, "data/customers.csv"), "utf-8");
  const customerLines = customersData.split("\n").slice(1);
  customers = customerLines
    .filter((line) => line.trim())
    .map((line) => {
      const [customer_id, name, email, country, signup_date] = line.split(",");
      const customer = {
        customer_id: parseInt(customer_id),
        name,
        email,
        country,
        signup_date,
      };
      customerById.set(customer.customer_id, customer);
      return customer;
    });

  // Load products
  const productsData = fs.readFileSync(path.join(__dirname, "data/products.csv"), "utf-8");
  const productLines = productsData.split("\n").slice(1);
  products = productLines
    .filter((line) => line.trim())
    .map((line) => {
      const [product_id, name, category, price] = line.split(",");
      const product = {
        product_id: parseInt(product_id),
        name,
        category,
        price: parseFloat(price),
      };
      productById.set(product.product_id, product);
      return product;
    });

  // Load orders with index building
  const ordersData = fs.readFileSync(path.join(__dirname, "data/orders.csv"), "utf-8");
  const orderLines = ordersData.split("\n").slice(1);
  orders = orderLines
    .filter((line) => line.trim())
    .map((line) => {
      const [order_id, customer_id, product_id, quantity, order_date, total_amount] =
        line.split(",");
      const order = {
        order_id: parseInt(order_id),
        customer_id: parseInt(customer_id),
        product_id: parseInt(product_id),
        quantity: parseInt(quantity),
        order_date,
        total_amount: parseFloat(total_amount),
        country: customerById.get(parseInt(customer_id))?.country,
        category: productById.get(parseInt(product_id))?.category,
        product_name: productById.get(parseInt(product_id))?.name,
      };

      // Build indexes
      if (!ordersByCustomer.has(order.customer_id)) {
        ordersByCustomer.set(order.customer_id, []);
      }
      ordersByCustomer.get(order.customer_id).push(order);

      if (!ordersByProduct.has(order.product_id)) {
        ordersByProduct.set(order.product_id, []);
      }
      ordersByProduct.get(order.product_id).push(order);

      if (!ordersByDate.has(order.order_date)) {
        ordersByDate.set(order.order_date, []);
      }
      ordersByDate.get(order.order_date).push(order);

      const month = order.order_date.substring(0, 7); // YYYY-MM
      if (!ordersByMonth.has(month)) {
        ordersByMonth.set(month, []);
      }
      ordersByMonth.get(month).push(order);

      return order;
    });

  const elapsed = Date.now() - start;
  console.log(
    `Loaded ${orders.length.toLocaleString()} orders, ${customers.length.toLocaleString()} customers, ${products.length.toLocaleString()} products in ${elapsed}ms`
  );
}

// Query 1: Total Revenue by Country
function totalRevenueByCountry() {
  const countryStats = new Map();

  for (let i = 0; i < orders.length; i++) {
    const order = orders[i];
    if (!order.country) continue;

    let stats = countryStats.get(order.country);
    if (!stats) {
      stats = {
        country: order.country,
        order_count: 0,
        total_revenue: 0,
      };
      countryStats.set(order.country, stats);
    }

    stats.order_count++;
    stats.total_revenue += order.total_amount;
  }

  return Array.from(countryStats.values())
    .map((stat) => ({
      country: stat.country,
      order_count: stat.order_count,
      total_revenue: stat.total_revenue,
      avg_order_value: stat.total_revenue / stat.order_count,
    }))
    .sort((a, b) => b.total_revenue - a.total_revenue)
    .slice(0, 10);
}

// Query 2: Top Products by Category
function topProductsByCategory() {
  const productStats = new Map();

  for (let i = 0; i < orders.length; i++) {
    const order = orders[i];
    if (!order.category) continue;

    const key = `${order.category}|${order.product_name}`;
    let stats = productStats.get(key);
    if (!stats) {
      stats = {
        category: order.category,
        product_name: order.product_name,
        times_ordered: 0,
        total_quantity: 0,
        revenue: 0,
      };
      productStats.set(key, stats);
    }

    stats.times_ordered++;
    stats.total_quantity += order.quantity;
    stats.revenue += order.total_amount;
  }

  return Array.from(productStats.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 20);
}

// Query 3: Monthly Sales Trends
function monthlySalesTrends() {
  const now = new Date();
  const cutoffDate = new Date(now.getFullYear(), now.getMonth() - 24, 1);
  const cutoffMonth = cutoffDate.toISOString().substring(0, 7);

  const monthlyStats = new Map();

  // Iterate only months that pass the filter
  for (const [month, monthOrders] of ordersByMonth) {
    if (month < cutoffMonth) continue;

    const uniqueCustomers = new Set();
    let total_orders = 0;
    let revenue = 0;

    for (let i = 0; i < monthOrders.length; i++) {
      const order = monthOrders[i];
      uniqueCustomers.add(order.customer_id);
      total_orders++;
      revenue += order.total_amount;
    }

    monthlyStats.set(month, {
      month,
      unique_customers: uniqueCustomers.size,
      total_orders,
      revenue,
    });
  }

  return Array.from(monthlyStats.values())
    .sort((a, b) => b.month.localeCompare(a.month))
    .slice(0, 24);
}

// Query 4: Customer Lifetime Value
function customerLifetimeValue() {
  const customerStats = new Map();

  for (let i = 0; i < orders.length; i++) {
    const order = orders[i];
    let stats = customerStats.get(order.customer_id);
    if (!stats) {
      stats = {
        customer_id: order.customer_id,
        country: order.country,
        order_count: 0,
        total_spent: 0,
      };
      customerStats.set(order.customer_id, stats);
    }

    stats.order_count++;
    stats.total_spent += order.total_amount;
  }

  const countryStats = new Map();

  for (const stats of customerStats.values()) {
    if (!stats.country) continue;

    let countryStat = countryStats.get(stats.country);
    if (!countryStat) {
      countryStat = {
        country: stats.country,
        customer_count: 0,
        total_orders: 0,
        total_spent: 0,
      };
      countryStats.set(stats.country, countryStat);
    }

    countryStat.customer_count++;
    countryStat.total_orders += stats.order_count;
    countryStat.total_spent += stats.total_spent;
  }

  return Array.from(countryStats.values())
    .map((stat) => ({
      country: stat.country,
      customer_count: stat.customer_count,
      avg_orders_per_customer: stat.total_orders / stat.customer_count,
      avg_lifetime_value: stat.total_spent / stat.customer_count,
    }))
    .sort((a, b) => b.avg_lifetime_value - a.avg_lifetime_value);
}

// Query 5: Category Performance Analysis
function categoryPerformanceAnalysis() {
  const categoryStats = new Map();

  for (let i = 0; i < orders.length; i++) {
    const order = orders[i];
    if (!order.category) continue;

    let stats = categoryStats.get(order.category);
    if (!stats) {
      stats = {
        category: order.category,
        unique_buyers: new Set(),
        total_orders: 0,
        units_sold: 0,
        total_revenue: 0,
        first_sale: order.order_date,
        last_sale: order.order_date,
      };
      categoryStats.set(order.category, stats);
    }

    stats.unique_buyers.add(order.customer_id);
    stats.total_orders++;
    stats.units_sold += order.quantity;
    stats.total_revenue += order.total_amount;

    if (order.order_date < stats.first_sale) stats.first_sale = order.order_date;
    if (order.order_date > stats.last_sale) stats.last_sale = order.order_date;
  }

  return Array.from(categoryStats.values())
    .map((stat) => ({
      category: stat.category,
      unique_buyers: stat.unique_buyers.size,
      total_orders: stat.total_orders,
      units_sold: stat.units_sold,
      total_revenue: stat.total_revenue,
      avg_order_value: stat.total_revenue / stat.total_orders,
      first_sale: stat.first_sale,
      last_sale: stat.last_sale,
    }))
    .sort((a, b) => b.total_revenue - a.total_revenue);
}

// Run all queries and report timing
function runAllQueries() {
  const queries = [
    { name: "Total Revenue by Country", fn: totalRevenueByCountry },
    { name: "Top Products by Category", fn: topProductsByCategory },
    { name: "Monthly Sales Trends", fn: monthlySalesTrends },
    { name: "Customer Lifetime Value", fn: customerLifetimeValue },
    { name: "Category Performance Analysis", fn: categoryPerformanceAnalysis },
  ];

  console.log("\n🚀 Running in-memory JSON queries...\n");
  const results = [];

  queries.forEach(({ name, fn }) => {
    const start = Date.now();
    const data = fn();
    const timeMs = Date.now() - start;
    results.push({ name, timeMs, rowCount: data.length });
    console.log(`  ✓ ${name}`);
    console.log(`    Time: ${timeMs.toFixed(2)} ms | Rows: ${data.length}`);
  });

  const totalTime = results.reduce((sum, r) => sum + r.timeMs, 0);
  console.log(`\n  Total Time: ${totalTime.toFixed(2)} ms\n`);

  return results;
}

// Initialize if run directly
if (require.main === module) {
  loadData();
  runAllQueries();
}

module.exports = {
  loadData,
  totalRevenueByCountry,
  topProductsByCategory,
  monthlySalesTrends,
  customerLifetimeValue,
  categoryPerformanceAnalysis,
  runAllQueries,
};
