/* ==========================================================================
   Vijay Arya Bike Rentals — vanilla JS
   Sticky header · mobile nav · scroll spy · gallery lightbox · testimonial
   scroller · FAQ accordion · reveal on scroll · dynamic years · scroll
   progress · year count-up · booking modal with Rs.500 UPI advance
   No dependencies. Every block guards against missing markup.
   ========================================================================== */
(function () {
  'use strict';

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

    function update() {
      el.classList.toggle('is-scrolled', window.scrollY > 12);
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
    var triggers = $$('.gal-item');

    if (!box || !img || !triggers.length) return;

    // Build the slide list from the DOM so markup stays the single source of truth
    var slides = triggers
      .slice()
      .sort(function (a, b) {
        return Number(a.dataset.gal || 0) - Number(b.dataset.gal || 0);
      })
      .map(function (btn) {
        var i = btn.querySelector('img');
        return { src: i ? i.getAttribute('src') : '', alt: i ? i.getAttribute('alt') : '' };
      });

    var index = 0;
    var lastFocus = null;

    function render() {
      var s = slides[index];
      if (!s) return;
      img.setAttribute('src', s.src);
      img.setAttribute('alt', s.alt);
      if (cap) cap.textContent = s.alt;
      if (count) count.textContent = (index + 1) + ' / ' + slides.length;
    }

    function open(i) {
      index = i;
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
      index = (index + dir + slides.length) % slides.length;
      render();
    }

    triggers.forEach(function (btn) {
      btn.addEventListener('click', function () {
        open(Number(btn.dataset.gal || 0));
      });
    });

    if (btnClose) btnClose.addEventListener('click', close);
    if (btnPrev) btnPrev.addEventListener('click', function () { step(-1); });
    if (btnNext) btnNext.addEventListener('click', function () { step(1); });

    box.addEventListener('click', function (e) {
      if (e.target === box || e.target === $('.lb-figure', box)) close();
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

    function stepSize() {
      var card = track.querySelector('.test-card');
      if (!card) return track.clientWidth;
      var gap = parseFloat(getComputedStyle(track).columnGap || '24') || 24;
      return card.getBoundingClientRect().width + gap;
    }

    function go(dir) {
      track.scrollBy({ left: dir * stepSize(), behavior: reduceMotion ? 'auto' : 'smooth' });
    }

    if (prev) prev.addEventListener('click', function () { go(-1); });
    if (next) next.addEventListener('click', function () { go(1); });

    function syncButtons() {
      var max = track.scrollWidth - track.clientWidth - 2;
      if (prev) prev.disabled = track.scrollLeft <= 2;
      if (next) next.disabled = track.scrollLeft >= max;
      [prev, next].forEach(function (b) {
        if (b) b.style.opacity = b.disabled ? '.4' : '';
      });
    }

    track.addEventListener('scroll', syncButtons, { passive: true });
    window.addEventListener('resize', syncButtons, { passive: true });
    syncButtons();

    // Arrow keys when the scroller has focus
    track.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
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
     14. Booking modal — details, Rs.500 advance, hand-off to the shop

     This is a static site: there is no server and no payment gateway.
     The advance is taken through the shop's own UPI ID / Google Pay QR,
     and the booking details go to the shop over WhatsApp or a call.
     ------------------------------------------------------------------ */
  (function booking() {
    var modal   = document.getElementById('booking');
    if (!modal) return;

    var panel   = $('.booking-panel', modal);
    var step1   = document.getElementById('bookStep1');
    var step2   = document.getElementById('bookStep2');
    var dots    = $$('[data-step-dot]', modal);
    var closeBt = document.getElementById('bookClose');
    var backBt  = document.getElementById('bkBack');
    var errBox  = document.getElementById('bkError');
    var summary = document.getElementById('bkSummary');
    var upiLink = document.getElementById('bkUpi');
    var whatsLink = document.getElementById('bkWhats');
    var copyBt  = document.getElementById('bkCopy');
    var upiIdEl = document.getElementById('bkUpiId');

    var f = {
      bike:  document.getElementById('bkBike'),
      date:  document.getElementById('bkDate'),
      days:  document.getElementById('bkDays'),
      name:  document.getElementById('bkName'),
      phone: document.getElementById('bkPhone'),
      note:  document.getElementById('bkNote')
    };

    var ADVANCE   = 500;
    var UPI_ID    = upiIdEl ? upiIdEl.textContent.trim() : '';
    var PAYEE     = 'Vijay Arya Bike Rentals';
    var WHATSAPP  = '917200011799';
    var lastFocus = null;

    // Pickup date cannot be in the past
    if (f.date) {
      var today = new Date();
      var iso = today.getFullYear() + '-' +
                String(today.getMonth() + 1).padStart(2, '0') + '-' +
                String(today.getDate()).padStart(2, '0');
      f.date.min = iso;
      if (!f.date.value) f.date.value = iso;
    }

    function focusables() {
      return $$('a[href], button:not([disabled]), input, select, textarea', modal)
        .filter(function (el) { return el.offsetParent !== null; });
    }

    function open(bike) {
      lastFocus = document.activeElement;
      if (bike && f.bike) {
        // match the card's bike to an option, falling back to the first match
        var opts = $$('option', f.bike);
        for (var i = 0; i < opts.length; i++) {
          if (opts[i].value === bike || opts[i].value.indexOf(bike) === 0) {
            f.bike.value = opts[i].value; break;
          }
        }
      }
      showStep(1);
      modal.hidden = false;
      window.requestAnimationFrame(function () { modal.classList.add('is-open'); });
      document.body.classList.add('bk-open');
      window.setTimeout(function () { if (f.bike) f.bike.focus(); }, 60);
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
      dots.forEach(function (d) {
        var i = Number(d.dataset.stepDot);
        d.classList.toggle('is-current', i === n);
        d.classList.toggle('is-done', i < n);
      });
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

      if (!f.name.value.trim())  return fail('Please tell us your name.', f.name);
      var phone = f.phone.value.replace(/\D/g, '');
      if (phone.length < 10)     return fail('Please enter a valid phone number, at least 10 digits.', f.phone);
      if (!f.date.value)         return fail('Please choose a pickup date.', f.date);
      var days = parseInt(f.days.value, 10);
      if (!days || days < 1)     return fail('Rentals start from one day.', f.days);
      return true;
    }

    function prettyDate(v) {
      var d = new Date(v + 'T00:00:00');
      if (isNaN(d)) return v;
      return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    function buildStep2() {
      var days = parseInt(f.days.value, 10) || 1;
      var bike = f.bike.value;
      var note = f.note.value.trim();

      if (summary) {
        summary.innerHTML =
          '<dl>' +
          '<dt>Ride</dt><dd>' + esc(bike) + '</dd>' +
          '<dt>Pickup</dt><dd>' + esc(prettyDate(f.date.value)) + '</dd>' +
          '<dt>Duration</dt><dd>' + days + (days === 1 ? ' day' : ' days') + '</dd>' +
          '<dt>Name</dt><dd>' + esc(f.name.value.trim()) + '</dd>' +
          '<dt>Phone</dt><dd>' + esc(f.phone.value.trim()) + '</dd>' +
          (note ? '<dt>Note</dt><dd>' + esc(note) + '</dd>' : '') +
          '</dl>';
      }

      var tn = 'Advance for ' + bike + ' from ' + prettyDate(f.date.value);
      if (upiLink && UPI_ID) {
        upiLink.href = 'upi://pay?pa=' + encodeURIComponent(UPI_ID) +
                       '&pn=' + encodeURIComponent(PAYEE) +
                       '&am=' + ADVANCE + '&cu=INR' +
                       '&tn=' + encodeURIComponent(tn);
      }

      var msg =
        'Hello Vijay Arya Bike Rentals, I would like to book a ride.\n\n' +
        'Ride: ' + bike + '\n' +
        'Pickup: ' + prettyDate(f.date.value) + '\n' +
        'Duration: ' + days + (days === 1 ? ' day' : ' days') + '\n' +
        'Name: ' + f.name.value.trim() + '\n' +
        'Phone: ' + f.phone.value.trim() + '\n' +
        (note ? 'Note: ' + note + '\n' : '') +
        '\nI am paying the Rs.' + ADVANCE + ' advance.';

      if (whatsLink) whatsLink.href = 'https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(msg);
    }

    function esc(s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }

    // Every .js-book control opens the modal; cards pass their bike through
    document.addEventListener('click', function (e) {
      var trigger = e.target.closest ? e.target.closest('.js-book') : null;
      if (!trigger) return;
      e.preventDefault();
      open(trigger.dataset.bike || '');
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
})();
