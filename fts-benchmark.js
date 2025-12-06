const Database = require("better-sqlite3");
const duckdb = require("duckdb");
const fs = require("fs");
const path = require("path");
const { getFtsBenchmarkTests } = require("./queries");

console.log("\n🔍 Full-Text Search Benchmark: SQLite FTS5 vs DuckDB\n");
console.log("=".repeat(80));

// Initialize SQLite with FTS5
console.log("\n📚 Checking SQLite FTS5 indexes...\n");
const sqliteDb = new Database("./analytics.db");

// Check if FTS5 tables exist
try {
  const result = sqliteDb
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='customers_fts'")
    .get();
  if (!result) {
    throw new Error(
      "FTS5 tables not found. Please run 'node init-databases.js' first to create FTS5 indexes."
    );
  }
  console.log("✅ FTS5 tables found.\n");
} catch (error) {
  console.error("\n❌ Error: FTS5 tables not found.");
  console.error(
    "Please run 'node init-databases.js' first to create the database with FTS5 indexes.\n"
  );
  process.exit(1);
}

// Initialize DuckDB
const duckDb = new duckdb.Database("./analytics.duckdb", { access_mode: "READ_ONLY" });
const duckConn = duckDb.connect();

function runDuckQuery(query) {
  return new Promise((resolve, reject) => {
    duckConn.all(query, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

function formatTime(ms) {
  if (ms < 1) return `${ms.toFixed(3)} ms`;
  if (ms < 1000) return `${ms.toFixed(2)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

const searchTests = getFtsBenchmarkTests();

async function runFTSBenchmark() {
  const sqliteResults = [];
  const duckdbResults = [];

  console.log("\n📊 Running SQLite FTS5 Tests...\n");

  for (const test of searchTests) {
    const start = process.hrtime.bigint();
    const stmt = sqliteDb.prepare(test.sqlite);
    const results = stmt.all(test.searchTerm);
    const end = process.hrtime.bigint();
    const timeMs = Number(end - start) / 1000000;

    sqliteResults.push({ name: test.name, timeMs, rowCount: results.length });
    console.log(`  ✓ ${test.name}`);
    console.log(`    Search: "${test.searchTerm}"`);
    console.log(`    Time: ${formatTime(timeMs)} | Results: ${results.length}`);
    if (results.length > 0) {
      const sample = { ...results[0] };
      // Convert any BigInt values to strings for JSON serialization
      Object.keys(sample).forEach((key) => {
        if (typeof sample[key] === "bigint") sample[key] = sample[key].toString();
      });
      console.log(`    Sample: ${JSON.stringify(sample).substring(0, 100)}`);
    }
  }

  const sqliteTotal = sqliteResults.reduce((sum, r) => sum + r.timeMs, 0);
  console.log(`\n  Total SQLite FTS5 Time: ${formatTime(sqliteTotal)}`);

  console.log("\n" + "=".repeat(80));
  console.log("\n🦆 Running DuckDB Tests...\n");

  for (const test of searchTests) {
    const start = process.hrtime.bigint();
    // For DuckDB, convert FTS5 wildcard syntax to SQL LIKE pattern
    const likePattern = test.searchTerm.replace("*", "%");
    const results = await runDuckQuery(test.duckdb.replace("?", `'${likePattern}'`));
    const end = process.hrtime.bigint();
    const timeMs = Number(end - start) / 1000000;

    duckdbResults.push({ name: test.name, timeMs, rowCount: results.length });
    console.log(`  ✓ ${test.name}`);
    console.log(`    Search: "${likePattern}"`);
    console.log(`    Time: ${formatTime(timeMs)} | Results: ${results.length}`);
    if (results.length > 0) {
      const sample = { ...results[0] };
      // Convert any BigInt values to strings for JSON serialization
      Object.keys(sample).forEach((key) => {
        if (typeof sample[key] === "bigint") sample[key] = sample[key].toString();
      });
      console.log(`    Sample: ${JSON.stringify(sample).substring(0, 100)}`);
    }
  }
  const duckdbTotal = duckdbResults.reduce((sum, r) => sum + r.timeMs, 0);
  console.log(`\n  Total DuckDB Time: ${formatTime(duckdbTotal)}`);

  // Comparison
  console.log("\n" + "=".repeat(80));
  console.log("\n📈 Full-Text Search Performance Comparison:\n");
  console.log("(Note: Differences under 200ms are imperceptible to users)\n");

  const USER_NOTICEABLE_THRESHOLD = 200; // ms
  let noticeableDifferences = 0;

  sqliteResults.forEach((sqliteResult, i) => {
    const duckdbResult = duckdbResults[i];
    const speedup = (duckdbResult.timeMs / sqliteResult.timeMs).toFixed(1);
    const faster = speedup > 1 ? "SQLite FTS5" : "DuckDB";
    const multiplier =
      speedup > 1 ? speedup : (sqliteResult.timeMs / duckdbResult.timeMs).toFixed(1);

    console.log(`  ${sqliteResult.name}:`);
    console.log(
      `    SQLite FTS5: ${formatTime(sqliteResult.timeMs)} | DuckDB: ${formatTime(
        duckdbResult.timeMs
      )}`
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

  const overallSpeedup = (duckdbTotal / sqliteTotal).toFixed(1);
  const winner = overallSpeedup > 1 ? "SQLite FTS5" : "DuckDB";
  const finalMultiplier =
    overallSpeedup > 1 ? overallSpeedup : (sqliteTotal / duckdbTotal).toFixed(1);

  console.log("=".repeat(80));
  console.log(`\n🏆 Overall Result: ${winner} is ${finalMultiplier}x faster`);
  console.log(`   SQLite FTS5 Total: ${formatTime(sqliteTotal)}`);
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

    const results = await runFTSBenchmark();
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
    console.log(`  User-noticeable differences: ${run.noticeableDifferences}/5\n`);
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
  console.error("Error running FTS benchmark:", error);
  process.exit(1);
});
