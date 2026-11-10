/* Liquid Glass Lab — 페이지 인터랙션 */
(() => {
  'use strict';

  const LG = window.LiquidGlass;
  const root = document.documentElement;
  // 거울 방식(Safari)에서는 유리 안에 화면 복제본이 들어가므로, 복제본 속 요소는 찾지 않습니다
  const real = (n) => !n.closest('.lg-mirror');
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s)).filter(real);
  const $ = (s, r = document) => {
    const n = r.querySelector(s);
    return !n || real(n) ? n : $$(s, r)[0] || null;
  };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const reduced = () => root.classList.contains('reduce-motion');

  function parseOpts(str) {
    const o = {};
    (str || '').split(';').forEach((pair) => {
      const [k, v] = pair.split(':');
      if (k && v !== undefined) o[k.trim()] = parseFloat(v);
    });
    return o;
  }

  /* ---------- 공용 도구 ---------- */

  // 포인터 드래그. threshold(px)를 넘기 전에는 move를 부르지 않으므로 탭과 드래그를 구분할 수 있습니다.
  function drag(el, { threshold = 0, start, move, end }) {
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !e.isPrimary) return;
      const ctx = start ? start(e) : {};
      if (ctx === false) return;
      const id = e.pointerId;
      const sx = e.clientX;
      const sy = e.clientY;
      let lx = sx;
      let ly = sy;
      let lt = performance.now();
      let vx = 0;
      let vy = 0;
      let active = threshold === 0;

      const onMove = (ev) => {
        if (ev.pointerId !== id) return;
        const dx = ev.clientX - sx;
        const dy = ev.clientY - sy;
        if (!active) {
          if (Math.hypot(dx, dy) < threshold) return;
          active = true;
        }
        const now = performance.now();
        const dt = Math.max(1, now - lt);
        vx = vx * 0.5 + ((ev.clientX - lx) / dt) * 0.5;
        vy = vy * 0.5 + ((ev.clientY - ly) / dt) * 0.5;
        lx = ev.clientX;
        ly = ev.clientY;
        lt = now;
        if (move) move({ dx, dy, vx, vy, ev, ctx });
      };
      const onUp = (ev) => {
        if (ev.pointerId !== id) return;
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        if (performance.now() - lt > 90) { vx = 0; vy = 0; }
        if (end) end({ active, vx, vy, ev, ctx, dx: ev.clientX - sx, dy: ev.clientY - sy });
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    });
  }

  // 무대 안에서 끌거나 화살표 키로 옮길 수 있는 요소
  function movable(el, stage, onMove) {
    const pos = { x: 0, y: 0 };
    const place = () => {
      pos.x = clamp(pos.x, 0, Math.max(0, stage.clientWidth - el.offsetWidth));
      pos.y = clamp(pos.y, 0, Math.max(0, stage.clientHeight - el.offsetHeight));
      el.style.transform = `translate3d(${pos.x.toFixed(1)}px, ${pos.y.toFixed(1)}px, 0)`;
      if (onMove) onMove(pos);
    };
    drag(el, {
      start() {
        el.classList.add('is-dragging');
        return { x: pos.x, y: pos.y };
      },
      move({ dx, dy, ctx }) {
        pos.x = ctx.x + dx;
        pos.y = ctx.y + dy;
        place();
      },
      end() { el.classList.remove('is-dragging'); },
    });
    el.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 60 : 20;
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (!d) return;
      e.preventDefault();
      pos.x += d[0];
      pos.y += d[1];
      place();
    });
    return {
      pos,
      place,
      center(fx = 0.5, fy = 0.5) {
        pos.x = (stage.clientWidth - el.offsetWidth) * fx;
        pos.y = (stage.clientHeight - el.offsetHeight) * fy;
        place();
      },
    };
  }

  function syncRange(input) {
    const min = +input.min || 0;
    const max = +input.max || 100;
    input.style.setProperty('--p', (((input.value - min) / (max - min)) * 100).toFixed(2) + '%');
  }

  function chipGroup(buttons, onSelect) {
    buttons.forEach((b) => {
      b.addEventListener('click', () => {
        buttons.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        onSelect(b);
      });
    });
  }

  function pressWhere(buttons, pred) {
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(pred(b))));
  }

  const BG_TEMPLATES = {
    text: '<div class="bgtext"><p>리퀴드 글래스</p><p>LIQUID GLASS</p><p>빛을 휘게 하는</p><p>HTML · CSS · SVG</p><p>굴절 반사 탄성</p><p>LENS 렌즈 LENS</p><p>유리 너머의 글자</p></div>',
  };

  function setBg(layer, name) {
    Array.from(layer.classList).filter((c) => c.startsWith('bg-')).forEach((c) => layer.classList.remove(c));
    layer.classList.add('bg-' + name);
    layer.innerHTML = BG_TEMPLATES[name] || '';
    layer.dataset.bg = name;
  }

  let toastTimer = 0;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    t.style.animation = 'none';
    void t.offsetWidth;
    t.style.animation = '';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }

  // 반경·크기 전환이 끝나면 변위 맵을 그 최종 모양으로 다시 그립니다
  function refreshOnShapeEnd(el) {
    el.addEventListener('transitionend', (e) => {
      if (e.target === el && /radius|width|height/.test(e.propertyName) && el.__glass) el.__glass.schedule();
    });
  }

  /* ---------- 접근성 설정 ---------- */
  function initA11y() {
    const MQ = {
      'reduce-transparency': '(prefers-reduced-transparency: reduce)',
      'reduce-motion': '(prefers-reduced-motion: reduce)',
      'more-contrast': '(prefers-contrast: more)',
    };
    $$('[data-a11y]').forEach((sw) => {
      const cls = sw.dataset.a11y;
      const set = (on) => {
        root.classList.toggle(cls, on);
        sw.setAttribute('aria-checked', String(on));
        document.dispatchEvent(new CustomEvent('a11ychange', { detail: { cls, on } }));
      };
      let initial = false;
      try { initial = matchMedia(MQ[cls]).matches; } catch (e) { initial = false; }
      root.classList.toggle(cls, initial);
      sw.setAttribute('aria-checked', String(initial));
      sw.addEventListener('click', () => set(sw.getAttribute('aria-checked') !== 'true'));
    });
  }

  /* ---------- 유리 연결 · 동적 조명 ---------- */
  function initGlass() {
    $$('.bg[data-bg]').forEach((layer) => setBg(layer, layer.dataset.bg));
    $$('[data-refract]').forEach((el) => {
      const opts = parseOpts(el.dataset.refract);
      if (el.dataset.mirror) opts.mirror = el.closest(el.dataset.mirror);
      LG.attach(el, opts);
    });

    const lit = $$('[data-lit]');
    let raf = 0;
    let px = -1e4;
    let py = -1e4;
    const update = () => {
      raf = 0;
      for (const el of lit) {
        const r = el.getBoundingClientRect();
        if (r.bottom < -200 || r.top > innerHeight + 200) continue;
        const dx = px - (r.left + r.width / 2);
        const dy = py - (r.top + r.height / 2);
        el.style.setProperty('--lx', clamp(px - r.left, -60, r.width + 60).toFixed(0) + 'px');
        el.style.setProperty('--ly', clamp(py - r.top, -60, r.height + 60).toFixed(0) + 'px');
        el.style.setProperty('--g-angle', ((Math.atan2(dx, -dy) * 180) / Math.PI).toFixed(1) + 'deg');
      }
    };
    window.addEventListener('pointermove', (e) => {
      px = e.clientX;
      py = e.clientY;
      if (!raf) raf = requestAnimationFrame(update);
    }, { passive: true });
  }

  /* ---------- 로컬 내비게이션 ---------- */
  function initNav() {
    const nav = $('#localnav');
    const btn = $('.localnav__chevron', nav);
    const links = $$('.localnav__links a', nav);
    const close = () => {
      nav.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-label', '메뉴 열기');
    };
    btn.addEventListener('click', () => {
      const open = !nav.classList.contains('is-open');
      nav.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', String(open));
      btn.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
    });
    links.forEach((a) => a.addEventListener('click', close));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

    const byId = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) links.forEach((a) => a.classList.toggle('is-current', a === byId.get(en.target.id)));
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    byId.forEach((a, id) => {
      const s = document.getElementById(id);
      if (s) io.observe(s);
    });
  }

  /* ---------- 히어로: 끌 수 있는 렌즈 ---------- */
  function initHero() {
    const stage = $('#hero-stage');
    const lens = $('#hero-lens');
    const hint = $('#hero-hint');
    const tagline = $('.hero__tagline', stage);
    LG.attach(lens, { refraction: 96, bezel: 36, blur: 0.4, dispersion: 0.55, saturation: 1.35, mirror: stage });
    refreshOnShapeEnd(lens);

    const SHAPES = { capsule: [300, 150, 75], circle: [210, 210, 105], card: [330, 210, 46] };
    let shape = 'capsule';
    let size = { w: 300, h: 150 };
    let x = 0;
    let y = 0;
    let vx = 0;
    let vy = 0;
    let dvx = 0;
    let dvy = 0;
    let stretch = 0;
    let angle = 0;
    let dragging = false;
    let touched = false;
    let inView = true;
    let raf = 0;
    let lastT = 0;
    let home = { x: 0, y: 0 };

    const k = () => clamp(stage.clientWidth / 1100, 0.58, 1);
    const maxX = () => Math.max(0, stage.clientWidth - size.w);
    const maxY = () => Math.max(0, stage.clientHeight - size.h);

    function applyShape() {
      const [w, h, r] = SHAPES[shape];
      const s = k();
      size = { w: Math.round(w * s), h: Math.round(h * s) };
      lens.style.setProperty('--lw', size.w + 'px');
      lens.style.setProperty('--lh', size.h + 'px');
      lens.style.setProperty('--lr', Math.round(r * s) + 'px');
    }
    function computeHome() {
      const sr = stage.getBoundingClientRect();
      const tr = tagline.getBoundingClientRect();
      home = {
        x: clamp(tr.left - sr.left + tr.width / 2 - size.w / 2, 0, maxX()),
        y: clamp(tr.top - sr.top + tr.height / 2 - size.h / 2, 0, maxY()),
      };
    }
    function render() {
      const sx = 1 + stretch;
      const sy = 1 - stretch * 0.55;
      lens.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotate(${angle.toFixed(3)}rad) scale(${sx.toFixed(3)}, ${sy.toFixed(3)}) rotate(${(-angle).toFixed(3)}rad)`;
    }
    function towardStretch(svx, svy) {
      const speed = Math.hypot(svx, svy);
      const target = clamp(speed * 0.085, 0, 0.2);
      stretch += (target - stretch) * 0.22;
      if (speed > 0.05) angle = Math.atan2(svy, svx);
    }
    function tick(t) {
      raf = 0;
      const dt = lastT ? Math.min(48, t - lastT) : 16;
      lastT = t;
      let keep = false;
      if (dragging) {
        towardStretch(dvx, dvy);
        dvx *= 0.82;
        dvy *= 0.82;
        keep = true;
      } else if (!touched && !reduced()) {
        const s = t / 1000;
        const tx = home.x + Math.sin(s * 0.55) * Math.min(150, stage.clientWidth * 0.16);
        const ty = home.y + Math.sin(s * 1.1) * 12;
        const nx = x + (tx - x) * 0.05;
        const ny = y + (ty - y) * 0.05;
        towardStretch((nx - x) / dt, (ny - y) / dt);
        x = nx;
        y = ny;
        keep = true;
      } else {
        x += vx * dt;
        y += vy * dt;
        const f = Math.pow(0.9, dt / 16);
        vx *= f;
        vy *= f;
        if (x < 0) { x = 0; vx = Math.abs(vx) * 0.5; }
        if (x > maxX()) { x = maxX(); vx = -Math.abs(vx) * 0.5; }
        if (y < 0) { y = 0; vy = Math.abs(vy) * 0.5; }
        if (y > maxY()) { y = maxY(); vy = -Math.abs(vy) * 0.5; }
        towardStretch(vx, vy);
        keep = Math.hypot(vx, vy) > 0.004 || stretch > 0.002;
        if (!keep) stretch = 0;
      }
      render();
      if (keep && inView) raf = requestAnimationFrame(tick);
      else lastT = 0;
    }
    const kick = () => { if (!raf && inView) raf = requestAnimationFrame(tick); };
    const touch = () => {
      touched = true;
      hint.classList.add('is-done');
    };

    drag(lens, {
      start() {
        dragging = true;
        touch();
        lens.classList.add('is-dragging');
        vx = 0;
        vy = 0;
        return { ox: x, oy: y };
      },
      move({ dx, dy, vx: pvx, vy: pvy, ctx }) {
        x = clamp(ctx.ox + dx, 0, maxX());
        y = clamp(ctx.oy + dy, 0, maxY());
        dvx = pvx;
        dvy = pvy;
        render();
        kick();
      },
      end({ vx: pvx, vy: pvy }) {
        dragging = false;
        lens.classList.remove('is-dragging');
        vx = clamp(pvx, -2.5, 2.5);
        vy = clamp(pvy, -2.5, 2.5);
        kick();
      },
    });
    lens.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 72 : 24;
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (!d) return;
      e.preventDefault();
      touch();
      x = clamp(x + d[0], 0, maxX());
      y = clamp(y + d[1], 0, maxY());
      render();
    });

    chipGroup($$('[data-lens]', stage), (b) => {
      shape = b.dataset.lens;
      applyShape();
      computeHome();
      x = clamp(x, 0, maxX());
      y = clamp(y, 0, maxY());
      render();
      kick();
    });

    new IntersectionObserver(([en]) => {
      inView = en.isIntersecting;
      if (inView) kick();
    }).observe(stage);

    let rt = 0;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => {
        applyShape();
        computeHome();
        x = clamp(x, 0, maxX());
        y = clamp(y, 0, maxY());
        render();
        kick();
      }, 120);
    });

    applyShape();
    computeHome();
    x = home.x;
    y = home.y;
    render();
    kick();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(computeHome);
  }

  /* ---------- 일단 핵심부터: 갤러리 ---------- */
  function initGallery() {
    const gallery = $('#gallery');
    const track = $('#gallery-track');
    const cards = $$('.gcard', track);
    const dots = $$('.dotnav__dot', gallery);
    const btn = $('#gallery-play');
    const DURATION = 5500;
    let index = 0;
    let timer = 0;
    let inView = false;
    let playing = !reduced();

    function restartFill() {
      const d = dots[index];
      d.classList.remove('is-filling');
      void d.offsetWidth;
      d.classList.add('is-filling');
    }
    function schedule() {
      clearTimeout(timer);
      if (playing && inView) timer = setTimeout(() => go(index + 1), DURATION);
    }
    function setActive(i) {
      index = i;
      dots.forEach((d, k) => {
        d.classList.toggle('is-active', k === i);
        d.classList.remove('is-filling');
        d.setAttribute('aria-current', String(k === i));
      });
      restartFill();
      schedule();
    }
    function go(i) {
      i = (i + cards.length) % cards.length;
      const c = cards[i];
      track.scrollTo({ left: c.offsetLeft - (track.clientWidth - c.offsetWidth) / 2, behavior: reduced() ? 'auto' : 'smooth' });
      setActive(i);
    }
    function setPlaying(p) {
      playing = p;
      gallery.classList.toggle('is-playing', p);
      btn.setAttribute('aria-label', p ? '일시 정지' : '재생');
      if (p) restartFill();
      schedule();
    }

    dots.forEach((d, i) => d.addEventListener('click', () => go(i)));
    btn.addEventListener('click', () => setPlaying(!playing));

    let st = 0;
    track.addEventListener('scroll', () => {
      clearTimeout(st);
      st = setTimeout(() => {
        const center = track.scrollLeft + track.clientWidth / 2;
        let best = 0;
        let bd = Infinity;
        cards.forEach((c, i) => {
          const d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - center);
          if (d < bd) { bd = d; best = i; }
        });
        if (best !== index) setActive(best);
      }, 90);
    }, { passive: true });
    track.addEventListener('pointerdown', schedule);

    new IntersectionObserver(([en]) => {
      inView = en.isIntersecting;
      schedule();
    }, { threshold: 0.35 }).observe(gallery);
    const cio = new IntersectionObserver((entries) => {
      entries.forEach((en) => en.target.classList.toggle('is-visible', en.isIntersecting));
    }, { threshold: 0.4 });
    cards.forEach((c) => cio.observe(c));

    document.addEventListener('a11ychange', (e) => {
      if (e.detail.cls === 'reduce-motion' && e.detail.on) setPlaying(false);
    });
    setPlaying(playing);
  }

  /* ---------- 구조: 레이어 토글 · 분해도 ---------- */
  function initLayers() {
    const card = $('#layer-card');
    const stack = $('#layer-stack');
    const range = $('#explode');
    const out = $('#explode-val');

    $$('[data-layer]').forEach((sw) => {
      const name = sw.dataset.layer;
      const plane = $(`[data-plane="${name}"]`, stack);
      sw.addEventListener('click', () => {
        const on = sw.getAttribute('aria-checked') !== 'true';
        sw.setAttribute('aria-checked', String(on));
        card.classList.toggle('no-' + name, !on);
        stack.classList.toggle('no-' + name, !on);
        if (name === 'base' && card.__glass) card.__glass.setActive(on);
      });
      const tile = sw.closest('.tile');
      tile.addEventListener('pointerenter', () => plane.classList.add('is-hot'));
      tile.addEventListener('pointerleave', () => plane.classList.remove('is-hot'));
    });

    const upd = () => {
      stack.style.setProperty('--gap', (range.value * 0.72).toFixed(1) + 'px');
      out.textContent = range.value + '%';
    };
    range.addEventListener('input', upd);
    upd();
  }

  /* ---------- 굴절 실험실 ---------- */
  function initLab() {
    const stage = $('#lab-stage');
    const panel = $('#lab-glass');
    const mapImg = $('#lab-map');
    const codeEl = $('#lab-code code');
    const keys = ['refraction', 'bezel', 'dispersion', 'blur', 'radius'];
    const inputs = Object.fromEntries(keys.map((k) => [k, $('#lab-' + k)]));
    const outs = Object.fromEntries(keys.map((k) => [k, $('#lab-' + k + '-val')]));
    let showMap = false;

    if (!LG.supported && !LG.mirrorSupported) $('#lab-note').hidden = false;

    const read = () => ({
      refraction: +inputs.refraction.value,
      bezel: +inputs.bezel.value,
      dispersion: inputs.dispersion.value / 100,
      blur: +inputs.blur.value,
      saturation: 1.5,
    });
    panel.style.borderRadius = inputs.radius.value + 'px';
    const glass = LG.attach(panel, Object.assign(read(), { mirror: stage }));

    function update() {
      panel.style.borderRadius = inputs.radius.value + 'px';
      panel.style.setProperty('--g-blur', Math.max(3, +inputs.blur.value * 2) + 'px');
      glass.set(read());
      outs.refraction.textContent = inputs.refraction.value;
      outs.bezel.textContent = inputs.bezel.value + 'px';
      outs.dispersion.textContent = inputs.dispersion.value + '%';
      outs.blur.textContent = inputs.blur.value + 'px';
      outs.radius.textContent = inputs.radius.value + 'px';
      codeEl.textContent = glass.source();
      if (showMap) mapImg.src = glass.mapURL;
    }
    keys.forEach((k) => inputs[k].addEventListener('input', update));

    const mover = movable(panel, stage);
    chipGroup($$('[data-labbg]'), (b) => setBg($('.bg', stage), b.dataset.labbg));

    $('#lab-showmap').addEventListener('click', (e) => {
      showMap = !showMap;
      e.currentTarget.setAttribute('aria-pressed', String(showMap));
      mapImg.hidden = !showMap;
      if (showMap) mapImg.src = glass.mapURL;
    });

    let rt = 0;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => { mover.place(); update(); }, 150);
    });

    update();
    mover.center(0.42, 0.42);
  }

  /* ---------- 광학: 스넬의 법칙 도해 ---------- */
  function initOptics() {
    const svg = $('#optics-svg');
    const nIn = $('#optics-n');
    const xIn = $('#optics-x');
    const g = (id) => document.getElementById(id);
    const C = { x: 420, y: 262 };
    const R = 160;
    const TOP = 102;
    const FLOOR = 262;
    const X_MIN = 120;
    const X_MAX = 576;
    const chips = $$('[data-n]');
    const deg = (r) => (r * 180) / Math.PI;
    const setLine = (el, x1, y1, x2, y2) => {
      el.setAttribute('x1', x1.toFixed(1));
      el.setAttribute('y1', y1.toFixed(1));
      el.setAttribute('x2', x2.toFixed(1));
      el.setAttribute('y2', y2.toFixed(1));
    };

    function draw() {
      const n = +nIn.value;
      const X = X_MIN + ((X_MAX - X_MIN) * xIn.value) / 100;
      let P;
      let N;
      if (X <= C.x) {
        P = { x: X, y: TOP };
        N = { x: 0, y: -1 };
      } else {
        const dx = X - C.x;
        const py = C.y - Math.sqrt(R * R - dx * dx);
        P = { x: X, y: py };
        N = { x: dx / R, y: (py - C.y) / R };
      }
      // 아래로 내려오는 빛 d = (0, 1). 표면 법선 N은 바깥(위)을 향합니다.
      const cosi = -N.y;
      const eta = 1 / n;
      const kk = 1 - eta * eta * (1 - cosi * cosi);
      const c2 = eta * cosi - Math.sqrt(Math.max(0, kk));
      const t = { x: c2 * N.x, y: eta + c2 * N.y };
      const s = (FLOOR - P.y) / t.y;
      const H = { x: clamp(P.x + s * t.x, 0, 640), y: FLOOR };
      const th1 = Math.acos(clamp(cosi, -1, 1));
      const th2 = Math.asin(clamp(eta * Math.sin(th1), -1, 1));
      const R0 = ((n - 1) / (n + 1)) ** 2;
      const Rf = n <= 1.001 ? 0 : R0 + (1 - R0) * (1 - cosi) ** 5;
      const refl = { x: 2 * cosi * N.x, y: 1 + 2 * cosi * N.y };

      g('optics-handle').setAttribute('cx', X.toFixed(1));
      setLine(g('optics-in'), X, 26, P.x, P.y);
      setLine(g('optics-out'), P.x, P.y, H.x, H.y);
      setLine(g('optics-ghost'), X, P.y, X, FLOOR);
      setLine(g('optics-normal'), P.x - N.x * 44, P.y - N.y * 44, P.x + N.x * 44, P.y + N.y * 44);
      setLine(g('optics-reflect'), P.x, P.y, P.x + refl.x * 80, P.y + refl.y * 80);
      g('optics-reflect').style.opacity = clamp(Rf * 5, 0.08, 1).toFixed(2);
      g('optics-hit').setAttribute('cx', H.x.toFixed(1));
      const shift = H.x - X;
      g('optics-shift').setAttribute('d', Math.abs(shift) < 0.5 ? '' : `M${X.toFixed(1)} 276 V288 M${X.toFixed(1)} 282 H${H.x.toFixed(1)} M${H.x.toFixed(1)} 276 V288`);

      g('ro-t1').textContent = deg(th1).toFixed(1) + '°';
      g('ro-t2').textContent = deg(th2).toFixed(1) + '°';
      g('ro-dx').textContent = Math.abs(shift).toFixed(1) + 'px';
      g('ro-r').textContent = (Rf * 100).toFixed(1) + '%';
      g('optics-n-val').textContent = n.toFixed(2);
      g('optics-x-val').textContent = X <= C.x ? '평평한 가운데' : '곡면 베젤';
      pressWhere(chips, (b) => Math.abs(+b.dataset.n - n) < 0.005);
    }

    nIn.addEventListener('input', draw);
    xIn.addEventListener('input', draw);
    chips.forEach((b) => b.addEventListener('click', () => {
      nIn.value = b.dataset.n;
      syncRange(nIn);
      draw();
    }));

    const toX = (clientX, clientY) => {
      const pt = svg.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      const p = pt.matrixTransform(svg.getScreenCTM().inverse());
      xIn.value = clamp(((p.x - X_MIN) / (X_MAX - X_MIN)) * 100, 0, 100);
      syncRange(xIn);
      draw();
    };
    drag(svg, {
      start(e) { toX(e.clientX, e.clientY); return {}; },
      move({ ev }) { toX(ev.clientX, ev.clientY); },
    });
    draw();
  }

  /* ---------- 인터랙션: 세그먼트 컨트롤 ---------- */
  function initSegmented() {
    const seg = $('#seg');
    const pill = $('#seg-pill');
    const opts = $$('.seg__opt', seg);
    const glass = LG.attach(pill, { refraction: 46, bezel: 14, blur: 0, dispersion: 0.6, saturation: 1.3, active: false, mirror: seg });
    const PAD = 4;
    const ELASTIC = 8;
    let idx = 0;
    let w = 0;
    let pos = 0;
    let suppressClick = false;

    function setPos(p, sx = 1, sy = 1) {
      pos = p;
      pill.style.setProperty('--seg-x', p.toFixed(1) + 'px');
      pill.style.setProperty('--seg-sx', sx.toFixed(3));
      pill.style.setProperty('--seg-sy', sy.toFixed(3));
    }
    function measure() {
      w = opts[0].offsetWidth;
      pill.style.setProperty('--seg-w', w + 'px');
      setPos(idx * w);
    }
    function select(i, focus) {
      idx = i;
      opts.forEach((o, k) => {
        o.setAttribute('aria-checked', String(k === i));
        o.tabIndex = k === i ? 0 : -1;
      });
      setPos(i * w);
      if (focus) opts[i].focus();
    }

    opts.forEach((o, i) => o.addEventListener('click', () => {
      if (suppressClick) return;
      select(i);
    }));
    seg.addEventListener('keydown', (e) => {
      const d = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
      if (!d) return;
      e.preventDefault();
      select((idx + d + opts.length) % opts.length, true);
    });

    drag(seg, {
      threshold: 3,
      start(e) {
        const local = e.clientX - seg.getBoundingClientRect().left - PAD;
        return { onPill: local >= pos - 4 && local <= pos + w + 4, start: pos };
      },
      move({ dx, vx, ctx }) {
        if (!ctx.onPill) return;
        if (!seg.classList.contains('is-dragging')) {
          seg.classList.add('is-dragging');
          glass.setActive(true);
        }
        const max = (opts.length - 1) * w;
        let p = ctx.start + dx;
        if (p < 0) p = -ELASTIC * (1 - Math.exp(p / 40));
        else if (p > max) p = max + ELASTIC * (1 - Math.exp(-(p - max) / 40));
        const st = clamp(Math.abs(vx) * 0.12, 0, 0.16);
        setPos(p, 1.08 + st, 1.08 - st * 0.5);
      },
      end({ active, ctx }) {
        if (!ctx.onPill || !active) return;
        suppressClick = true;
        setTimeout(() => { suppressClick = false; }, 0);
        seg.classList.remove('is-dragging');
        select(clamp(Math.round(pos / w), 0, opts.length - 1));
        setTimeout(() => { if (!seg.classList.contains('is-dragging')) glass.setActive(false); }, 260);
      },
    });

    new ResizeObserver(measure).observe(seg);
    measure();
    select(0);
  }

  /* ---------- 인터랙션: 스위치 ---------- */
  function initSwitch() {
    const sw = $('#gswitch');
    const thumb = $('#gswitch-thumb');
    const glass = LG.attach(thumb, { refraction: 40, bezel: 12, blur: 0, dispersion: 0.7, saturation: 1.4, active: false, mirror: sw });
    let offTimer = 0;
    const press = () => {
      clearTimeout(offTimer);
      sw.classList.add('is-pressed');
      glass.setActive(true);
    };
    const release = () => {
      if (!sw.classList.contains('is-pressed')) return;
      sw.classList.remove('is-pressed');
      offTimer = setTimeout(() => glass.setActive(false), 260);
    };
    sw.addEventListener('pointerdown', (e) => { if (e.button === 0) press(); });
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    sw.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') press(); });
    sw.addEventListener('keyup', release);
    sw.addEventListener('blur', release);
    sw.addEventListener('click', () => {
      sw.setAttribute('aria-checked', String(sw.getAttribute('aria-checked') !== 'true'));
    });
  }

  /* ---------- 인터랙션: 슬라이더 ---------- */
  function initSlider() {
    const sl = $('#gslider');
    const track = $('.gslider__track', sl);
    const thumb = $('#gslider-thumb');
    const glass = LG.attach(thumb, { refraction: 34, bezel: 12, blur: 0, dispersion: 0.6, saturation: 1.3, active: false, mirror: sl });
    let v = 40;
    let offTimer = 0;

    function set(nv) {
      v = clamp(Math.round(nv), 0, 100);
      sl.style.setProperty('--vr', (v / 100).toFixed(3));
      sl.style.setProperty('--vx', ((v / 100) * track.offsetWidth).toFixed(1) + 'px');
      sl.setAttribute('aria-valuenow', String(v));
    }
    const fromX = (clientX) => {
      const r = track.getBoundingClientRect();
      return ((clientX - r.left) / r.width) * 100;
    };
    drag(sl, {
      start(e) {
        clearTimeout(offTimer);
        sl.classList.add('is-dragging');
        glass.setActive(true);
        set(fromX(e.clientX));
        return {};
      },
      move({ ev }) { set(fromX(ev.clientX)); },
      end() {
        sl.classList.remove('is-dragging');
        offTimer = setTimeout(() => glass.setActive(false), 300);
      },
    });
    sl.addEventListener('keydown', (e) => {
      const d = { ArrowLeft: -5, ArrowDown: -5, ArrowRight: 5, ArrowUp: 5, PageDown: -20, PageUp: 20 }[e.key];
      if (e.key === 'Home') set(0);
      else if (e.key === 'End') set(100);
      else if (d) set(v + d);
      else return;
      e.preventDefault();
    });
    new ResizeObserver(() => set(v)).observe(track);
    set(v);
  }

  /* ---------- 인터랙션: 스프링 곡선 ---------- */
  function initSpring() {
    const y1In = $('#spring-y1');
    const curve = $('#spring-curve');
    const peak = $('#spring-peak');
    const code = $('#spring-code');
    const over = $('#spring-over');
    const out = $('#spring-y1-val');
    const rail = $('.spring__rail');
    const dot = $('#spring-dot');
    const X1 = 0.34;
    const X2 = 0.64;
    const Y2 = 1;
    const gx = (t) => 30 + t * 220;
    const gy = (p) => 190 - p * 110;

    function update() {
      const y1 = +y1In.value;
      curve.setAttribute('d', `M${gx(0)} ${gy(0)} C${gx(X1).toFixed(1)} ${gy(y1).toFixed(1)} ${gx(X2).toFixed(1)} ${gy(Y2).toFixed(1)} ${gx(1)} ${gy(1)}`);
      let best = { x: 1, y: 1 };
      for (let i = 0; i <= 200; i++) {
        const s = i / 200;
        const m = 1 - s;
        const by = 3 * m * m * s * y1 + 3 * m * s * s * Y2 + s * s * s;
        const bx = 3 * m * m * s * X1 + 3 * m * s * s * X2 + s * s * s;
        if (by > best.y) best = { x: bx, y: by };
      }
      peak.setAttribute('cx', gx(best.x).toFixed(1));
      peak.setAttribute('cy', gy(best.y).toFixed(1));
      const str = `cubic-bezier(${X1}, ${y1.toFixed(2)}, ${X2}, ${Y2})`;
      code.textContent = str;
      out.textContent = y1.toFixed(2);
      over.textContent = best.y > 1.004 ? `최대 오버슈트 +${((best.y - 1) * 100).toFixed(0)}%` : '오버슈트 없음';
      root.style.setProperty('--spring', str);
    }
    const setRail = () => rail.style.setProperty('--rail-x', Math.max(0, rail.clientWidth - dot.offsetWidth - 8) + 'px');

    y1In.addEventListener('input', update);
    $('#spring-play').addEventListener('click', () => {
      setRail();
      rail.classList.toggle('is-end');
    });
    window.addEventListener('resize', setRail);
    setRail();
    update();
  }

  /* ---------- 사용 경험: 휴대폰 화면 ---------- */
  function initExperience() {
    const tabs = $$('.tabs__tab');
    const panel = $('#xp-panel');
    const phone = $('.phone', panel);
    const screens = $$('.screen[data-screen], .xp__shot', panel);
    const texts = $$('.xp__item');

    function show(name, focus) {
      tabs.forEach((t) => {
        const on = t.dataset.screen === name;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        if (on) {
          panel.setAttribute('aria-labelledby', t.id);
          if (focus) t.focus();
        }
      });
      screens.forEach((s) => { s.hidden = s.dataset.screen !== name; });
      texts.forEach((s) => { s.hidden = s.dataset.screen !== name; });
      // 제어 센터와 알림은 Apple 이미지로 보여 주므로 CSS로 만든 휴대폰을 숨깁니다
      phone.hidden = !$('.screen:not([hidden])', phone);
    }
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => show(t.dataset.screen));
      t.addEventListener('keydown', (e) => {
        const d = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
        if (!d) return;
        e.preventDefault();
        show(tabs[(i + d + tabs.length) % tabs.length].dataset.screen, true);
      });
    });

    // 사진 보관함: 일러스트 열 장. 앞 줄은 사진 전체를, 뒤로 갈수록 확대한 부분을 보여 줍니다
    const grid = $('#photo-grid');
    const frag = document.createDocumentFragment();
    const PHOTOS = ['christmas', 'bkomachi', 'poster', 'lineup', 'kana-akane', 'shikishi', 'silhouette-star', 'underwater', 'silhouette-stage', 'character']
      .map((n) => `assets/illust-${n}.jpg`);
    for (let i = 0; i < 30; i++) {
      const p = i % PHOTOS.length;
      const zoom = Math.floor(i / PHOTOS.length);
      const tile = document.createElement('i');
      tile.dataset.photo = p;
      tile.setAttribute('role', 'button');
      tile.setAttribute('tabindex', '0');
      tile.setAttribute('aria-label', `사진 ${p + 1} 열기`);
      tile.style.backgroundImage = `url("${PHOTOS[p]}")`;
      tile.style.backgroundSize = zoom ? 150 + zoom * 60 + '%' : 'cover';
      tile.style.backgroundPosition = zoom ? `${(i * 37) % 100}% ${(i * 23) % 60 + 10}%` : 'center 25%';
      frag.appendChild(tile);
    }
    grid.appendChild(frag);

    const viewer = $('#viewer');
    const vImg = $('#viewer-img');
    const vCount = $('#viewer-count');
    const vLike = $('#viewer-like');
    const liked = new Set();
    let current = 0;
    const showPhoto = (i) => {
      current = (i + PHOTOS.length) % PHOTOS.length;
      vImg.src = PHOTOS[current];
      vCount.textContent = `${current + 1} / ${PHOTOS.length}`;
      vLike.setAttribute('aria-pressed', String(liked.has(current)));
    };
    const openViewer = (i) => {
      showPhoto(i);
      viewer.hidden = false;
      $('#viewer-back').focus();
    };
    const closeViewer = () => {
      viewer.hidden = true;
      const tile = $(`#photo-grid [data-photo="${current}"]`);
      if (tile) tile.focus({ preventScroll: true });
    };
    grid.addEventListener('click', (e) => {
      const t = e.target.closest('[data-photo]');
      if (t) openViewer(+t.dataset.photo);
    });
    grid.addEventListener('keydown', (e) => {
      const t = e.target.closest('[data-photo]');
      if (t && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openViewer(+t.dataset.photo); }
    });
    $('#viewer-back').addEventListener('click', closeViewer);
    $('#viewer-prev').addEventListener('click', () => showPhoto(current - 1));
    $('#viewer-next').addEventListener('click', () => showPhoto(current + 1));
    vLike.addEventListener('click', () => {
      if (liked.has(current)) liked.delete(current);
      else liked.add(current);
      vLike.setAttribute('aria-pressed', String(liked.has(current)));
    });
    viewer.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeViewer();
      else if (e.key === 'ArrowLeft') showPhoto(current - 1);
      else if (e.key === 'ArrowRight') showPhoto(current + 1);
    });
    // 옆으로 밀어 넘기기
    drag(vImg, {
      threshold: 12,
      end({ active, dx, dy }) {
        if (active && Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) showPhoto(current + (dx < 0 ? 1 : -1));
      },
    });

    const photos = $('#photos-scroller');
    const photosScreen = photos.closest('.screen');
    let lastTop = 0;
    photos.addEventListener('scroll', () => {
      const top = photos.scrollTop;
      if (top > lastTop + 4 && top > 40) photosScreen.classList.add('is-min');
      else if (top < lastTop - 4 || top < 20) photosScreen.classList.remove('is-min');
      lastTop = top;
    }, { passive: true });
    const tabBtns = $$('.ios-tab', photosScreen);
    tabBtns.forEach((b) => b.addEventListener('click', () => {
      if (photosScreen.classList.contains('is-min')) {
        photosScreen.classList.remove('is-min');
        return;
      }
      tabBtns.forEach((x) => x.classList.toggle('is-active', x === b));
    }));

    // 앨범
    const names = ['Refraction', '빛의 굴절', 'Specular Light', 'Fresnel', 'Caustics', 'Soft Bezel', '유리 위의 비', 'Displacement', 'Chromatic', 'Spring 1.56', 'Backdrop', 'Clear Glass', '틴트', 'Lens Flare', 'Liquid Motion'];
    $('#tracks').innerHTML = names.map((n) => `<li>${n}</li>`).join('');
    const album = $('#album-scroller');
    const albumScreen = album.closest('.screen');
    album.addEventListener('scroll', () => {
      albumScreen.classList.toggle('is-scrolled', album.scrollTop > 250);
    }, { passive: true });

    initControlCenter($('[data-shot="control"]'));
    initLockScreen($('[data-shot="notify"]'));
    show('tabbar');
  }

  /* ---------- Apple 화면 위의 조작 ----------
     좌표는 원본 이미지 픽셀입니다. 켜고 끈 상태는 이미지와 다른 모습(face)을 그 자리에 덮어 보여 줍니다. */
  const ICONS = {
    airplane: '<path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" fill="currentColor"/>',
    airdrop: '<g fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M7.8 17.2a6 6 0 1 1 8.4 0"/><path d="M5 20a10 10 0 1 1 14 0"/><path d="M10.4 14.6a2.3 2.3 0 1 1 3.2 0"/></g>',
    wifi: '<path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.2a9.5 9.5 0 0 1 13 0M8.6 15.3a5 5 0 0 1 6.8 0" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="18.6" r="1.8" fill="currentColor"/>',
    cell: '<rect x="3" y="15" width="3.6" height="5" rx="1" fill="currentColor"/><rect x="8.2" y="11" width="3.6" height="9" rx="1" fill="currentColor"/><rect x="13.4" y="7" width="3.6" height="13" rx="1" fill="currentColor"/><rect x="18.6" y="3" width="3.4" height="17" rx="1" fill="currentColor"/>',
    bluetooth: '<path d="M7 7.5l10 9-5 4.5V3l5 4.5-10 9" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
    link: '<g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M10 14a4 4 0 0 1 0-5.6l2.4-2.4a4 4 0 0 1 5.6 5.6l-1.2 1.2"/><path d="M14 10a4 4 0 0 1 0 5.6L11.6 18A4 4 0 0 1 6 12.4l1.2-1.2"/></g>',
    globe: '<g fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.8 2.6 15.2 0 18M12 3c-2.6 2.8-2.6 15.2 0 18"/></g>',
    bell: '<path d="M12 3a6 6 0 0 0-6 6v4.2L4.3 16a.8.8 0 0 0 .7 1.2h14a.8.8 0 0 0 .7-1.2L18 13.2V9a6 6 0 0 0-6-6zM9.5 19a2.5 2.5 0 0 0 5 0z" fill="currentColor"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="currentColor"/>',
    bulb: '<path d="M12 2.5a6.5 6.5 0 0 0-3.8 11.8c.6.5.8 1 .8 1.7V17h6v-1c0-.7.3-1.2.8-1.7A6.5 6.5 0 0 0 12 2.5zM9 18.5h6V20a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 20z" fill="currentColor"/>',
    rotation: '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M17.5 3v4h-4"/></g><rect x="9" y="11" width="6" height="5" rx="1" fill="currentColor"/><path d="M10.2 11V9.6a1.8 1.8 0 0 1 3.6 0" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    battery: '<rect x="2.5" y="7.5" width="17" height="9" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="4.5" y="9.5" width="11" height="5" rx="1" fill="currentColor"/><rect x="20.5" y="10.5" width="1.6" height="3" rx=".8" fill="currentColor"/>',
    pause: '<path d="M6.5 4h4v16h-4zM13.5 4h4v16h-4z" fill="currentColor"/>',
    sun: '<circle cx="12" cy="12" r="4.2" fill="currentColor"/><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.3 5.3l1.7 1.7M17 17l1.7 1.7M5.3 18.7L7 17M17 7l1.7-1.7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    speaker: '<path d="M3.5 9h4l5-4.5v15L7.5 15h-4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.7 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    flashlight: '<path d="M7.5 2.5h9v3.8l-2.8 3.9V21.5h-3.4V10.2L7.5 6.3z" fill="currentColor"/>',
    camera: '<path d="M4 7.5h3l1.8-2.5h6.4L17 7.5h3a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8.5a1 1 0 0 1 1-1zM12 16.2a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8z" fill="currentColor" fill-rule="evenodd"/>',
  };
  const svg = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
  const OFF = 'rgb(140 122 100)';

  function hotspot(shot, c) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'hot' + (c.rect ? ' hot--rect' : '');
    b.setAttribute('aria-label', c.label);
    const vars = c.rect
      ? { '--x0': c.rect[0], '--y0': c.rect[1], '--w': c.rect[2], '--h': c.rect[3], '--r': c.rect[4] || 0 }
      : { '--x': c.x, '--y': c.y, '--d': c.d };
    const f = c.face;
    if (f) {
      Object.assign(vars, { '--fx': f.x ?? c.x, '--fy': f.y ?? c.y, '--fd': f.d ?? c.d });
      // 사각형 단추 안의 face 좌표는 단추 기준이 아니라 이미지 기준이므로 단추 위치만큼 빼 줍니다
      if (c.rect) { vars['--fx'] -= c.rect[0]; vars['--fy'] -= c.rect[1]; }
      else { vars['--fx'] -= c.x - c.d / 2; vars['--fy'] -= c.y - c.d / 2; }
      b.innerHTML = `<span class="hot__face${f.square ? ' hot__face--rect' : ''}" style="--bg:${f.bg};--fg:${f.fg || '#fff'}">${svg(f.icon)}</span>`;
    }
    Object.entries(vars).forEach(([k, v]) => b.style.setProperty(k, v));
    if (c.toggle) {
      b.setAttribute('aria-pressed', String(c.on));
      b.addEventListener('click', () => {
        const flipped = b.classList.toggle('is-flipped');
        b.setAttribute('aria-pressed', String(c.on !== flipped));
      });
    }
    shot.appendChild(b);
    return b;
  }

  function initControlCenter(shot) {
    const T = true;
    [
      { label: '에어플레인 모드', x: 103.5, y: 196, d: 57, toggle: T, on: false, face: { bg: '#ff9f0a', icon: 'airplane' } },
      { label: 'AirDrop', x: 172.5, y: 196, d: 57, toggle: T, on: false, face: { bg: '#0a84ff', icon: 'airdrop' } },
      { label: 'Wi-Fi', x: 103.5, y: 267.5, d: 57, toggle: T, on: true, face: { bg: OFF, icon: 'wifi' } },
      { label: '셀룰러 데이터', x: 158, y: 252, d: 26, toggle: T, on: true, face: { bg: OFF, icon: 'cell' } },
      { label: 'Bluetooth', x: 190, y: 252, d: 26, toggle: T, on: true, face: { bg: OFF, icon: 'bluetooth' } },
      { label: '개인용 핫스팟', x: 158, y: 284, d: 26, toggle: T, on: false, face: { bg: '#30d158', icon: 'link' } },
      { label: 'VPN', x: 190, y: 284, d: 26, toggle: T, on: false, face: { bg: '#0a84ff', icon: 'globe' } },
      { label: 'AirPlay', x: 352.5, y: 187.5, d: 32 },
      { label: '이전 곡', x: 266, y: 286, d: 30 },
      { label: '재생', rect: [295, 271, 31, 30, 4], toggle: T, on: false, face: { x: 310.5, y: 286, d: 30, bg: 'rgb(97 91 88)', icon: 'pause', square: T } },
      { label: '다음 곡', x: 355, y: 286, d: 30 },
      { label: '카메라', x: 96, y: 361, d: 70 },
      { label: '무음 모드', x: 181, y: 361, d: 70, toggle: T, on: true, face: { bg: OFF, icon: 'bell' } },
      { label: '집중 모드', rect: [61, 412.5, 155, 70, 35], toggle: T, on: false, face: { x: 95, y: 447.5, d: 40, bg: '#5e5ce6', icon: 'moon' } },
      { label: '손전등', rect: [61, 499, 155, 153.5, 32], toggle: T, on: false, face: { x: 95, y: 530, d: 40, bg: '#f5f5f7', fg: '#1d1d1f', icon: 'bulb' } },
      { label: '화면 방향 고정', x: 268, y: 532.5, d: 70, toggle: T, on: false, face: { bg: '#f5f5f7', fg: '#ff3b30', icon: 'rotation' } },
      { label: '화면 미러링', x: 353, y: 532.5, d: 70 },
      { label: '저전력 모드', x: 268, y: 617.5, d: 70, toggle: T, on: false, face: { bg: '#f5f5f7', fg: '#e5a400', icon: 'battery' } },
    ].forEach((c) => hotspot(shot, c));

    // 밝기·음량: 원본 막대 위에 같은 모양의 막대를 덮고 끌어서 조절합니다
    [
      { label: '밝기', x0: 233, w: 70, fillTop: 369, icon: 'sun', color: '#ffcc00' },
      { label: '음량', x0: 318.5, w: 69.5, fillTop: 426, icon: 'speaker', color: '#00c0e8' },
    ].forEach((c) => {
      const y0 = 326;
      const h = 155;
      const el = document.createElement('div');
      el.className = 'hot-slider';
      el.setAttribute('role', 'slider');
      el.setAttribute('tabindex', '0');
      el.setAttribute('aria-label', c.label);
      el.setAttribute('aria-valuemin', '0');
      el.setAttribute('aria-valuemax', '100');
      const sk = h / (c.fillTop - y0);
      Object.entries({ '--x0': c.x0, '--y0': y0, '--w': c.w, '--h': h, '--sk': sk.toFixed(3), '--icon-on': c.color })
        .forEach(([k, v]) => el.style.setProperty(k, v));
      el.innerHTML = `<span class="hot-slider__fill"></span>${svg(c.icon)}`;
      const set = (v) => {
        v = clamp(Math.round(v), 0, 100);
        el.style.setProperty('--vr', (v / 100).toFixed(3));
        el.setAttribute('aria-valuenow', String(v));
        el.classList.toggle('is-covered', v > 26);
      };
      set(((y0 + h - c.fillTop) / h) * 100);
      drag(el, {
        start() { return { v0: +el.getAttribute('aria-valuenow'), h: el.offsetHeight }; },
        move({ dy, ctx }) { set(ctx.v0 - (dy / ctx.h) * 100); },
      });
      el.addEventListener('keydown', (e) => {
        const d = { ArrowUp: 5, ArrowRight: 5, ArrowDown: -5, ArrowLeft: -5 }[e.key];
        if (!d) return;
        e.preventDefault();
        set(+el.getAttribute('aria-valuenow') + d);
      });
      shot.appendChild(el);
    });
  }

  function initLockScreen(shot) {
    const dim = document.createElement('div');
    dim.className = 'shot__dim';
    const glow = document.createElement('div');
    glow.className = 'lock-glow';
    shot.append(glow, dim);

    const cards = [[114, 454, 373.5, 66], [114, 528, 373.5, 66], [114, 602.5, 373.5, 62.5], [114, 682.5, 373.5, 62.5]];
    const MESSAGES = [
      '펼친 알림은 이 페이지의 리퀴드 글래스입니다. 가장자리를 따라 잠금 화면의 곡선이 휘어 보입니다.',
      '두 번째 알림입니다. 바깥을 누르거나 닫기를 누르면 접힙니다.',
      '겹친 알림 묶음입니다. 실제 iPhone에서는 눌러서 펼치면 같은 앱의 알림이 차례로 나타납니다.',
      '마지막 알림 묶음입니다. 아래 손전등 버튼도 눌러 보세요.',
    ];
    const sheet = document.createElement('div');
    sheet.className = 'lock-sheet glass';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-label', '펼친 알림');
    sheet.innerHTML = '<div class="lock-sheet__head"><span class="lock-sheet__icon"></span><p class="lock-sheet__title">Title</p><span class="lock-sheet__time">9:41 AM</span></div><p class="lock-sheet__msg"></p><div class="lock-sheet__actions"><button type="button">읽음으로 표시</button><button type="button">알림 지우기</button></div>';
    shot.appendChild(sheet);

    let lastCard = null;
    const close = () => {
      shot.classList.remove('is-sheet');
      if (lastCard) lastCard.focus({ preventScroll: true });
    };
    cards.forEach((r, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'lock-card';
      b.setAttribute('aria-label', `알림 ${i + 1} 펼치기`);
      Object.entries({ '--x0': r[0], '--y0': r[1], '--w': r[2], '--h': r[3] }).forEach(([k, v]) => b.style.setProperty(k, v));
      b.addEventListener('click', () => {
        lastCard = b;
        $('.lock-sheet__msg', sheet).textContent = MESSAGES[i];
        sheet.style.top = `calc(${Math.min(r[1], 560)} * var(--u))`;
        shot.classList.add('is-sheet');
        $('button', sheet).focus({ preventScroll: true });
      });
      shot.insertBefore(b, dim);
    });
    dim.addEventListener('click', close);
    $$('.lock-sheet__actions button', sheet).forEach((b) => b.addEventListener('click', close));
    sheet.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

    [['손전등', 'flashlight', 150], ['카메라', 'camera', 452]].forEach(([label, icon, x]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'lock-btn glass';
      b.setAttribute('aria-label', label);
      b.style.setProperty('--x', x);
      b.style.setProperty('--y', 838);
      b.innerHTML = svg(icon);
      if (icon === 'flashlight') {
        b.setAttribute('aria-pressed', 'false');
        b.addEventListener('click', () => {
          const on = b.getAttribute('aria-pressed') !== 'true';
          b.setAttribute('aria-pressed', String(on));
          shot.classList.toggle('is-torch', on);
        });
      }
      shot.insertBefore(b, dim);
      LG.attach(b, { refraction: 40, bezel: 16, blur: 3, dispersion: 0.35, saturation: 1.6, mirror: shot });
    });
    LG.attach(sheet, { refraction: 60, bezel: 22, blur: 4, dispersion: 0.3, saturation: 1.6, mirror: shot });
  }

  /* ---------- 직접 만들기 ---------- */
  const PRESETS = {
    liquid: { refraction: 70, bezel: 24, dispersion: 30, blur: 1.5, saturation: 160, radius: 36, tint: '#ffffff', tintA: 8, hi: 55, shadow: 40, fg: 'light' },
    clear: { refraction: 110, bezel: 32, dispersion: 55, blur: 0, saturation: 120, radius: 36, tint: '#ffffff', tintA: 0, hi: 75, shadow: 25, fg: 'light' },
    tinted: { refraction: 60, bezel: 22, dispersion: 20, blur: 3, saturation: 180, radius: 36, tint: '#0a84ff', tintA: 38, hi: 50, shadow: 40, fg: 'light' },
    glassmorphism: { refraction: 0, bezel: 24, dispersion: 0, blur: 16, saturation: 100, radius: 16, tint: '#ffffff', tintA: 15, hi: 30, shadow: 60, fg: 'light' },
    ios7: { refraction: 0, bezel: 24, dispersion: 0, blur: 30, saturation: 180, radius: 12, tint: '#f8f8f8', tintA: 62, hi: 0, shadow: 0, fg: 'dark' },
  };
  const SHAPES = { card: { w: 340, h: 210 }, capsule: { w: 300, h: 64 }, circle: { w: 110, h: 110 } };
  const PAGE_BG = {
    underwater: '#12324a url("illust-underwater.jpg") center 32% / cover no-repeat',
    character: '#788b92 url("illust-character.jpg") center 22% / cover no-repeat',
    lineup: '#f1eff0 url("illust-lineup.jpg") center 30% / cover no-repeat',
    aurora: 'radial-gradient(45% 60% at 15% 25%, #ff8a3d, transparent 70%), radial-gradient(40% 55% at 85% 20%, #5e5ce6, transparent 70%), radial-gradient(50% 60% at 70% 90%, #00c7be, transparent 70%), radial-gradient(35% 45% at 25% 90%, #ff375f, transparent 70%), #241a3a',
    night: 'radial-gradient(30% 40% at 70% 30%, #3a3aa0, transparent 70%), radial-gradient(40% 40% at 20% 80%, #1f5f7a, transparent 70%), #07070d',
    text: '#fff',
  };
  const LIGHT_BGS = ['text', 'lineup'];
  let applyPreset = () => {};

  function initBuilder() {
    const stage = $('#build-stage');
    const el = $('#build-glass');
    const inputs = $$('#build-form .range');
    const presetBtns = $$('[data-preset]');
    const shapeBtns = $$('[data-shape]');
    const bgBtns = $$('[data-buildbg]');
    const fgBtns = $$('[data-fg]');
    const swatches = $$('#build-swatches .swatch[data-tint]');
    const customTint = $('#b-tint-custom');
    const customWrap = customTint.closest('.swatch--custom');
    const codeTabs = $$('#code-tabs .chip');
    const codeOut = $('#code-out code');
    const state = Object.assign({ shape: 'card', bg: 'underwater', code: 'html' }, PRESETS.liquid);
    const glass = LG.attach(el, { mirror: stage });
    refreshOnShapeEnd(el);
    const mover = movable(el, stage);

    const fmt = {
      refraction: (v) => String(v),
      bezel: (v) => v + 'px',
      dispersion: (v) => v + '%',
      blur: (v) => v + 'px',
      saturation: (v) => v + '%',
      radius: (v) => v + 'px',
      tintA: (v) => v + '%',
      hi: (v) => v + '%',
      shadow: (v) => v + '%',
    };

    const hexToRgb = (hex) => {
      const n = parseInt(hex.slice(1), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    };
    const rgba = (hex, a) => `rgb(${hexToRgb(hex).join(' ')} / ${+a.toFixed(2)})`;
    const white = (a) => `rgb(255 255 255 / ${+Math.min(1, a).toFixed(2)})`;

    function dims(scaled) {
      const base = SHAPES[state.shape];
      let w = base.w;
      let h = base.h;
      if (scaled) {
        const s = Math.min(1, (stage.clientWidth - 32) / w);
        w = Math.round(w * s);
        h = state.shape === 'circle' ? w : Math.round(h * (state.shape === 'card' ? s : 1));
      }
      const r = state.shape === 'card' ? state.radius : Math.round(Math.min(w, h) / 2);
      return { w, h, r };
    }

    function syncControls() {
      inputs.forEach((i) => {
        const k = i.dataset.key;
        i.value = state[k];
        syncRange(i);
        $('#' + i.id + '-val').textContent = fmt[k](state[k]);
      });
      const known = swatches.some((s) => s.dataset.tint === state.tint);
      swatches.forEach((s) => s.setAttribute('aria-checked', String(s.dataset.tint === state.tint)));
      customWrap.classList.toggle('is-on', !known);
      if (!known) customTint.value = state.tint;
      pressWhere(fgBtns, (b) => b.dataset.fg === state.fg);
      pressWhere(shapeBtns, (b) => b.dataset.shape === state.shape);
      $('#b-radius').disabled = state.shape !== 'card';
    }

    function apply() {
      const s = state;
      const { w, h, r } = dims(true);
      el.dataset.shape = s.shape;
      el.style.setProperty('--bw', w + 'px');
      el.style.setProperty('--bh', h + 'px');
      el.style.setProperty('--br', r + 'px');
      el.style.setProperty('--g-tint', rgba(s.tint, s.tintA / 100));
      el.style.setProperty('--g-hi', (s.hi / 100).toFixed(2));
      el.style.setProperty('--g-shadow', `0 12px 32px rgb(0 0 0 / ${((s.shadow / 100) * 0.5).toFixed(2)})`);
      el.style.setProperty('--g-blur', (s.refraction > 0 ? Math.max(8, s.blur) : s.blur) + 'px');
      el.style.setProperty('--g-sat', s.saturation + '%');
      el.style.color = s.fg === 'light' ? '#fff' : '#1d1d1f';
      glass.set({
        refraction: s.refraction,
        bezel: s.bezel,
        dispersion: s.dispersion / 100,
        blur: s.blur,
        saturation: s.saturation / 100,
      });
      renderCode();
    }

    /* ----- 코드 생성 ----- */
    function filterMarkup(w, h) {
      const s = state;
      const S = s.refraction;
      const lines = [
        `<filter id="liquid-glass" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">`,
        `  <feGaussianBlur in="SourceGraphic" stdDeviation="${s.blur}" result="blur"/>`,
        `  <feImage id="liquid-glass-map" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="map"/>`,
      ];
      if (s.dispersion > 0) {
        const spread = (s.dispersion / 100) * 0.18;
        const ch = [
          ['r', S * (1 - spread), '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0'],
          ['g', S, '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0'],
          ['b', S * (1 + spread), '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0'],
        ];
        lines.push('  <!-- 빨강·초록·파랑을 조금씩 다르게 밀어 색수차를 만듭니다 -->');
        ch.forEach(([n, sc, m]) => {
          lines.push(`  <feDisplacementMap in="blur" in2="map" scale="${sc.toFixed(1)}" xChannelSelector="R" yChannelSelector="G" result="d${n}"/>`);
          lines.push(`  <feColorMatrix in="d${n}" type="matrix" values="${m}" result="c${n}"/>`);
        });
        lines.push('  <feBlend in="cr" in2="cg" mode="screen" result="rg"/>');
        lines.push('  <feBlend in="rg" in2="cb" mode="screen" result="refract"/>');
      } else {
        lines.push(`  <feDisplacementMap in="blur" in2="map" scale="${S}" xChannelSelector="R" yChannelSelector="G" result="refract"/>`);
      }
      lines.push(`  <feColorMatrix in="refract" type="saturate" values="${(s.saturation / 100).toFixed(2)}"/>`);
      lines.push('</filter>');
      return lines;
    }

    function contentMarkup() {
      if (state.shape === 'card') {
        return ['  <div class="weather">', '    <p class="city">서울</p>', '    <p class="temp">18°</p>', '    <p class="desc">대체로 맑음</p>', '  </div>'];
      }
      if (state.shape === 'capsule') return ['  <span>뒤로</span>', '  <span>좋아요</span>', '  <span>공유</span>', '  <span>더 보기</span>'];
      return ['  <span>▶</span>'];
    }

    function snippet() {
      const s = state;
      const { w, h, r } = dims(false);
      const refract = s.refraction > 0;
      const hi = s.hi / 100;
      const fallbackBlur = refract ? Math.max(8, s.blur) : s.blur;
      const html = [];
      if (refract) {
        html.push('<!-- 1. SVG 굴절 필터: 페이지에 한 번만 넣습니다 -->');
        html.push('<svg width="0" height="0" style="position:absolute" aria-hidden="true">');
        filterMarkup(w, h).forEach((l) => html.push('  ' + l));
        html.push('</svg>', '');
        html.push('<!-- 2. 유리 요소 -->');
      }
      html.push('<div class="liquid-glass">', ...contentMarkup(), '</div>');

      const css = [
        '.liquid-glass {',
        '  position: relative;',
        '  isolation: isolate;',
        `  width: ${w}px;`,
        `  height: ${h}px;`,
        `  border-radius: ${r}px;`,
        `  color: ${s.fg === 'light' ? '#fff' : '#1d1d1f'};`,
        `  background-color: ${rgba(s.tint, s.tintA / 100)};`,
      ];
      if (refract) css.push('  /* 굴절을 지원하지 않는 브라우저용 대체 스타일 */');
      css.push(
        `  -webkit-backdrop-filter: blur(${fallbackBlur}px) saturate(${s.saturation}%);`,
        `  backdrop-filter: blur(${fallbackBlur}px) saturate(${s.saturation}%);`,
        '  box-shadow:',
        `    inset 0 1px 0 ${white(hi * 1.1)},`,
        `    inset 0 -1px 0 ${white(hi * 0.3)},`,
        `    0 12px 32px rgb(0 0 0 / ${+((s.shadow / 100) * 0.5).toFixed(2)});`,
        '}',
      );
      if (refract) {
        css.push('', '/* Chromium: SVG 굴절 필터를 화면 뒤에 겁니다 (JS가 클래스를 붙입니다) */', '.liquid-glass.is-refractive {', '  backdrop-filter: url(#liquid-glass);', '}');
      }
      if (hi > 0) {
        css.push(
          '',
          '/* 프레넬: 위가 밝고 아래로 갈수록 사라지는 반사 */',
          '.liquid-glass::before {',
          '  content: "";',
          '  position: absolute;',
          '  inset: 0;',
          '  z-index: -1;',
          '  border-radius: inherit;',
          `  background: linear-gradient(to bottom, ${white(hi * 0.5)}, rgb(255 255 255 / 0) 55%);`,
          '  pointer-events: none;',
          '}',
          '',
          '/* 테두리 링: 원뿔형 그라데이션을 1px 테두리만 남기고 가립니다 */',
          '.liquid-glass::after {',
          '  content: "";',
          '  position: absolute;',
          '  inset: 0;',
          '  border-radius: inherit;',
          '  padding: 1px;',
          '  background: conic-gradient(from -45deg,',
          `    ${white(hi * 1.7)}, ${white(hi * 0.25)} 14%, ${white(hi * 0.08)} 32%,`,
          `    ${white(hi * 0.9)} 50%, ${white(hi * 0.08)} 68%, ${white(hi * 0.25)} 86%,`,
          `    ${white(hi * 1.7)});`,
          '  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);',
          '  -webkit-mask-composite: xor;',
          '  mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0);',
          '  pointer-events: none;',
          '}',
        );
      }

      const js = refract ? [
        '// 변위 맵: 가장자리(베젤)에서만 배경을 안쪽으로 끌어당깁니다.',
        '// R = 가로, G = 세로 변위. 128은 제자리입니다.',
        '(function () {',
        "  const el = document.querySelector('.liquid-glass');",
        "  const map = document.getElementById('liquid-glass-map');",
        `  const BEZEL = ${s.bezel};`,
        '',
        '  const brands = navigator.userAgentData && navigator.userAgentData.brands;',
        '  const chromium = !!brands && brands.some((b) => /Chrom|Edge/.test(b.brand));',
        "  if (!chromium || !CSS.supports('backdrop-filter', 'url(#a)')) return;",
        '',
        '  const w = el.offsetWidth;',
        '  const h = el.offsetHeight;',
        '  const r = Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, w / 2, h / 2);',
        "  const canvas = document.createElement('canvas');",
        '  canvas.width = w;',
        '  canvas.height = h;',
        "  const ctx = canvas.getContext('2d');",
        '  const img = ctx.createImageData(w, h);',
        '',
        '  for (let y = 0; y < h; y++) {',
        '    for (let x = 0; x < w; x++) {',
        '      const px = x + 0.5 - w / 2;',
        '      const py = y + 0.5 - h / 2;',
        '      const qx = Math.abs(px) - (w / 2 - r);',
        '      const qy = Math.abs(py) - (h / 2 - r);',
        '      let d, nx = 0, ny = 0;',
        '      if (qx > 0 && qy > 0) {',
        '        const l = Math.hypot(qx, qy);',
        '        d = l - r;',
        '        nx = (Math.sign(px) * qx) / l;',
        '        ny = (Math.sign(py) * qy) / l;',
        '      } else if (qx > qy) {',
        '        d = qx - r;',
        '        nx = Math.sign(px);',
        '      } else {',
        '        d = qy - r;',
        '        ny = Math.sign(py);',
        '      }',
        '      const t = Math.max(0, Math.min(1, 1 + d / BEZEL)); // 가장자리 1 → 안쪽 0',
        '      const m = 1 - Math.sqrt(1 - t * t);                 // 원호 모양의 볼록한 테두리',
        '      const i = (y * w + x) * 4;',
        '      img.data[i] = 128 - nx * m * 127;',
        '      img.data[i + 1] = 128 - ny * m * 127;',
        '      img.data[i + 2] = 128;',
        '      img.data[i + 3] = 255;',
        '    }',
        '  }',
        '  ctx.putImageData(img, 0, 0);',
        "  map.setAttribute('href', canvas.toDataURL());",
        "  el.classList.add('is-refractive');",
        '})();',
      ] : ['// 굴절이 0이면 JS가 필요 없습니다. CSS만으로 동작합니다.'];

      return { html: html.join('\n'), css: css.join('\n'), js: js.join('\n'), refract };
    }

    function fullHTML() {
      const s = snippet();
      const pageCss = [
        '/* 데모용 페이지 */',
        'body {',
        '  margin: 0;',
        '  min-height: 100vh;',
        '  display: grid;',
        '  place-items: center;',
        '  font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;',
        ...(/illust/.test(PAGE_BG[state.bg] || '') ? ['  /* 이미지 파일을 이 HTML과 같은 폴더에 두세요 */'] : []),
        `  background: ${PAGE_BG[state.bg] || PAGE_BG.aurora};`,
        '}',
        'body::before {',
        '  content: "LIQUID GLASS";',
        '  position: fixed;',
        '  inset: 0;',
        '  z-index: -1;',
        '  display: grid;',
        '  place-items: center;',
        '  font: 800 14vw/1 system-ui, sans-serif;',
        '  letter-spacing: -0.05em;',
        `  color: ${LIGHT_BGS.includes(state.bg) ? '#1d1d1f' : 'rgb(255 255 255 / .6)'};`,
        '}',
        '.liquid-glass { display: flex; align-items: center; justify-content: space-around; }',
        '.weather { padding: 22px 26px; width: 100%; }',
        '.weather p { margin: 0; }',
        '.city { font-size: 18px; font-weight: 600; }',
        '.temp { font-size: 64px; font-weight: 300; line-height: 1; }',
        '.desc { margin-top: 8px !important; font-weight: 600; }',
      ].join('\n');
      return [
        '<!doctype html>',
        '<html lang="ko">',
        '<head>',
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        '<title>Liquid Glass</title>',
        '<style>',
        pageCss,
        '',
        s.css,
        '</style>',
        '</head>',
        '<body>',
        s.html,
        s.refract ? '<script>\n' + s.js + '\n</' + 'script>' : '',
        '</body>',
        '</html>',
        '',
      ].join('\n');
    }

    function renderCode() {
      codeOut.textContent = snippet()[state.code];
    }

    /* ----- 이벤트 ----- */
    inputs.forEach((i) => i.addEventListener('input', () => {
      state[i.dataset.key] = +i.value;
      $('#' + i.id + '-val').textContent = fmt[i.dataset.key](state[i.dataset.key]);
      pressWhere(presetBtns, () => false);
      apply();
    }));
    swatches.forEach((sw) => sw.addEventListener('click', () => {
      state.tint = sw.dataset.tint;
      if (state.tintA < 10) state.tintA = 30;
      syncControls();
      apply();
    }));
    customTint.addEventListener('input', () => {
      state.tint = customTint.value;
      if (state.tintA < 10) state.tintA = 30;
      syncControls();
      apply();
    });
    chipGroup(fgBtns, (b) => { state.fg = b.dataset.fg; apply(); });
    chipGroup(shapeBtns, (b) => {
      state.shape = b.dataset.shape;
      syncControls();
      apply();
      requestAnimationFrame(() => mover.place());
    });
    chipGroup(bgBtns, (b) => {
      state.bg = b.dataset.buildbg;
      setBg($('.bg', stage), state.bg);
      if (LIGHT_BGS.includes(state.bg) && state.fg === 'light' && state.tintA < 30) { state.fg = 'dark'; syncControls(); apply(); }
    });
    applyPreset = (name) => {
      Object.assign(state, PRESETS[name]);
      pressWhere(presetBtns, (b) => b.dataset.preset === name);
      syncControls();
      apply();
    };
    presetBtns.forEach((b) => b.addEventListener('click', () => applyPreset(b.dataset.preset)));
    codeTabs.forEach((b) => b.addEventListener('click', () => {
      state.code = b.dataset.code;
      codeTabs.forEach((x) => {
        x.setAttribute('aria-pressed', String(x === b));
        x.setAttribute('aria-selected', String(x === b));
      });
      renderCode();
    }));
    $('#build-form').addEventListener('submit', (e) => e.preventDefault());

    $('#code-copy').addEventListener('click', () => {
      const text = fullHTML();
      const fallback = () => {
        codeOut.textContent = text;
        const range = document.createRange();
        range.selectNodeContents(codeOut);
        const sel = getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        toast('코드를 선택했습니다. ⌘C 또는 Ctrl+C로 복사하세요');
      };
      try {
        navigator.clipboard.writeText(text).then(() => toast('전체 HTML을 복사했습니다'), fallback);
      } catch (e) {
        fallback();
      }
    });

    let rt = 0;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => { apply(); mover.place(); }, 150);
    });

    syncControls();
    apply();
    requestAnimationFrame(() => mover.center(0.5, 0.45));
  }

  function initCompare() {
    $$('[data-topreset]').forEach((b) => b.addEventListener('click', () => {
      applyPreset(b.dataset.topreset);
      document.getElementById('build').scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth' });
    }));
  }

  /* ---------- 성능: 유리 개수와 프레임 ---------- */
  function initPerf() {
    const stage = $('#perf-stage');
    const box = $('#perf-bubbles');
    const countIn = $('#perf-count');
    const countOut = $('#perf-count-val');
    const fpsEl = $('#perf-fps');
    const msEl = $('#perf-ms');
    const OPTS = { refraction: 60, bezel: 22, blur: 1, dispersion: 0.3, saturation: 1.5 };
    const bubbles = [];
    let mode = 'refract';
    let running = false;
    let raf = 0;

    let seed = 7;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    function applyMode() {
      box.classList.toggle('is-blur', mode === 'blur');
      box.classList.toggle('is-none', mode === 'none');
      bubbles.forEach((b) => {
        if (mode === 'refract') LG.attach(b, OPTS).setActive(true);
        else if (b.__glass) b.__glass.setActive(false);
      });
    }
    function build() {
      const n = +countIn.value;
      countOut.textContent = n + '개';
      while (bubbles.length > n) {
        const b = bubbles.pop();
        if (b.__glass) b.__glass.destroy();
        b.remove();
      }
      while (bubbles.length < n) {
        const b = document.createElement('div');
        const s = 64 + rnd() * 80;
        b.className = 'bubble glass';
        b.style.setProperty('--s', s.toFixed(0) + 'px');
        b.style.setProperty('--x', (2 + rnd() * 80).toFixed(1) + '%');
        b.style.setProperty('--y', (4 + rnd() * 70).toFixed(1) + '%');
        b.style.setProperty('--mx', ((rnd() - 0.5) * 140).toFixed(0) + 'px');
        b.style.setProperty('--my', ((rnd() - 0.5) * 100).toFixed(0) + 'px');
        b.style.setProperty('--d', (2.8 + rnd() * 3.5).toFixed(2) + 's');
        b.style.setProperty('--dl', (-rnd() * 4).toFixed(2) + 's');
        box.appendChild(b);
        bubbles.push(b);
      }
      applyMode();
    }

    let frames = 0;
    let t0 = 0;
    let prev = 0;
    let worst = 0;
    function loop(t) {
      raf = requestAnimationFrame(loop);
      if (!t0) { t0 = t; prev = t; return; }
      frames++;
      worst = Math.max(worst, t - prev);
      prev = t;
      if (t - t0 >= 600) {
        const fps = (frames * 1000) / (t - t0);
        fpsEl.textContent = String(Math.round(fps));
        msEl.textContent = `평균 ${(1000 / fps).toFixed(1)}ms · 가장 긴 프레임 ${worst.toFixed(0)}ms`;
        frames = 0;
        t0 = t;
        worst = 0;
      }
    }
    function setRunning(on) {
      running = on;
      stage.classList.toggle('is-running', on);
      cancelAnimationFrame(raf);
      t0 = 0;
      frames = 0;
      if (on) raf = requestAnimationFrame(loop);
    }

    countIn.addEventListener('input', build);
    chipGroup($$('[data-perfmode]'), (b) => { mode = b.dataset.perfmode; applyMode(); });
    new IntersectionObserver(([en]) => setRunning(en.isIntersecting), { threshold: 0.2 }).observe(stage);
    document.addEventListener('visibilitychange', () => { if (document.hidden) setRunning(false); });
    build();
  }

  /* ---------- 시작 ---------- */
  initA11y();
  $$('.range').forEach(syncRange);
  document.addEventListener('input', (e) => {
    if (e.target.classList && e.target.classList.contains('range')) syncRange(e.target);
  });
  initGlass();
  initNav();
  initHero();
  initGallery();
  initLayers();
  initLab();
  initOptics();
  initSegmented();
  initSwitch();
  initSlider();
  initSpring();
  initExperience();
  initBuilder();
  initCompare();
  initPerf();
})();
