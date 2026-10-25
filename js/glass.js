/*!
 * glass.js — 리퀴드 글래스 굴절 엔진
 *
 * 1. 요소의 크기·모서리 반경·베젤 폭으로 변위 맵(displacement map)을 캔버스에 그립니다.
 *    R 채널 = 가로 변위, G 채널 = 세로 변위, 128 = 움직이지 않음.
 * 2. 그 맵을 SVG <feImage>로 불러오고 <feDisplacementMap>으로 배경 픽셀을 밀어냅니다.
 * 3. backdrop-filter: url(#필터) 로 요소 뒤의 화면에 필터를 겁니다.
 *
 * SVG 필터를 backdrop-filter에 쓰는 기능은 Chromium 계열 브라우저에서만 동작합니다.
 * 그 밖의 브라우저에서는 CSS에 적어 둔 blur() 대체 스타일이 그대로 보입니다.
 */
(function (global) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const DEFAULTS = { refraction: 60, bezel: 22, blur: 1.5, dispersion: 0.25, saturation: 1.6, active: true };
  const MAX_MAP_SIDE = 640;
  const mapCache = new Map();
  let defs = null;
  let uid = 0;

  const supported = (() => {
    try {
      const brands = navigator.userAgentData && navigator.userAgentData.brands;
      if (!brands || !brands.some((b) => /Chrom|Edge|Opera|Brave/i.test(b.brand))) return false;
      return CSS.supports('backdrop-filter', 'url(#lg)');
    } catch (e) {
      return false;
    }
  })();

  function ensureDefs() {
    if (defs) return defs;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
    defs = document.createElementNS(NS, 'defs');
    svg.appendChild(defs);
    document.body.prepend(svg);
    return defs;
  }

  /**
   * 둥근 사각형의 가장자리에서 안쪽으로 들어온 깊이에 따라 변위 크기를 정합니다.
   * 단면이 원호인 볼록한 테두리를 가정하므로 가장자리에서 가장 크게 꺾이고,
   * 베젤 폭보다 안쪽(평평한 가운데)은 전혀 움직이지 않습니다.
   * 변위 방향은 가장 가까운 가장자리의 안쪽(-법선)입니다.
   */
  function drawMap(w, h, radius, bezel) {
    const k = Math.min(1, MAX_MAP_SIDE / Math.max(w, h));
    const mw = Math.max(2, Math.round(w * k));
    const mh = Math.max(2, Math.round(h * k));
    const canvas = document.createElement('canvas');
    canvas.width = mw;
    canvas.height = mh;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(mw, mh);
    const data = img.data;
    const hw = w / 2;
    const hh = h / 2;
    const r = Math.max(0, Math.min(radius, hw, hh));
    const b = Math.max(1, bezel);

    for (let j = 0; j < mh; j++) {
      const py = ((j + 0.5) / mh) * h - hh;
      for (let i = 0; i < mw; i++) {
        const px = ((i + 0.5) / mw) * w - hw;
        const qx = Math.abs(px) - (hw - r);
        const qy = Math.abs(py) - (hh - r);
        let dist;
        let nx = 0;
        let ny = 0;
        if (qx > 0 && qy > 0) {
          const l = Math.hypot(qx, qy);
          dist = l - r;
          nx = (Math.sign(px) * qx) / l;
          ny = (Math.sign(py) * qy) / l;
        } else if (qx > qy) {
          dist = qx - r;
          nx = Math.sign(px);
        } else {
          dist = qy - r;
          ny = Math.sign(py);
        }
        const t = Math.max(0, Math.min(1, 1 + dist / b));
        const m = 1 - Math.sqrt(1 - t * t);
        const o = (j * mw + i) * 4;
        data[o] = 128 - nx * m * 127;
        data[o + 1] = 128 - ny * m * 127;
        data[o + 2] = 128;
        data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas.toDataURL('image/png');
  }

  function getMap(w, h, r, bezel) {
    const key = w + 'x' + h + '|' + r.toFixed(1) + '|' + bezel.toFixed(1);
    let url = mapCache.get(key);
    if (!url) {
      url = drawMap(w, h, r, bezel);
      mapCache.set(key, url);
      if (mapCache.size > 48) mapCache.delete(mapCache.keys().next().value);
    }
    return url;
  }

  function readRadius(el, w, h) {
    const first = getComputedStyle(el).borderTopLeftRadius.split(' ')[0];
    let r = parseFloat(first) || 0;
    if (first.endsWith('%')) r = (Math.min(w, h) * r) / 100;
    return Math.min(r, w / 2, h / 2);
  }

  const CHANNELS = [
    ['r', -1, '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0'],
    ['g', 0, '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0'],
    ['b', 1, '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0'],
  ];

  /** 필터 안에 들어갈 프리미티브 목록. pretty=true면 사람이 읽기 좋게 줄을 나눕니다. */
  function primitives(o, w, h, href, pretty) {
    const S = +o.refraction.toFixed(1);
    const nl = pretty ? '\n  ' : '';
    const out = [];
    out.push(`<feGaussianBlur in="SourceGraphic" stdDeviation="${o.blur}" edgeMode="duplicate" result="blur"/>`);
    out.push(`<feImage href="${href}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="map"/>`);
    if (o.dispersion > 0 && S > 0) {
      const spread = o.dispersion * 0.18;
      for (const [n, dir, matrix] of CHANNELS) {
        const scale = (S * (1 + dir * spread)).toFixed(1);
        out.push(`<feDisplacementMap in="blur" in2="map" scale="${scale}" xChannelSelector="R" yChannelSelector="G" result="d${n}"/>`);
        out.push(`<feColorMatrix in="d${n}" type="matrix" values="${matrix}" result="c${n}"/>`);
      }
      out.push('<feBlend in="cr" in2="cg" mode="screen" result="rg"/>');
      out.push('<feBlend in="rg" in2="cb" mode="screen" result="refract"/>');
    } else {
      out.push(`<feDisplacementMap in="blur" in2="map" scale="${S}" xChannelSelector="R" yChannelSelector="G" result="refract"/>`);
    }
    out.push(`<feColorMatrix in="refract" type="saturate" values="${o.saturation}"/>`);
    return (pretty ? '  ' : '') + out.join(nl);
  }

  const ro = typeof ResizeObserver === 'function'
    ? new ResizeObserver((entries) => {
        for (const entry of entries) if (entry.target.__glass) entry.target.__glass.schedule();
      })
    : null;

  class Glass {
    constructor(el, opts) {
      this.el = el;
      this.opts = Object.assign({}, DEFAULTS, opts);
      this.id = 'lg-' + ++uid;
      this.mapURL = '';
      this.size = { w: 0, h: 0, r: 0, bezel: 0 };
      this._raf = 0;

      const f = document.createElementNS(NS, 'filter');
      f.setAttribute('id', this.id);
      f.setAttribute('x', '0');
      f.setAttribute('y', '0');
      f.setAttribute('width', '100%');
      f.setAttribute('height', '100%');
      f.setAttribute('color-interpolation-filters', 'sRGB');
      ensureDefs().appendChild(f);
      this.filter = f;

      el.__glass = this;
      this.render();
      this.apply();
      if (ro) ro.observe(el);
    }

    set(next) {
      Object.assign(this.opts, next);
      this.render();
      this.apply();
      return this;
    }

    setActive(on) {
      this.opts.active = !!on;
      this.apply();
      return this;
    }

    get refracting() {
      return supported && this.opts.active && this.opts.refraction > 0;
    }

    apply() {
      const on = this.refracting;
      this.el.style.backdropFilter = on ? `url(#${this.id})` : '';
      this.el.classList.toggle('lg-refract', on);
    }

    schedule() {
      if (this._raf) return;
      this._raf = requestAnimationFrame(() => {
        this._raf = 0;
        this.render();
      });
    }

    render() {
      const el = this.el;
      const w = Math.round(el.offsetWidth);
      const h = Math.round(el.offsetHeight);
      if (!w || !h) return;
      const r = readRadius(el, w, h);
      const bezel = Math.min(this.opts.bezel, Math.min(w, h) / 2);
      this.size = { w, h, r, bezel };
      this.mapURL = getMap(w, h, r, bezel);
      this.filter.innerHTML = primitives(this.opts, w, h, this.mapURL, false);
    }

    /** 지금 적용된 필터를 사람이 읽을 수 있는 SVG 코드로 돌려줍니다 (맵 데이터는 줄여서 표시). */
    source() {
      const { w, h } = this.size;
      const kb = Math.max(1, Math.round((this.mapURL.length * 0.75) / 1024));
      const href = `data:image/png;base64,… (${kb}KB)`;
      return (
        `<filter id="liquid-glass" x="0" y="0" width="100%" height="100%"\n        color-interpolation-filters="sRGB">\n` +
        primitives(this.opts, w, h, href, true) +
        '\n</filter>'
      );
    }

    destroy() {
      if (ro) ro.unobserve(this.el);
      this.el.style.backdropFilter = '';
      this.el.classList.remove('lg-refract');
      this.filter.remove();
      delete this.el.__glass;
    }
  }

  global.LiquidGlass = {
    supported,
    DEFAULTS,
    drawMap,
    attach(el, opts) {
      if (!el) return null;
      return el.__glass ? el.__glass.set(opts || {}) : new Glass(el, opts);
    },
  };
})(window);
