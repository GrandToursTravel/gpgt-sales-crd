/* ---------- Liquid metal ----------
   A flowing chrome rim, drawn on a small canvas behind each primary button.
   Same idea as the shader version: soft repeating bands warped by noise, with
   a whisker of per-channel offset so the highlights catch colour. Rendered
   into a low-resolution buffer and scaled up — metal is smooth, so nobody can
   tell, and it costs almost nothing. */
export var Metal = (function(){
  var PERM = new Uint8Array(512);
  (function(){
    var p = [], i, seed = 1;
    for(i=0;i<256;i++) p[i] = i;
    function rnd(){ seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    for(i=255;i>0;i--){ var j = (rnd()*(i+1))|0, t = p[i]; p[i] = p[j]; p[j] = t; }
    for(i=0;i<512;i++) PERM[i] = p[i & 255];
  })();
  function fade(t){ return t*t*(3-2*t); }
  function grad(h,x,y){
    switch(h & 3){ case 0: return x+y; case 1: return -x+y; case 2: return x-y; default: return -x-y; }
  }
  function noise(x,y){
    var X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    var u = fade(x), v = fade(y);
    var a = grad(PERM[PERM[X]+Y], x, y),     b = grad(PERM[PERM[X+1]+Y], x-1, y);
    var c = grad(PERM[PERM[X]+Y+1], x, y-1), d = grad(PERM[PERM[X+1]+Y+1], x-1, y-1);
    var ab = a + (b-a)*u, cd = c + (d-c)*u;
    return (ab + (cd-ab)*v) * 0.5 + 0.5;
  }

  var RAMP = [[0,38,40,46],[0.30,96,102,112],[0.58,176,183,194],[0.80,232,238,246],[1,255,255,255]];
  function ramp(m){
    m = m < 0 ? 0 : (m > 1 ? 1 : m);
    for(var i=1;i<RAMP.length;i++){
      if(m <= RAMP[i][0]){
        var a = RAMP[i-1], b = RAMP[i], t = (m - a[0]) / (b[0] - a[0]);
        return [a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t, a[3]+(b[3]-a[3])*t];
      }
    }
    return [255,255,255];
  }
  function bandAt(p, soft){
    var f = p - Math.floor(p);
    var a = f < 0.5 ? f/0.5 : (1-f)/0.5;
    return Math.pow(a < 0 ? 0 : (a > 1 ? 1 : a), 1/(0.35 + soft));
  }

  var REP = 3.0, SCALE = 2.0, SOFT = 0.36, SHIFT = 0.035, GLOSS = 0.18;
  var buttons = [], raf = null, reduced = false;

  function measure(b){
    var r = b.el.getBoundingClientRect();
    if(!r.width) return false;
    var w = Math.max(8, Math.round(r.width/3)), h = Math.max(4, Math.round(r.height/3));
    if(w === b.w && h === b.h) return true;
    b.w = w; b.h = h;
    b.canvas.width = w; b.canvas.height = h;
    b.img = b.ctx.createImageData(w, h);
    b.buf = b.img.data;
    return true;
  }

  function render(b){
    if(!b.buf) return;
    var i = 0, w = b.w, h = b.h, t = b.t;
    for(var y=0;y<h;y++){
      var vy = y/h - 0.5;
      for(var x=0;x<w;x++){
        var vx = x/w - 0.5;
        var rx = (vx - vy) * 0.7071, ry = (vx + vy) * 0.7071;
        var n = noise(rx*SCALE + t*0.35, ry*SCALE*2.2 - t*0.22);
        var p = rx*REP + n*1.5 + t*0.45;
        var cR = ramp(bandAt(p + SHIFT, SOFT));
        var cG = ramp(bandAt(p,         SOFT));
        var cB = ramp(bandAt(p - SHIFT, SOFT));
        var lift = 1 + GLOSS * (0.5 - y/h);
        b.buf[i++] = cR[0]*lift; b.buf[i++] = cG[1]*lift; b.buf[i++] = cB[2]*lift; b.buf[i++] = 255;
      }
    }
    b.ctx.putImageData(b.img, 0, 0);
  }

  function frame(){
    raf = requestAnimationFrame(frame);
    for(var i=0;i<buttons.length;i++){
      var b = buttons[i];
      if(b.el.offsetParent === null) continue;   // hidden step: nothing to draw
      if(!measure(b)) continue;
      b.t += 0.016 * b.speed;
      render(b);
    }
  }

  return {
    attach: function(el){
      if(!el || el.dataset.metal) return;
      var ctx, canvas = document.createElement('canvas');
      try { ctx = canvas.getContext('2d'); } catch(e){ return; }
      if(!ctx) return;
      el.dataset.metal = "1";
      el.classList.add('btn-metal');

      var label = document.createElement('span');
      label.className = 'btn-label';
      label.textContent = el.textContent;
      el.textContent = '';
      var face = document.createElement('i');
      face.className = 'btn-face';
      el.appendChild(canvas); el.appendChild(face); el.appendChild(label);
      el.__label = label;

      var b = { el:el, canvas:canvas, ctx:ctx, w:0, h:0, img:null, buf:null, t:Math.random()*40, speed:0.6 };
      buttons.push(b);

      el.addEventListener('mouseenter', function(){ b.speed = 1.6; });
      el.addEventListener('mouseleave', function(){ b.speed = 0.6; });
      el.addEventListener('click', function(){
        b.speed = 3.2;
        setTimeout(function(){ b.speed = 0.6; }, 320);
      });

      reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if(reduced){ measure(b); render(b); return; }
      if(!raf) raf = requestAnimationFrame(frame);
    },
    /* the label is a child now, so set text through here */
    setText: function(el, text){
      if(el.__label) el.__label.textContent = text; else el.textContent = text;
    },
    stop: function(){ if(raf){ cancelAnimationFrame(raf); raf = null; } },
    start: function(){ if(!raf && !reduced && buttons.length) raf = requestAnimationFrame(frame); }
  };
})();
