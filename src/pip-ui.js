var KaraokePiPUI = (function () {

  const CSS = `
:root{
  color-scheme:dark;
  --kp-size:19px;
  --kp-weight:700;
  --kp-dim:.5;
  --kp-lead:1.36;
}
*{ margin:0; padding:0; box-sizing:border-box; }
html,body{ height:100%; }
body{
  background:#121212;
  color:#fff;
  font-family:"YouTube Sans",Roboto,-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;
  overflow:hidden;
  user-select:none;
  -webkit-font-smoothing:antialiased;
}
.kp-app{ display:flex; flex-direction:column; height:100%; }

.kp-bar{ display:flex; align-items:center; gap:10px; padding:12px 18px 6px; }
.kp-id{ flex:1; min-width:0; }
.kp-track{
  display:block; font-size:12.5px; font-weight:600; letter-spacing:.01em;
  color:rgba(255,255,255,.9);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}
.kp-artist{
  display:block; margin-top:1px; font-size:11px; color:rgba(255,255,255,.42);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}
.kp-nudge{
  display:flex; align-items:center; gap:2px;
  padding:2px; border-radius:999px; background:rgba(255,255,255,.07);
}
.kp-key{
  all:unset; width:20px; height:20px; display:grid; place-items:center;
  border-radius:50%; font-size:13px; line-height:1; cursor:pointer;
  color:rgba(255,255,255,.55);
  transition:background .15s ease,color .15s ease;
}
.kp-key:hover{ background:rgba(255,255,255,.14); color:#fff; }
.kp-key:focus-visible{ outline:2px solid #3ea6ff; outline-offset:1px; }
.kp-delta{
  min-width:42px; text-align:center; font-size:10px;
  font-variant-numeric:tabular-nums; color:rgba(255,255,255,.45);
}
.kp-mode{
  all:unset; cursor:pointer;
  padding:3px 9px; margin-left:6px; border-radius:999px;
  font-size:10px; font-weight:700; letter-spacing:.06em;
  color:rgba(255,255,255,.55); background:rgba(255,255,255,.07);
  transition:background .15s ease,color .15s ease;
}
.kp-mode:hover{ background:rgba(255,255,255,.14); color:#fff; }
.kp-mode:focus-visible{ outline:2px solid #3ea6ff; outline-offset:1px; }
.kp-mode.is-on{ color:#3ea6ff; background:rgba(62,166,255,.14); }
.kp-mode[hidden]{ display:none; }

.kp-stage{
  position:relative; flex:1; overflow:hidden;
  -webkit-mask-image:linear-gradient(180deg,transparent 0,#000 16%,#000 84%,transparent 100%);
          mask-image:linear-gradient(180deg,transparent 0,#000 16%,#000 84%,transparent 100%);
}
.kp-list{
  list-style:none;
  padding:46vh 22px;
  transform:translate3d(0,0,0);
  will-change:transform;
  transition:transform 480ms cubic-bezier(.22,.9,.26,1);
  pointer-events:none;
}
.kp-line{
  padding:10px 0;
  font-size:var(--kp-size);
  line-height:var(--kp-lead);
  font-weight:var(--kp-weight);
  letter-spacing:-.005em;
  color:#fff;
  opacity:var(--kp-dim);
  text-wrap:balance;
  overflow-wrap:break-word;
  -webkit-text-stroke:0 #fff;
  transition:opacity 240ms ease,
             text-shadow 260ms ease,
             -webkit-text-stroke-width 240ms ease;
}
.kp-line.is-active{
  opacity:1;
  -webkit-text-stroke-width:.42px;
  text-shadow:0 0 26px rgba(255,255,255,.28);
}
.kp-line.is-gap{ letter-spacing:.35em; color:rgba(255,255,255,.62); }
.kp-list.is-static .kp-line{ opacity:.62; }
.kp-roman{
  display:block; margin-top:3px;
  font-size:13.5px; font-weight:600; letter-spacing:.012em;
  color:rgba(255,255,255,.72);
}

.kp-status{
  padding:8px 18px 12px; min-height:14px;
  font-size:11px; text-align:center; color:rgba(255,255,255,.38);
}
.kp-status:empty{ padding:0; min-height:0; }
.kp-status.is-error{ color:#ff7a7a; }

@media (prefers-reduced-motion: reduce){
  .kp-list,.kp-line{ transition:none !important; }
}`;

  function el(doc, tag, cls, text) {
    const n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function mount(win, handlers) {
    const doc = win.document;
    doc.title = 'Lyrics';
    doc.head.replaceChildren();
    doc.body.replaceChildren();

    const style = doc.createElement('style');
    style.textContent = CSS;
    doc.head.appendChild(style);

    const app    = el(doc, 'div', 'kp-app');
    const bar    = el(doc, 'header', 'kp-bar');
    const id     = el(doc, 'div', 'kp-id');
    const track  = el(doc, 'span', 'kp-track', 'Loading…');
    const artist = el(doc, 'span', 'kp-artist', '');
    id.append(track, artist);

    const nudge = el(doc, 'div', 'kp-nudge');
    const minus = el(doc, 'button', 'kp-key', '−');
    const delta = el(doc, 'span', 'kp-delta', '0.0s');
    const plus  = el(doc, 'button', 'kp-key', '+');
    minus.title = 'Delay lyrics by 0.2s';
    plus.title  = 'Advance lyrics by 0.2s';
    nudge.append(minus, delta, plus);

    const mode = el(doc, 'button', 'kp-mode', 'A');
    mode.hidden = true;
    mode.title = 'Switch between original and romanized lyrics';

    bar.append(id, nudge, mode);

    const stage = el(doc, 'main', 'kp-stage');
    const list  = el(doc, 'ul', 'kp-list');
    stage.appendChild(list);

    const status = el(doc, 'footer', 'kp-status', '');

    app.append(bar, stage, status);
    doc.body.appendChild(app);

    minus.addEventListener('click', () => handlers.onOffset(-0.2));
    plus .addEventListener('click', () => handlers.onOffset(+0.2));
    mode .addEventListener('click', () => handlers.onMode());

    let active = -1;
    let centres = [];

    function measure() {
      centres = Array.from(list.children)
        .map((n) => n.offsetTop + n.offsetHeight / 2);
    }

    function centre() {
      if (!centres.length && list.children.length) measure();
      const c = centres[Math.max(0, active)];
      if (c == null) return;
      list.style.transform =
        `translate3d(0, ${Math.round(stage.clientHeight / 2 - c)}px, 0)`;
    }

    function remeasure() { measure(); centre(); }

    const ro = new ResizeObserver(remeasure);
    ro.observe(stage);
    ro.observe(list);

    doc.fonts?.ready.then(remeasure).catch(() => {});

    return {
      setMeta(t, a) {
        track.textContent  = t || 'Unknown track';
        artist.textContent = a || '';
      },
      setStatus(msg, isError) {
        status.textContent = msg || '';
        status.classList.toggle('is-error', !!isError);
      },
      setOffset(sec) {
        delta.textContent = `${sec >= 0 ? '+' : '−'}${Math.abs(sec).toFixed(1)}s`;
      },
      setMode(available, m) {
        mode.hidden = !available;
        mode.textContent = m === 'off' ? 'A' : m === 'roman' ? 'ROMAJI' : 'BOTH';
        mode.classList.toggle('is-on', m !== 'off');
      },
      setLines(lines, synced, m) {
        active = -1;
        centres = [];
        list.classList.toggle('is-static', !synced);

        const frag = doc.createDocumentFragment();
        for (const line of lines) {
          const li = el(doc, 'li', 'kp-line');
          const hasRoman = !!line.roman && line.roman !== line.text;

          if (!line.text) {
            li.textContent = '♪';
            li.classList.add('is-gap');
          } else if (m === 'roman' && hasRoman) {
            li.textContent = line.roman;
          } else if (m === 'both' && hasRoman) {
            li.appendChild(el(doc, 'div', null, line.text));
            li.appendChild(el(doc, 'div', 'kp-roman', line.roman));
          } else {
            li.textContent = line.text;
          }
          frag.appendChild(li);
        }
        list.replaceChildren(frag);
        list.style.transform = 'translate3d(0,0,0)';
        win.requestAnimationFrame(measure);
      },
      setActive(i) {
        list.children[active]?.classList.remove('is-active');
        active = i;
        list.children[active]?.classList.add('is-active');
        centre();
      },
      destroy() { ro.disconnect(); }
    };
  }

  return { mount, CSS };
})();
