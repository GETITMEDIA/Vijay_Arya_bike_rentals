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
  var olderBookings = [];      // pages fetched beyond the live window
  var lastLiveDoc = null;      // cursor for startAfter()
  var hasMoreBookings = false;
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
  var BOOKINGS_PAGE = 50;      // Newest N bookings held live; older ones on demand

  // ------------------------------------------------- shared live listeners
  // One Firestore listener per collection, however many parts of the page ask
  // for the data. Re-rendering or switching tabs must never open a new one.
  var listeners = {};          // name → { unsubscribe, subscribers[], last }

  function subscribe(name, start, callback) {
    var entry = listeners[name];

    if (!entry) {
      entry = listeners[name] = { subscribers: [], unsubscribe: null, last: null };
      entry.unsubscribe = start(function (data) {
        entry.last = data;
        entry.subscribers.forEach(function (fn) {
          try { fn(data); } catch (e) { console.error('[' + name + '] subscriber error:', e); }
        });
      });
      console.info('[' + name + '] live listener opened');
    } else if (entry.last) {
      callback(entry.last);          // serve the snapshot we already hold
    }

    entry.subscribers.push(callback);

    return function stop() {
      entry.subscribers = entry.subscribers.filter(function (fn) { return fn !== callback; });
      if (entry.subscribers.length === 0 && entry.unsubscribe) {
        entry.unsubscribe();
        delete listeners[name];
        console.info('[' + name + '] live listener closed');
      }
    };
  }

  // Detach everything when the page goes away
  global.addEventListener('pagehide', function () {
    Object.keys(listeners).forEach(function (k) {
      if (listeners[k].unsubscribe) listeners[k].unsubscribe();
    });
    listeners = {};
  });

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

  /**
   * Delete every file under a Storage folder. Best effort — a failure here
   * must never stop the Firestore delete that it accompanies.
   */
  function deleteStorageFolder(path) {
    if (!storage) return Promise.resolve();

    return storage.ref(path).listAll().then(function (res) {
      return Promise.all(res.items.map(function (item) { return item.delete(); }));
    }).then(function () {
      console.log('[storage] cleared ' + path);
    }).catch(function (err) {
      console.info('[storage] could not clear ' + path + ':', (err && err.code) || err.message);
    });
  }

  // Common seed fleet for initial population
  var DEFAULT_SEED_FLEET = [
    { id: 'vespa', name: 'Vespa', category: 'SCOOTER', colors: [{ name: 'Peach Green', hex: '#A8D5BA', image: 'assets/rentel-bikes/vespa_main_view.png', imageBack: 'assets/rentel-bikes/vespa_side_view.png', status: 'AVAILABLE' }, { name: 'Red', hex: '#D0202E', image: 'assets/rentel-bikes/vespa_red_main_view.png', imageBack: 'assets/rentel-bikes/vespa_red_side_view.png', status: 'AVAILABLE' }, { name: 'Black', hex: '#1C1917', image: 'assets/rentel-bikes/vespa_black_main_view.png', imageBack: 'assets/rentel-bikes/vespa_black_side_view.png', status: 'AVAILABLE' }, { name: 'Light Blue', hex: '#9CC6DA', image: 'assets/rentel-bikes/vespa_light_blue_main_view.png', imageBack: 'assets/rentel-bikes/vespa_light_blue_side_view.png', status: 'AVAILABLE' }], rate: 500, advance: 500, image: 'assets/rentel-bikes/vespa_main_view.png', imageBack: 'assets/rentel-bikes/vespa_side_view.png', status: 'AVAILABLE', desc: 'Stylish Italian-inspired automatic scooter for comfortable cruising through White Town.' },
    { id: 'honda-activa', name: 'Honda Activa', category: 'SCOOTER', rate: 500, advance: 500, image: 'assets/rentel-bikes/honda_activa_main_view.png', imageBack: 'assets/rentel-bikes/honda_activa_side_view.png', status: 'AVAILABLE', desc: 'Reliable, smooth, and highly fuel-efficient 110cc scooter for daily Pondy rides.' },
    { id: 'tvs-jupiter', name: 'TVS Jupiter', category: 'SCOOTER', rate: 500, advance: 500, image: 'assets/rentel-bikes/tvs_jupiter_main_view.png', imageBack: 'assets/rentel-bikes/tvs_jupiter_side_view.png', status: 'AVAILABLE', desc: 'Comfortable ride with extra footboard space and plush suspension.' },
    { id: 'suzuki-access', name: 'Suzuki Access 125', category: 'SCOOTER', rate: 500, advance: 500, image: 'assets/rentel-bikes/suzuki_access_main_view.png', imageBack: 'assets/rentel-bikes/suzuki_access_side_view.png', status: 'AVAILABLE', desc: 'Powerful 125cc engine offering effortless pickup and comfortable seating.' },
    { id: 'honda-dio', name: 'Honda Dio', category: 'SCOOTER', rate: 500, advance: 500, image: 'assets/rentel-bikes/dio_main_view.png', imageBack: 'assets/rentel-bikes/dio_side_view.png', status: 'AVAILABLE', desc: 'Sporty design and lightweight handling, ideal for city sightseeing and cafes.' },
    { id: 'yamaha-fascino', name: 'Yamaha Fascino', category: 'SCOOTER', rate: 500, advance: 500, image: 'assets/rentel-bikes/yamaha_fascino_main_view.png', imageBack: 'assets/rentel-bikes/yamaha_fascino_side_view.png', status: 'AVAILABLE', desc: 'Classic retro aesthetics combined with Yamaha refined 125cc performance.' },
    { id: 'yamaha-ray', name: 'Yamaha Ray', category: 'SCOOTER', rate: 500, advance: 500, image: 'assets/rentel-bikes/yamaha_ray_main_view.png', imageBack: 'assets/rentel-bikes/yamaha_ray_side_view.png', status: 'AVAILABLE', desc: 'Aggressive street styling scooter with sharp maneuvering and easy handling.' },
    { id: 'honda-cliq', name: 'Honda Cliq', category: 'SCOOTER', rate: 500, advance: 500, image: 'assets/rentel-bikes/honda_clic_main_view.png', imageBack: 'assets/rentel-bikes/honda_clic_side_view.png', status: 'AVAILABLE', desc: 'Rugged, utilitarian automatic two-wheeler with block-pattern tyres.' },
    { id: 'honda-navi', name: 'Honda Navi', category: 'SCOOTER', rate: 500, advance: 500, image: 'assets/rentel-bikes/Honda_navi_main_view.png', imageBack: 'assets/rentel-bikes/honda_navi_side_view.png', status: 'AVAILABLE', desc: 'Fun-sized mini-bike experience with convenient automatic CVT transmission.' }
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
      // Paint instantly from cache, then let the live snapshot take over
      callback(lsGet(KEY_FLEET, null) || DEFAULT_SEED_FLEET);

      if (init() !== 'firebase') return function () {};

      return subscribe('fleet', function (emit) {
        return db.collection(COL_FLEET).onSnapshot(function (snap) {
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

            // NEVER wipe the admin's own vehicles because the cloud reply was
            // empty (offline / not yet seeded) — keep what we have.
            var keep = lsGet(KEY_FLEET, null);
            emit(keep && keep.length ? keep : DEFAULT_SEED_FLEET.slice());
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
          emit(live);
        }, function (err) {
          console.error('[fleet] Live listener error:', (err && err.code) || err.message,
            err && err.code === 'permission-denied'
              ? '→ publish the Firestore rules from firebase-rules.txt'
              : '');
        });
      }, callback);
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

    /**
     * The shop rents scooters only. Remove the motorcycles that were part of
     * the original seed list (Hero Splendor, Yamaha FZ, Royal Enfield GT 650)
     * from Firestore and from the local cache. Safe to call every time — it
     * only touches those three document ids.
     * @returns {Promise<number>} how many were removed
     */
    removeRetiredVehicles: function () {
      var RETIRED = ['hero-splendor', 'yamaha-fz', 're-gt650'];

      var local = lsGet(KEY_FLEET, []) || [];
      var kept = local.filter(function (v) { return RETIRED.indexOf(v.id) === -1; });
      if (kept.length !== local.length) lsSet(KEY_FLEET, kept);

      if (init() !== 'firebase') return Promise.resolve(local.length - kept.length);

      return Promise.all(RETIRED.map(function (id) {
        var ref = db.collection(COL_FLEET).doc(id);
        return ref.get({ source: 'server' }).then(function (snap) {
          if (!snap.exists) return 0;
          deleteStorageFolder('vehicles/' + id);
          return ref.delete().then(function () {
            console.log('[fleet] removed motorcycle "' + id + '" (scooters only)');
            return 1;
          });
        }).catch(function (err) {
          console.info('[fleet] could not check "' + id + '":', (err && err.code) || err.message);
          return 0;
        });
      })).then(function (results) {
        return results.reduce(function (a, b) { return a + b; }, 0);
      });
    },


    /**
     * Vehicles seeded before colour options existed have no `colors` field.
     * Copy the built-in list onto those documents, once.
     * @returns {Promise<number>} how many vehicles were updated
     */
    backfillColors: function () {
      if (init() !== 'firebase') return Promise.resolve(0);

      var withColors = DEFAULT_SEED_FLEET.filter(function (d) { return d.colors && d.colors.length; });

      return Promise.all(withColors.map(function (d) {
        var ref = db.collection(COL_FLEET).doc(d.id);

        return ref.get({ source: 'server' }).then(function (snap) {
          if (!snap.exists) return 0;

          var data = snap.data() || {};
          if (data.colors && data.colors.length) return 0;        // already has colours

          return ref.update({
            colors: d.colors.map(function (c) { return cleanDoc(c); }),
            updatedAt: Date.now()
          }).then(function () {
            console.log('[fleet] colour options added to "' + d.id + '"');
            return 1;
          });
        }).catch(function (err) {
          console.info('[fleet] colour backfill skipped for "' + d.id + '":', (err && err.code) || err.message);
          return 0;
        });
      })).then(function (results) {
        return results.reduce(function (a, b) { return a + b; }, 0);
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

      // Snapshot of the stored version BEFORE the local mirror overwrites it —
      // this is what the changed-field diff is computed against.
      var previousDoc = (lsGet(KEY_FLEET, []) || []).filter(function (x) { return x.id === id; })[0];
      if (previousDoc) previousDoc = JSON.parse(JSON.stringify(previousDoc));

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

        // 2. Build the Firestore document.
        //    A Firestore document may not exceed 1 MiB. If a Storage upload
        //    failed we still hold a base64 image — sending that would make the
        //    whole write fail, so it is dropped from the cloud copy (the photo
        //    stays available locally and is retried on the next save).
        var docData = cleanDoc(v);
        var droppedPhotos = [];

        ['image', 'imageBack'].forEach(function (key) {
          var val = docData[key];
          if (typeof val === 'string' && val.indexOf('data:') === 0 && val.length > 300000) {
            docData[key] = '';
            droppedPhotos.push(key === 'image' ? 'front' : 'back');
          }
        });

        if (droppedPhotos.length) {
          console.warn('[vehicle] Photo(s) too large for Firestore (' + droppedPhotos.join(', ') +
            ') — saved without them. Enable Firebase Storage so photos upload properly.');
        }

        // Editing an existing vehicle? Send only the fields that actually
        // changed, so untouched data (and its photo URLs) is not rewritten.
        var docRef = db.collection(COL_FLEET).doc(id);
        var write;

        if (vehicle.id && previousDoc && previousDoc.createdAt) {
          var diff = {};
          Object.keys(docData).forEach(function (k) {
            if (k === 'updatedAt') { diff[k] = docData[k]; return; }
            if (JSON.stringify(docData[k]) !== JSON.stringify(previousDoc[k])) diff[k] = docData[k];
          });

          if (Object.keys(diff).length <= 1) {
            console.log('[vehicle] nothing changed for ' + id + ' — no write sent');
            return { id: id, cloud: true, error: null, photosDropped: droppedPhotos };
          }

          console.log('[vehicle] updating ' + Object.keys(diff).length + ' field(s):',
            Object.keys(diff).join(', '));
          write = docRef.set(diff, { merge: true });
        } else {
          write = docRef.set(docData, { merge: true });
        }

        return withTimeout(write, WRITE_TIMEOUT, new Error('Firestore write timed out after 5s'))
          .then(function () {
            console.log('✓ Vehicle "' + v.name + '" written to Firestore/' + COL_FLEET + '/' + id +
              (droppedPhotos.length ? ' (without ' + droppedPhotos.join(' & ') + ' photo)' : ''));
            return {
              id: id,
              cloud: true,
              error: null,
              photosDropped: droppedPhotos
            };
          })
          .catch(function (err) {
            var code = (err && err.code) || '';
            var msg = (err && (err.code || err.message)) || 'unknown error';
            console.error('Firestore write failed for vehicle ' + id + ':', err);

            if (code === 'permission-denied') {
              msg = 'permission-denied — sign in again, or publish the Firestore rules';
            } else if (code === 'invalid-argument') {
              msg = 'the vehicle data is too large for one document (photo size)';
            }
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
      // Remove the photos too, so Storage does not fill up with orphans
      deleteStorageFolder('vehicles/' + id);

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
      // Instant paint from the cached page, then the live snapshot
      var cached = lsGet(KEY_BOOKINGS, []);
      if (cached && cached.length) callback(cached);

      if (init() !== 'firebase') {
        if (!cached || !cached.length) callback([]);
        return function () {};
      }

      return subscribe('bookings', function (emit) {
        // Only the newest page stays live — older bookings load on demand
        return db.collection(COL_BOOKINGS)
          .orderBy('timestamp', 'desc')
          .limit(BOOKINGS_PAGE)
          .onSnapshot(function (snap) {
            var live = docsToArray(snap);
            olderBookings = olderBookings.filter(function (o) {
              return !live.some(function (b) { return b.bookingId === o.bookingId; });
            });

            var all = live.concat(olderBookings);
            lastLiveDoc = snap.docs.length ? snap.docs[snap.docs.length - 1] : null;
            hasMoreBookings = snap.size === BOOKINGS_PAGE;

            lsSet(KEY_BOOKINGS, all);
            emit(all);
          }, function (err) {
            console.error('[bookings] Live listener error:', (err && err.code) || err.message);
          });
      }, callback);
    },

    /** True when older bookings remain beyond the loaded page. */
    hasMoreBookings: function () { return hasMoreBookings; },

    /**
     * Fetch the next page of older bookings (one read batch, no listener).
     * @returns {Promise<Array>} the full list, newest first
     */
    loadMoreBookings: function () {
      if (init() !== 'firebase' || !lastLiveDoc) {
        return Promise.resolve(lsGet(KEY_BOOKINGS, []));
      }

      var query = db.collection(COL_BOOKINGS)
        .orderBy('timestamp', 'desc')
        .startAfter(lastLiveDoc)
        .limit(BOOKINGS_PAGE);

      return withTimeout(query.get(), WRITE_TIMEOUT, new Error('no reply from Firestore'))
        .then(function (snap) {
          var page = docsToArray(snap);
          if (snap.docs.length) lastLiveDoc = snap.docs[snap.docs.length - 1];
          hasMoreBookings = snap.size === BOOKINGS_PAGE;

          page.forEach(function (b) {
            if (!olderBookings.some(function (o) { return o.bookingId === b.bookingId; })) {
              olderBookings.push(b);
            }
          });

          var all = lsGet(KEY_BOOKINGS, []).concat(page);
          lsSet(KEY_BOOKINGS, all);
          console.log('[bookings] loaded ' + page.length + ' older booking(s)');
          return all;
        });
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
      // Mirror locally first so the table reacts immediately
      var all = lsGet(KEY_BOOKINGS, []);
      all.forEach(function (b) {
        if (b.bookingId === bookingId) Object.keys(changes).forEach(function (k) { b[k] = changes[k]; });
      });
      lsSet(KEY_BOOKINGS, all);

      if (init() !== 'firebase') return Promise.resolve({ cloud: false, error: 'offline' });

      // update() sends only these fields — unchanged data is not rewritten
      return withTimeout(
        db.collection(COL_BOOKINGS).doc(bookingId).update(cleanDoc(changes)),
        WRITE_TIMEOUT,
        new Error('Firestore update timed out after 5s')
      ).then(function () {
        return { cloud: true, error: null };
      }).catch(function (err) {
        var msg = (err && (err.code || err.message)) || 'unknown error';
        console.error('Booking update failed for ' + bookingId + ':', err);
        return { cloud: false, error: msg };
      });
    },

    /** @returns {Promise<void>} */
    deleteBooking: function (bookingId) {
      lsSet(KEY_BOOKINGS, lsGet(KEY_BOOKINGS, []).filter(function (b) { return b.bookingId !== bookingId; }));
      olderBookings = olderBookings.filter(function (b) { return b.bookingId !== bookingId; });

      if (init() !== 'firebase') return Promise.resolve({ cloud: false, error: 'offline' });

      // The customer's KYC documents go with the booking
      deleteStorageFolder('kyc/' + bookingId);

      return withTimeout(
        db.collection(COL_BOOKINGS).doc(bookingId).delete(),
        WRITE_TIMEOUT,
        new Error('Firestore delete timed out after 5s')
      ).then(function () {
        console.log('✓ Booking ' + bookingId + ' removed from Firestore/' + COL_BOOKINGS);
        return { cloud: true, error: null };
      }).catch(function (err) {
        var msg = (err && (err.code || err.message)) || 'unknown error';
        console.error('Booking delete failed for ' + bookingId + ':', err);
        return { cloud: false, error: msg };
      });
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
