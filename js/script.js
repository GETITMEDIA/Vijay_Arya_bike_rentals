/* ==========================================================================
   Vijay Arya Bike Rentals — vanilla JS
   Sticky header · mobile nav · scroll spy · gallery lightbox · testimonial
   scroller · FAQ accordion · reveal on scroll · dynamic years · scroll
   progress · year count-up · booking modal with Rs.500 UPI advance
   No dependencies. Every block guards against missing markup.
   ========================================================================== */
(function () {
  'use strict';

  document.documentElement.classList.add('js');

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $  = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ------------------------------------------------------------------
     1. Footer year + years-in-business (calculated, never hardcoded)
     ------------------------------------------------------------------ */
  (function years() {
    var now = new Date().getFullYear();
    var yearEl = document.getElementById('year');
    if (yearEl) yearEl.textContent = String(now);

    var span = now - 1973;
    if (span > 0) {
      $$('[data-years-phrase]').forEach(function (el) {
        el.textContent = 'More than ' + Math.floor(span / 10) * 10 + ' years';
      });
    }
  })();

  /* ------------------------------------------------------------------
     2. Header state on scroll
     ------------------------------------------------------------------ */
  (function header() {
    var el = document.getElementById('siteHeader');
    if (!el) return;
    var ticking = false;
    var lastScrollY = window.scrollY;

    function update() {
      var currentScrollY = window.scrollY;
      
      // Toggle shadow/background on scroll
      el.classList.toggle('is-scrolled', currentScrollY > 12);
      
      // Smart header: hide on scroll down, show on scroll up
      if (currentScrollY > 150 && currentScrollY > lastScrollY) {
        el.classList.add('is-hidden');
      } else if (currentScrollY < lastScrollY) {
        el.classList.remove('is-hidden');
      }
      
      lastScrollY = currentScrollY;
      ticking = false;
    }
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
    }, { passive: true });
    update();
  })();

  /* ------------------------------------------------------------------
     3. Mobile navigation (focus-trapped drawer)
     ------------------------------------------------------------------ */
  (function mobileNav() {
    var toggle  = document.getElementById('menuToggle');
    var closeBt = document.getElementById('menuClose');
    var nav     = document.getElementById('mobileNav');
    var overlay = document.getElementById('navOverlay');
    if (!toggle || !nav || !overlay) return;

    var isOpen = false;

    function focusables() {
      return $$('a[href], button:not([disabled])', nav);
    }

    function open() {
      isOpen = true;
      nav.hidden = false;
      overlay.hidden = false;
      // next frame so the transition runs from the closed state
      window.requestAnimationFrame(function () {
        nav.classList.add('is-open');
        overlay.classList.add('is-open');
      });
      toggle.setAttribute('aria-expanded', 'true');
      document.body.classList.add('nav-open');
      var f = focusables();
      if (f.length) f[0].focus();
    }

    function close(returnFocus) {
      if (!isOpen) return;
      isOpen = false;
      nav.classList.remove('is-open');
      overlay.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('nav-open');

      var done = function () {
        if (!isOpen) { nav.hidden = true; overlay.hidden = true; }
      };
      if (reduceMotion) { done(); } else { window.setTimeout(done, 280); }
      if (returnFocus !== false) toggle.focus();
    }

    toggle.addEventListener('click', function () { isOpen ? close() : open(); });
    if (closeBt) closeBt.addEventListener('click', function () { close(); });
    overlay.addEventListener('click', function () { close(); });

    $$('.nav-link-m', nav).forEach(function (link) {
      link.addEventListener('click', function () { close(false); });
    });

    document.addEventListener('keydown', function (e) {
      if (!isOpen) return;
      if (e.key === 'Escape') { close(); return; }
      if (e.key !== 'Tab') return;

      var f = focusables();
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    // Close the drawer if the viewport grows back to desktop
    window.addEventListener('resize', function () {
      if (isOpen && window.innerWidth > 900) close(false);
    });
  })();

  /* ------------------------------------------------------------------
     4. Smooth scroll for in-page anchors, offset by the sticky header
     ------------------------------------------------------------------ */
  (function smoothScroll() {
    function headerOffset() {
      var h = document.getElementById('siteHeader');
      return (h ? h.offsetHeight : 0) + 16;
    }

    document.addEventListener('click', function (e) {
      var link = e.target.closest ? e.target.closest('a[href^="#"]') : null;
      if (!link) return;
      // The skip link needs the browser's native jump so focus moves with it
      if (link.classList.contains('skip-link')) return;

      var hash = link.getAttribute('href');
      if (!hash || hash === '#' || hash.length < 2) return;

      var target = document.getElementById(hash.slice(1));
      if (!target) return;

      e.preventDefault();

      var top = hash === '#top'
        ? 0
        : window.scrollY + target.getBoundingClientRect().top - headerOffset();

      window.scrollTo({ top: Math.max(0, top), behavior: reduceMotion ? 'auto' : 'smooth' });

      if (history.replaceState) history.replaceState(null, '', hash);
    });
  })();

  /* ------------------------------------------------------------------
     5. Scroll spy — Home / About / Gallery / Contact
     ------------------------------------------------------------------ */
  (function scrollSpy() {
    var links = $$('.nav-link').concat($$('.nav-link-m'));
    if (!links.length) return;

    // Sections the primary nav points at, in document order
    var ids = ['top', 'about', 'gallery', 'contact'];
    var sections = ids.map(function (id) { return document.getElementById(id); })
                      .filter(Boolean);
    if (!sections.length) return;

    var ticking = false;

    function setActive(id) {
      links.forEach(function (l) {
        l.classList.toggle('is-active', l.getAttribute('href') === '#' + id);
      });
    }

    function update() {
      ticking = false;
      var probe = window.scrollY + (window.innerHeight * 0.3);
      var current = 'top';

      sections.forEach(function (sec) {
        if (sec.id === 'top') return;
        if (sec.offsetTop <= probe) current = sec.id;
      });

      // Bottom of the page always lights up the last nav item
      if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 8) {
        current = 'contact';
      }
      setActive(current);
    }

    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
    }, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    update();
  })();

  /* ------------------------------------------------------------------
     6. Gallery lightbox
     ------------------------------------------------------------------ */
  (function lightbox() {
    var box = document.getElementById('lightbox');
    var img = document.getElementById('lbImg');
    var cap = document.getElementById('lbCap');
    var count = document.getElementById('lbCount');
    var btnClose = document.getElementById('lbClose');
    var btnPrev = document.getElementById('lbPrev');
    var btnNext = document.getElementById('lbNext');

    if (!box || !img) return;

    var slides = [];
    var index = 0;
    var lastFocus = null;

    function buildSlides() {
      var triggers = $$('.gal-item');
      slides = triggers.map(function (btn) {
        var i = btn.querySelector('img');
        return {
          src: i ? i.getAttribute('src') : '',
          alt: i ? (i.getAttribute('alt') || i.getAttribute('title') || '') : '',
          element: btn
        };
      }).filter(function(s) { return s.src !== ''; });
    }

    function render() {
      if (!slides.length) return;
      var s = slides[index];
      if (!s) return;
      img.setAttribute('src', s.src);
      img.setAttribute('alt', s.alt);
      if (cap) cap.textContent = s.alt;
      if (count) count.textContent = (index + 1) + ' / ' + slides.length;
    }

    function openSlide(targetIdx) {
      if (targetIdx < 0 || targetIdx >= slides.length) return;
      index = targetIdx;
      lastFocus = document.activeElement;
      render();
      box.hidden = false;
      window.requestAnimationFrame(function () { box.classList.add('is-open'); });
      document.body.classList.add('lb-open');
      if (btnClose) btnClose.focus();
    }

    function close() {
      box.classList.remove('is-open');
      document.body.classList.remove('lb-open');
      var done = function () { box.hidden = true; };
      if (reduceMotion) done(); else window.setTimeout(done, 220);
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    function step(dir) {
      if (!slides.length) return;
      index = (index + dir + slides.length) % slides.length;
      render();
    }

    document.addEventListener('click', function (e) {
      var btn = e.target.closest('.gal-item');
      if (!btn) return;

      e.preventDefault();
      buildSlides();

      // Find the clicked button's exact index in slides!
      var foundIdx = slides.findIndex(function(s) {
        return s.element === btn;
      });

      // Fallback: match by img src if element reference differs
      if (foundIdx === -1) {
        var clickedImg = btn.querySelector('img');
        var clickedSrc = clickedImg ? clickedImg.getAttribute('src') : '';
        if (clickedSrc) {
          foundIdx = slides.findIndex(function(s) { return s.src === clickedSrc; });
        }
      }

      if (foundIdx !== -1) {
        openSlide(foundIdx);
      }
    });

    if (btnClose) btnClose.addEventListener('click', close);
    if (btnPrev) btnPrev.addEventListener('click', function () { step(-1); });
    if (btnNext) btnNext.addEventListener('click', function () { step(1); });

    box.addEventListener('click', function (e) {
      if (e.target === box || (e.target && e.target.classList && e.target.classList.contains('lb-figure'))) close();
    });

    document.addEventListener('keydown', function (e) {
      if (box.hidden) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'Tab') {
        // keep focus inside the dialog
        var f = $$('button', box);
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });

    // Swipe on touch devices
    var startX = null;
    box.addEventListener('touchstart', function (e) {
      startX = e.changedTouches[0].clientX;
    }, { passive: true });
    box.addEventListener('touchend', function (e) {
      if (startX === null) return;
      var dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 45) step(dx < 0 ? 1 : -1);
      startX = null;
    }, { passive: true });
  })();

  /* ------------------------------------------------------------------
     7. Testimonial scroller
     ------------------------------------------------------------------ */
  (function testimonials() {
    var track = document.getElementById('testScroller');
    var prev = document.getElementById('testPrev');
    var next = document.getElementById('testNext');
    if (!track) return;

    var autoPlayTimer = null;
    var isHovered = false;

    function stepSize() {
      var card = track.querySelector('.test-card');
      if (!card) return track.clientWidth;
      var gap = parseFloat(getComputedStyle(track).columnGap || '24') || 24;
      return card.getBoundingClientRect().width + gap;
    }

    function go(dir) {
      var max = track.scrollWidth - track.clientWidth - 2;
      if (dir === 1 && track.scrollLeft >= max - 8) {
        track.scrollTo({ left: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
      } else if (dir === -1 && track.scrollLeft <= 8) {
        track.scrollTo({ left: max, behavior: reduceMotion ? 'auto' : 'smooth' });
      } else {
        track.scrollBy({ left: dir * stepSize(), behavior: reduceMotion ? 'auto' : 'smooth' });
      }
    }

    if (prev) prev.addEventListener('click', function () { go(-1); resetAutoPlay(); });
    if (next) next.addEventListener('click', function () { go(1); resetAutoPlay(); });

    function syncButtons() {
      var max = track.scrollWidth - track.clientWidth - 2;
      if (prev) prev.disabled = false;
      if (next) next.disabled = false;
    }

    track.addEventListener('scroll', syncButtons, { passive: true });
    window.addEventListener('resize', syncButtons, { passive: true });
    syncButtons();

    // Auto-play continuous animation loop
    function startAutoPlay() {
      if (reduceMotion || autoPlayTimer) return;
      autoPlayTimer = setInterval(function() {
        if (!isHovered) {
          go(1);
        }
      }, 3500);
    }

    function stopAutoPlay() {
      if (autoPlayTimer) {
        clearInterval(autoPlayTimer);
        autoPlayTimer = null;
      }
    }

    function resetAutoPlay() {
      stopAutoPlay();
      startAutoPlay();
    }

    track.addEventListener('mouseenter', function() { isHovered = true; });
    track.addEventListener('mouseleave', function() { isHovered = false; });
    startAutoPlay();

    // Arrow keys when the scroller has focus
    track.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1); resetAutoPlay(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); resetAutoPlay(); }
    });
  })();

  /* ------------------------------------------------------------------
     8. FAQ accordion (height-animated, one open at a time)
     ------------------------------------------------------------------ */
  (function accordion() {
    var root = document.getElementById('faqAcc');
    if (!root) return;

    var items = $$('.acc-item', root).map(function (item) {
      return {
        btn: $('.acc-btn', item),
        panel: $('.acc-panel', item),
        inner: $('.acc-inner', item)
      };
    }).filter(function (o) { return o.btn && o.panel && o.inner; });

    function collapse(o) {
      o.btn.setAttribute('aria-expanded', 'false');
      o.panel.style.height = o.inner.offsetHeight + 'px';
      window.requestAnimationFrame(function () { o.panel.style.height = '0px'; });
    }

    function expand(o) {
      o.btn.setAttribute('aria-expanded', 'true');
      o.panel.style.height = o.inner.offsetHeight + 'px';
    }

    items.forEach(function (o, i) {
      var panelId = 'faq-panel-' + i;
      o.panel.id = panelId;
      o.panel.setAttribute('role', 'region');
      o.btn.setAttribute('aria-controls', panelId);
      o.panel.style.height = '0px';

      o.btn.addEventListener('click', function () {
        var willOpen = o.btn.getAttribute('aria-expanded') !== 'true';
        items.forEach(function (other) {
          if (other.btn.getAttribute('aria-expanded') === 'true') collapse(other);
        });
        if (willOpen) expand(o);
      });

      // Let an open panel settle to auto height so it reflows on resize
      o.panel.addEventListener('transitionend', function (e) {
        if (e.propertyName !== 'height') return;
        if (o.btn.getAttribute('aria-expanded') === 'true') o.panel.style.height = 'auto';
      });
    });

    window.addEventListener('resize', function () {
      items.forEach(function (o) {
        if (o.btn.getAttribute('aria-expanded') === 'true') o.panel.style.height = 'auto';
      });
    }, { passive: true });
  })();

  /* ------------------------------------------------------------------
     9. Reveal on scroll
     ------------------------------------------------------------------ */
  (function reveal() {
    var items = $$('.reveal');
    if (!items.length) return;

    if (reduceMotion || !('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });

    items.forEach(function (el) { io.observe(el); });
  })();

  /* ------------------------------------------------------------------
     10. Flag any image that fails to load, so it never shows a broken icon
     ------------------------------------------------------------------ */
  (function imageGuard() {
    $$('img').forEach(function (img) {
      img.addEventListener('error', function () {
        img.style.visibility = 'hidden';
        if (window.console && console.warn) {
          console.warn('Image failed to load:', img.getAttribute('src'));
        }
      });
    });
  })();


  /* ------------------------------------------------------------------
     11. Scroll progress hairline
     ------------------------------------------------------------------ */
  (function progress() {
    var bar = document.createElement('div');
    bar.className = 'scroll-progress';
    bar.setAttribute('aria-hidden', 'true');
    document.body.appendChild(bar);

    var ticking = false;
    function update() {
      ticking = false;
      var max = document.documentElement.scrollHeight - window.innerHeight;
      var pct = max > 0 ? window.scrollY / max : 0;
      bar.style.transform = 'scaleX(' + Math.min(1, Math.max(0, pct)) + ')';
    }
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
    }, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    update();
  })();

  /* ------------------------------------------------------------------
     12. Stagger siblings that reveal together
     ------------------------------------------------------------------ */
  (function stagger() {
    var groups = {};
    $$('.reveal').forEach(function (el) {
      var p = el.parentNode;
      if (!p) return;
      var key = groups[p.dataset.revealGroup] ? p.dataset.revealGroup : null;
      if (!key) {
        key = 'g' + Object.keys(groups).length;
        p.dataset.revealGroup = key;
        groups[key] = [];
      }
      groups[key].push(el);
    });
    Object.keys(groups).forEach(function (k) {
      groups[k].forEach(function (el, i) {
        if (groups[k].length > 1) el.style.setProperty('--d', Math.min(i * 70, 420) + 'ms');
      });
    });
  })();

  /* ------------------------------------------------------------------
     13. Count up the heritage year, once, when it scrolls into view
     ------------------------------------------------------------------ */
  (function countYear() {
    var el = $('.num-red');
    if (!el || reduceMotion || !('IntersectionObserver' in window)) return;

    var target = parseInt(el.textContent, 10);
    if (!target) return;
    var from = target - 40;

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        io.disconnect();
        var start = null, dur = 900;
        function frame(t) {
          if (start === null) start = t;
          var p = Math.min(1, (t - start) / dur);
          var eased = 1 - Math.pow(1 - p, 3);
          el.textContent = Math.round(from + (target - from) * eased);
          if (p < 1) window.requestAnimationFrame(frame);
          else el.textContent = target;
        }
        window.requestAnimationFrame(frame);
      });
    }, { threshold: 0.5 });
    io.observe(el);
  })();

  /* ------------------------------------------------------------------
     14. Booking drawer — details, Rs.500 advance, hand-off to WhatsApp
     ------------------------------------------------------------------ */
  (function booking() {
    var modal   = document.getElementById('booking');
    if (!modal) return;

    var panel   = $('.booking-panel', modal);
    var step1   = document.getElementById('bookStep1');
    var step2   = document.getElementById('bookStep2');
    var closeBt = document.getElementById('bookClose');
    var backBt  = document.getElementById('bkBack');
    var errBox  = document.getElementById('bkError');
    var summary = document.getElementById('bkSummary');
    var upiLink = document.getElementById('bkUpi');
    var whatsLink = document.getElementById('bkWhats');
    var copyBt  = document.getElementById('bkCopy');
    var upiIdEl = document.getElementById('bkUpiId');

    var titleEl = document.getElementById('bookTitle');
    var descEl  = document.getElementById('bookDesc');
    var qtyLabelEl = document.getElementById('qtyLabel');

    var qtyValEl = document.getElementById('qtyVal');
    var qtyMinusBtn = document.getElementById('qtyMinus');
    var qtyPlusBtn = document.getElementById('qtyPlus');

    var kycIdFile = document.getElementById('kycIdFile');
    var kycIdCam  = document.getElementById('kycIdCam');
    var kycIdBtn  = document.getElementById('kycIdBtn');
    var kycIdCamBtn = document.getElementById('kycIdCamBtn');
    var kycIdStatus = document.getElementById('kycIdStatus');

    var kycDlFile = document.getElementById('kycDlFile');
    var kycDlCam  = document.getElementById('kycDlCam');
    var kycDlBtn  = document.getElementById('kycDlBtn');
    var kycDlCamBtn = document.getElementById('kycDlCamBtn');
    var kycDlStatus = document.getElementById('kycDlStatus');

    var f = {
      bike:      document.getElementById('bkBike'),
      startDate: document.getElementById('bkStartDate'),
      endDate:   document.getElementById('bkEndDate'),
      startTime: document.getElementById('bkStartTime'),
      endTime:   document.getElementById('bkEndTime'),
      name:      document.getElementById('bkName'),
      phone:     document.getElementById('bkPhone'),
      email:     document.getElementById('bkEmail')
    };

    var BIKE_DESCRIPTIONS = {
      'Vespa': 'Stylish Italian-inspired automatic scooter for comfortable cruising through White Town.',
      'Honda Activa': 'India\'s most trusted automatic scooter for smooth city rides.',
      'TVS Jupiter': 'High mileage, comfortable seating scooter perfect for long daily rides.',
      'Suzuki Access 125': 'Powerful 125cc scooter with excellent pickup and spacious footboard.',
      'Honda Dio': 'Sporty design and agile handling for easy navigating through narrow streets.',
      'Yamaha Fascino': 'Retro-modern lightweight scooter with refined engine performance.',
      'Yamaha Ray': 'Nimble and compact automatic scooter ideal for quick city errands.',
      'Honda Cliq': 'Sturdy, practical and light runabout scooter.',
      'Honda Navi': 'Fun mini-bike design with full automatic scooter convenience.',
      'Hero Splendor': 'Legendary 100cc motorcycle with exceptional fuel efficiency.',
      'Yamaha FZ': '150cc sporty motorcycle for enthusiastic road trips.',
      'Royal Enfield GT 650': 'Twin-cylinder Cafe Racer motorcycle for unmatched highway cruiser feel.'
    };

    var currentQty = 1;
    var ADVANCE   = 500;
    var UPI_ID    = upiIdEl ? upiIdEl.textContent.trim() : '7200011799@okbizaxis';
    var PAYEE     = 'Vijay Arya Bike Rentals';
    var WHATSAPP  = '917200011799';
    var lastFocus = null;

    // Date defaults Initialization
    var today = new Date();
    var tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    function toIso(d) {
      return d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0');
    }

    if (f.startDate) {
      f.startDate.min = toIso(today);
      if (!f.startDate.value) f.startDate.value = toIso(today);
    }
    if (f.endDate) {
      f.endDate.min = toIso(today);
      if (!f.endDate.value) f.endDate.value = toIso(tomorrow);
    }

    // Quantity counter handlers
    if (qtyMinusBtn && qtyPlusBtn && qtyValEl) {
      qtyMinusBtn.addEventListener('click', function () {
        if (currentQty > 1) {
          currentQty--;
          qtyValEl.textContent = String(currentQty);
        }
      });
      qtyPlusBtn.addEventListener('click', function () {
        if (currentQty < 10) {
          currentQty++;
          qtyValEl.textContent = String(currentQty);
        }
      });
    }

    // KYC Upload Handlers
    function bindKyc(btn, camBtn, fileInput, camInput, statusEl) {
      if (btn && fileInput) {
        btn.addEventListener('click', function () { fileInput.click(); });
      }
      if (camBtn && camInput) {
        camBtn.addEventListener('click', function () { camInput.click(); });
      }
      var handleChange = function (input, targetBtn) {
        if (input.files && input.files[0]) {
          var name = input.files[0].name;
          if (statusEl) statusEl.textContent = '✓ Attached: ' + (name.length > 18 ? name.slice(0, 15) + '...' : name);
          if (targetBtn) targetBtn.classList.add('is-uploaded');
        }
      };
      if (fileInput) fileInput.addEventListener('change', function () { handleChange(fileInput, btn); });
      if (camInput) camInput.addEventListener('change', function () { handleChange(camInput, camBtn); });
    }

    bindKyc(kycIdBtn, kycIdCamBtn, kycIdFile, kycIdCam, kycIdStatus);
    bindKyc(kycDlBtn, kycDlCamBtn, kycDlFile, kycDlCam, kycDlStatus);

    function focusables() {
      return $$('a[href], button:not([disabled]), input, select, textarea', modal)
        .filter(function (el) { return el.offsetParent !== null; });
    }

    function open(bikeName) {
      lastFocus = document.activeElement;
      var selectedBike = bikeName || 'Vespa';

      if (f.bike) {
        var opts = $$('option', f.bike);
        for (var i = 0; i < opts.length; i++) {
          if (opts[i].value === selectedBike || opts[i].value.indexOf(selectedBike) === 0) {
            f.bike.value = opts[i].value;
            selectedBike = opts[i].value;
            break;
          }
        }
      }

      if (titleEl) titleEl.textContent = selectedBike;
      if (descEl) descEl.textContent = BIKE_DESCRIPTIONS[selectedBike] || 'Reliable two-wheeler rental in Pondicherry with ₹500 advance.';
      if (qtyLabelEl) qtyLabelEl.textContent = 'How many ' + selectedBike + '?';

      currentQty = 1;
      if (qtyValEl) qtyValEl.textContent = '1';

      showStep(1);
      modal.hidden = false;
      window.requestAnimationFrame(function () { modal.classList.add('is-open'); });
      document.body.classList.add('bk-open');
      window.setTimeout(function () { if (f.name) f.name.focus(); }, 60);
    }

    function close() {
      modal.classList.remove('is-open');
      document.body.classList.remove('bk-open');
      var done = function () { modal.hidden = true; };
      if (reduceMotion) done(); else window.setTimeout(done, 300);
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    function showStep(n) {
      step1.classList.toggle('is-active', n === 1);
      step2.classList.toggle('is-active', n === 2);
      if (panel) panel.scrollTop = 0;
    }

    function fail(msg, field) {
      if (errBox) { errBox.textContent = msg; errBox.hidden = false; }
      $$('.has-error', modal).forEach(function (el) { el.classList.remove('has-error'); });
      if (field) { field.classList.add('has-error'); field.focus(); }
      return false;
    }

    function validate() {
      if (errBox) errBox.hidden = true;
      $$('.has-error', modal).forEach(function (el) { el.classList.remove('has-error'); });

      if (f.name && !f.name.value.trim()) return fail('Please enter your full name.', f.name);
      if (f.phone) {
        var phone = f.phone.value.replace(/\D/g, '');
        if (phone.length !== 10) return fail('Please enter a valid 10-digit WhatsApp phone number.', f.phone);
      }
      if (f.startDate && !f.startDate.value) return fail('Please choose a start date.', f.startDate);
      if (f.endDate && !f.endDate.value) return fail('Please choose an end date.', f.endDate);
      return true;
    }

    function prettyDate(v) {
      if (!v) return '';
      var d = new Date(v + 'T00:00:00');
      if (isNaN(d)) return v;
      return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    function buildStep2() {
      var bike = f.bike ? f.bike.value : (titleEl ? titleEl.textContent : 'Vespa');
      var sDate = f.startDate ? f.startDate.value : '';
      var eDate = f.endDate ? f.endDate.value : '';
      var sTime = f.startTime ? f.startTime.value : '09:00';
      var eTime = f.endTime ? f.endTime.value : '19:00';
      var name = f.name ? f.name.value.trim() : '';
      var phone = f.phone ? f.phone.value.trim() : '';
      var email = f.email ? f.email.value.trim() : '';

      var idAttached = (kycIdFile && kycIdFile.files.length) || (kycIdCam && kycIdCam.files.length);
      var dlAttached = (kycDlFile && kycDlFile.files.length) || (kycDlCam && kycDlCam.files.length);

      if (summary) {
        summary.innerHTML =
          '<dl>' +
          '<dt>Vehicle</dt><dd>' + esc(bike) + ' (Qty: ' + currentQty + ')</dd>' +
          '<dt>Pickup</dt><dd>' + esc(prettyDate(sDate)) + ' at ' + esc(sTime) + '</dd>' +
          '<dt>Return</dt><dd>' + esc(prettyDate(eDate)) + ' at ' + esc(eTime) + '</dd>' +
          '<dt>Name</dt><dd>' + esc(name) + '</dd>' +
          '<dt>Phone</dt><dd>' + esc(phone) + '</dd>' +
          (email ? '<dt>Email</dt><dd>' + esc(email) + '</dd>' : '') +
          '<dt>KYC</dt><dd>' + (idAttached || dlAttached ? 'Files attached online' : 'Will present photo ID at shop') + '</dd>' +
          '</dl>';
      }

      var tn = 'Advance for ' + bike + ' (' + currentQty + ') from ' + prettyDate(sDate);
      if (upiLink && UPI_ID) {
        upiLink.href = 'upi://pay?pa=' + encodeURIComponent(UPI_ID) +
                       '&pn=' + encodeURIComponent(PAYEE) +
                       '&am=' + ADVANCE + '&cu=INR' +
                       '&tn=' + encodeURIComponent(tn);
      }

      var msg =
        'Hello Vijay Arya Bike Rentals, I would like to reserve a ride.\n\n' +
        '📌 *RENTAL DETAILS*\n' +
        '• Vehicle: ' + bike + ' (Qty: ' + currentQty + ')\n' +
        '• Pickup: ' + prettyDate(sDate) + ' at ' + sTime + '\n' +
        '• Return: ' + prettyDate(eDate) + ' at ' + eTime + '\n\n' +
        '👤 *CUSTOMER DETAILS*\n' +
        '• Name: ' + name + '\n' +
        '• WhatsApp: ' + phone + '\n' +
        (email ? '• Email: ' + email + '\n' : '') +
        (idAttached || dlAttached ? '• KYC ID Documents: Attached\n' : '• KYC ID Documents: Presenting original ID at shop\n') +
        '\n💳 *PAYMENT*\n' +
        '• Advance Paid: ₹' + ADVANCE + ' (UPI)';

      if (whatsLink) whatsLink.href = 'https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(msg);
    }

    function esc(s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }

    document.addEventListener('click', function (e) {
      var trigger = e.target.closest ? e.target.closest('.js-book') : null;
      if (!trigger) return;
      e.preventDefault();
      
      var bike = trigger.dataset.bike;
      if (!bike) {
        var fleet = document.getElementById('fleet');
        if (fleet) {
          fleet.scrollIntoView({ behavior: 'smooth' });
        } else {
          window.location.href = 'index.html#fleet';
        }
        return;
      }
      open(bike);
    });

    step1.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!validate()) return;
      buildStep2();
      showStep(2);
    });

    if (backBt) backBt.addEventListener('click', function () { showStep(1); });
    if (closeBt) closeBt.addEventListener('click', close);
    $$('[data-book-close]', modal).forEach(function (el) {
      el.addEventListener('click', close);
    });

    if (copyBt && upiIdEl) {
      copyBt.addEventListener('click', function () {
        var text = upiIdEl.textContent.trim();
        var done = function () {
          copyBt.textContent = 'Copied';
          copyBt.classList.add('is-done');
          window.setTimeout(function () {
            copyBt.textContent = 'Copy';
            copyBt.classList.remove('is-done');
          }, 1800);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, done);
        } else {
          var t = document.createElement('textarea');
          t.value = text; document.body.appendChild(t); t.select();
          try { document.execCommand('copy'); } catch (err) {}
          document.body.removeChild(t);
          done();
        }
      });
    }

    document.addEventListener('keydown', function (e) {
      if (modal.hidden) return;
      if (e.key === 'Escape') { close(); return; }
      if (e.key !== 'Tab') return;
      var fs = focusables();
      if (!fs.length) return;
      var first = fs[0], last = fs[fs.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  })();

  /* ------------------------------------------------------------------
     15. Multi-page navigation active link highlight
     ------------------------------------------------------------------ */
  (function activePageNav() {
    var path = window.location.pathname.split('/').pop() || 'index.html';
    if (path === '' || path === '/') path = 'index.html';

    $$('.nav-link, .nav-link-m').forEach(function (link) {
      var href = link.getAttribute('href');
      if (!href) return;
      var targetPage = href.split('#')[0].split('/').pop();
      if (targetPage === path || (path === 'index.html' && (targetPage === '' || targetPage === 'index.html'))) {
        link.classList.add('is-active');
      } else {
        if (!href.startsWith('#')) {
          link.classList.remove('is-active');
        }
      }
    });
  })();

  /* ------------------------------------------------------------------
     16. Stats Counter Animation
     ------------------------------------------------------------------ */
  (function animateStats() {
    var counters = $$('[data-count]');
    if (!counters.length || reduceMotion || !('IntersectionObserver' in window)) return;

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        io.unobserve(el);
        var target = parseInt(el.dataset.count, 10);
        var suffix = el.dataset.suffix || '';
        if (isNaN(target)) return;

        var duration = 1600;
        var startTime = null;

        function step(timestamp) {
          if (!startTime) startTime = timestamp;
          var progress = Math.min((timestamp - startTime) / duration, 1);
          var eased = 1 - Math.pow(1 - progress, 3);
          var current = Math.floor(eased * target);
          el.textContent = current.toLocaleString('en-IN') + suffix;
          if (progress < 1) {
            window.requestAnimationFrame(step);
          } else {
            el.textContent = target.toLocaleString('en-IN') + suffix;
          }
        }
        window.requestAnimationFrame(step);
      });
    }, { threshold: 0.3 });

    counters.forEach(function (c) { io.observe(c); });
  })();

  /* ------------------------------------------------------------------
     17. Category Filtering for gallery.html
     ------------------------------------------------------------------ */
  (function galleryFilter() {
    var filterBtns = $$('[data-filter]');
    var items = $$('[data-category]');
    if (!filterBtns.length || !items.length) return;

    filterBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var cat = btn.dataset.filter;
        filterBtns.forEach(function (b) { b.classList.remove('is-active'); });
        btn.classList.add('is-active');

        items.forEach(function (item) {
          var itemCat = item.dataset.category || '';
          if (cat === 'all' || itemCat.indexOf(cat) !== -1) {
            item.style.display = '';
            window.requestAnimationFrame(function () {
              item.style.opacity = '1';
              item.style.transform = 'scale(1)';
            });
          } else {
            item.style.opacity = '0';
            item.style.transform = 'scale(0.92)';
            window.setTimeout(function () {
              if (item.style.opacity === '0') item.style.display = 'none';
            }, 250);
          }
        });
      });
    });
  })();
})();

  /* ------------------------------------------------------------------
     18. Hero Background Carousel
     ------------------------------------------------------------------ */
  (function heroCarousel() {
    var images = document.querySelectorAll('.hero-light-bg-img');
    if (images.length < 2) return;
    
    var current = 0;
    setInterval(function() {
      images[current].classList.remove('active');
      current = (current + 1) % images.length;
      images[current].classList.add('active');
    }, 4000);
  })();

  /* ------------------------------------------------------------------
     19. 3D Infinite Spiral Gallery Component (React Bits Adaptation)
     ------------------------------------------------------------------ */
  (function initInfiniteSpiral() {
    var root = document.getElementById('infiniteSpiral');
    var stage = document.getElementById('spiralStage');
    if (!root || !stage) return;

    var cards = Array.prototype.slice.call(stage.querySelectorAll('.infinite-spiral__item'));
    if (!cards.length) return;

    var speed = 0.55;
    var direction = 'up';
    var radius = 205;
    var cardWidth = 235;
    var cardHeight = 160;
    var verticalSpacing = 64;
    var perspective = 1050;
    var cardsPerTurn = 7;
    var rotation = 0;
    var cardTilt = 0;
    var centerScale = 1.26;
    var edgeFade = 0.3;
    var edgeBlur = 0; // Set to 0 for 100% sharp photo clarity!
    var pauseOnHover = true;

    var progress = 0;
    var targetProgress = 0;
    var autoSpeed = 0;
    var hovered = false;
    var visible = true;
    var dragging = false;
    var dragMoved = false;
    var lastPointerY = 0;
    var lastTs = performance.now();
    var frameId = null;

    function clamp(val, min, max) { return Math.min(Math.max(val, min), max); }
    function modulo(val, div) { return ((val % div) + div) % div; }
    function smoothstep(min, max, val) {
      var x = clamp((val - min) / (max - min || 1), 0, 1);
      return x * x * (3 - 2 * x);
    }

    var bounds = root.getBoundingClientRect();
    window.addEventListener('resize', function() {
      bounds = root.getBoundingClientRect();
    });

    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function(entries) {
        if (entries[0]) visible = entries[0].isIntersecting;
      }, { threshold: 0.02 });
      io.observe(root);
    }

    var lastScrollY = window.scrollY;
    window.addEventListener('scroll', function() {
      var nextScrollY = window.scrollY;
      var scrollDelta = nextScrollY - lastScrollY;
      lastScrollY = nextScrollY;
      if (!visible || scrollDelta === 0) return;
      targetProgress += clamp(scrollDelta / Math.max(verticalSpacing * 2, 1), -1.5, 1.5);
    }, { passive: true });

    function render(time) {
      var delta = Math.min((time - lastTs) / 1000, 0.05);
      lastTs = time;

      var motionPaused = dragging || (pauseOnHover && hovered);
      var dirMult = direction === 'down' ? -1 : 1;
      var desiredAutoSpeed = visible && !motionPaused ? speed * dirMult : 0;
      var speedBlend = 1 - Math.exp(-delta * 7);
      autoSpeed += (desiredAutoSpeed - autoSpeed) * speedBlend;
      targetProgress += autoSpeed * delta;

      var followBlend = 1 - Math.exp(-delta * (dragging ? 22 : 11));
      progress += (targetProgress - progress) * followBlend;

      var count = cards.length;
      var half = count / 2;
      var width = Math.max(bounds.width || root.clientWidth, 1);
      var height = Math.max(bounds.height || root.clientHeight, 1);
      var fit = Math.min(1.0, width / (cardWidth * 2.5), height / (cardHeight * 2.2));
      var responsiveRadius = Math.min(radius, Math.max(80, width * 0.37)) * fit;
      var fadeStart = clamp(1 - edgeFade, 0, 0.98);
      var turnSize = Math.max(cardsPerTurn, 1);

      cards.forEach(function(card, index) {
        var offset = index - progress;
        offset = modulo(offset + half, count) - half;

        var edge = Math.min(Math.abs(offset) / Math.max(half, 1), 1);
        var opacity = 1 - smoothstep(fadeStart, 1, edge);
        var focus = 1 - Math.min(Math.abs(offset) / Math.max(turnSize * 0.65, 1), 1);
        var scale = (1 + (centerScale - 1) * focus) * fit;
        var angle = offset * (360 / turnSize) + rotation;
        var angleRad = (angle * Math.PI) / 180;
        var x = Math.sin(angleRad) * responsiveRadius;
        var z = Math.cos(angleRad) * responsiveRadius;
        var depthScale = clamp(perspective / Math.max(perspective - z, 1), 0.85, 1.35);
        var visualScale = scale * depthScale;
        var depth = (z / Math.max(responsiveRadius, 1) + 1) / 2;

        card.style.transform = 'translate(-50%, -50%) translate3d(' + x.toFixed(2) + 'px, ' + (offset * verticalSpacing * fit).toFixed(2) + 'px, 0) scale(' + visualScale.toFixed(3) + ')';
        card.style.opacity = '1';
        card.style.filter = 'none';
        card.style.zIndex = String(Math.round(depth * 100000) + index);
        card.style.pointerEvents = 'auto';

      });

      frameId = requestAnimationFrame(render);
    }

    // Hover ONLY pauses when directly over an image card!
    cards.forEach(function(card) {
      card.addEventListener('mouseenter', function() { hovered = true; });
      card.addEventListener('mouseleave', function() { hovered = false; });
    });

    root.addEventListener('mouseleave', function() {
      hovered = false;
      dragging = false;
    });

    root.addEventListener('pointerdown', function(e) {
      if (e.button !== 0) return;
      dragging = true;
      dragMoved = false;
      lastPointerY = e.clientY;
      targetProgress = progress;
    });

    root.addEventListener('pointermove', function(e) {
      if (!dragging) return;
      var pointerDelta = e.clientY - lastPointerY;
      lastPointerY = e.clientY;
      if (Math.abs(pointerDelta) > 0.5) dragMoved = true;
      targetProgress -= pointerDelta / Math.max(verticalSpacing, 1);
    });

    root.addEventListener('pointerup', function() { dragging = false; });
    root.addEventListener('pointercancel', function() { dragging = false; });

    frameId = requestAnimationFrame(render);
  })();

  /* ------------------------------------------------------------------
     26. BOOKING DRAWER & RAZORPAY PAYMENT ENGINE
     ------------------------------------------------------------------ */
  (function bookingEngine() {
    var RZP_KEY_ID = 'rzp_test_TcCsvzG1Ynmsq7'; // User's Razorpay Test API Key

    var modal = document.getElementById('booking');
    if (!modal) return;

    var closeBtn = document.getElementById('bookClose');
    var backdrop = modal.querySelector('[data-book-close]');
    var bookTitle = document.getElementById('bookTitle');
    var bookDesc = document.getElementById('bookDesc');
    var bkBike = document.getElementById('bkBike');
    var qtyLabel = document.getElementById('qtyLabel');
    var qtyVal = document.getElementById('qtyVal');
    var qtyMinus = document.getElementById('qtyMinus');
    var qtyPlus = document.getElementById('qtyPlus');

    var step1 = document.getElementById('bookStep1');
    var step2 = document.getElementById('bookStep2');
    var step3 = document.getElementById('bookStep3');

    var bkStartDate = document.getElementById('bkStartDate');
    var bkEndDate = document.getElementById('bkEndDate');
    var bkStartTime = document.getElementById('bkStartTime');
    var bkEndTime = document.getElementById('bkEndTime');
    var bkName = document.getElementById('bkName');
    var bkPhone = document.getElementById('bkPhone');
    var bkEmail = document.getElementById('bkEmail');
    var bkError = document.getElementById('bkError');

    var bkSummary = document.getElementById('bkSummary');
    var bkRzpAmount = document.getElementById('bkRzpAmount');
    var bkRazorpayBtn = document.getElementById('bkRazorpayBtn');
    var bkBack = document.getElementById('bkBack');
    var bkUpi = document.getElementById('bkUpi');
    var bkUpiId = document.getElementById('bkUpiId');
    var bkCopy = document.getElementById('bkCopy');
    var bkWhats = document.getElementById('bkWhats');

    var bkReceiptDetails = document.getElementById('bkReceiptDetails');
    var bkSuccessWhats = document.getElementById('bkSuccessWhats');
    var bkPrintReceipt = document.getElementById('bkPrintReceipt');
    var bkNewBooking = document.getElementById('bkNewBooking');

    // Catalog details
    var FLEET_CATALOG = {
      'Vespa': { rate: 500, desc: 'Stylish Italian-inspired automatic scooter for comfortable cruising through White Town.' },
      'Honda Activa': { rate: 500, desc: 'Reliable, smooth, and highly fuel-efficient 110cc scooter for daily Pondy rides.' },
      'TVS Jupiter': { rate: 500, desc: 'Comfortable ride with extra footboard space and plush suspension.' },
      'Suzuki Access 125': { rate: 500, desc: 'Powerful 125cc engine offering effortless pickup and comfortable seating.' },
      'Honda Dio': { rate: 500, desc: 'Sporty design and lightweight handling, ideal for city sightseeing and cafes.' },
      'Yamaha Fascino': { rate: 500, desc: 'Classic retro aesthetics combined with Yamaha refined 125cc performance.' },
      'Yamaha Ray': { rate: 500, desc: 'Aggressive street styling scooter with sharp maneuvering and easy handling.' },
      'Honda Cliq': { rate: 500, desc: 'Rugged, utilitarian automatic two-wheeler with block-pattern tyres.' },
      'Honda Navi': { rate: 500, desc: 'Fun-sized mini-bike experience with convenient automatic CVT transmission.' },
      'Hero Splendor': { rate: 500, desc: 'Legendary Indian commuter motorcycle offering unmatched fuel efficiency.' },
      'Yamaha FZ': { rate: 500, desc: 'Muscular street bike with superior road grip for cruising ECR and Auroville.' },
      'Royal Enfield GT 650': { rate: 1200, desc: 'Twin-cylinder cafe racer powerhouse for the ultimate coastal highway experience.' }
    };

    var currentQuantity = 1;
    var currentBikeName = 'Vespa';
    var activeBookingData = null;

    // Helper: format YYYY-MM-DD
    function toISODate(d) {
      var month = '' + (d.getMonth() + 1);
      var day = '' + d.getDate();
      var year = d.getFullYear();
      if (month.length < 2) month = '0' + month;
      if (day.length < 2) day = '0' + day;
      return [year, month, day].join('-');
    }

    // Initialize date pickers
    function initDates() {
      var today = new Date();
      var tomorrow = new Date();
      tomorrow.setDate(today.getDate() + 1);

      var todayStr = toISODate(today);
      var tomorrowStr = toISODate(tomorrow);

      if (bkStartDate) {
        bkStartDate.min = todayStr;
        if (!bkStartDate.value) bkStartDate.value = todayStr;
      }
      if (bkEndDate) {
        bkEndDate.min = todayStr;
        if (!bkEndDate.value) bkEndDate.value = tomorrowStr;
      }
    }
    initDates();

    // Switch step
    function showStep(stepNum) {
      if (step1) step1.classList.toggle('is-active', stepNum === 1);
      if (step2) step2.classList.toggle('is-active', stepNum === 2);
      if (step3) step3.classList.toggle('is-active', stepNum === 3);

      var panel = modal.querySelector('.booking-panel');
      if (panel) panel.scrollTop = 0;
    }

    // Open booking modal
    function openModal(bikeName) {
      if (bikeName && FLEET_CATALOG[bikeName]) {
        currentBikeName = bikeName;
      } else if (bikeName) {
        currentBikeName = bikeName;
      } else {
        currentBikeName = 'Vespa';
      }

      if (bkBike) bkBike.value = currentBikeName;
      if (bookTitle) bookTitle.textContent = currentBikeName;
      if (bookDesc) {
        var info = FLEET_CATALOG[currentBikeName];
        bookDesc.textContent = info ? info.desc : 'Explore Pondicherry in style with Vijay Arya Bike Rentals.';
      }
      if (qtyLabel) qtyLabel.textContent = 'How many ' + currentBikeName + '?';

      currentQuantity = 1;
      if (qtyVal) qtyVal.textContent = '1';
      if (bkError) { bkError.hidden = true; bkError.textContent = ''; }

      showStep(1);

      modal.hidden = false;
      window.requestAnimationFrame(function () {
        modal.classList.add('is-open');
        document.body.style.overflow = 'hidden';
      });
    }

    // Close booking modal
    function closeModal() {
      modal.classList.remove('is-open');
      document.body.style.overflow = '';
      setTimeout(function () {
        if (!modal.classList.contains('is-open')) {
          modal.hidden = true;
        }
      }, 350);
    }

    // Event bindings for modal open / close
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (backdrop) backdrop.addEventListener('click', closeModal);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.classList.contains('is-open')) {
        closeModal();
      }
    });

    // Global Book Buttons listener
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('.js-book');
      if (btn) {
        e.preventDefault();
        var bike = btn.getAttribute('data-bike') || '';
        if (!bike) {
          var card = btn.closest('[data-bike]');
          if (card) bike = card.getAttribute('data-bike');
        }
        openModal(bike);
      }
    });

    // Quantity buttons
    if (qtyMinus) {
      qtyMinus.addEventListener('click', function () {
        if (currentQuantity > 1) {
          currentQuantity--;
          if (qtyVal) qtyVal.textContent = String(currentQuantity);
        }
      });
    }

    if (qtyPlus) {
      qtyPlus.addEventListener('click', function () {
        if (currentQuantity < 10) {
          currentQuantity++;
          if (qtyVal) qtyVal.textContent = String(currentQuantity);
        }
      });
    }

    // Step 1: Submit & Validate -> Go to Step 2
    if (step1) {
      step1.addEventListener('submit', function (e) {
        e.preventDefault();
        if (bkError) { bkError.hidden = true; bkError.textContent = ''; }

        var name = (bkName && bkName.value) ? bkName.value.trim() : '';
        var phone = (bkPhone && bkPhone.value) ? bkPhone.value.replace(/[^0-9]/g, '') : '';
        var email = (bkEmail && bkEmail.value) ? bkEmail.value.trim() : '';
        var sDate = bkStartDate ? bkStartDate.value : '';
        var eDate = bkEndDate ? bkEndDate.value : '';
        var sTime = bkStartTime ? bkStartTime.value : '09:00';
        var eTime = bkEndTime ? bkEndTime.value : '19:00';

        if (!sDate || !eDate) {
          showError('Please select both Start Date and End Date.');
          return;
        }

        var startObj = new Date(sDate + 'T00:00:00');
        var endObj = new Date(eDate + 'T00:00:00');
        if (endObj < startObj) {
          showError('End Date must be on or after Start Date.');
          return;
        }

        if (!name || name.length < 2) {
          showError('Please enter your full name.');
          if (bkName) bkName.focus();
          return;
        }

        if (!phone || phone.length !== 10) {
          showError('Please enter a valid 10-digit WhatsApp phone number.');
          if (bkPhone) bkPhone.focus();
          return;
        }

        // Calculate rental days
        var timeDiff = endObj.getTime() - startObj.getTime();
        var days = Math.max(1, Math.ceil(timeDiff / (1000 * 3600 * 24)));
        if (days === 0) days = 1;

        var catalogInfo = FLEET_CATALOG[currentBikeName] || { rate: 500 };
        var dailyRate = catalogInfo.rate;
        var totalEstimate = dailyRate * days * currentQuantity;
        var advancePayable = 500 * currentQuantity;

        activeBookingData = {
          bikeName: currentBikeName,
          quantity: currentQuantity,
          startDate: sDate,
          endDate: eDate,
          startTime: sTime,
          endTime: eTime,
          days: days,
          dailyRate: dailyRate,
          estimatedTotal: totalEstimate,
          advancePaid: advancePayable,
          balanceDue: Math.max(0, totalEstimate - advancePayable),
          customerName: name,
          customerPhone: phone,
          customerEmail: email
        };

        // Render Step 2 Summary
        renderSummary(activeBookingData);
        showStep(2);
      });
    }

    function showError(msg) {
      if (bkError) {
        bkError.textContent = msg;
        bkError.hidden = false;
        bkError.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }

    function renderSummary(data) {
      if (bkSummary) {
        bkSummary.innerHTML =
          '<div class="booking-summary-header">' +
            '<h4>' + data.bikeName + (data.quantity > 1 ? ' (' + data.quantity + ' Vehicles)' : '') + '</h4>' +
            '<span class="summary-badge">' + data.days + ' ' + (data.days === 1 ? 'Day' : 'Days') + ' Rental</span>' +
          '</div>' +
          '<div class="summary-row"><span>Pickup Date:</span><strong>' + data.startDate + ' @ ' + data.startTime + '</strong></div>' +
          '<div class="summary-row"><span>Return Date:</span><strong>' + data.endDate + ' @ ' + data.endTime + '</strong></div>' +
          '<div class="summary-row"><span>Rider Name:</span><strong>' + data.customerName + '</strong></div>' +
          '<div class="summary-row"><span>WhatsApp:</span><strong>+91 ' + data.customerPhone + '</strong></div>' +
          '<div class="summary-row"><span>Daily Rate:</span><strong>&#8377;' + data.dailyRate + ' / day &times; ' + data.quantity + '</strong></div>' +
          '<div class="summary-row"><span>Estimated Total Rent:</span><strong>&#8377;' + data.estimatedTotal + '</strong></div>' +
          '<div class="summary-row total-row"><span>Advance to Pay Now:</span><strong style="color:var(--red);font-size:16px;">&#8377;' + data.advancePaid + '</strong></div>' +
          '<div class="summary-row" style="font-size:11.5px;color:#6b7280;"><span>Balance at shop pickup:</span><span>&#8377;' + data.balanceDue + '</span></div>';
      }

      if (bkRzpAmount) {
        bkRzpAmount.textContent = '₹' + data.advancePaid;
      }

      if (bkRazorpayBtn) {
        var span = bkRazorpayBtn.querySelector('span');
        if (span) span.textContent = 'Pay ₹' + data.advancePaid + ' via Razorpay';
      }

      // Manual UPI App link
      if (bkUpi) {
        var upiLink = 'upi://pay?pa=7200011799@okbizaxis&pn=Vijay%20Arya%20Bike%20Rentals&am=' + data.advancePaid + '&cu=INR&tn=Advance%20Booking%20for%20' + encodeURIComponent(data.bikeName);
        bkUpi.href = upiLink;
      }

      // Manual WhatsApp link for Step 2 fallback
      if (bkWhats) {
        var msg2 = 'Hi Vijay Arya Bike Rentals, I want to book ' + data.quantity + ' ' + data.bikeName + ' from ' + data.startDate + ' to ' + data.endDate + '. My Name: ' + data.customerName + ', Phone: ' + data.customerPhone + '. Advance payable: Rs.' + data.advancePaid;
        bkWhats.href = 'https://wa.me/919600334488?text=' + encodeURIComponent(msg2);
      }
    }

    // Step 2 Back Button
    if (bkBack) {
      bkBack.addEventListener('click', function () {
        showStep(1);
      });
    }

    // Copy UPI ID button
    if (bkCopy && bkUpiId) {
      bkCopy.addEventListener('click', function () {
        var text = bkUpiId.textContent || '7200011799@okbizaxis';
        navigator.clipboard.writeText(text).then(function () {
          var orig = bkCopy.textContent;
          bkCopy.textContent = 'Copied!';
          setTimeout(function () { bkCopy.textContent = orig; }, 2000);
        }).catch(function () {
          alert('UPI ID: ' + text);
        });
      });
    }

    // ================================================================
    // RAZORPAY CHECKOUT TRIGGER
    // ================================================================
    if (bkRazorpayBtn) {
      bkRazorpayBtn.addEventListener('click', function () {
        if (!activeBookingData) {
          alert('Please complete step 1 booking details.');
          showStep(1);
          return;
        }

        if (typeof Razorpay === 'undefined') {
          alert('Razorpay Checkout SDK is still loading. Please check your internet connection or reload the page.');
          return;
        }

        var rzpOptions = {
          key: RZP_KEY_ID,
          amount: activeBookingData.advancePaid * 100, // paise
          currency: 'INR',
          name: 'Vijay Arya Bike Rentals',
          description: 'Advance for ' + activeBookingData.bikeName + ' (' + activeBookingData.quantity + ' Vehicle' + (activeBookingData.quantity > 1 ? 's' : '') + ')',
          image: 'assets/logo/logo.png',
          prefill: {
            name: activeBookingData.customerName,
            contact: '+91' + activeBookingData.customerPhone,
            email: activeBookingData.customerEmail || ''
          },
          theme: {
            color: '#EF3138'
          },
          handler: function (response) {
            handlePaymentSuccess(response, activeBookingData);
          },
          modal: {
            ondismiss: function () {
              console.log('Razorpay modal closed by user');
            }
          }
        };

        try {
          var rzp = new Razorpay(rzpOptions);
          rzp.on('payment.failed', function (resp) {
            alert('Payment could not be completed: ' + (resp.error.description || 'Unknown error'));
          });
          rzp.open();
        } catch (err) {
          console.error('Razorpay initialization error:', err);
          alert('Unable to launch Razorpay. You can scan the UPI QR code below to complete your payment.');
        }
      });
    }

    // ================================================================
    // PAYMENT SUCCESS & RECEIPT GENERATION
    // ================================================================
    function handlePaymentSuccess(rzpResponse, bookingData) {
      var bookingId = 'VA-' + Date.now().toString().slice(-6);
      var paymentId = rzpResponse.razorpay_payment_id || ('pay_' + Math.random().toString(36).substring(2, 11));

      var finalRecord = {
        bookingId: bookingId,
        paymentId: paymentId,
        bikeName: bookingData.bikeName,
        quantity: bookingData.quantity,
        startDate: bookingData.startDate,
        endDate: bookingData.endDate,
        startTime: bookingData.startTime,
        endTime: bookingData.endTime,
        days: bookingData.days,
        dailyRate: bookingData.dailyRate,
        estimatedTotal: bookingData.estimatedTotal,
        advancePaid: bookingData.advancePaid,
        balanceDue: bookingData.balanceDue,
        customerName: bookingData.customerName,
        customerPhone: bookingData.customerPhone,
        customerEmail: bookingData.customerEmail,
        paymentMethod: 'Razorpay Online (Verified)',
        status: 'CONFIRMED',
        timestamp: new Date().toISOString(),
        formattedDate: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
      };

      // Save to localStorage as JSON
      try {
        var existing = JSON.parse(localStorage.getItem('vijay_arya_bookings') || '[]');
        existing.unshift(finalRecord);
        localStorage.setItem('vijay_arya_bookings', JSON.stringify(existing));
        console.log('Booking saved successfully to LocalStorage:', finalRecord);
      } catch (e) {
        console.warn('LocalStorage error:', e);
      }

      // Render Step 3 Receipt
      if (bkReceiptDetails) {
        bkReceiptDetails.innerHTML =
          '<div class="receipt-item-row"><span>Booking Reference:</span><strong style="color:var(--red);">' + finalRecord.bookingId + '</strong></div>' +
          '<div class="receipt-item-row highlight-paid"><span>Payment Status:</span><strong>&check; PAID via Razorpay (' + finalRecord.paymentId + ')</strong></div>' +
          '<div class="receipt-item-row"><span>Vehicle:</span><strong>' + finalRecord.bikeName + (finalRecord.quantity > 1 ? ' (' + finalRecord.quantity + ' Vehicles)' : '') + '</strong></div>' +
          '<div class="receipt-item-row"><span>Rental Duration:</span><strong>' + finalRecord.days + ' ' + (finalRecord.days === 1 ? 'Day' : 'Days') + ' (' + finalRecord.startDate + ' to ' + finalRecord.endDate + ')</strong></div>' +
          '<div class="receipt-item-row"><span>Pickup Timing:</span><strong>' + finalRecord.startTime + ' &ndash; 9:00 PM</strong></div>' +
          '<div class="receipt-item-row"><span>Customer:</span><strong>' + finalRecord.customerName + ' (' + finalRecord.customerPhone + ')</strong></div>' +
          '<div class="receipt-item-row"><span>Advance Paid:</span><strong style="color:#059669;">&#8377;' + finalRecord.advancePaid + '</strong></div>' +
          '<div class="receipt-item-row"><span>Balance at Pickup:</span><strong>&#8377;' + finalRecord.balanceDue + '</strong></div>';
      }

      // Populate WhatsApp confirmation URL
      if (bkSuccessWhats) {
        var whatsMsg =
          '🎉 *VIJAY ARYA BIKE RENTALS - BOOKING CONFIRMATION*\n\n' +
          '🆔 *Booking ID:* ' + finalRecord.bookingId + '\n' +
          '💳 *Razorpay Payment ID:* ' + finalRecord.paymentId + '\n' +
          '🏍️ *Vehicle:* ' + finalRecord.bikeName + ' (' + finalRecord.quantity + ' qty)\n' +
          '📅 *Rental Dates:* ' + finalRecord.startDate + ' to ' + finalRecord.endDate + ' (' + finalRecord.days + ' days)\n' +
          '⏰ *Pickup Time:* ' + finalRecord.startTime + '\n' +
          '👤 *Customer:* ' + finalRecord.customerName + ' (+91 ' + finalRecord.customerPhone + ')\n' +
          '💰 *Advance Paid:* ₹' + finalRecord.advancePaid + ' (PAID via Razorpay)\n' +
          '💵 *Balance at Shop:* ₹' + finalRecord.balanceDue + '\n\n' +
          'Please reserve my vehicle. I will carry my original Driving Licence and ID at pickup.';
        bkSuccessWhats.href = 'https://wa.me/919600334488?text=' + encodeURIComponent(whatsMsg);
      }

      showStep(3);
    }

    // Print Receipt
    if (bkPrintReceipt) {
      bkPrintReceipt.addEventListener('click', function () {
        window.print();
      });
    }

    // Book another ride reset
    if (bkNewBooking) {
      bkNewBooking.addEventListener('click', function () {
        if (step1) step1.reset();
        initDates();
        showStep(1);
      });
    }
  })();
