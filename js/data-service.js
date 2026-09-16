/* ==========================================================================
   Vijay Arya Bike Rentals — Data service
   --------------------------------------------------------------------------
   One API for the website and the admin panel.

   • When Firebase is configured  → Firestore + Storage + Auth (shared data:
     what the admin changes is what every customer sees, and every booking a
     customer makes lands in the admin panel).
   • When it is not configured    → browser storage, so the site still runs
     as a local demo exactly like before.

   Everything returns a Promise.
   ========================================================================== */
(function (global) {
  'use strict';

  var KEY_FLEET = 'vijay_arya_fleet';
  var KEY_BOOKINGS = 'vijay_arya_bookings';
  var COL_FLEET = 'vehicles';
  var COL_BOOKINGS = 'bookings';

  var app = null, db = null, storage = null, auth = null;
  var seedAttempted = false;
  var mode = 'local';

  // ---------------------------------------------------------------- setup
  function configured() {
    var c = global.FIREBASE_CONFIG;
    return Boolean(
      global.FIREBASE_ENABLED !== false &&
      c && c.apiKey && c.projectId && global.firebase
    );
  }

  function init() {
    if (mode !== 'local') return mode;
    if (!configured()) { mode = 'local'; return mode; }

    try {
      app = global.firebase.apps && global.firebase.apps.length
        ? global.firebase.app()
        : global.firebase.initializeApp(global.FIREBASE_CONFIG);

      db = global.firebase.firestore();

      // Default: force long-polling (plain XHR). It is the most compatible
      // transport and works behind antivirus / proxies / VPNs that silently
      // kill streaming. Set window.FIREBASE_FORCE_LONG_POLLING = false to let
      // the SDK auto-detect instead (slightly faster on clean networks).
      var forceLongPolling = global.FIREBASE_FORCE_LONG_POLLING !== false;

      try {
        // The two long-polling flags cannot both be present — not even with
        // `merge: true`, which would keep the SDK's default auto-detect flag.
        var settings = { useFetchStreams: false };
        if (forceLongPolling) {
          settings.experimentalForceLongPolling = true;
        } else {
          settings.experimentalAutoDetectLongPolling = true;
        }
        db.settings(settings);
        console.info('[firestore] transport:', forceLongPolling ? 'long-polling (forced)' : 'auto-detect');
      } catch (settingsErr) {
        console.info('Firestore settings notice:', settingsErr && settingsErr.message);
      }

      if (global.firebase.storage) storage = global.firebase.storage();
      if (global.firebase.auth) auth = global.firebase.auth();

      // Offline cache is a nice-to-have: it must never block or crash startup.
      // (failed-precondition = another tab owns it, unimplemented = browser
      // does not support it — both are safe to ignore.)
      try {
        var persistence = db.enablePersistence({ synchronizeTabs: true });
        if (persistence && persistence.catch) {
          persistence.catch(function (err) {
            console.info('Firestore offline cache not enabled:', err && err.code);
          });
        }
      } catch (persistErr) {
        console.info('Firestore offline cache unavailable:', persistErr && persistErr.message);
      }

      mode = 'firebase';
    } catch (err) {
      console.warn('Firebase init failed, using local storage:', err);
      mode = 'local';
    }
    return mode;
  }

  // ------------------------------------------------------- local fallback
  function lsGet(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }

  function lsSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { console.warn('Local storage write failed:', e); return false; }
  }

  // --------------------------------------------------------------- helpers
  function docsToArray(snap) {
    var out = [];
    snap.forEach(function (d) {
      var data = d.data();
      data.id = d.id;
      out.push(data);
    });
    return out;
  }

  var UPLOAD_TIMEOUT = 5000;   // Storage upload may never settle — cap it
  var WRITE_TIMEOUT = 5000;    // Same for a Firestore write

  /**
   * Resolve/reject `promise`, but never wait longer than `ms`.
   * @param {Promise} promise
   * @param {number} ms
   * @param {*} fallback   resolved value on timeout; if it is an Error the
   *                       race rejects with it instead
   */
  function withTimeout(promise, ms, fallback) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        if (fallback instanceof Error) reject(fallback); else resolve(fallback);
      }, ms);

      Promise.resolve(promise).then(function (value) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(value);
      }, function (err) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  /**
   * Upload a data URL and return its public download URL.
   * Never hangs and never rejects: on timeout or failure the original value is
   * returned, so the image keeps working (base64 preview) and Firestore is not
   * blocked by Storage rules / CORS / an unconfigured bucket.
   */
  function uploadDataUrl(path, dataUrl) {
    if (!storage || !dataUrl) return Promise.resolve(dataUrl || null);
    if (dataUrl.indexOf('data:') !== 0) return Promise.resolve(dataUrl); // already a URL

    try {
      var ref = storage.ref().child(path);
      var task = ref.putString(dataUrl, 'data_url').then(function () {
        return ref.getDownloadURL();
      });

      return withTimeout(task, UPLOAD_TIMEOUT, dataUrl).catch(function (err) {
        console.warn('Storage upload failed for ' + path + ' — keeping inline image:',
          (err && (err.code || err.message)) || err);
        return dataUrl;
      });
    } catch (e) {
      console.warn('Storage unavailable — keeping inline image:', e && e.message);
      return Promise.resolve(dataUrl);
    }
  }

  // Common seed fleet for initial population
  var DEFAULT_SEED_FLEET = [
    { id: 'vespa', name: 'Vespa', category: 'SCOOTER', rate: 500, advance: 500, image: 'assets/rentel-bikes/vespa_main_view.png', imageBack: 'assets/rentel-bikes/vespa_side_view.png', status: 'AVAILABLE', desc: 'Stylish Italian-inspired automatic scooter for comfortable cruising through White Town.' },
    { id: 'honda-activa', name: 'Honda Activa', category: 'SCOOTER', rate: 500, advance: 500, image: 'assets/rentel-bikes/honda_activa_main_view.png', imageBack: 'assets/rentel-bikes/honda_activa_side_view.png', status: 'AVAILABLE', desc: 'Reliable, smooth, and highly fuel-efficient 110cc scooter for daily Pondy rides.' },
    { id: 'tvs-jupiter', name: 'TVS Jupiter', category: 'SCOOTER', rate: 500, advance: 500, image: 'assets/rentel-bikes/tvs_jupiter_main_view.png', imageBack: 'assets/rentel-bikes/tvs_jupiter_side_view.png', status: 'AVAILABLE', desc: 'Comfortable ride with extra footboard space and plush suspension.' },
    { id: 'suzuki-access', name: 'Suzuki Access 125', category: 'SCOOTER', rate: 500, advance: 500, image: 'assets/rentel-bikes/suzuki_access_main_view.png', imageBack: 'assets/rentel-bikes/suzuki_access_side_view.png', status: 'AVAILABLE', desc: 'Powerful 125cc engine offering effortless pickup and comfortable seating.' },
    { id: 'honda-dio', name: 'Honda Dio', category: 'SCOOTER', rate: 500, advance: 500, image: 'assets/rentel-bikes/dio_main_view.png', imageBack: 'assets/rentel-bikes/dio_side_view.png', status: 'AVAILABLE', desc: 'Sporty design and lightweight handling, ideal for city sightseeing and cafes.' },
    { id: 'yamaha-fascino', name: 'Yamaha Fascino', category: 'SCOOTER', rate: 500, advance: 500, image: 'assets/rentel-bikes/yamaha_fascino_main_view.png', imageBack: 'assets/rentel-bikes/yamaha_fascino_side_view.png', status: 'AVAILABLE', desc: 'Classic retro aesthetics combined with Yamaha refined 125cc performance.' },
    { id: 'yamaha-ray', name: 'Yamaha Ray', category: 'SCOOTER', rate: 500, advance: 500, image: 'assets/rentel-bikes/yamaha_ray_main_view.png', imageBack: 'assets/rentel-bikes/yamaha_ray_side_view.png', status: 'AVAILABLE', desc: 'Aggressive street styling scooter with sharp maneuvering and easy handling.' },
    { id: 'honda-cliq', name: 'Honda Cliq', category: 'SCOOTER', rate: 500, advance: 500, image: 'assets/rentel-bikes/honda_clic_main_view.png', imageBack: 'assets/rentel-bikes/honda_clic_side_view.png', status: 'AVAILABLE', desc: 'Rugged, utilitarian automatic two-wheeler with block-pattern tyres.' },
    { id: 'honda-navi', name: 'Honda Navi', category: 'SCOOTER', rate: 500, advance: 500, image: 'assets/rentel-bikes/Honda_navi_main_view.png', imageBack: 'assets/rentel-bikes/honda_navi_side_view.png', status: 'AVAILABLE', desc: 'Fun-sized mini-bike experience with convenient automatic CVT transmission.' },
    { id: 'hero-splendor', name: 'Hero Splendor', category: 'BIKE', rate: 500, advance: 500, image: 'assets/rentel-bikes/hero_splender_main_view.png', imageBack: 'assets/rentel-bikes/hero_spleander_side_view.png', status: 'AVAILABLE', desc: 'Legendary Indian commuter motorcycle offering unmatched fuel efficiency.' },
    { id: 'yamaha-fz', name: 'Yamaha FZ', category: 'BIKE', rate: 500, advance: 500, image: 'assets/rentel-bikes/yamaha_fz_main_view.png', imageBack: 'assets/rentel-bikes/yamaha_fz_side_view.png', status: 'AVAILABLE', desc: 'Muscular street bike with superior road grip for cruising ECR and Auroville.' },
    { id: 're-gt650', name: 'Royal Enfield GT 650', category: 'BIKE', rate: 1200, advance: 500, image: 'assets/rentel-bikes/yamaha_fz_main_view.png', imageBack: 'assets/rentel-bikes/yamaha_fz_side_view.png', status: 'AVAILABLE', desc: 'Twin-cylinder cafe racer powerhouse for the ultimate coastal highway experience.' }
  ];

  // Ensure no undefined values reach Firestore
  function cleanDoc(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    var out = {};
    Object.keys(obj).forEach(function (k) {
      var val = obj[k];
      if (val === undefined) {
        out[k] = '';
      } else if (val !== null && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date)) {
        out[k] = cleanDoc(val);
      } else {
        out[k] = val;
      }
    });
    return out;
  }

  /**
   * Once Firestore holds any vehicle it is the single source of truth — the
   * defaults must NOT be folded back in, otherwise a vehicle the admin deletes
   * would reappear. Defaults are only used while the collection is still empty.
   */
  function mergeWithDefaults(liveItems) {
    if (liveItems && Array.isArray(liveItems) && liveItems.length > 0) {
      return liveItems;
    }
    return DEFAULT_SEED_FLEET.slice();
  }

  var DataService = {
    /** 'firebase' once connected, otherwise 'local'. */
    mode: function () { return init(); },
    isLive: function () { return init() === 'firebase'; },

    // ===================================================== FLEET (vehicles)

    /** All vehicles, newest first. @returns {Promise<Array>} */
    getFleet: function () {
      var cached = lsGet(KEY_FLEET, null);
      if (init() === 'firebase') {
        return db.collection(COL_FLEET).orderBy('createdAt', 'desc').get()
          .then(function (snap) {
            var items = docsToArray(snap);
            var merged = mergeWithDefaults(items);
            lsSet(KEY_FLEET, merged);
            return merged;
          })
          .catch(function (err) {
            console.warn('getFleet notice (using cached):', err && err.message);
            return cached || DEFAULT_SEED_FLEET;
          });
      }
      return Promise.resolve(cached || DEFAULT_SEED_FLEET);
    },

    /** Live updates — callback(fleetArray). @returns {Function} unsubscribe */
    watchFleet: function (callback) {
      var cached = lsGet(KEY_FLEET, null) || DEFAULT_SEED_FLEET;
      callback(cached);

      if (init() === 'firebase') {
        try {
          return db.collection(COL_FLEET)
            .onSnapshot(function (snap) {
              if (snap.empty) {
                // Seed once per page load — a failing seed must not retry in a loop
                if (!seedAttempted) {
                  seedAttempted = true;
                  console.log('[fleet] Firestore "' + COL_FLEET + '" is empty' +
                    (snap.metadata && snap.metadata.fromCache ? ' (from cache — offline)' : '') +
                    ' — seeding the standard fleet…');
                  DataService.seedAllDefaultsToFirestore().catch(function (err) {
                    console.error('[fleet] Auto-seed failed:', (err && err.code) || err.message);
                  });
                }

                // NEVER wipe the admin's own vehicles because the cloud reply
                // was empty (offline / not yet seeded) — keep what we have.
                var keep = lsGet(KEY_FLEET, null);
                callback(keep && keep.length ? keep : DEFAULT_SEED_FLEET.slice());
                return;
              }
              var live = docsToArray(snap);

              // Vehicles added while the cloud was unreachable are not in the
              // snapshot yet — keep showing them until they sync.
              var local = lsGet(KEY_FLEET, []) || [];
              var liveIds = {};
              live.forEach(function (v) { liveIds[v.id] = true; });

              local.forEach(function (v) {
                var isDefault = DEFAULT_SEED_FLEET.some(function (d) { return d.id === v.id; });
                if (!liveIds[v.id] && !isDefault) {
                  v.pendingSync = true;
                  live.push(v);
                  console.info('[fleet] "' + v.name + '" is not in Firestore yet (pending sync).');
                }
              });

              live.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
              lsSet(KEY_FLEET, live);
              callback(live);
            }, function (err) {
              console.error("[fleet] Live listener error:", (err && err.code) || err.message,
                err && err.code === "permission-denied"
                  ? "→ publish the Firestore rules from firebase-rules.txt"
                  : "");
            });
        } catch (e) {
          console.warn('watchFleet error:', e);
        }
      }
      return function () {};
    },

    /** Seed all default 12 bikes directly into Firestore */
    seedAllDefaultsToFirestore: function () {
      if (init() !== 'firebase') {
        return Promise.reject(new Error('Firebase is not configured (offline demo mode)'));
      }

      console.log('[seed] Writing ' + DEFAULT_SEED_FLEET.length +
        ' vehicles into Firestore collection "' + COL_FLEET + '" …');

      var batch = db.batch();
      DEFAULT_SEED_FLEET.forEach(function (v, i) {
        var ref = db.collection(COL_FLEET).doc(v.id);
        var copy = cleanDoc(JSON.parse(JSON.stringify(v)));
        copy.createdAt = Date.now() - (i * 1000);
        copy.updatedAt = Date.now();
        batch.set(ref, copy, { merge: true });
      });

      // NOTE: with offline persistence on, commit() only settles once the
      // server acknowledges the write. If it does not settle in time we ask the
      // server directly whether the documents actually landed, instead of
      // declaring failure — the write may simply be queued.
      var TIMED_OUT = '__timeout__';

      return withTimeout(batch.commit(), 10000, TIMED_OUT).then(function (result) {
        if (result !== TIMED_OUT) {
          console.log('[seed] ✓ Batch committed — ' + DEFAULT_SEED_FLEET.length +
            ' documents now live in Firestore/' + COL_FLEET);
          return DEFAULT_SEED_FLEET.length;
        }

        console.warn('[seed] Commit has not been acknowledged yet — verifying with the server…');
        return db.collection(COL_FLEET).get({ source: 'server' }).then(function (snap) {
          if (snap.size > 0) {
            console.log('[seed] ✓ Verified — ' + snap.size + ' documents are in Firestore.');
            return snap.size;
          }
          throw new Error('Firestore accepted no documents. The write is queued offline — ' +
            'the browser cannot reach firestore.googleapis.com.');
        }).catch(function (verifyErr) {
          throw enrich(verifyErr);
        });
      }).catch(function (err) {
        throw enrich(err);
      });

      function enrich(err) {
        var code = (err && err.code) || '';
        console.error('[seed] ✗ FAILED', code ? '(' + code + ')' : '', err);

        if (code === 'permission-denied') {
          err.hint = 'Firestore rules are blocking this write. Publish the rules from ' +
            'firebase-rules.txt (Firestore Database → Rules) and make sure you are signed in.';
        } else if (code === 'unavailable' || code === 'deadline-exceeded' ||
                   /queued offline|cannot reach/i.test(err.message || '')) {
          err.hint = 'The browser cannot reach Firestore. Usual causes:\n' +
            '  1. The Firestore database has not been created yet — Firebase console → ' +
            'Build → Firestore Database → Create database.\n' +
            '  2. An ad blocker / VPN / office firewall is blocking firestore.googleapis.com.\n' +
            '  3. No internet connection.';
        } else if (code === 'failed-precondition') {
          err.hint = 'Firestore reports the database is missing. Create it in the Firebase console ' +
            '(Build → Firestore Database → Create database).';
        }
        if (err.hint) console.error('[seed] ' + err.hint);
        return err;
      }
    },

    /**
     * Check what is (and is not) working. Resolves with a readable report.
     * @returns {Promise<{ok:boolean, lines:string[]}>}
     */
    diagnose: function () {
      var lines = [];
      var cfg = global.FIREBASE_CONFIG || {};

      lines.push('Firebase SDK loaded: ' + (global.firebase ? 'yes' : 'NO'));
      lines.push('Project: ' + (cfg.projectId || '(missing)'));
      lines.push('Mode: ' + init());
      lines.push('Signed in as: ' + ((auth && auth.currentUser && auth.currentUser.email) || 'not signed in'));
      lines.push('Browser online: ' + (navigator.onLine ? 'yes' : 'NO'));

      if (init() !== 'firebase') {
        return Promise.resolve({ ok: false, lines: lines });
      }

      return withTimeout(
        db.collection(COL_FLEET).limit(1).get({ source: 'server' }),
        8000,
        new Error('No reply from Firestore within 8s')
      ).then(function () {
        lines.push('Firestore server reachable: YES');
        return { ok: true, lines: lines };
      }).catch(function (err) {
        var code = (err && err.code) || (err && err.message) || 'unknown';
        lines.push('Firestore server reachable: NO (' + code + ')');

        if (code === 'permission-denied') {
          lines.push('→ Publish the rules from firebase-rules.txt.');
        } else {
          lines.push('→ Create the Firestore database in the Firebase console, and check');
          lines.push('  that no ad blocker / firewall blocks firestore.googleapis.com.');
        }
        return { ok: false, lines: lines };
      });
    },

    /** How many vehicle documents exist right now. @returns {Promise<number>} */
    countFleetDocs: function () {
      if (init() !== 'firebase') return Promise.resolve(-1);
      // Ask the server, not the offline cache — otherwise an unreachable
      // database looks "already populated" and seeding is skipped.
      return withTimeout(db.collection(COL_FLEET).get({ source: 'server' }),
        WRITE_TIMEOUT, new Error('no reply from Firestore'))
        .then(function (snap) { return snap.size; })
        .catch(function (err) {
          console.warn('[seed] Could not count vehicles:', (err && err.code) || err.message);
          return -1;
        });
    },

    /**
     * Create or update a vehicle. Photos given as data URLs are uploaded to
     * Storage and replaced by their download URL.
     * @returns {Promise<string>} vehicle id
     */
    saveVehicle: function (vehicle) {
      var v = JSON.parse(JSON.stringify(vehicle));
      var id = v.id || ('veh-' + Date.now().toString(36));
      v.id = id;
      if (!v.createdAt) v.createdAt = Date.now();
      v.updatedAt = Date.now();

      // Immediate local sync
      var fleet = lsGet(KEY_FLEET, DEFAULT_SEED_FLEET.slice());
      var idx = fleet.findIndex(function (x) { return x.id === id; });
      if (idx > -1) fleet[idx] = v; else fleet.unshift(v);
      lsSet(KEY_FLEET, fleet);

      if (init() !== 'firebase') {
        return Promise.resolve({ id: id, cloud: false, error: 'Offline demo mode' });
      }

      // 1. Photos — each capped at 5s, falls back to the inline image
      return Promise.all([
        uploadDataUrl('vehicles/' + id + '/front.jpg', v.image),
        uploadDataUrl('vehicles/' + id + '/back.jpg', v.imageBack)
      ]).then(function (urls) {
        if (urls[0]) v.image = urls[0];
        if (urls[1]) v.imageBack = urls[1];

        // Update local with final uploaded URLs
        var cur = lsGet(KEY_FLEET, []);
        var cIdx = cur.findIndex(function (x) { return x.id === id; });
        if (cIdx > -1) cur[cIdx] = v; else cur.unshift(v);
        lsSet(KEY_FLEET, cur);

        // 2. Firestore write — also capped, so the UI can never hang
        var write = db.collection(COL_FLEET).doc(id).set(cleanDoc(v), { merge: true });

        return withTimeout(write, WRITE_TIMEOUT, new Error('Firestore write timed out after 5s'))
          .then(function () {
            console.log('✓ Vehicle "' + v.name + '" written to Firestore/' + COL_FLEET + '/' + id);
            return { id: id, cloud: true, error: null };
          })
          .catch(function (err) {
            var msg = (err && (err.code || err.message)) || 'unknown error';
            console.error('Firestore write failed for vehicle ' + id + ':', err);
            return { id: id, cloud: false, error: msg };
          });
      }).catch(function (err) {
        var msg = (err && (err.code || err.message)) || 'unknown error';
        console.error('saveVehicle failed for ' + id + ':', err);
        return { id: id, cloud: false, error: msg };
      });
    },

    /** @returns {Promise<void>} */
    deleteVehicle: function (id) {
      var fleet = lsGet(KEY_FLEET, []);
      lsSet(KEY_FLEET, fleet.filter(function (x) { return x.id !== id; }));

      if (init() !== 'firebase') {
        return Promise.resolve();
      }
      return withTimeout(
        db.collection(COL_FLEET).doc(id).delete(),
        WRITE_TIMEOUT,
        new Error('Firestore delete timed out after 5s')
      ).then(function () {
        console.log('✓ Vehicle ' + id + ' removed from Firestore/' + COL_FLEET);
        return { cloud: true, error: null };
      }).catch(function (err) {
        var msg = (err && (err.code || err.message)) || 'unknown error';
        console.error('Firestore delete failed for ' + id + ':', err);
        return { cloud: false, error: msg };
      });
    },

    /** @returns {Promise<void>} */
    setVehicleStatus: function (id, status) {
      var fleet = lsGet(KEY_FLEET, []);
      fleet.forEach(function (v) { if (v.id === id) v.status = status; });
      lsSet(KEY_FLEET, fleet);

      if (init() !== 'firebase') return Promise.resolve({ cloud: false, error: 'offline' });

      return withTimeout(
        db.collection(COL_FLEET).doc(id).update({ status: status, updatedAt: Date.now() }),
        WRITE_TIMEOUT,
        new Error('Firestore status update timed out after 5s')
      ).then(function () {
        return { cloud: true, error: null };
      }).catch(function (err) {
        var msg = (err && (err.code || err.message)) || 'unknown error';
        console.error('Status update failed for ' + id + ':', err);
        return { cloud: false, error: msg };
      });
    },


    // ======================================================== BOOKINGS

    /** All bookings, newest first. @returns {Promise<Array>} */
    getBookings: function () {
      if (init() === 'firebase') {
        return db.collection(COL_BOOKINGS).orderBy('timestamp', 'desc').get()
          .then(docsToArray)
          .catch(function (err) {
            console.warn('getBookings failed, falling back to local:', err);
            return lsGet(KEY_BOOKINGS, []);
          });
      }
      return Promise.resolve(lsGet(KEY_BOOKINGS, []));
    },

    /** Live updates — callback(bookingsArray). @returns {Function} unsubscribe */
    watchBookings: function (callback) {
      if (init() === 'firebase') {
        return db.collection(COL_BOOKINGS).orderBy('timestamp', 'desc')
          .onSnapshot(function (snap) { callback(docsToArray(snap)); },
                      function (err) { console.warn('watchBookings:', err); });
      }
      callback(lsGet(KEY_BOOKINGS, []));
      return function () {};
    },

    /**
     * Save a new booking from the website. KYC images are uploaded to Storage
     * and the booking keeps their download URLs.
     * @returns {Promise<string>} bookingId
     */
    addBooking: function (booking) {
      var b = JSON.parse(JSON.stringify(booking));
      var id = b.bookingId;

      if (init() !== 'firebase') {
        var all = lsGet(KEY_BOOKINGS, []);
        all.unshift(b);
        lsSet(KEY_BOOKINGS, all);
        return Promise.resolve(id);
      }

      var aadhaarUrl = b.kycAadhaar && b.kycAadhaar.dataUrl
        ? uploadDataUrl('kyc/' + id + '/aadhaar.jpg', b.kycAadhaar.dataUrl)
        : Promise.resolve(null);

      var dlUrl = b.kycDl && b.kycDl.dataUrl
        ? uploadDataUrl('kyc/' + id + '/licence.jpg', b.kycDl.dataUrl)
        : Promise.resolve(null);

      return Promise.all([aadhaarUrl, dlUrl]).then(function (urls) {
        if (b.kycAadhaar) { b.kycAadhaar.dataUrl = urls[0]; b.kycAadhaar.url = urls[0]; }
        if (b.kycDl) { b.kycDl.dataUrl = urls[1]; b.kycDl.url = urls[1]; }
        b.timestamp = b.timestamp || new Date().toISOString();
        return db.collection(COL_BOOKINGS).doc(id).set(b).then(function () {
          var all = lsGet(KEY_BOOKINGS, []);
          var idx = all.findIndex(function (x) { return x.bookingId === id; });
          if (idx > -1) all[idx] = b; else all.unshift(b);
          lsSet(KEY_BOOKINGS, all);
          return id;
        });
      });
    },

    /** @returns {Promise<void>} */
    updateBooking: function (bookingId, changes) {
      if (init() !== 'firebase') {
        var all = lsGet(KEY_BOOKINGS, []);
        all.forEach(function (b) {
          if (b.bookingId === bookingId) Object.keys(changes).forEach(function (k) { b[k] = changes[k]; });
        });
        lsSet(KEY_BOOKINGS, all);
        return Promise.resolve();
      }
      return db.collection(COL_BOOKINGS).doc(bookingId).update(changes);
    },

    /** @returns {Promise<void>} */
    deleteBooking: function (bookingId) {
      if (init() !== 'firebase') {
        lsSet(KEY_BOOKINGS, lsGet(KEY_BOOKINGS, []).filter(function (b) { return b.bookingId !== bookingId; }));
        return Promise.resolve();
      }
      return db.collection(COL_BOOKINGS).doc(bookingId).delete();
    },

    // ============================================================ ADMIN AUTH

    /** @returns {Promise<Object>} the signed-in user */
    signIn: function (email, password) {
      if (init() !== 'firebase' || !auth) {
        return Promise.reject(new Error('offline'));
      }
      return auth.signInWithEmailAndPassword(email, password);
    },

    signOut: function () {
      if (auth) return auth.signOut();
      return Promise.resolve();
    },

    /** callback(user|null). @returns {Function} unsubscribe */
    onAuth: function (callback) {
      if (init() !== 'firebase' || !auth) { callback(null); return function () {}; }
      return auth.onAuthStateChanged(callback);
    },

    currentUser: function () {
      return (auth && auth.currentUser) || null;
    }
  };

  global.DataService = DataService;
})(window);
