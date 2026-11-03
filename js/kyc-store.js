/* ==========================================================================
   Vijay Arya Bike Rentals — KYC document store
   Keeps customer Aadhaar / Driving Licence uploads for the shop to review.

   Documents are written to IndexedDB (large quota, survives restarts) with a
   localStorage fallback, so the admin panel can open them at any time.
   ========================================================================== */
(function (global) {
  'use strict';

  var DB_NAME = 'vijay_arya_kyc';
  var DB_VERSION = 1;
  var STORE = 'documents';
  var LS_KEY = 'vijay_arya_kyc_docs';

  var dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise(function (resolve, reject) {
      if (!global.indexedDB) { reject(new Error('IndexedDB unavailable')); return; }

      var req = global.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'bookingId' });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    }).catch(function (err) {
      dbPromise = null;
      throw err;
    });

    return dbPromise;
  }

  // ---- localStorage fallback -------------------------------------------
  function lsRead() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch (e) { return {}; }
  }

  function lsWrite(map) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(map));
      return true;
    } catch (e) {
      return false;
    }
  }

  var KycStore = {
    /**
     * Save a booking's documents.
     * @param {string} bookingId
     * @param {{aadhaar:Object|null, dl:Object|null}} docs  each {dataUrl, name, size, uploadedAt}
     * @returns {Promise<boolean>} true when stored
     */
    put: function (bookingId, docs) {
      if (!bookingId || !docs) return Promise.resolve(false);

      var record = {
        bookingId: bookingId,
        aadhaar: docs.aadhaar || null,
        dl: docs.dl || null,
        savedAt: new Date().toISOString()
      };

      return openDb().then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).put(record);
          tx.oncomplete = function () { resolve(true); };
          tx.onerror = function () { reject(tx.error); };
        });
      }).catch(function () {
        var map = lsRead();
        map[bookingId] = record;
        return lsWrite(map);
      });
    },

    /** Read one booking's documents. @returns {Promise<Object|null>} */
    get: function (bookingId) {
      if (!bookingId) return Promise.resolve(null);

      return openDb().then(function (db) {
        return new Promise(function (resolve, reject) {
          var req = db.transaction(STORE, 'readonly').objectStore(STORE).get(bookingId);
          req.onsuccess = function () { resolve(req.result || null); };
          req.onerror = function () { reject(req.error); };
        });
      }).catch(function () {
        return lsRead()[bookingId] || null;
      });
    },

    /** Every stored record, newest first. @returns {Promise<Array>} */
    all: function () {
      return openDb().then(function (db) {
        return new Promise(function (resolve, reject) {
          var req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
          req.onsuccess = function () { resolve(req.result || []); };
          req.onerror = function () { reject(req.error); };
        });
      }).catch(function () {
        var map = lsRead();
        return Object.keys(map).map(function (k) { return map[k]; });
      }).then(function (list) {
        return list.sort(function (a, b) {
          return String(b.savedAt || '').localeCompare(String(a.savedAt || ''));
        });
      });
    },

    /** Delete one booking's documents. @returns {Promise<boolean>} */
    remove: function (bookingId) {
      if (!bookingId) return Promise.resolve(false);

      return openDb().then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).delete(bookingId);
          tx.oncomplete = function () { resolve(true); };
          tx.onerror = function () { reject(tx.error); };
        });
      }).catch(function () {
        var map = lsRead();
        delete map[bookingId];
        return lsWrite(map);
      });
    }
  };

  global.KycStore = KycStore;
})(window);
