const fs = require("fs");
const path = require("path");

// Configuration
const NUM_CUSTOMERS = 100000;
const NUM_PRODUCTS = 10000;
const NUM_ORDERS = 10000000; // 10 million orders
const BATCH_SIZE = 100000;

async function generateData() {
  return new Promise((resolve, reject) => {
    try {
      console.log("Starting data generation...");
      console.time("Total generation time");

      // Generate customers
      console.log(`Generating ${NUM_CUSTOMERS} customers...`);
      console.time("Customers");
      const customersPath = path.join(__dirname, "data", "customers.csv");
      fs.mkdirSync(path.dirname(customersPath), { recursive: true });
      let customersStream = fs.createWriteStream(customersPath);
      customersStream.write("customer_id,name,email,country,signup_date\n");

      const countries = [
        "USA",
        "UK",
        "Germany",
        "France",
        "Japan",
        "Canada",
        "Australia",
        "Brazil",
        "India",
        "China",
      ];
      const customerNames = [
        "Alice",
        "Bob",
        "Charlie",
        "David",
        "Eva",
        "Frank",
        "Grace",
        "Hannah",
        "Ian",
        "Jack",
        "Customer",
      ];
      for (let i = 1; i <= NUM_CUSTOMERS; i++) {
        const country = countries[Math.floor(Math.random() * countries.length)];
        const signupDate = new Date(
          2020 + Math.random() * 5,
          Math.floor(Math.random() * 12),
          Math.floor(Math.random() * 28) + 1
        )
          .toISOString()
          .split("T")[0];
        const name = customerNames[Math.floor(Math.random() * customerNames.length)];
        customersStream.write(
          `${i},${name}-${i},customer${i}@example.com,${country},${signupDate}\n`
        );
      }
      customersStream.end();
      console.timeEnd("Customers");

      // Generate products
      console.log(`Generating ${NUM_PRODUCTS} products...`);
      console.time("Products");
      const productsPath = path.join(__dirname, "data", "products.csv");
      let productsStream = fs.createWriteStream(productsPath);
      productsStream.write("product_id,name,category,price\n");

      const categories = [
        "Electronics",
        "Clothing",
        "Home",
        "Books",
        "Sports",
        "Toys",
        "Food",
        "Beauty",
        "Automotive",
        "Garden",
      ];
      for (let i = 1; i <= NUM_PRODUCTS; i++) {
        const category = categories[Math.floor(Math.random() * categories.length)];
        const price = (Math.random() * 1000 + 5).toFixed(2);
        productsStream.write(`${i},Product${i},${category},${price}\n`);
      }
      productsStream.end();
      console.timeEnd("Products");

      // Generate orders in batches
      console.log(`Generating ${NUM_ORDERS} orders in batches of ${BATCH_SIZE}...`);
      console.time("Orders");
      const ordersPath = path.join(__dirname, "data", "orders.csv");
      let ordersStream = fs.createWriteStream(ordersPath);
      ordersStream.write("order_id,customer_id,product_id,quantity,order_date,total_amount\n");

      for (let i = 1; i <= NUM_ORDERS; i++) {
        const customerId = Math.floor(Math.random() * NUM_CUSTOMERS) + 1;
        const productId = Math.floor(Math.random() * NUM_PRODUCTS) + 1;
        const quantity = Math.floor(Math.random() * 10) + 1;
        const orderDate = new Date(
          2023 + Math.random() * 2,
          Math.floor(Math.random() * 12),
          Math.floor(Math.random() * 28) + 1
        )
          .toISOString()
          .split("T")[0];
        const totalAmount = (quantity * (Math.random() * 1000 + 5)).toFixed(2);

        ordersStream.write(
          `${i},${customerId},${productId},${quantity},${orderDate},${totalAmount}\n`
        );

        if (i % BATCH_SIZE === 0) {
          console.log(`  Generated ${i.toLocaleString()} orders...`);
        }
      }
      ordersStream.end();
      console.timeEnd("Orders");

      console.timeEnd("Total generation time");
      console.log("\nData generation complete!");
      console.log(`Files created in ./data/ directory:`);
      console.log(`  - customers.csv (${NUM_CUSTOMERS.toLocaleString()} records)`);
      console.log(`  - products.csv (${NUM_PRODUCTS.toLocaleString()} records)`);
      console.log(`  - orders.csv (${NUM_ORDERS.toLocaleString()} records)`);

      resolve();
    } catch (error) {
      reject(error);
    }
  });
}

// Run if called directly
if (require.main === module) {
  generateData()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Data generation failed:", err);
      process.exit(1);
    });
}

module.exports = { generateData };
