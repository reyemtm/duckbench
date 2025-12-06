const { parentPort, workerData } = require("worker_threads");
const Database = require("better-sqlite3");

try {
  const db = new Database("./db/analytics.db", { readonly: true });
  const data = db.prepare(workerData.query).all();

  // Properly close the connection
  try {
    db.close();
  } catch (e) {
    // Ignore close errors
  }

  parentPort.postMessage({ ok: true, data });
} catch (err) {
  parentPort.postMessage({ ok: false, error: err.message });
}
