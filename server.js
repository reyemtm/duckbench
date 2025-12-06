const express = require("express");
const Database = require("better-sqlite3");
const duckdb = require("duckdb");
const path = require("path");
const { Worker } = require("worker_threads");
const { getAnalyticTests, getFTSTests } = require("./queries");
const jsonQueries = require("./queries-json");

const app = express();
const PORT = 3023;

// Initialize databases
const sqliteDb = new Database("./analytics.db", { readonly: true });
const duckDb = new duckdb.Database("./analytics.duckdb", { access_mode: "READ_ONLY" });
const duckConn = duckDb.connect();

// Load in-memory JSON data on startup
console.log("Loading in-memory JSON data...");
const jsonLoadStart = Date.now();
jsonQueries.loadData();
console.log(`In-memory data loaded in ${Date.now() - jsonLoadStart}ms`);

// Override JSON serialization to handle BigInt globally
BigInt.prototype.toJSON = function () {
  return Number(this);
};

app.use(express.static("public"));

// Helper to convert BigInt to Number for JSON serialization
function convertBigInt(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "bigint") return Number(obj);
  if (Array.isArray(obj)) return obj.map(convertBigInt);
  if (typeof obj === "object") {
    const result = {};
    for (const key in obj) {
      result[key] = convertBigInt(obj[key]);
    }
    return result;
  }
  return obj;
}

// Helper to run DuckDB queries with promises
function runDuckQuery(query) {
  return new Promise((resolve, reject) => {
    duckConn.all(query, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

// Helper to run SQLite query in a worker thread (non-blocking main thread)
function runSqliteQueryWorker(query) {
  return new Promise((resolve, reject) => {
    // offload sync driver
    const worker = new Worker(path.join(__dirname, "sqlite-worker.js"), {
      workerData: { query },
    });

    worker.once("message", (msg) => {
      if (msg.ok) resolve(msg.data);
      else reject(new Error(msg.error));
    });
    worker.once("error", reject);
  });
}

// Run analytical tests for a specific database (in parallel)
async function runAnalyticTests(db) {
  const queries = getAnalyticTests(db);

  if (db === "duckdb") {
    const tasks = queries.map(async ({ name, query }) => {
      const start = process.hrtime.bigint();
      const data = await runDuckQuery(query);
      const end = process.hrtime.bigint();
      const timeMs = Number(end - start) / 1000000;
      return { name, timeMs, rowCount: data.length, data: data.slice(0, 5) };
    });
    return Promise.all(tasks);
  }

  // SQLite: use per-query connection to allow parallel execution
  const tasks = queries.map(async ({ name, query }) => {
    const start = process.hrtime.bigint();
    const data = await runSqliteQueryWorker(query);
    const end = process.hrtime.bigint();
    const timeMs = Number(end - start) / 1000000;
    return { name, timeMs, rowCount: data.length, data: data.slice(0, 5) };
  });

  return Promise.all(tasks);
}

// Run FTS tests for a specific database (in parallel)
async function runFTSTests(db) {
  const queries = getFTSTests(db);

  if (db === "duckdb") {
    const tasks = queries.map(async (test) => {
      const start = process.hrtime.bigint();
      const data = await runDuckQuery(test.query);
      const end = process.hrtime.bigint();
      const timeMs = Number(end - start) / 1000000;
      return {
        name: test.name,
        timeMs,
        rowCount: data.length,
        data: data.slice(0, 5),
        searchTerm: test.searchTerm,
      };
    });
    return Promise.all(tasks);
  }

  // SQLite FTS: run synchronously in sequence since they're fast lookups
  const results = [];
  for (const test of queries) {
    const start = process.hrtime.bigint();
    const data = sqliteDb.prepare(test.query).all();
    const end = process.hrtime.bigint();
    const timeMs = Number(end - start) / 1000000;
    results.push({
      name: test.name,
      timeMs,
      rowCount: data.length,
      data: data.slice(0, 5),
      searchTerm: test.searchTerm,
    });
  }
  return results;
}

// Run in-memory JSON tests (analytics only)
async function runJSONTests() {
  const queries = [
    { name: "Total Revenue by Country", fn: jsonQueries.totalRevenueByCountry },
    { name: "Top Products by Category", fn: jsonQueries.topProductsByCategory },
    { name: "Monthly Sales Trends", fn: jsonQueries.monthlySalesTrends },
    { name: "Customer Lifetime Value", fn: jsonQueries.customerLifetimeValue },
    { name: "Category Performance Analysis", fn: jsonQueries.categoryPerformanceAnalysis },
  ];

  const results = [];
  for (const { name, fn } of queries) {
    const start = process.hrtime.bigint();
    const data = fn();
    const end = process.hrtime.bigint();
    const timeMs = Number(end - start) / 1000000;
    results.push({ name, timeMs, rowCount: data.length, data: data.slice(0, 5) });
  }
  return results;
}

// Helpers to measure wall-clock duration for a full batch
async function runAnalyticTestsWithTiming(db) {
  const start = process.hrtime.bigint();
  const results = db === "json" ? await runJSONTests() : await runAnalyticTests(db);
  const wallMs = Number(process.hrtime.bigint() - start) / 1000000;
  return { results, wallMs };
}

async function runFTSTestsWithTiming(db) {
  const start = process.hrtime.bigint();
  const results = await runFTSTests(db);
  const wallMs = Number(process.hrtime.bigint() - start) / 1000000;
  return { results, wallMs };
}

// Benchmark endpoint
app.get("/api/benchmark", async (req, res) => {
  const db = req.query.db; // 'sqlite' or 'duckdb'
  const type = req.query.type || "analytics"; // 'analytics' or 'fts'

  try {
    const { results, wallMs } =
      type === "fts" ? await runFTSTestsWithTiming(db) : await runAnalyticTestsWithTiming(db);
    res.json(convertBigInt({ success: true, database: db, type, results, wallMs }));
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get database stats
app.get("/api/stats", async (req, res) => {
  try {
    const sqliteStats = sqliteDb
      .prepare(
        `
      SELECT
        CAST((SELECT COUNT(*) FROM customers) AS INTEGER) as customers,
        CAST((SELECT COUNT(*) FROM products) AS INTEGER) as products,
        CAST((SELECT COUNT(*) FROM orders) AS INTEGER) as orders
    `
      )
      .get();

    const duckdbStats = await runDuckQuery(`
      SELECT
        CAST((SELECT COUNT(*) FROM customers) AS DOUBLE) as customers,
        CAST((SELECT COUNT(*) FROM products) AS DOUBLE) as products,
        CAST((SELECT COUNT(*) FROM orders) AS DOUBLE) as orders
    `);

    res.json(
      convertBigInt({
        sqlite: sqliteStats,
        duckdb: duckdbStats[0],
      })
    );
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Run all benchmarks and return comparison
app.get("/api/compare", async (req, res) => {
  const type = req.query.type || "analytics"; // 'analytics' or 'fts'

  try {
    if (type === "fts") {
      // FTS only for SQLite and DuckDB
      const sqliteRun = await runFTSTestsWithTiming("sqlite");
      const duckdbRun = await runFTSTestsWithTiming("duckdb");
      res.json(
        convertBigInt({
          success: true,
          type,
          sqlite: { results: sqliteRun.results, total: sqliteRun.wallMs },
          duckdb: { results: duckdbRun.results, total: duckdbRun.wallMs },
          speedup: (sqliteRun.wallMs / duckdbRun.wallMs).toFixed(1),
        })
      );
    } else {
      // Analytics: all three
      const sqliteRun = await runAnalyticTestsWithTiming("sqlite");
      const duckdbRun = await runAnalyticTestsWithTiming("duckdb");
      const jsonRun = await runAnalyticTestsWithTiming("json");
      res.json(
        convertBigInt({
          success: true,
          type,
          sqlite: { results: sqliteRun.results, total: sqliteRun.wallMs },
          duckdb: { results: duckdbRun.results, total: duckdbRun.wallMs },
          json: { results: jsonRun.results, total: jsonRun.wallMs },
          fastest: Math.min(sqliteRun.wallMs, duckdbRun.wallMs, jsonRun.wallMs),
        })
      );
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Dashboard: http://localhost:${PORT}`);
  console.log(`\nAPI Endpoints:`);
  console.log(`  GET /api/benchmark?db=sqlite - Run SQLite benchmarks`);
  console.log(`  GET /api/benchmark?db=duckdb - Run DuckDB benchmarks`);
  console.log(`  GET /api/stats - Get database statistics`);
});

// Cleanup on exit
process.on("SIGINT", () => {
  try {
    // Checkpoint and close SQLite to remove WAL files
    sqliteDb.pragma("wal_checkpoint(TRUNCATE)");
    sqliteDb.close();
  } catch (e) {
    console.error("Error closing SQLite:", e);
  }
  duckDb.close();
  process.exit(0);
});
