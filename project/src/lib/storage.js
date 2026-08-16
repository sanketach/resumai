// IndexedDB-backed storage — replaces the Claude-Artifacts-only
// `window.storage` API with something that works on a real, publicly
// hosted website. Deliberately matches window.storage's call shape
// (get/set/delete/list, all async, same {key, value} result shape) so the
// rest of the app didn't need to change beyond swapping the import.
//
// Schema is versioned from the start (DB_VERSION + the upgrade ladder in
// openDB) so future changes to what's stored don't require throwing away
// existing users' data — add a new `if (event.oldVersion < N)` block below
// rather than editing the existing ones.

const DB_NAME = "ResumeBuilderPro";
const DB_VERSION = 1;
const STORE_NAME = "kv";

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available in this browser"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = req.result;
      // Migration ladder: each version bump gets its own guarded block so
      // upgrading a user from v1 -> v3 runs v2's migration AND v3's, in
      // order, without ever dropping their existing data.
      if (event.oldVersion < 1) {
        // Generic key-value store, key supplied explicitly by the caller
        // (not derived from the stored value) — mirrors window.storage's
        // model, where "resume:<id>" / "resume-index" are just string keys.
        db.createObjectStore(STORE_NAME);
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("Failed to open IndexedDB"));
    req.onblocked = () => reject(new Error("IndexedDB upgrade blocked — close other tabs of this site and reload"));
  });
  return dbPromise;
}

async function getStore(mode) {
  const db = await openDB();
  return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
}

function wrapRequest(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB request failed"));
  });
}

export const storage = {
  // Signature intentionally accepts and ignores a second arg so existing
  // call sites like `storage.get(key, false)` (ported straight from
  // window.storage.get(key, shared)) keep working unchanged. There's no
  // multi-user "shared" concept for a no-account, single-browser app.
  async get(key) {
    const store = await getStore("readonly");
    const value = await wrapRequest(store.get(key));
    return value !== undefined ? { key, value } : null;
  },

  async set(key, value) {
    const store = await getStore("readwrite");
    await wrapRequest(store.put(value, key));
    return { key, value };
  },

  async delete(key) {
    const store = await getStore("readwrite");
    // Must reuse this same transaction's store for both operations — calling
    // this.get(key) here would open a separate transaction, and by the time
    // it resolved, this readwrite transaction would already have
    // auto-committed (IndexedDB transactions close once nothing is pending
    // on them, even across an `await` to an unrelated transaction).
    const existingValue = await wrapRequest(store.get(key));
    await wrapRequest(store.delete(key));
    return { key, deleted: existingValue !== undefined };
  },

  async list(prefix = "") {
    const store = await getStore("readonly");
    return new Promise((resolve, reject) => {
      const keys = [];
      const req = store.openKeyCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          if (String(cursor.key).startsWith(prefix)) keys.push(cursor.key);
          cursor.continue();
        } else {
          resolve({ keys });
        }
      };
      req.onerror = () => reject(req.error || new Error("IndexedDB cursor failed"));
    });
  },

  // ---- Data portability (Part 31/32 of the audit) ----
  // Since this is entirely local, browser-based storage with no account
  // system, these are the user's only backup/recovery path.

  async exportAll() {
    const store = await getStore("readonly");
    return new Promise((resolve, reject) => {
      const result = {};
      const req = store.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          result[cursor.key] = cursor.value;
          cursor.continue();
        } else {
          resolve(result);
        }
      };
      req.onerror = () => reject(req.error || new Error("IndexedDB export failed"));
    });
  },

  async importAll(data) {
    const store = await getStore("readwrite");
    const entries = Object.entries(data || {});
    for (const [key, value] of entries) {
      await wrapRequest(store.put(value, key));
    }
    return { imported: entries.length };
  },

  async clearAll() {
    const store = await getStore("readwrite");
    await wrapRequest(store.clear());
    return { cleared: true };
  },
};
