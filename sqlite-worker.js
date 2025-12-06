const { parentPort, workerData } = require("worker_threads");
const Database = require("better-sqlite3");

try {
  const db = new Database("./analytics.db", { readonly: true });
  const data = db.prepare(workerData.query).all();
  db.close();
  parentPort.postMessage({ ok: true, data });
} catch (err) {
  parentPort.postMessage({ ok: false, error: err.message });
}
