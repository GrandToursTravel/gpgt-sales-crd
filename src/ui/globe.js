import earthTexture from "../assets/images/earth-texture.webp";
import { airportLabel } from "../data/airports.js";
import { $, escapeHtml } from "../dom.js";
import { answers } from "../state.js";

/* Natural Earth I with shaded relief, bathymetry and water, 3600x1800 - the
   cartographic map rather than satellite imagery, which is what was asked
   for. Pulled from the 16200x8100 source: it is an uncompressed TIFF, one
   row per strip, so the whole thing could be streamed straight through a
   4x4 box filter instead of being downloaded and then resized. WebP, which
   is a third the size of JPEG on a map this smooth. */
export var EARTH_TEX = earthTexture;

/* ---------- Globe ----------
   Earth at night on a plain 2D canvas. Land outlines come from Natural Earth
   110m land (public domain); the city lights are Natural Earth populated
   places, brightness scaled by population. Orthographic projection centred on
   whichever circuit is selected. No WebGL and no dependencies — if any of it
   fails, the race list still works on its own. */
/* ---------- Globe ----------
   A photographic Earth, not a diagram. The texture is NASA's Black Marble
   night lights over a heavily darkened Blue Marble, with Natural Earth
   coastlines and country borders drawn over the top, and it is mapped onto a
   sphere by hand in 2D canvas.

   The trick that makes that affordable is the lookup table. For every pixel
   inside the disc we precompute which texture row it samples and where in
   that row it sits; spinning the planet in longitude is then just a constant
   added to the column, because a longitude rotation IS a horizontal shift of
   an equirectangular map. So a frame costs one add and one array read per
   pixel - no trigonometry at all.

   The table depends on the view, so choosing a race does two things in
   sequence: it rotates the planet at full width, then closes in. While the
   zoom is moving, the last table's render is simply scaled - orthographic
   projection scales linearly about the sphere centre, so that is exact
   geometry, just softer than a native render. The table is rebuilt once the
   motion settles and a short cross-fade covers the change in sharpness.
   Rebuilding every frame would mean an asin and an atan2 per pixel again,
   which is precisely what the table exists to avoid. */
export var Globe = (function(){
  var TAU = Math.PI*2, D2R = Math.PI/180;
  var TILT = 0.26;                     /* ~15 degrees, favouring the north */
  var RF = 0.45;                       /* sphere radius as a fraction of the box */
  var ZOOM = 2.05;                     /* how close the country gets */
  var PIXEL_BUDGET = 750000;
  var IDLE_SPIN = 0.055;               /* radians a second, while nothing is chosen */
  /* Sequential, not overlapping: out, round, in. Trimmed a little from the
     overlapping version so three phases still land in about three seconds. */
  var ROT_MS = 1300, IN_MS = 1400, OUT_MS = 700;

  var canvas, ctx, pin, caption, label, wrap, gl, glx, fade, fadex, img;
  var tex = null, TW = 0, TH = 0;
  var lut = null, rv = null;           /* the view the table was built for */
  var lng0 = 0.35, target = null, ready = false, needLut = false, pendingView = null;
  var zoom = 1, pan = 0, panSy = 0, fadeT = 0;
  var rotTween = null, zoomTween = null, closingIn = false, last = 0;
  var pinAt = null, route = null, zoomAim = ZOOM, revealT = 0, queued = null;
  /* Where the aircraft is along the path, 0 to 1, then a gap to 1.25 before it
     sets off again - the pause is what makes it read as a repeated flight
     rather than a bead going round a loop. */
  var planeT = 0, PLANE_SECS = 7.5;
  var raf = null, size = 0, dpr = 1, reduced = false, alive = false;
  var labelW = 0, wasBelow = null;
  var lastPx = -1, lastPy = -1, lastLx = -1, lastStem = -1, lastOp = -1;

  function unit(lat,lng){
    var la = lat*D2R, ln = lng*D2R, cl = Math.cos(la);
    return [cl*Math.cos(ln), Math.sin(la), cl*Math.sin(ln)];
  }

  /* The flight path is a great circle - the route an aircraft actually takes -
     sampled by spherical interpolation and lifted off the surface in the
     middle so it reads as a path over the planet rather than a line drawn on
     it. The lift scales with distance: a hop to Paris should hug the ground. */
  function buildArc(from, to){
    var A = unit(from.lat, from.lng), B = unit(to.lat, to.lng);
    var dot = A[0]*B[0] + A[1]*B[1] + A[2]*B[2];
    if(dot > 1) dot = 1; else if(dot < -1) dot = -1;
    var ang = Math.acos(dot);
    var n = Math.max(28, Math.round(ang/Math.PI*180));
    var s = Math.sin(ang);
    var pts = new Float32Array((n+1)*3);
    var hi = 0.075 * Math.min(1, ang/1.4);
    for(var i=0;i<=n;i++){
      var t = i/n, w1, w2;
      if(s < 1e-6){ w1 = 1-t; w2 = t; }
      else { w1 = Math.sin((1-t)*ang)/s; w2 = Math.sin(t*ang)/s; }
      var lift = 1 + hi*Math.sin(Math.PI*t);
      pts[i*3]   = (A[0]*w1 + B[0]*w2)*lift;
      pts[i*3+1] = (A[1]*w1 + B[1]*w2)*lift;
      pts[i*3+2] = (A[2]*w1 + B[2]*w2)*lift;
    }
    /* Centre the camera on the halfway point of the arc, not on either end:
       that is the one aim from which the whole path is on the near side. */
    var mx = A[0]+B[0], my = A[1]+B[1], mz = A[2]+B[2];
    var ml = Math.sqrt(mx*mx + my*my + mz*mz);
    if(ml < 1e-6){ mx = A[0]; my = A[1]; mz = A[2]; ml = 1; }
    mx /= ml; my /= ml; mz /= ml;
    if(my > 1) my = 1; else if(my < -1) my = -1;
    return { pts:pts, n:n, from:from, to:to, ang:ang,
             midLat: Math.asin(my)/D2R, midLng: Math.atan2(mz, mx)/D2R };
  }

  /* The tilt is fixed, so the view can only slide the sphere up and down, not
     look further north or south. Slide it too far and the planet leaves the
     frame - a Sydney to Sao Paulo great circle runs past 60 south, and
     centring that put the globe in a corner with the path along its edge. So
     the centring is capped, and the fit is then measured against wherever the
     view actually ends up rather than against the ideal. */
  var PAN_CAP = 0.55;
  function routeCentre(arc){
    var s = Math.sin(arc.midLat*D2R - TILT);
    return s > PAN_CAP ? PAN_CAP : (s < -PAN_CAP ? -PAN_CAP : s);
  }

  /* How far in we can go and still hold the arc on screen. */
  function fitZoom(arc, centreY){
    var l0 = arc.midLng*D2R;
    var C0 = Math.cos(l0), S0 = Math.sin(l0);
    var ct = Math.cos(TILT), st = Math.sin(TILT);
    var worst = 0.02;
    for(var i=0;i<=arc.n;i++){
      var x = arc.pts[i*3], y = arc.pts[i*3+1], z = arc.pts[i*3+2];
      var X = z*C0 - x*S0, H = x*C0 + z*S0;
      var Y = ct*y - st*H;
      var dy = Y - centreY;
      var d = Math.sqrt(X*X + dy*dy);
      if(d > worst) worst = d;
    }
    /* 0.5 of the box is the edge; RF of it is the radius at zoom 1; leave a
       margin for the flag that sits above the marker. */
    var z2 = (0.42/RF) / worst;
    if(z2 < 1) z2 = 1;
    if(z2 > 2.4) z2 = 2.4;
    return z2;
  }

  function shortest(a,b){
    var d = (b - a) % TAU;
    if(d > Math.PI) d -= TAU;
    if(d < -Math.PI) d += TAU;
    return d;
  }

  /* The whole globe, centred and unzoomed. Any zoom between this and the
     close-up is a scale of it, so a table built here is never short of
     geometry. */
  function wideView(){ return { R:size*RF, cx:size/2, cy:size/2 }; }

  /* The sphere as it should appear right now: radius, and where its centre
     sits once the view has panned to put the chosen country in the middle. */
  function view(){
    var R = size*RF*zoom;
    /* panSy is kept after the target is cleared, so pulling back out slides
       to the middle instead of jumping there. */
    return { R:R, cx:size/2, cy:size/2 + pan*panSy*R };
  }

  /* Every pixel of the disc is remapped by hand each frame, so cost grows
     with the area actually on screen. Trade a little sharpness for the frame
     rate, and only at the sizes where it would otherwise hurt. */
  function chooseDpr(R){
    var visible = Math.min(Math.PI*R*R, size*size);
    var d = Math.min(window.devicePixelRatio || 1, 2);
    var cap = Math.sqrt(PIXEL_BUDGET / visible);
    if(d > cap) d = cap;
    return d < 1 ? 1 : d;
  }

  /* One asin and one atan2 per pixel, paid once per view. */
  function buildLut(v){
    dpr = chooseDpr(v.R);
    var Wd = Math.round(size*dpr), Hd = Wd;
    var ct = Math.cos(TILT), st = Math.sin(TILT);
    var cap = Math.min(Math.ceil(Math.PI*v.R*v.R*dpr*dpr), Wd*Hd) + Hd*2 + 16;
    var u = new Float32Array(cap), row = new Int32Array(cap);
    var dst = new Int32Array(Hd), len = new Int32Array(Hd);
    var n = 0, spans = 0, dy, dx;

    for(dy=0; dy<Hd; dy++){
      var Y = -(((dy+0.5)/dpr - v.cy)/v.R);
      var yy = Y*Y;
      if(yy >= 1) continue;
      var half = Math.sqrt(1-yy)*v.R;
      var x0 = Math.ceil((v.cx-half)*dpr - 0.5), x1 = Math.floor((v.cx+half)*dpr - 0.5);
      if(x0 < 0) x0 = 0;
      if(x1 > Wd-1) x1 = Wd-1;
      if(x1 < x0) continue;
      var start = n, count = 0;
      for(dx=x0; dx<=x1; dx++){
        var X = ((dx+0.5)/dpr - v.cx)/v.R;
        var d2 = X*X + yy;
        if(d2 >= 1) continue;
        var Z = Math.sqrt(1-d2);
        var wy = ct*Y + st*Z;            /* undo the tilt */
        var H  = ct*Z - st*Y;
        if(wy > 1) wy = 1; else if(wy < -1) wy = -1;
        var r0 = ((0.5 - Math.asin(wy)/Math.PI) * TH) | 0;
        if(r0 < 0) r0 = 0; else if(r0 > TH-1) r0 = TH-1;
        row[n] = r0*TW;
        var A = Math.atan2(X, H);
        var ut = (A/TAU + 0.5) * TW;
        if(ut < 0) ut += TW; else if(ut >= TW) ut -= TW;
        u[n] = ut;
        n++; count++;
      }
      if(count){ dst[spans] = dy*Wd + x0; len[spans] = count; spans++; }
    }

    canvas.width = Wd; canvas.height = Hd;
    gl.width = Wd; gl.height = Hd;
    img = glx.createImageData(Wd, Hd);
    lut = { u:u, row:row, dst:dst, len:len, spans:spans, buf:new Uint32Array(img.data.buffer) };
    rv = v;
    needLut = false;
  }

  function paintSphere(){
    if(!lut || !tex) return;
    var shift = (lng0/TAU) * TW;
    shift = shift - Math.floor(shift/TW)*TW;
    var u = lut.u, row = lut.row, dstA = lut.dst, lenA = lut.len, buf = lut.buf;
    var p = 0, s, k, d, cnt, t;
    for(s=0; s<lut.spans; s++){
      d = dstA[s]; cnt = lenA[s];
      for(k=0; k<cnt; k++, p++, d++){
        t = u[p] + shift;
        if(t >= TW) t -= TW;
        buf[d] = tex[row[p] + (t|0)];
      }
    }
    glx.putImageData(img, 0, 0);
  }

  function draw(){
    if(!size || !rv) return;
    var v = view(), R = v.R, cx = v.cx, cy = v.cy;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,size,size);

    /* A ring of darkness. The sky behind is a photograph full of stars, and
       without this the limb of the planet dissolves into them. Pure black at
       every stop: tinted, it painted itself lighter than the photo's own
       black and the clipped edge of the canvas showed as a rectangle. */
    var halo = ctx.createRadialGradient(cx,cy,R*1.03,cx,cy,R*1.20);
    halo.addColorStop(0,   'rgba(0,0,0,0.55)');
    halo.addColorStop(0.38,'rgba(0,0,0,0.30)');
    halo.addColorStop(0.70,'rgba(0,0,0,0.11)');
    halo.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(cx,cy,R*1.20,0,TAU); ctx.fill();

    ctx.fillStyle = '#7dabc9';
    ctx.beginPath(); ctx.arc(cx,cy,R,0,TAU); ctx.fill();

    if(ready){
      paintSphere();
      /* Orthographic projection scales linearly about the sphere centre, so
         showing the last render at another zoom is exact - only softer. */
      var k = R / rv.R;
      ctx.setTransform(1,0,0,1,0,0);
      if(Math.abs(k-1) < 0.0015 && Math.abs(cy-rv.cy) < 0.4){
        ctx.drawImage(gl, 0, 0);
      } else {
        ctx.drawImage(gl, (cx - rv.cx*k)*dpr, (cy - rv.cy*k)*dpr, size*k*dpr, size*k*dpr);
      }
      ctx.setTransform(dpr,0,0,dpr,0,0);
    }

    /* Enough modelling to read as a sphere and no more. This is a map, not a
       photograph of a lit planet, so the heavy day-side shading a satellite
       image wants would just look like the print had been left in the sun. */
    var lit = ctx.createRadialGradient(cx - R*0.36, cy - R*0.42, R*0.14,
                                       cx - R*0.36, cy - R*0.42, R*2.10);
    lit.addColorStop(0,   'rgba(14,32,58,0)');
    lit.addColorStop(0.50,'rgba(14,32,58,0)');
    lit.addColorStop(0.76,'rgba(14,32,58,0.08)');
    lit.addColorStop(0.92,'rgba(12,28,52,0.20)');
    lit.addColorStop(1,   'rgba(10,24,46,0.32)');
    ctx.fillStyle = lit;
    ctx.beginPath(); ctx.arc(cx,cy,R,0,TAU); ctx.fill();

    /* A hairline at the very edge, so the limb is defined all the way round. */
    var edge = ctx.createRadialGradient(cx,cy,R*0.955,cx,cy,R);
    edge.addColorStop(0,'rgba(20,48,78,0)');
    edge.addColorStop(1,'rgba(20,48,78,0.26)');
    ctx.fillStyle = edge;
    ctx.beginPath(); ctx.arc(cx,cy,R,0,TAU); ctx.fill();

    if(route) drawRoute(v);

    /* A thin band of atmosphere, mostly inside the limb. Wide and bright
       reads as a neon ring rather than air. */
    ctx.globalCompositeOperation = 'lighter';
    /* Daylight atmosphere is a broad soft haze, not a thin bright line, and
       the dark ring outside it now starts beyond the haze - butted straight
       up against the lit limb it read as a bezel. */
    var rim = ctx.createRadialGradient(cx,cy,R*0.962,cx,cy,R*1.09);
    rim.addColorStop(0,   'rgba(96,158,214,0)');
    rim.addColorStop(0.32,'rgba(136,190,232,0.12)');
    rim.addColorStop(0.54,'rgba(214,238,255,0.40)');
    rim.addColorStop(0.74,'rgba(150,200,240,0.16)');
    rim.addColorStop(1,   'rgba(96,158,214,0)');
    ctx.fillStyle = rim;
    ctx.beginPath(); ctx.arc(cx,cy,R*1.10,0,TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    /* Zoomed in, the planet reaches the foot of the box and stops dead
       against the card. Fade it out instead, in step with the zoom. */
    var zf = (zoom - 1) / (ZOOM - 1);
    if(zf > 0.02){
      var h = size*0.13;
      var foot = ctx.createLinearGradient(0, size-h, 0, size);
      foot.addColorStop(0, 'rgba(24,24,27,0)');
      foot.addColorStop(0.55, 'rgba(24,24,27,' + (0.55*zf).toFixed(3) + ')');
      foot.addColorStop(1, 'rgba(24,24,27,' + (0.97*zf).toFixed(3) + ')');
      ctx.fillStyle = foot;
      ctx.fillRect(0, size-h, size, h);
    }

    /* Cover the moment the table is rebuilt: same picture, different
       sharpness, so a straight cut would read as a glitch. */
    if(fadeT > 0){
      ctx.setTransform(1,0,0,1,0,0);
      ctx.globalAlpha = fadeT;
      ctx.drawImage(fade, 0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;
      ctx.setTransform(dpr,0,0,dpr,0,0);
    }

    placePin(v);
  }

  function drawRoute(v){
    var C0 = Math.cos(lng0), S0 = Math.sin(lng0);
    var ct = Math.cos(TILT), st = Math.sin(TILT);
    var n = route.n, upto = Math.max(1, Math.round(n*revealT));
    var i, x, y, z, X, H, Y, Z, px, py;

    /* Two passes: a soft wide stroke for the glow, then the line itself. The
       path is broken wherever it crosses to the far side of the planet, so
       segments are only joined while both ends face us. */
    function trace(){
      var drawing = false;
      ctx.beginPath();
      for(i=0;i<=upto;i++){
        x = route.pts[i*3]; y = route.pts[i*3+1]; z = route.pts[i*3+2];
        X = z*C0 - x*S0; H = x*C0 + z*S0;
        Y = ct*y - st*H; Z = st*y + ct*H;
        if(Z <= 0){ drawing = false; continue; }
        px = v.cx + X*v.R; py = v.cy - Y*v.R;
        if(drawing) ctx.lineTo(px, py);
        else { ctx.moveTo(px, py); drawing = true; }
      }
    }

    /* Three passes rather than two: a wide soft halo, a solid red body and a
       near-white core. One thick line reads as a bar drawn over the map; the
       three together read as a lit route. */
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(207,33,42,0.26)';
    ctx.lineWidth = 15;
    trace(); ctx.stroke();
    ctx.strokeStyle = 'rgba(214,40,49,0.90)';
    ctx.lineWidth = 6.5;
    trace(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,246,243,0.96)';
    ctx.lineWidth = 2.6;
    trace(); ctx.stroke();

    drawPlane(v, C0, S0, ct, st);

    /* The departure end, marked and labelled on the canvas. A second floating
       flag in the DOM would collide with the race one at close zooms. */
    x = route.pts[0]; y = route.pts[1]; z = route.pts[2];
    X = z*C0 - x*S0; H = x*C0 + z*S0;
    Y = ct*y - st*H; Z = st*y + ct*H;
    if(Z > 0.02){
      px = v.cx + X*v.R; py = v.cy - Y*v.R;
      ctx.beginPath(); ctx.arc(px, py, 5.5, 0, TAU);
      ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill();
      ctx.beginPath(); ctx.arc(px, py, 3, 0, TAU);
      ctx.fillStyle = '#cf212a'; ctx.fill();

      var txt = route.from.code || route.from.label || '';
      if(txt){
        ctx.font = '600 11px ' + '"Manrope", system-ui, sans-serif';
        ctx.textBaseline = 'middle';
        var tw = ctx.measureText(txt).width;
        var bx = px + 11, by = py - 9, bw = tw + 14, bh = 19;
        if(bx + bw > size - 4) bx = px - 11 - bw;      /* flip near the edge */
        if(by < 2) by = 2;
        if(by + bh > size - 2) by = size - 2 - bh;
        ctx.fillStyle = 'rgba(12,12,14,0.82)';
        if(ctx.roundRect){ ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 3); ctx.fill(); }
        else ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = '#f3f1ed';
        ctx.fillText(txt, bx + 7, by + bh/2 + 0.5);
      }
    }
  }

  /* A plan-view airliner, nose along +x, drawn as one closed silhouette: the
     upper edge is listed and the lower half mirrored, so it stays symmetric
     whatever the size. */
  var PLANE_EDGE = [
    [ 0.62, 0.000], [ 0.34, 0.100], [ 0.16, 0.115],
    [-0.10, 0.520], [-0.28, 0.520], [-0.20, 0.115],
    [-0.40, 0.115], [-0.52, 0.300], [-0.62, 0.300],
    [-0.56, 0.090], [-0.66, 0.000]
  ];
  function planePath(s){
    var i;
    ctx.beginPath();
    ctx.moveTo(PLANE_EDGE[0][0]*s, 0);
    for(i=1;i<PLANE_EDGE.length;i++) ctx.lineTo(PLANE_EDGE[i][0]*s, PLANE_EDGE[i][1]*s);
    for(i=PLANE_EDGE.length-2;i>=1;i--) ctx.lineTo(PLANE_EDGE[i][0]*s, -PLANE_EDGE[i][1]*s);
    ctx.closePath();
  }

  /* Position AND heading come from the arc itself: the aircraft is turned to
     the tangent in screen space, which is what stops it looking pinned on. */
  function drawPlane(v, C0, S0, ct, st){
    if(planeT > 1) return;                     /* the gap between passes */
    var n = route.n;
    var i0 = Math.floor(planeT*n);
    if(i0 > n-1) i0 = n-1;
    var frac = planeT*n - i0;

    function proj(i){
      var x = route.pts[i*3], y = route.pts[i*3+1], z = route.pts[i*3+2];
      var X = z*C0 - x*S0, H = x*C0 + z*S0;
      var Y = ct*y - st*H, Z = st*y + ct*H;
      return [v.cx + X*v.R, v.cy - Y*v.R, Z];
    }
    var a = proj(i0), b = proj(i0+1);
    if(a[2] <= 0.05 || b[2] <= 0.05) return;   /* round the far side */

    var px = a[0] + (b[0]-a[0])*frac, py = a[1] + (b[1]-a[1])*frac;
    var ang = Math.atan2(b[1]-a[1], b[0]-a[0]);
    /* Sized for legibility rather than scale: at 16px it still reads as an
       airliner, and a thin-bladed silhouette did not. */
    var s = 19 + 6*(zoom - 1);
    if(s < 16) s = 16; else if(s > 30) s = 30;

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(ang);
    planePath(s);
    ctx.fillStyle = 'rgba(255,255,255,0.97)';
    ctx.strokeStyle = 'rgba(18,18,22,0.80)';
    ctx.lineWidth = Math.max(1, s/14);
    ctx.lineJoin = 'round';
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function placePin(v){
    if(!pinAt) return;
    var C0 = Math.cos(lng0), S0 = Math.sin(lng0);
    var ct = Math.cos(TILT), st = Math.sin(TILT);
    var la = pinAt.lat*D2R, ln = pinAt.lng*D2R, cl = Math.cos(la);
    var x = cl*Math.cos(ln), y = Math.sin(la), z = cl*Math.sin(ln);
    var X = z*C0 - x*S0, H = x*C0 + z*S0;
    var Y = ct*y - st*H, Z = st*y + ct*H;
    if(Z <= 0){
      if(lastOp !== 0){ pin.style.opacity = 0; lastOp = 0; }
      return;
    }
    /* Rounded, and only written when it changes. The easing is asymptotic, so
       otherwise the pin nudges by hundredths of a pixel forever and every
       frame pays for a style recalculation. */
    var px2 = Math.round(v.cx + X*v.R), py2 = Math.round(v.cy - Y*v.R);
    var op = Math.round(Math.min(1, Z*2.6)*100)/100;
    pin.hidden = false;
    if(px2 !== lastPx){ pin.style.left = px2 + 'px'; lastPx = px2; }
    if(py2 !== lastPy){ pin.style.top = py2 + 'px'; lastPy = py2; }
    if(op !== lastOp){ pin.style.opacity = op; lastOp = op; }

    /* Flag above the marker where there is room, below it near the top. It
       reads left-to-right from the marker unless that would run off the right
       edge, and is clamped either way, so a long name never spills out. */
    var stem = size < 300 ? 34 : 42;
    var below = (py2 - stem - 34) < 2;
    if(below !== wasBelow){ pin.classList.toggle('below', below); wasBelow = below; }
    if(stem !== lastStem){ pin.style.setProperty('--stem', stem + 'px'); lastStem = stem; }
    var lx = px2 - 14;
    if(lx + labelW > size - 4) lx = px2 + 14 - labelW;
    if(lx < 4) lx = 4;
    if(lx + labelW > size - 4) lx = Math.max(4, size - 4 - labelW);
    lx = Math.round(lx - px2 + 17);
    if(lx !== lastLx){ label.style.left = lx + 'px'; lastLx = lx; }
  }

  function measure(){
    var w = wrap.offsetWidth;
    if(!w || w === size) return;
    size = w;
    needLut = true;
  }

  /* Eased at both ends. A per-frame lerp toward the target is fastest on the
     very first frame and then crawls, which is what made the move feel like a
     lurch followed by a drift - and being per-frame it also ran twice as fast
     on a 120Hz screen. These are timed, so the motion is the same on any
     display. */
  function ease(p){ return p < 0.5 ? 4*p*p*p : 1 - Math.pow(-2*p + 2, 3)/2; }

  /* Everything that describes the new destination, held back until the view
     has actually pulled out. Applied any earlier and the camera's vertical
     offset, the flag and the flight path would all switch to the new place
     while the old close-up was still on screen, which is what made changing
     your mind look like the globe jumping to a random spot. */
  function applyQueued(){
    if(!queued) return;
    panSy  = queued.panSy;
    pinAt  = queued.pinAt;
    route  = queued.route;
    zoomAim = queued.zoomAim;
    revealT = 0;
    lastPx = lastPy = lastLx = lastStem = lastOp = -1; wasBelow = null;
    if(queued.label !== null && queued.label !== undefined){
      label.textContent = queued.label;
      pin.hidden = false;
      labelW = label.offsetWidth || 120;
    }
    queued = null;
  }

  /* Three phases, in order: out from wherever we are, round to the new
     longitude at full width, then in. Turning at 2x reads as a lurch, and
     swapping the vertical offset under a zoomed camera reads as a jump. */
  function startFly(aim, plan){
    var now = performance.now();
    closingIn = false;
    target = { lng0: aim };
    if(zoom > 1.01 || pan > 0.01){
      queued = plan;
      rotTween = null;
      zoomTween = { t0:now, zf:zoom, zt:1, pf:pan, pt:0, dur:OUT_MS, thenRotate:aim };
    } else {
      queued = plan;
      applyQueued();
      zoomTween = null;
      rotTween = { t0:now, from:lng0, delta:shortest(lng0, aim), dur:ROT_MS };
    }
  }

  function settle(now, dt){
    if(rotTween){
      var p = (now - rotTween.t0) / rotTween.dur;
      if(p > 1) p = 1;
      lng0 = rotTween.from + rotTween.delta*ease(p);
      if(!closingIn && p > 0.55 && target){
        zoomTween = { t0:now, zf:zoom, zt:zoomAim, pf:pan, pt:1, dur:IN_MS };
        closingIn = true;
      }
      if(p >= 1) rotTween = null;
    } else if(!target && !reduced){
      lng0 += IDLE_SPIN * dt;
    }
    /* Draw the path on as the view closes in, rather than snapping it in. The
       aircraft leads the line while it draws, then simply carries on at
       cruising speed - so there is no jump between the two. */
    if(route){
      if(closingIn){ revealT += dt/1.15; if(revealT > 1) revealT = 1; }
      if(reduced) planeT = 0.55;
      else if(revealT < 1) planeT = revealT;
      else { planeT += dt/PLANE_SECS; if(planeT >= 1.25) planeT -= 1.25; }
    } else if(revealT !== 0){ revealT = 0; planeT = 0; }

    if(zoomTween){
      var q = (now - zoomTween.t0) / zoomTween.dur;
      if(q > 1) q = 1;
      var e = ease(q);
      zoom = zoomTween.zf + (zoomTween.zt - zoomTween.zf)*e;
      pan  = zoomTween.pf + (zoomTween.pt - zoomTween.pf)*e;
      if(q >= 1){
        zoom = zoomTween.zt; pan = zoomTween.pt;
        var rotateTo = zoomTween.thenRotate;
        zoomTween = null;
        /* pan is 0 here, so the offset the new latitude implies is not yet
           being applied - the one moment the swap is invisible. */
        if(rotateTo !== undefined && rotateTo !== null){
          applyQueued();
          rotTween = { t0:now, from:lng0, delta:shortest(lng0, rotateTo), dur:ROT_MS };
        }
      }
    }
  }

  function frame(){
    measure();
    var now = performance.now();
    var dt = last ? (now - last)/1000 : 0.016;
    if(dt > 0.05) dt = 0.05;            /* a backgrounded tab must not jump */
    last = now;
    settle(now, dt);

    var v = view();
    var still = (!rotTween && !zoomTween);
    var want = pendingView ||
               (needLut ? v
                        : (still && rv && (Math.abs(v.R-rv.R) > 0.5 || Math.abs(v.cy-rv.cy) > 0.5) ? v : null));
    if(want){
      /* Sizing the snapshot canvas is what clears it, so it has to happen
         before the copy - and before buildLut changes the main canvas. */
      if(rv){
        fade.width = canvas.width; fade.height = canvas.height;
        fadex.drawImage(canvas, 0, 0);
        fadeT = 1;
      }
      buildLut(want);
      pendingView = null;
      needLut = false;
      lastPx = lastPy = lastLx = lastStem = lastOp = -1;
    }
    if(fadeT > 0){ fadeT -= 0.10; if(fadeT < 0) fadeT = 0; }
    draw();
    raf = requestAnimationFrame(frame);
  }

  function loadTexture(src){
    var im = new Image();
    im.onload = function(){
      try {
        TW = im.naturalWidth; TH = im.naturalHeight;
        var c = document.createElement('canvas');
        c.width = TW; c.height = TH;
        var cc = c.getContext('2d');
        cc.drawImage(im, 0, 0);
        tex = new Uint32Array(cc.getImageData(0,0,TW,TH).data.buffer);
        ready = true;
        needLut = true;
        if(!raf && size){ measure(); buildLut(view()); draw(); }
      } catch(e){ ready = false; }
    };
    /* The globe reads the texture's pixels back off a canvas, which a
       cross-origin image would taint. Same-origin assets are unaffected by
       this; it is here so a CORS-enabled CDN works too. The read is already
       wrapped above, so the worst case is no globe rather than no page. */
    try{ im.crossOrigin = "anonymous"; }catch(e){}
    im.src = src;
  }

  return {
    init: function(texSrc){
      wrap = document.querySelector('.globe-wrap');
      canvas = $("globeCanvas");
      pin = $("globePin");
      caption = $("globeCaption");
      label = $("globeLabel");
      if(!wrap || !canvas || !canvas.getContext || !label) return false;
      ctx = canvas.getContext('2d');
      gl = document.createElement('canvas'); glx = gl.getContext('2d');
      fade = document.createElement('canvas'); fadex = fade.getContext('2d');
      if(!ctx || !glx || !fadex) return false;
      reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      alive = true;
      loadTexture(texSrc);
      return true;
    },
    start: function(){
      if(!alive || raf) return;
      measure();
      last = 0;
      raf = requestAnimationFrame(frame);
    },
    stop: function(){ if(raf){ cancelAnimationFrame(raf); raf = null; } },
    flyTo: function(lat,lng,name,city_){
      if(!alive) return;
      if(lat === null || lat === undefined){
        target = null; pinAt = null; route = null; revealT = 0; zoomAim = ZOOM;
        queued = null; rotTween = null; closingIn = false;
        zoomTween = { t0:performance.now(), zf:zoom, zt:1, pf:pan, pt:0, dur:OUT_MS };
        if(size) pendingView = wideView();
        pin.hidden = true;
        caption.classList.remove('sr-only');
        caption.innerHTML = "We'll suggest a race that fits your dates and budget";
        return;
      }
      /* Where the country will sit vertically once the planet has turned to
         it: the tilt is fixed, so this is known before the move starts. */
      startFly(lng*D2R, {
        panSy: Math.sin(lat*D2R - TILT),
        pinAt: { lat: lat, lng: lng },
        route: null,
        zoomAim: ZOOM,
        /* The pin is hidden on the very first selection, and a hidden element
           measures zero - which let a long name clamp against a stale width
           and hang off the globe. applyQueued shows it before measuring. */
        label: name
      });
      /* The table in hand was built for the last close-up, which only covers
         the part of the sphere that fitted on the canvas at that zoom. Scaled
         down for the pull-out it left half the planet missing, so rebuild it
         wide before the move starts. */
      if(size) pendingView = wideView();
      caption.classList.add('sr-only');
      caption.innerHTML = '<b>' + escapeHtml(name) + '</b>' + escapeHtml(city_);
      if(reduced){
        rotTween = zoomTween = null;
        applyQueued();
        lng0 = lng*D2R; zoom = ZOOM; pan = 1; needLut = true;
      }
    },
    /* Back to the race on its own, for when the race step is reopened. */
    showRace: function(){
      if(!alive || !route || !pinAt) return;
      var at = pinAt;
      startFly(at.lng*D2R, {
        panSy: Math.sin(at.lat*D2R - TILT),
        pinAt: at, route: null, zoomAim: ZOOM, label: null
      });
      if(size) pendingView = wideView();
      if(reduced){
        rotTween = zoomTween = null;
        applyQueued();
        lng0 = at.lng*D2R; zoom = ZOOM; pan = 1; needLut = true;
      }
    },

    /* Re-show whatever route is already set, for when the departure step is
       reopened after the race step has taken the camera back. */
    showRoute: function(){
      if(!alive || !answers.depart || !pinAt) return;
      if(route) return;
      this.flyRoute(answers.depart);
    },

    flyRoute: function(from){
      if(!alive) return;
      var dest = (queued && queued.pinAt) || pinAt;
      if(!dest) return;
      var arc = buildArc({ lat:from.lat, lng:from.lng, code:from.code },
                         { lat:dest.lat, lng:dest.lng });
      var centreY = routeCentre(arc);
      startFly(arc.midLng*D2R, {
        panSy: centreY,
        pinAt: dest, route: arc, zoomAim: fitZoom(arc, centreY), label: null
      });
      if(size) pendingView = wideView();
      caption.classList.add('sr-only');
      caption.innerHTML = '<b>' + escapeHtml(airportLabel(from)) + '</b>' +
                          'to ' + escapeHtml(answers.race || 'your race');
      if(reduced){
        rotTween = zoomTween = null;
        applyQueued();
        lng0 = arc.midLng*D2R; zoom = zoomAim; pan = 1; revealT = 1; needLut = true;
      }
    },

    available: function(){ return alive; }
  };
})();
