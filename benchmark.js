const Database = require("better-sqlite3");
const duckdb = require("duckdb");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { getAnalyticTests } = require("./queries");

let sqliteDb;
let duckDb;
let duckConn;

// Helper to run DuckDB queries with promises
function runDuckQuery(query) {
  return new Promise((resolve, reject) => {
    duckConn.all(query, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

// Run analytical tests for a specific database
async function runAnalyticTests(db) {
  const queries = getAnalyticTests(db);
  const results = [];

  for (const { name, query } of queries) {
    const start = process.hrtime.bigint();

    if (db === "sqlite") {
      const data = sqliteDb.prepare(query).all();
      const end = process.hrtime.bigint();
      const timeMs = Number(end - start) / 1000000;
      results.push({ name, timeMs, rowCount: data.length });
    } else if (db === "duckdb") {
      const data = await runDuckQuery(query);
      const end = process.hrtime.bigint();
      const timeMs = Number(end - start) / 1000000;
      results.push({ name, timeMs, rowCount: data.length });
    }
  }

  return results;
}

function formatTime(ms) {
  if (ms < 1) return `${ms.toFixed(3)} ms`;
  if (ms < 1000) return `${ms.toFixed(2)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

async function checkAndGenerateData() {
  const dataDir = path.join(__dirname, "data");
  const ordersFile = path.join(dataDir, "orders.csv");

  if (!fs.existsSync(ordersFile)) {
    console.log("📁 Data files not found. Generating test data...\n");
    execSync("node generate-data.js", { stdio: "inherit" });
    console.log("\n✅ Data generation complete!\n");
  } else {
    console.log("✅ Data files found.\n");
  }
}

async function checkAndInitDatabases() {
  const sqliteExists = fs.existsSync("./db/analytics.db");
  const duckdbExists = fs.existsSync("./db/analytics.duckdb");

  if (!sqliteExists || !duckdbExists) {
    console.log("💾 Database files not found. Initializing databases...\n");
    execSync("node init-databases.js", { stdio: "inherit" });
    console.log("\n✅ Database initialization complete!\n");
  } else {
    console.log("✅ Database files found.\n");
  }
}

async function runBenchmark() {
  console.log("\n🔥 Running DuckDB vs SQLite Performance Benchmark\n");
  console.log("=".repeat(80));

  // Check and setup data/databases if needed
  await checkAndGenerateData();
  await checkAndInitDatabases();

  // Initialize database connections
  sqliteDb = new Database("./db/analytics.db", { readonly: true });
  duckDb = new duckdb.Database("./db/analytics.duckdb", { access_mode: "READ_ONLY" });
  duckConn = duckDb.connect();

  // Run SQLite tests
  console.log("\n📊 Running SQLite Tests...\n");
  const sqliteStart = process.hrtime.bigint();
  const sqliteResults = await runAnalyticTests("sqlite");
  const sqliteTotal = Number(process.hrtime.bigint() - sqliteStart) / 1000000;

  sqliteResults.forEach((result) => {
    console.log(`  ✓ ${result.name}`);
    console.log(`    Time: ${formatTime(result.timeMs)} | Rows: ${result.rowCount}`);
  });
  console.log(`\n  Total SQLite Time: ${formatTime(sqliteTotal)}`);

  // Run DuckDB tests
  console.log("\n" + "=".repeat(80));
  console.log("\n🦆 Running DuckDB Tests...\n");
  const duckdbStart = process.hrtime.bigint();
  const duckdbResults = await runAnalyticTests("duckdb");
  const duckdbTotal = Number(process.hrtime.bigint() - duckdbStart) / 1000000;

  duckdbResults.forEach((result) => {
    console.log(`  ✓ ${result.name}`);
    console.log(`    Time: ${formatTime(result.timeMs)} | Rows: ${result.rowCount}`);
  });
  console.log(`\n  Total DuckDB Time: ${formatTime(duckdbTotal)}`);

  // Comparison
  console.log("\n" + "=".repeat(80));
  console.log("\n📈 Performance Comparison:\n");
  console.log("(Note: Differences under 200ms are imperceptible to users)\n");

  const USER_NOTICEABLE_THRESHOLD = 200; // ms
  let noticeableDifferences = 0;

  sqliteResults.forEach((sqliteResult, i) => {
    const duckdbResult = duckdbResults[i];
    const speedup = (sqliteResult.timeMs / duckdbResult.timeMs).toFixed(1);
    const faster = speedup > 1 ? "DuckDB" : "SQLite";
    const multiplier = speedup > 1 ? speedup : (1 / speedup).toFixed(1);

    console.log(`  ${sqliteResult.name}:`);
    console.log(
      `    SQLite: ${formatTime(sqliteResult.timeMs)} | DuckDB: ${formatTime(duckdbResult.timeMs)}`
    );

    // Check if difference is user-noticeable
    const bothFast =
      sqliteResult.timeMs < USER_NOTICEABLE_THRESHOLD &&
      duckdbResult.timeMs < USER_NOTICEABLE_THRESHOLD;

    if (bothFast) {
      console.log(`    ✅ Both feel instant to users (< 200ms)\n`);
    } else {
      console.log(`    → ${faster} is ${multiplier}x faster (USER NOTICEABLE)\n`);
      noticeableDifferences++;
    }
  });

  const overallSpeedup = (sqliteTotal / duckdbTotal).toFixed(1);
  console.log("=".repeat(80));
  console.log(`\n🚀 Overall Result: DuckDB is ${overallSpeedup}x faster`);
  console.log(`   SQLite Total: ${formatTime(sqliteTotal)}`);
  console.log(`   DuckDB Total: ${formatTime(duckdbTotal)}`);
  console.log(
    `\n👤 User Experience: ${noticeableDifferences} out of ${sqliteResults.length} queries have noticeable performance differences`
  );
  console.log("\n" + "=".repeat(80) + "\n");

  return { sqliteResults, duckdbResults, sqliteTotal, duckdbTotal, noticeableDifferences };
}

async function runMultipleTimes() {
  console.log("\n🔄 Running benchmark 3 times to ensure consistent results...\n");

  const allRuns = [];

  for (let run = 1; run <= 3; run++) {
    console.log(`\n${"=".repeat(80)}`);
    console.log(`RUN #${run}`);
    console.log("=".repeat(80));

    const results = await runBenchmark();
    allRuns.push(results);

    // Brief pause between runs
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // Summary of all runs
  console.log("\n" + "=".repeat(80));
  console.log("📊 SUMMARY OF ALL 3 RUNS");
  console.log("=".repeat(80) + "\n");

  allRuns.forEach((run, i) => {
    console.log(`Run #${i + 1}:`);
    console.log(`  SQLite Total: ${formatTime(run.sqliteTotal)}`);
    console.log(`  DuckDB Total: ${formatTime(run.duckdbTotal)}`);
    console.log(`  Speedup: ${(run.sqliteTotal / run.duckdbTotal).toFixed(1)}x`);
    console.log(
      `  User-noticeable differences: ${run.noticeableDifferences}/${run.sqliteResults.length}\n`
    );
  });

  // Averages
  const avgSqlite = allRuns.reduce((sum, r) => sum + r.sqliteTotal, 0) / allRuns.length;
  const avgDuckdb = allRuns.reduce((sum, r) => sum + r.duckdbTotal, 0) / allRuns.length;

  console.log("Average across all runs:");
  console.log(`  SQLite Average: ${formatTime(avgSqlite)}`);
  console.log(`  DuckDB Average: ${formatTime(avgDuckdb)}`);
  console.log(`  Average Speedup: ${(avgSqlite / avgDuckdb).toFixed(1)}x`);
  console.log("\n" + "=".repeat(80) + "\n");

  // Cleanup
  sqliteDb.close();
  duckDb.close();
}

runMultipleTimes().catch((error) => {
  console.error("Error running benchmark:", error);
  process.exit(1);
});
