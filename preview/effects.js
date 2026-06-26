/* Green smoke canvas + scroll reveal */
(() => {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const revealObs = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add('is-visible');
        if (e.target.dataset.revealOnce !== 'false') revealObs.unobserve(e.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -24px 0px' });

  function markAboveFoldVisible() {
    const vh = window.innerHeight || document.documentElement.clientHeight;
    document.querySelectorAll('.reveal:not(.is-visible)').forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.top < vh * 0.92 && rect.bottom > 0) {
        el.classList.add('is-visible');
        revealObs.unobserve(el);
      }
    });
  }

  const fx = {
    observeReveals(root = document) {
      root.querySelectorAll('.reveal, .product-card, .cat-tile, .section-head').forEach((el) => {
        if (!el.classList.contains('reveal')) el.classList.add('reveal');
        if (!el.classList.contains('is-visible')) revealObs.observe(el);
      });
      markAboveFoldVisible();
    },
    burstSmoke() {},
  };

  window.DabLabsFX = fx;

  const canvas = document.getElementById('smokeCanvas');
  if (!canvas) {
    fx.observeReveals();
    return;
  }

  const ctx = canvas.getContext('2d');
  let w, h, particles = [];

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }

  class SmokePuff {
    constructor() { this.reset(true); }
    reset(initial = false) {
      this.x = Math.random() * w;
      this.y = initial ? Math.random() * h : h + 40;
      this.r = 30 + Math.random() * 90;
      this.vx = (Math.random() - 0.5) * 0.4;
      this.vy = -0.15 - Math.random() * 0.35;
      this.life = 0;
      this.maxLife = 200 + Math.random() * 200;
      this.g = 40 + Math.random() * 80;
      this.a = 0.04 + Math.random() * 0.06;
    }
    update() {
      this.x += this.vx + Math.sin(this.life * 0.02) * 0.3;
      this.y += this.vy;
      this.r += 0.12;
      this.life++;
      if (this.life > this.maxLife || this.y < -this.r) this.reset();
    }
    draw() {
      const t = this.life / this.maxLife;
      const alpha = this.a * (1 - t) * (t < 0.1 ? t / 0.1 : 1);
      const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.r);
      grad.addColorStop(0, `rgba(${this.g + 60}, ${this.g + 140}, ${this.g + 40}, ${alpha})`);
      grad.addColorStop(0.4, `rgba(${this.g}, ${this.g + 90}, ${this.g}, ${alpha * 0.6})`);
      grad.addColorStop(1, `rgba(${this.g}, ${this.g + 50}, ${this.g}, 0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function initParticles() {
    const count = prefersReduced ? 0 : Math.min(28, Math.floor(w / 50));
    particles = Array.from({ length: count }, () => new SmokePuff());
  }

  function loop() {
    if (!prefersReduced) {
      ctx.clearRect(0, 0, w, h);
      particles.forEach((p) => { p.update(); p.draw(); });
    }
    requestAnimationFrame(loop);
  }

  fx.burstSmoke = (x, y) => {
    if (prefersReduced) return;
    for (let i = 0; i < 6; i++) {
      const p = new SmokePuff();
      p.x = x;
      p.y = y;
      p.r = 10 + Math.random() * 20;
      p.vy = -0.5 - Math.random();
      particles.push(p);
      if (particles.length > 40) particles.shift();
    }
  };

  resize();
  initParticles();
  loop();
  window.addEventListener('resize', () => { resize(); initParticles(); });

  fx.observeReveals();
})();