import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, doc, collection, onSnapshot, setDoc, updateDoc, deleteDoc, addDoc, getDocs, serverTimestamp, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getDatabase, ref, onValue, set, push, remove, update, off, onDisconnect, get } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBziPlsUPMpNleC0vezR1UfNXqbjiC9Rws",
  authDomain: "ficha-op-c9df8.firebaseapp.com",
  databaseURL: "https://ficha-op-c9df8-default-rtdb.firebaseio.com",
  projectId: "ficha-op-c9df8",
  storageBucket: "ficha-op-c9df8.firebasestorage.app",
  messagingSenderId: "5463680704",
  appId: "1:5463680704:web:3d6296c296699f4d41af25"
};

const existingApps = getApps();
const app  = existingApps.length ? existingApps[0] : initializeApp(firebaseConfig);
const db   = getFirestore(app);
const rtdb = getDatabase(app);
const auth = getAuth(app);

// ═══ SEGURANÇA: escapa texto vindo de outros usuários (chat, nomes, cores)
// antes de injetar em innerHTML, evitando XSS armazenado via Firebase.
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}
// Para atributos que esperam uma cor CSS (style="background:${cor}"): só aceita
// formatos válidos de cor (#hex, rgb(), nome simples) — qualquer outra coisa vira
// a cor padrão, fechando a brecha de injeção via "background:${p.cor}".
function safeColor(str, fallback = '#4a8fe8') {
  const s = String(str || '').trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(s)) return s;
  if (/^rgb(a)?\([\d.,\s%]+\)$/.test(s)) return s;
  if (/^[a-zA-Z]{3,20}$/.test(s)) return s;
  return fallback;
}
// Para src de imagem: só permite http(s)/data URLs, bloqueando javascript: e afins.
function safeImgSrc(str) {
  const s = String(str || '').trim();
  if (/^(https?:|data:image\/)/i.test(s)) return s;
  return '';
}

// ═══ ESTADO GLOBAL ═══
let campanhaId   = null;
let currentUser  = null;
let isMestre     = false;
let nomeLocal    = 'Agente';

let tokens       = {};
let initList     = [];
let currentTurn  = 0;
let fogCells     = {};
let drawings     = [];
let drawHistory  = [];
let drawFuture   = [];

let canvas, ctx, drawCanvas, drawCtx;
let camX = 0, camY = 0, camZoom = 1;
let cellSize   = 60;
let gridType   = 'square';
let boardCols  = 30;
let boardRows  = 30;
let mapImg     = null;
let mapImgData = null;
let mapVideoEl = null;
let mapGifEl   = null;

let activeTool      = 'select';
let brushColor      = '#e84040';
let brushSize       = 4;
let isDrawing       = false;
let currentDrawPath = null;
let measureStart    = null;
let isPanning       = false;
let panStartX = 0, panStartY = 0, panCamX = 0, panCamY = 0;

let draggingToken   = null;
let dragOffX = 0, dragOffY = 0;
let selectedTokenId = null;
let hoveredTokenId  = null;
let ctxTokenId      = null;
let hpQuickTokenId  = null;

const _imgCache = {};

// ═══ INIT ═══
window.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(location.search);
  campanhaId = params.get('campanha');
  if (!campanhaId) { alert('Nenhuma campanha especificada!'); history.back(); return; }

  canvas     = document.getElementById('tt-canvas');
  ctx        = canvas.getContext('2d');
  drawCanvas = document.getElementById('tt-draw-canvas');
  drawCtx    = drawCanvas.getContext('2d');

  // Polyfill roundRect
  if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x,y,w,h,r){
      if(w<2*r)r=w/2; if(h<2*r)r=h/2;
      this.beginPath(); this.moveTo(x+r,y);
      this.arcTo(x+w,y,x+w,y+h,r); this.arcTo(x+w,y+h,x,y+h,r);
      this.arcTo(x,y+h,x,y,r); this.arcTo(x,y,x+w,y,r); this.closePath();
    };
  }

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  setupEvents();
  aplicarTema();
  setupKeyboard();

  // Init toolbar color
  const toolColor = document.querySelector('.tool-color');
  if (toolColor) toolColor.style.background = brushColor;

  document.getElementById('loading-msg').textContent = 'Autenticando...';

  onAuthStateChanged(auth, async user => {
    if (!user) { window.location.href = 'index.html'; return; }
    currentUser = user;
    nomeLocal = sessionStorage.getItem('ficha_user') || localStorage.getItem('ficha_user') || user.displayName || user.email?.split('@')[0] || 'Agente';
    document.getElementById('loading-msg').textContent = 'Carregando campanha...';
    await verificarPapel();
    conectarFirebase();
    iniciarPresenca();
    atualizarToolbarPorPapel();
    setTimeout(() => {
      document.getElementById('loading-overlay').classList.add('hidden');
    }, 1200);
  });
});

// ═══ AUTH / PAPEL ═══
async function verificarPapel() {
  try {
    const snap = await getDoc(doc(db, 'campanhas', campanhaId));
    if (!snap.exists()) return;
    const camp = snap.data();
    isMestre = camp.mestreUid === currentUser.uid;
    document.getElementById('tt-camp-nome').textContent = camp.nome || 'Mesa';
    const badge = document.getElementById('tt-role-badge');
    badge.textContent = isMestre ? '★ MESTRE' : '◆ JOGADOR';
    badge.className = 'hdr-badge ' + (isMestre ? 'mestre' : 'jogador');
  } catch(e) { console.error(e); }
}

function atualizarToolbarPorPapel() {
  if (!isMestre) {
    ['tool-fog','tool-unfog'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.style.opacity = '0.3'; el.style.pointerEvents = 'none'; }
    });
    const mapTab = document.getElementById('ptab-map');
    if (mapTab) { mapTab.style.opacity = '0.5'; mapTab.style.pointerEvents = 'none'; }
  }
}

// ═══ FIREBASE REALTIME ═══
function conectarFirebase() {
  // Estado do mapa
  onValue(ref(rtdb, `tabletop/${campanhaId}/state`), snap => {
    const d = snap.val(); if (!d) return;
    if (d.animMapUrl) {
      ativarMapaAnimado(d.animMapUrl, d.animMapType||'gif');
    } else if (d.mapUrl !== undefined && d.mapUrl !== mapImgData) {
      desativarMapaAnimado(); mapImgData = d.mapUrl; carregarMapa(mapImgData);
    }
    if (d.gridType !== undefined) { gridType = d.gridType; document.getElementById('grid-type').value = gridType; }
    if (d.cellSize !== undefined) {
      cellSize = d.cellSize;
      document.getElementById('grid-size').value = cellSize;
      document.getElementById('grid-size-label').textContent = cellSize;
    }
    if (d.boardCols !== undefined) {
      boardCols = d.boardCols;
      const el = document.getElementById('board-cols'); if(el) el.value = boardCols;
      document.getElementById('board-cols-label').textContent = boardCols;
    }
    if (d.boardRows !== undefined) {
      boardRows = d.boardRows;
      const el = document.getElementById('board-rows'); if(el) el.value = boardRows;
      document.getElementById('board-rows-label').textContent = boardRows;
    }
    renderAll();
  });

  onValue(ref(rtdb, `tabletop/${campanhaId}/tokens`), snap => {
    tokens = snap.val() || {};
    renderAll(); renderTokenList(); atualizarInitTokenSelect();
  });

  onValue(ref(rtdb, `tabletop/${campanhaId}/initiative`), snap => {
    const d = snap.val() || {};
    initList = d.list || []; currentTurn = d.currentTurn || 0;
    renderInitiative();
  });

  onValue(ref(rtdb, `tabletop/${campanhaId}/chat`), snap => {
    const msgs = snap.val() || {};
    renderChat(Object.values(msgs).sort((a,b) => (a.ts||0)-(b.ts||0)));
  });

  onValue(ref(rtdb, `tabletop/${campanhaId}/drawings`), snap => {
    const d = snap.val() || {};
    drawings = Object.values(d); renderDrawings();
  });

  onValue(ref(rtdb, `tabletop/${campanhaId}/pings`), snap => {
    const d = snap.val() || {};
    Object.values(d).forEach(p => mostrarPing(p.worldX, p.worldY, p.cor||'#fdcb6e'));
  });

  onValue(ref(rtdb, `tabletop/${campanhaId}/fog`), snap => {
    fogCells = snap.val() || {}; renderAll();
  });
}

// ═══ PRESENÇA ═══
function iniciarPresenca() {
  if (!campanhaId || !currentUser) return;
  const presRef = ref(rtdb, `tabletop/${campanhaId}/presence/${currentUser.uid}`);
  const presData = { nome: nomeLocal, role: isMestre ? 'mestre' : 'jogador', cor: '#4a8fe8', online: true, ts: Date.now() };
  set(presRef, presData);
  onDisconnect(presRef).remove();
  onValue(ref(rtdb, '.info/connected'), snap => {
    if (snap.val()) { set(presRef, presData); onDisconnect(presRef).remove(); }
  });
  onValue(ref(rtdb, `tabletop/${campanhaId}/presence`), snap => {
    const data = snap.val() || {};
    const players = Object.values(data).filter(p => p.online);
    renderPlayers(players);
    const el = document.getElementById('tt-online-count');
    if (el) el.textContent = players.length;
  });
}

function renderPlayers(players) {
  const list = document.getElementById('players-list');
  if (!list) return;
  list.innerHTML = players.map(p=>{
    const cor = safeColor(p.cor);
    return `
    <div class="player-row">
      <div class="player-dot" style="background:${cor};box-shadow:0 0 5px ${cor};"></div>
      <span class="player-name">${escapeHtml(p.nome||'Agente')}</span>
      <span class="player-badge ${p.role==='mestre'?'mestre':'jogador'}">${p.role==='mestre'?'★ GM':'◆ JOG'}</span>
    </div>`;
  }).join('');
}

// ═══ CANVAS ═══
function resizeCanvas() {
  const area = document.getElementById('tt-canvas-area');
  canvas.width = drawCanvas.width = area.clientWidth;
  canvas.height = drawCanvas.height = area.clientHeight;
  renderAll();
}

function boardWidth()  { return boardCols * cellSize; }
function boardHeight() { return boardRows * cellSize; }

function renderAll() {
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  renderMap();
  renderGrid();
  renderFog();
  renderTokens();
}

function renderMap() {
  if (!mapImg || !mapImg.complete) return;
  ctx.save();
  ctx.translate(camX, camY); ctx.scale(camZoom, camZoom);
  ctx.drawImage(mapImg, 0, 0, boardWidth(), boardHeight());
  ctx.restore();
}

function renderGrid() {
  if (gridType === 'none') return;
  ctx.save();
  ctx.translate(camX, camY); ctx.scale(camZoom, camZoom);
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 0.5 / camZoom;

  const bw = boardWidth(), bh = boardHeight();

  if (gridType === 'square') {
    for (let x = 0; x <= boardCols; x++) {
      ctx.beginPath();
      ctx.moveTo(x * cellSize, 0);
      ctx.lineTo(x * cellSize, bh);
      ctx.stroke();
    }
    for (let y = 0; y <= boardRows; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * cellSize);
      ctx.lineTo(bw, y * cellSize);
      ctx.stroke();
    }
    // Borda do mapa
    ctx.strokeStyle = 'rgba(var(--glow-fallback,74,143,232),0.3)';
    ctx.lineWidth = 1.5 / camZoom;
    ctx.strokeRect(0, 0, bw, bh);
  } else if (gridType === 'hex') {
    const r  = cellSize / 2;
    const w  = Math.sqrt(3) * r;
    const h  = 2 * r;
    ctx.lineWidth = 0.5 / camZoom;
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    const cols = Math.ceil(bw / w) + 1;
    const rows = Math.ceil(bh / h) + 1;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cx = col * w + (row % 2) * w / 2;
        const cy = row * h * 0.75;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = Math.PI / 180 * (60 * i - 30);
          const px = cx + r * Math.cos(angle);
          const py = cy + r * Math.sin(angle);
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath(); ctx.stroke();
      }
    }
  }
  ctx.restore();
}

function renderFog() {
  ctx.save();
  ctx.translate(camX, camY); ctx.scale(camZoom, camZoom);
  ctx.fillStyle = 'rgba(6,6,9,0.88)';
  Object.keys(fogCells).forEach(key => {
    const [cx, cy] = key.split(',').map(Number);
    ctx.fillRect(cx * cellSize, cy * cellSize, cellSize, cellSize);
  });
  ctx.restore();
}

function getCachedImage(src) {
  if (!src) return null;
  if (_imgCache[src]) return _imgCache[src].complete ? _imgCache[src] : null;
  const img = new Image(); img.crossOrigin = 'anonymous';
  img.onload = () => renderAll();
  img.src = src;
  _imgCache[src] = img;
  return null;
}

function renderTokens() {
  Object.entries(tokens).forEach(([id, t]) => {
    const tw = Math.max(0.1, t.tw || 1);
    const th = Math.max(0.1, t.th || 1);
    const pixW = tw * cellSize;
    const pixH = th * cellSize;

    const isDragging = id === draggingToken;
    let baseX, baseY;
    if (isDragging && t._dragVisX !== undefined) {
      baseX = t._dragVisX; baseY = t._dragVisY;
    } else {
      const bp = tokenBasePx(t);
      baseX = bp.bx; baseY = bp.by;
    }

    const cx = baseX + pixW / 2;
    const cy = baseY + pixH / 2;
    const halfX = pixW * 0.47;
    const halfY = pixH * 0.47;
    const isSelected = id === selectedTokenId;
    const cor = t.cor || '#4a8fe8';
    const isRect = tw !== th;

    ctx.save();
    ctx.translate(camX, camY); ctx.scale(camZoom, camZoom);

    const imgSrc = t.img && (t.img.startsWith('data:') || t.img.startsWith('http')) ? t.img : null;
    const cached = imgSrc ? getCachedImage(imgSrc) : null;

    if (cached) {
      const escala = t.escala || 1;
      const dw = pixW * escala, dh = pixH * escala;
      const dx = cx - dw / 2, dy = cy - dh / 2;

      // Glow de seleção/drag antes da imagem
      if (isSelected || isDragging) {
        ctx.save();
        ctx.shadowColor = isDragging ? 'rgba(255,255,255,0.8)' : cor;
        ctx.shadowBlur  = isDragging ? 28 : 18;
        ctx.drawImage(cached, dx, dy, dw, dh);
        ctx.restore();
      }
      ctx.drawImage(cached, dx, dy, dw, dh);

      // Borda de seleção
      if (isSelected || isDragging) {
        ctx.strokeStyle = isDragging ? '#fff' : cor;
        ctx.lineWidth = 2; ctx.shadowColor = cor; ctx.shadowBlur = 12;
        ctx.strokeRect(dx + 1, dy + 1, dw - 2, dh - 2);
        ctx.shadowBlur = 0;
      }
    } else {
      // Fallback shape
      if (isSelected || isDragging) {
        ctx.strokeStyle = isDragging ? '#fff' : cor;
        ctx.lineWidth = 2.5; ctx.shadowColor = cor; ctx.shadowBlur = 20;
        if (isRect) {
          ctx.beginPath(); ctx.roundRect(cx - halfX - 5, cy - halfY - 5, pixW * 0.94 + 10, pixH * 0.94 + 10, 6);
        } else {
          ctx.beginPath(); ctx.arc(cx, cy, halfX + 5, 0, Math.PI * 2);
        }
        ctx.stroke(); ctx.shadowBlur = 0;
      }

      if (isRect) {
        const grad = ctx.createLinearGradient(cx - halfX, cy - halfY, cx + halfX, cy + halfY);
        grad.addColorStop(0, cor + '55'); grad.addColorStop(1, '#0a0a0c');
        ctx.beginPath(); ctx.roundRect(cx - halfX, cy - halfY, pixW * 0.94, pixH * 0.94, 5);
        ctx.fillStyle = grad; ctx.fill();
        ctx.strokeStyle = cor + 'aa'; ctx.lineWidth = 1.5;
        ctx.shadowColor = cor; ctx.shadowBlur = 6; ctx.stroke(); ctx.shadowBlur = 0;
      } else {
        const r = halfX;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = cor + 'aa'; ctx.lineWidth = 1.5;
        ctx.shadowColor = cor; ctx.shadowBlur = 6; ctx.stroke(); ctx.shadowBlur = 0;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0, cor + '44'); grad.addColorStop(1, '#0a0a0c');
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = grad; ctx.fill();
      }

      // Emoji/ícone centralizado
      const fontSize = Math.min(halfX, halfY) * 0.9;
      ctx.font = `${fontSize}px serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff'; ctx.fillText(t.icon || getDefaultIcon(t.tipo), cx, cy + 2);
    }

    // HP bar abaixo do token
    if (!isDragging && t.pvmax && t.pvmax > 0) {
      const barW = pixW * 0.85;
      const barH = Math.max(4, cellSize * 0.06);
      const barX = cx - barW / 2;
      const barY = cy + halfY + 4;
      const pct  = Math.max(0, Math.min(1, (t.pv || 0) / t.pvmax));
      const hpColor = pct > 0.5 ? '#00b894' : pct > 0.25 ? '#fdcb6e' : '#e84040';

      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH, 2); ctx.fill();
      if (pct > 0) {
        ctx.fillStyle = hpColor;
        ctx.shadowColor = hpColor; ctx.shadowBlur = 4;
        ctx.beginPath(); ctx.roundRect(barX, barY, barW * pct, barH, 2); ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    // Nome do token abaixo da HP bar
    if (cellSize >= 40) {
      const nameFontSize = Math.max(9, Math.min(13, cellSize * 0.18));
      ctx.font = `600 ${nameFontSize}px Inter, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      const labelY = cy + halfY + (t.pvmax ? barHOffset(cellSize) : 6);
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      const tw2 = ctx.measureText(t.nome || '').width;
      ctx.beginPath(); ctx.roundRect(cx - tw2 / 2 - 4, labelY - 1, tw2 + 8, nameFontSize + 4, 3);
      ctx.fill();
      ctx.fillStyle = '#e2e2ea';
      ctx.fillText(t.nome || '', cx, labelY);
    }

    // Condition badges abaixo do nome
    const conds = t.conditions || {};
    const condMap = {amedrontado:'😱',atordoado:'💫',envenenado:'☠️',maldito:'🔮',sangrando:'🩸',paralizado:'❄️',invisivel:'👁️',concentrado:'🎯'};
    const condIcons = Object.entries(conds).filter(([,v]) => v).map(([k]) => condMap[k] || '').filter(Boolean);
    if (condIcons.length > 0) {
      const badgeR = Math.max(6, cellSize * 0.1);
      condIcons.slice(0, 5).forEach((icon, i) => {
        const bx = cx - (condIcons.length - 1) * badgeR * 1.1 / 2 + i * badgeR * 1.1 * 2;
        const by = cy + halfY + badgeR + 2;
        ctx.fillStyle = 'rgba(10,10,12,0.8)';
        ctx.beginPath(); ctx.arc(bx, by, badgeR, 0, Math.PI * 2); ctx.fill();
        ctx.font = `${badgeR * 1.3}px serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(icon, bx, by + 1);
      });
    }

    ctx.restore();
  });
}

function barHOffset(cs) { return Math.max(4, cs * 0.06) + 8; }

function renderDrawings() {
  if (!drawCtx) return;
  drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
  drawings.forEach(d => {
    if (d.type === 'path' && d.points?.length > 1) {
      drawCtx.save();
      drawCtx.translate(camX, camY); drawCtx.scale(camZoom, camZoom);
      drawCtx.strokeStyle = d.color||'#e84040'; drawCtx.lineWidth = d.size||4;
      drawCtx.lineCap = 'round'; drawCtx.lineJoin = 'round';
      drawCtx.beginPath(); drawCtx.moveTo(d.points[0].x, d.points[0].y);
      d.points.slice(1).forEach(p => drawCtx.lineTo(p.x, p.y));
      drawCtx.stroke(); drawCtx.restore();
    } else if (d.type === 'text' && d.text) {
      drawCtx.save();
      drawCtx.translate(camX, camY); drawCtx.scale(camZoom, camZoom);
      drawCtx.font = `bold ${(d.size||4)*3}px Inter, sans-serif`;
      drawCtx.fillStyle = d.color||'#fff'; drawCtx.strokeStyle = '#000'; drawCtx.lineWidth = 2;
      drawCtx.strokeText(d.text, d.x, d.y); drawCtx.fillText(d.text, d.x, d.y);
      drawCtx.restore();
    }
  });
}

// ═══ EVENTOS DO CANVAS ═══
function worldPos(e) {
  const rect = canvas.getBoundingClientRect();
  const cx = (e.clientX - rect.left - camX) / camZoom;
  const cy = (e.clientY - rect.top  - camY) / camZoom;
  return { x: cx, y: cy };
}

function cellPos(wx, wy) {
  return { cx: Math.floor(wx/cellSize), cy: Math.floor(wy/cellSize) };
}

function getTokenAt(wx, wy) {
  const ids = Object.keys(tokens).reverse();
  for (const id of ids) {
    const t = tokens[id];
    const tw2 = (t.tw||1) * cellSize;
    const th2 = (t.th||1) * cellSize;
    const bp = tokenBasePx(t);
    const esc = t.escala || 1;
    const hw = tw2 * esc / 2, hh = th2 * esc / 2;
    const cx = bp.bx + tw2/2, cy = bp.by + th2/2;
    if (Math.abs(wx-cx) < hw && Math.abs(wy-cy) < hh) return id;
  }
  return null;
}

function tokenBasePx(t) {
  if (t.px !== undefined && t.py !== undefined) return { bx: t.px, by: t.py };
  return { bx: (t.x||0)*cellSize, by: (t.y||0)*cellSize };
}

function setupEvents() {
  const area = document.getElementById('tt-canvas-area');

  // Wheel zoom
  area.addEventListener('wheel', e => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.08 : 0.925;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const wBefore = (mx - camX) / camZoom;
    const hBefore = (my - camY) / camZoom;
    camZoom = Math.max(0.1, Math.min(5, camZoom * factor));
    camX = mx - wBefore * camZoom;
    camY = my - hBefore * camZoom;
    renderAll(); renderDrawings();
  }, { passive: false });

  // Mousedown
  canvas.addEventListener('mousedown', onMouseDown);
  drawCanvas.addEventListener('mousedown', onMouseDown);

  // Mousemove / up / leave
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('mousemove', onCanvasHover);
  canvas.addEventListener('mouseleave', () => {
    hoveredTokenId = null; esconderTooltip();
  });

  // Right click
  canvas.addEventListener('contextmenu', onContextMenu);
  drawCanvas.addEventListener('contextmenu', onContextMenu);

  // Click fora de menus
  document.addEventListener('click', e => {
    const ctx2 = document.getElementById('ctx-menu');
    const hp = document.getElementById('hp-quick');
    if (!ctx2.contains(e.target)) ctx2.style.display = 'none';
    if (!hp.contains(e.target)) hp.style.display = 'none';
  });
}

let _mouseDownPos = null;
function onMouseDown(e) {
  if (e.button === 2) return; // Handled by contextmenu
  const wp = worldPos(e);

  if (activeTool === 'select' || activeTool === 'pan') {
    // Try token drag first (select only)
    if (activeTool === 'select') {
      const tid = getTokenAt(wp.x, wp.y);
      if (tid) {
        draggingToken = tid;
        selectedTokenId = tid;
        const t = tokens[tid];
        const bp = tokenBasePx(t);
        dragOffX = wp.x - bp.bx;
        dragOffY = wp.y - bp.by;
        tokens[tid]._dragVisX = bp.bx;
        tokens[tid]._dragVisY = bp.by;
        _mouseDownPos = { x: e.clientX, y: e.clientY };
        renderAll(); renderTokenList();
        return;
      } else {
        selectedTokenId = null; renderAll(); renderTokenList();
      }
    }
    // Pan
    isPanning = true;
    panStartX = e.clientX; panStartY = e.clientY;
    panCamX = camX; panCamY = camY;
    return;
  }

  if (activeTool === 'draw') {
    isDrawing = true;
    currentDrawPath = { type: 'path', color: brushColor, size: brushSize, points: [wp] };
    return;
  }

  if (activeTool === 'eraser') {
    isDrawing = true; return;
  }

  if (activeTool === 'text') {
    const text = prompt('Texto:'); if (!text) return;
    const d = { type: 'text', text, x: wp.x, y: wp.y, color: brushColor, size: brushSize };
    drawings.push(d);
    sincronizarDrawings(); renderDrawings();
    return;
  }

  if (activeTool === 'fog') {
    const cp = cellPos(wp.x, wp.y);
    cobrirCelula(cp.cx, cp.cy); sincronizarFog();
    isDrawing = true; return;
  }
  if (activeTool === 'unfog') {
    const cp = cellPos(wp.x, wp.y);
    revelarCelula(cp.cx, cp.cy); sincronizarFog();
    isDrawing = true; return;
  }

  if (activeTool === 'ping') {
    enviarPing(wp.x, wp.y); return;
  }

  if (activeTool === 'measure') {
    measureStart = wp;
    const hud = document.getElementById('tt-measure-hud');
    hud.style.display = 'block'; return;
  }
}

function onMouseMove(e) {
  const area = document.getElementById('tt-canvas-area');
  const rect = canvas.getBoundingClientRect();
  if (!rect.width) return;
  const wp = worldPos(e);

  if (draggingToken) {
    const t = tokens[draggingToken];
    t._dragVisX = wp.x - dragOffX;
    t._dragVisY = wp.y - dragOffY;
    renderAll();
    return;
  }

  if (isPanning) {
    camX = panCamX + (e.clientX - panStartX);
    camY = panCamY + (e.clientY - panStartY);
    renderAll(); renderDrawings(); return;
  }

  if (activeTool === 'draw' && isDrawing && currentDrawPath) {
    currentDrawPath.points.push(wp);
    drawCtx.save();
    drawCtx.translate(camX, camY); drawCtx.scale(camZoom, camZoom);
    const pts = currentDrawPath.points;
    if (pts.length > 1) {
      const prev = pts[pts.length-2];
      drawCtx.strokeStyle = brushColor; drawCtx.lineWidth = brushSize;
      drawCtx.lineCap = 'round'; drawCtx.lineJoin = 'round';
      drawCtx.beginPath(); drawCtx.moveTo(prev.x, prev.y); drawCtx.lineTo(wp.x, wp.y);
      drawCtx.stroke();
    }
    drawCtx.restore();
    return;
  }

  if ((activeTool === 'fog' || activeTool === 'unfog') && isDrawing) {
    const cp = cellPos(wp.x, wp.y);
    if (activeTool === 'fog') cobrirCelula(cp.cx, cp.cy);
    else revelarCelula(cp.cx, cp.cy);
    return;
  }

  if (activeTool === 'measure' && measureStart) {
    const dx = wp.x - measureStart.x, dy = wp.y - measureStart.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const ft = ((dist / cellSize) * 5).toFixed(1);
    document.getElementById('measure-val').textContent = ft;
    renderAll();
    // draw ruler
    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    drawCtx.save();
    drawCtx.translate(camX, camY); drawCtx.scale(camZoom, camZoom);
    drawCtx.setLineDash([8, 6]);
    drawCtx.strokeStyle = '#fdcb6e'; drawCtx.lineWidth = 2 / camZoom;
    drawCtx.beginPath(); drawCtx.moveTo(measureStart.x, measureStart.y); drawCtx.lineTo(wp.x, wp.y);
    drawCtx.stroke(); drawCtx.setLineDash([]);
    drawCtx.restore();
    renderDrawings();
    return;
  }
}

function onMouseUp(e) {
  if (draggingToken) {
    const id = draggingToken;
    const t = tokens[id];
    if (t) {
      const px = t._dragVisX !== undefined ? t._dragVisX : tokenBasePx(t).bx;
      const py = t._dragVisY !== undefined ? t._dragVisY : tokenBasePx(t).by;
      delete t._dragVisX; delete t._dragVisY;
      moverToken(id, px, py);
    }
    draggingToken = null; renderAll(); return;
  }
  if (isPanning) { isPanning = false; return; }
  if (activeTool === 'draw' && isDrawing && currentDrawPath) {
    if (currentDrawPath.points.length > 1) {
      drawings.push({...currentDrawPath});
      drawFuture = [];
      sincronizarDrawings();
    }
    currentDrawPath = null; isDrawing = false; return;
  }
  if ((activeTool === 'fog' || activeTool === 'unfog') && isDrawing) {
    sincronizarFog(); isDrawing = false; return;
  }
  if (activeTool === 'measure') {
    measureStart = null;
    document.getElementById('tt-measure-hud').style.display = 'none';
    renderDrawings(); return;
  }
  isDrawing = false;
}

function onCanvasHover(e) {
  const wp = worldPos(e);
  const tid = getTokenAt(wp.x, wp.y);
  if (tid !== hoveredTokenId) {
    hoveredTokenId = tid;
    if (tid) mostrarTooltip(tokens[tid], e.clientX, e.clientY);
    else esconderTooltip();
  } else if (tid) {
    const ttip = document.getElementById('tt-token-tooltip');
    ttip.style.left = (e.clientX + 12) + 'px';
    ttip.style.top  = (e.clientY - 10) + 'px';
  }
}

function onContextMenu(e) {
  e.preventDefault();
  const wp = worldPos(e);
  const tid = getTokenAt(wp.x, wp.y);
  if (!tid) return;
  ctxTokenId = tid;
  selectedTokenId = tid; renderAll(); renderTokenList();
  const menu = document.getElementById('ctx-menu');
  menu.style.display = 'block';
  menu.style.left = Math.min(e.clientX, window.innerWidth - 175) + 'px';
  menu.style.top  = Math.min(e.clientY, window.innerHeight - 220) + 'px';
}

// ═══ TOOLTIPS ═══
function mostrarTooltip(t, x, y) {
  const el = document.getElementById('tt-token-tooltip');
  document.getElementById('ttip-name').textContent = t.nome || '?';
  const pct = t.pvmax ? t.pv/t.pvmax : 1;
  const hpEl = document.getElementById('ttip-hp');
  hpEl.textContent = t.pvmax ? `HP: ${t.pv||0}/${t.pvmax}` : 'HP: —';
  hpEl.className = 'ttip-hp' + (pct < 0.3 ? ' danger' : '');
  document.getElementById('ttip-type').textContent = t.tipo || '';
  el.style.left = (x + 12) + 'px';
  el.style.top  = (y - 10) + 'px';
  el.classList.add('show');
}
function esconderTooltip() {
  document.getElementById('tt-token-tooltip').classList.remove('show');
}

// ═══ TOKENS – CRUD ═══
async function moverToken(id, px, py) {
  await update(ref(rtdb, `tabletop/${campanhaId}/tokens/${id}`), { px, py });
}

function getDefaultIcon(tipo) {
  return { jogador:'🧙', npc:'👤', monstro:'👾', aliado:'🛡️' }[tipo] || '?';
}

// Fichas no modal add token
let _fichasCampanha = [];
let _fichaSelecionada = null;

async function _ntCarregarFichas() {
  const grid = document.getElementById('nt-ficha-grid');
  grid.innerHTML = '<div id="nt-ficha-loading" style="text-align:center;padding:20px;color:var(--text3);font-size:11px;grid-column:1/-1;">⏳ Carregando fichas...</div>';
  try {
    const snap = await getDocs(collection(db, 'campanhas', campanhaId, 'agentes'));
    _fichasCampanha = [];
    snap.forEach(d => _fichasCampanha.push({ id: d.id, ...d.data() }));
    if (!_fichasCampanha.length) {
      grid.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text3);font-size:11px;grid-column:1/-1;">Nenhuma ficha nesta campanha.</div>';
      return;
    }
    grid.innerHTML = _fichasCampanha.map((f,i) => {
      const avatar = safeImgSrc(f.foto || f.fotoUrl || '');
      const nome   = escapeHtml(f.nome || f.personagem || 'Sem nome');
      return `<div class="ficha-card" data-ficha-idx="${i}" id="nt-fc-${i}">
        <div class="ficha-card-avatar">${avatar ? `<img src="${avatar}" alt="">` : `<span>🧙</span>`}</div>
        <div class="ficha-card-name">${nome}</div>
      </div>`;
    }).join('');
    grid.querySelectorAll('.ficha-card').forEach(card => {
      card.addEventListener('click', () => _ntSelecionarFicha(Number(card.dataset.fichaIdx)));
    });
  } catch(err) {
    grid.innerHTML = '<div style="color:var(--red);font-size:11px;text-align:center;padding:12px;grid-column:1/-1;">Erro ao carregar fichas.</div>';
  }
}

window._ntRecarregarFichas = _ntCarregarFichas;

window._ntSelecionarFicha = function(idx) {
  const f = _fichasCampanha[idx];
  if (!f) return;
  _fichaSelecionada = f;

  document.querySelectorAll('.ficha-card').forEach(c => c.classList.remove('selected'));
  document.getElementById('nt-fc-' + idx)?.classList.add('selected');

  // Preenche campos automaticamente
  const nome = f.nome || f.personagem || '';
  document.getElementById('nt-nome').value = nome;
  const pvCurrent = f.pvAtual ?? f.pv ?? '';
  const pvMax = f.pvMax ?? f.pvmax ?? '';
  document.getElementById('nt-pv').value = pvCurrent;
  document.getElementById('nt-pvmax').value = pvMax;
  if (f.foto || f.fotoUrl) document.getElementById('nt-img').value = f.foto || f.fotoUrl;

  // Preview selecionada
  const preview = document.getElementById('nt-ficha-selected-preview');
  preview.style.display = 'flex';
  const avatar = safeImgSrc(f.foto || f.fotoUrl || '');
  document.getElementById('nt-ficha-sel-avatar').innerHTML = avatar ? `<img src="${avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:7px;">` : '🧙';
  document.getElementById('nt-ficha-sel-nome').textContent = nome;
  document.getElementById('nt-ficha-sel-meta').textContent = [f.origem, f.classe, f.trilha].filter(Boolean).join(' · ') || f.nex || '';
};

window.limparFichaSelecionada = function() {
  _fichaSelecionada = null;
  document.getElementById('nt-ficha-selected-preview').style.display = 'none';
  document.querySelectorAll('.ficha-card').forEach(c => c.classList.remove('selected'));
};

window.adicionarToken = async function() {
  const nome  = document.getElementById('nt-nome').value.trim();
  const tipo  = document.getElementById('nt-tipo').value;
  const pv    = parseInt(document.getElementById('nt-pv').value) || 0;
  const pvmax = parseInt(document.getElementById('nt-pvmax').value) || pv || 0;
  const cor   = document.getElementById('nt-cor').value || '#4a8fe8';
  const icon  = document.getElementById('nt-icon').value.trim() || getDefaultIcon(tipo);
  let img     = document.getElementById('nt-img').value.trim();

  if (!nome) { mostrarToast('⚠ Digite um nome!'); return; }

  if (!img && _fichaSelecionada) img = _fichaSelecionada.foto || _fichaSelecionada.fotoUrl || '';

  const token = {
    nome, tipo, pv, pvmax, cor, icon, img: img || '',
    x: Math.floor(boardCols/2), y: Math.floor(boardRows/2),
    tw: 1, th: 1, escala: 1,
    fichaId: _fichaSelecionada?.id || '',
    conditions: {},
    ts: Date.now()
  };

  await set(push(ref(rtdb, `tabletop/${campanhaId}/tokens`)), token);
  await push(ref(rtdb, `tabletop/${campanhaId}/chat`), {
    autor: nomeLocal, ts: Date.now(), uid: currentUser.uid,
    tipo: 'sistema', texto: `🎭 ${nome} entrou na mesa.`
  });

  closeModal('modal-add-token');
  limparFormToken();
  mostrarToast(`✅ ${nome} adicionado!`);
  showPane('tokens');
};

function limparFormToken() {
  ['nt-nome','nt-pv','nt-pvmax','nt-icon','nt-img'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('nt-cor').value = '#4a8fe8';
  document.getElementById('nt-img-preview').classList.remove('show');
  _fichaSelecionada = null;
  document.getElementById('nt-ficha-selected-preview').style.display = 'none';
  document.querySelectorAll('.ficha-card').forEach(c => c.classList.remove('selected'));
  document.querySelectorAll('.color-swatch').forEach((s,i) => s.classList.toggle('sel', i===0));
}

window.previewTokenImg = function(inp) {
  const file = inp.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const src = e.target.result;
    document.getElementById('nt-img').value = src;
    const preview = document.getElementById('nt-img-preview');
    document.getElementById('nt-img-preview-img').src = src;
    preview.classList.add('show');
  };
  reader.readAsDataURL(file);
};

// Color picker
window.selectColor = function(el) {
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('sel'));
  el.classList.add('sel');
  document.getElementById('nt-cor').value = el.dataset.color;
};
window.selectColorCustom = function(val) {
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('sel'));
  document.getElementById('nt-cor').value = val;
};

// Edit / Save
window.abrirEditarToken = function(id) {
  const t = tokens[id]; if (!t) return;
  document.getElementById('et-id').value = id;
  document.getElementById('et-nome').value = t.nome || '';
  document.getElementById('et-pv').value = t.pv ?? '';
  document.getElementById('et-pvmax').value = t.pvmax ?? '';
  document.getElementById('et-cor').value = t.cor || '#4a8fe8';
  document.getElementById('et-escala').value = t.escala || 1;
  document.getElementById('et-tw').value = t.tw || 1;
  document.getElementById('et-th').value = t.th || 1;

  // Condições
  const conds = t.conditions || {};
  document.querySelectorAll('.cond-btn').forEach(btn => {
    const cond = btn.dataset.cond;
    btn.classList.toggle('on', !!conds[cond]);
  });

  openModal('modal-edit-token');
};

window.toggleCond = function(btn) {
  btn.classList.toggle('on');
};

window.salvarToken = async function() {
  const id = document.getElementById('et-id').value; if (!id) return;
  const nome   = document.getElementById('et-nome').value.trim();
  const pv     = parseInt(document.getElementById('et-pv').value) || 0;
  const pvmax  = parseInt(document.getElementById('et-pvmax').value) || pv;
  const cor    = document.getElementById('et-cor').value;
  const escala = parseFloat(document.getElementById('et-escala').value) || 1;
  const tw     = parseFloat(document.getElementById('et-tw').value) || 1;
  const th     = parseFloat(document.getElementById('et-th').value) || 1;
  const conditions = {};
  document.querySelectorAll('.cond-btn').forEach(btn => {
    conditions[btn.dataset.cond] = btn.classList.contains('on');
  });
  await update(ref(rtdb, `tabletop/${campanhaId}/tokens/${id}`), { nome, pv, pvmax, cor, escala, tw, th, conditions });
  closeModal('modal-edit-token');
  mostrarToast('✅ Token atualizado!');
};

window.removerToken = async function(id) {
  if (!id) return;
  const t = tokens[id];
  await remove(ref(rtdb, `tabletop/${campanhaId}/tokens/${id}`));
  await push(ref(rtdb, `tabletop/${campanhaId}/chat`), {
    autor: nomeLocal, ts: Date.now(), uid: currentUser.uid,
    tipo: 'sistema', texto: `💨 ${t?.nome || 'Token'} saiu da mesa.`
  });
  if (selectedTokenId === id) selectedTokenId = null;
  closeModal('modal-edit-token');
  mostrarToast('🗑 Token removido.');
};

// ═══ RENDER TOKEN LIST ═══
function renderTokenList() {
  const list = document.getElementById('token-list');
  const empty = document.getElementById('token-list-empty');
  const entries = Object.entries(tokens);

  if (!entries.length) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  list.innerHTML = entries.map(([id, t]) => {
    const pct = t.pvmax > 0 ? Math.max(0, Math.min(100, (t.pv / t.pvmax) * 100)) : 0;
    const hpColor = pct > 50 ? '#00b894' : pct > 25 ? '#fdcb6e' : '#e84040';
    const sel = id === selectedTokenId ? 'selected' : '';
    const imgSrc = safeImgSrc(t.img);
    return `<div class="token-item ${sel}" data-token-id="${id}">
      <div class="token-avatar" style="background:${safeColor(t.cor)}22;">
        ${imgSrc ? `<img src="${imgSrc}" alt="">` : `<span>${escapeHtml(t.icon) || getDefaultIcon(t.tipo)}</span>`}
      </div>
      <div class="token-info">
        <div class="token-name">${escapeHtml(t.nome) || '?'}</div>
        <div class="token-hp-bar"><div class="token-hp-fill" style="width:${pct}%;background:${hpColor};"></div></div>
        <div class="token-sub">PV ${t.pv ?? '?'}/${t.pvmax ?? '?'}</div>
      </div>
      <button class="token-edit-btn" data-edit-id="${id}" title="Editar">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" style="width:13px;height:13px;"><path d="M3 13l8-8a1.5 1.5 0 012 2L5 15H3v-2z"/></svg>
      </button>
    </div>`;
  }).join('');

  list.querySelectorAll('.token-item').forEach(item => {
    item.addEventListener('click', () => selecionarTokenLista(item.dataset.tokenId));
  });
  list.querySelectorAll('.token-edit-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      abrirEditarToken(btn.dataset.editId);
    });
  });
}

window.selecionarTokenLista = function(id) {
  selectedTokenId = id;
  const t = tokens[id]; if (!t) return;
  // Pan para o token
  const bp = tokenBasePx(t);
  const tw2 = (t.tw||1)*cellSize, th2 = (t.th||1)*cellSize;
  const cx = bp.bx + tw2/2, cy = bp.by + th2/2;
  camX = canvas.width/2 - cx*camZoom;
  camY = canvas.height/2 - cy*camZoom;
  renderAll(); renderTokenList();
};

// ═══ HP QUICK ═══
window.alterarHP_token = async function(id, delta) {
  const t = tokens[id]; if (!t) return;
  const novoPV = Math.max(0, Math.min(t.pvmax||999, (t.pv||0) + delta));
  await update(ref(rtdb, `tabletop/${campanhaId}/tokens/${id}`), { pv: novoPV });
  updateHpQuickDisplay(id);
};

function updateHpQuickDisplay(id) {
  const t = tokens[id]; if (!t) return;
  const el = document.getElementById('hp-quick-display');
  if (el) { el.textContent = `${t.pv||0}/${t.pvmax||0}`; el.style.color = (t.pv||0) < (t.pvmax||0)*0.3 ? 'var(--red)' : 'var(--green)'; }
}

window.hpQuickChange = function(delta) { if (hpQuickTokenId) alterarHP_token(hpQuickTokenId, delta); };
window.hpQuickMax = async function() {
  if (!hpQuickTokenId) return;
  const t = tokens[hpQuickTokenId]; if (!t) return;
  await update(ref(rtdb, `tabletop/${campanhaId}/tokens/${hpQuickTokenId}`), { pv: t.pvmax||0 });
  updateHpQuickDisplay(hpQuickTokenId);
};
window.closeHpQuick = function() { document.getElementById('hp-quick').style.display = 'none'; };

// ═══ CONTEXT MENU ACTIONS ═══
window.ctxEditToken = function() {
  document.getElementById('ctx-menu').style.display = 'none';
  if (ctxTokenId) abrirEditarToken(ctxTokenId);
};
window.ctxHpQuick = function() {
  document.getElementById('ctx-menu').style.display = 'none';
  if (!ctxTokenId) return;
  hpQuickTokenId = ctxTokenId;
  const t = tokens[ctxTokenId];
  document.getElementById('hp-quick-name').textContent = t?.nome || '?';
  updateHpQuickDisplay(ctxTokenId);
  const menu = document.getElementById('ctx-menu');
  const hp = document.getElementById('hp-quick');
  hp.style.display = 'block';
  hp.style.left = (parseFloat(menu.style.left)||100) + 'px';
  hp.style.top  = (parseFloat(menu.style.top)||100) + 'px';
};
window.ctxFichaToken = async function() {
  document.getElementById('ctx-menu').style.display = 'none';
  if (!ctxTokenId) return;
  const t = tokens[ctxTokenId]; if (!t?.fichaId) { mostrarToast('⚠ Sem ficha vinculada.'); return; }
  const overlay = document.getElementById('ficha-overlay');
  document.getElementById('ficha-iframe').src = `ficha.html?id=${t.fichaId}&campanha=${campanhaId}`;
  overlay.classList.add('open');
  overlay.onclick = e => { if(e.target===overlay) { overlay.classList.remove('open'); document.getElementById('ficha-iframe').src=''; } };
};
window.ctxAddInit = function() {
  document.getElementById('ctx-menu').style.display = 'none';
  if (!ctxTokenId) return;
  const sel = document.getElementById('init-token-sel');
  sel.value = ctxTokenId;
  showPane('initiative');
};
window.ctxRemoveToken = function() {
  document.getElementById('ctx-menu').style.display = 'none';
  if (ctxTokenId) removerToken(ctxTokenId);
};

window.abrirEditarToken = abrirEditarToken;

// ═══ INICIATIVA ═══
function renderInitiative() {
  const list = document.getElementById('init-list');
  const banner = document.getElementById('init-turn-banner');
  if (!initList.length) { list.innerHTML = '<div style="color:var(--text3);font-size:12px;text-align:center;padding:16px;">Iniciativa vazia.</div>'; banner.style.display='none'; return; }

  const cur = initList[currentTurn] || initList[0];
  if (cur) { banner.style.display = 'block'; banner.textContent = `⚔ Turno de ${cur.nome}`; document.getElementById('turn-name').textContent = cur.nome; document.getElementById('turn-indicator').classList.add('show'); setTimeout(()=>document.getElementById('turn-indicator').classList.remove('show'), 3000); }
  // textContent acima já é seguro por natureza (não interpreta HTML).

  list.innerHTML = [...initList].sort((a,b)=>b.score-a.score).map((item, realIdx) => {
    const isCur = item.id === (initList[currentTurn]||{}).id;
    return `<div class="init-item ${isCur?'current-turn':''}">
      <div class="init-num">${item.score}</div>
      <div class="init-info">
        <div class="init-name">${escapeHtml(item.nome)}</div>
        <div class="init-hp">HP: ${item.pv??'—'}/${item.pvmax??'—'}</div>
      </div>
      <button class="init-remove" data-remove-id="${item.id}">✕</button>
    </div>`;
  }).join('');
  list.querySelectorAll('.init-remove').forEach(btn => {
    btn.addEventListener('click', () => removerInit(btn.dataset.removeId));
  });
}

function atualizarInitTokenSelect() {
  const sel = document.getElementById('init-token-sel');
  sel.innerHTML = '<option value="">Selecione token...</option>' + Object.entries(tokens).map(([id,t])=>`<option value="${id}">${escapeHtml(t.nome)||'?'}</option>`).join('');
}

window.nextTurn = async function() {
  const next = (currentTurn + 1) % (initList.length || 1);
  await update(ref(rtdb, `tabletop/${campanhaId}/initiative`), { currentTurn: next });
};
window.clearInitiative = async function() {
  await set(ref(rtdb, `tabletop/${campanhaId}/initiative`), { list:[], currentTurn:0 });
};
window.removerInit = async function(id) {
  const newList = initList.filter(x => x.id !== id);
  await set(ref(rtdb, `tabletop/${campanhaId}/initiative`), { list: newList, currentTurn: Math.min(currentTurn, Math.max(0,newList.length-1)) });
};
window.adicionarIniciativa = async function() {
  const sel   = document.getElementById('init-token-sel').value;
  const score = parseInt(document.getElementById('init-score').value);
  if (!sel || isNaN(score)) { mostrarToast('⚠ Selecione token e iniciativa!'); return; }
  const t = tokens[sel]; if (!t) return;
  const entry = { id: sel, nome: t.nome||'?', score, pv: t.pv||0, pvmax: t.pvmax||0 };
  const newList = [...initList, entry].sort((a,b)=>b.score-a.score);
  await set(ref(rtdb, `tabletop/${campanhaId}/initiative`), { list: newList, currentTurn });
  document.getElementById('init-score').value = '';
  mostrarToast(`⚔ ${t.nome} adicionado à iniciativa!`);
};

// ═══ CHAT ═══
function renderChat(msgs) {
  const el = document.getElementById('chat-messages');
  el.innerHTML = msgs.slice(-80).map(m => {
    let cls = 'chat-msg';
    if (m.tipo === 'sistema') cls += ' system';
    if (m.tipo === 'dado') cls += ' roll';
    const time = m.ts ? new Date(m.ts).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '';
    const content = m.tipo === 'dado'
      ? `<span class="chat-roll-result">${escapeHtml(m.resultado)}</span><span style="font-size:10px;color:var(--text3);">${escapeHtml(m.texto)}</span>`
      : escapeHtml(m.texto);
    return `<div class="${cls}">
      <div class="chat-author">${escapeHtml(m.autor)||'?'} · ${time}</div>
      <div>${content}</div>
    </div>`;
  }).join('');
  el.scrollTop = el.scrollHeight;
}

window.enviarChat = async function() {
  const input = document.getElementById('chat-input');
  const raw   = input.value.trim(); if (!raw) return;
  input.value = '';
  const base = { autor: nomeLocal, ts: Date.now(), uid: currentUser.uid };

  if (raw.match(/^\/r(oll)?\s+/i)) {
    const expr = raw.replace(/^\/r(oll)?\s+/i,'').trim();
    const { resultado, texto } = rolarDados(expr);
    await push(ref(rtdb, `tabletop/${campanhaId}/chat`), { ...base, tipo:'dado', texto, resultado });
  } else {
    await push(ref(rtdb, `tabletop/${campanhaId}/chat`), { ...base, tipo:'normal', texto:raw });
  }
};

window.quickRoll = function(sides) {
  const result = Math.floor(Math.random() * sides) + 1;
  push(ref(rtdb, `tabletop/${campanhaId}/chat`), {
    autor: nomeLocal, ts: Date.now(), uid: currentUser?.uid||'',
    tipo: 'dado',
    resultado: String(result),
    texto: `= d${sides} → ${result}`
  });
  showPane('chat');
  mostrarDado3D(sides, result);
};

function rolarDados(expr) {
  try {
    let total=0; const parts=[];
    const clean=expr.replace(/\s/g,'').toLowerCase();
    clean.split(/(?=[+-])/).filter(Boolean).forEach(tok=>{
      const sign=tok.startsWith('-')?-1:1, t=tok.replace(/^[+-]/,'');
      const m=t.match(/^(\d*)d(\d+)(?:kh(\d+))?$/);
      if(m){
        const n=parseInt(m[1])||1,d=parseInt(m[2]),kh=m[3]?parseInt(m[3]):n;
        const rs=Array.from({length:n},()=>Math.floor(Math.random()*d)+1).sort((a,b)=>b-a);
        const kept=rs.slice(0,kh); const sum=kept.reduce((s,r)=>s+r,0)*sign;
        total+=sum; parts.push(`${n}d${d}[${rs.join(',')}]${kh<n?`→top${kh}`:''}`);
      } else {
        const n=parseInt(t)*sign; if(!isNaN(n)){total+=n;parts.push(String(n));}
      }
    });
    return { resultado:String(total), texto:`= ${expr} → ${parts.join(' ')}` };
  } catch(e) { return { resultado:'⚠', texto:`Inválido: ${expr}` }; }
}

// ═══ MAPA ═══
function carregarMapa(url) {
  if (!url) { mapImg = null; renderAll(); return; }
  const img = new Image(); img.crossOrigin = 'anonymous';
  img.onload = () => { mapImg = img; renderAll(); };
  img.onerror = () => { mapImg = null; renderAll(); };
  img.src = url;
}

window.uploadMapa = async function(inp) {
  const file = inp.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async e => {
    const url = e.target.result;
    await salvarEstado({ mapUrl: url, animMapUrl: null });
    mostrarToast('✅ Mapa carregado!');
  };
  reader.readAsDataURL(file);
};

window.uploadMapaAnimado = async function(inp) {
  const file = inp.files[0]; if (!file) return;
  const type = file.type.startsWith('video') ? 'video' : 'gif';
  const reader = new FileReader();
  reader.onload = async e => {
    await sincronizarAnimMap(e.target.result, type);
    mostrarToast('✅ Mapa animado carregado!');
  };
  reader.readAsDataURL(file);
};

window.setMapaURL = async function() {
  const url = document.getElementById('map-url-input').value.trim(); if (!url) return;
  const isAnim = url.match(/\.(gif|mp4|webm)$/i);
  if (isAnim) await sincronizarAnimMap(url, url.match(/\.gif$/i)?'gif':'video');
  else await salvarEstado({ mapUrl: url, animMapUrl: null });
  mostrarToast('✅ Mapa aplicado!');
};

window.limparMapa = async function() {
  desativarMapaAnimado();
  await salvarEstado({ mapUrl: null, animMapUrl: null });
  mostrarToast('🗺 Mapa removido.');
};

// Mapa animado
let _animMapActive = false;
function ativarMapaAnimado(url, type) {
  const area = document.getElementById('tt-canvas-area');
  if (!_animMapActive || !mapVideoEl) {
    if (type === 'video') {
      mapVideoEl = document.createElement('video');
      mapVideoEl.autoplay = true; mapVideoEl.loop = true; mapVideoEl.muted = true; mapVideoEl.playsInline = true;
    } else {
      mapGifEl = document.createElement('img');
    }
    const el = mapVideoEl || mapGifEl;
    Object.assign(el.style, { position:'absolute', top:'0', left:'0', width:'100%', height:'100%', objectFit:'fill', zIndex:'1', pointerEvents:'none' });
    area.prepend(el);
    _animMapActive = true;
  }
  if (mapVideoEl) mapVideoEl.src = url;
  if (mapGifEl)   mapGifEl.src   = url;
  mapImg = null;
}
function desativarMapaAnimado() {
  if (mapVideoEl) { mapVideoEl.remove(); mapVideoEl = null; }
  if (mapGifEl)   { mapGifEl.remove();   mapGifEl   = null; }
  _animMapActive = false;
}
async function sincronizarAnimMap(url, type) {
  ativarMapaAnimado(url, type);
  await update(ref(rtdb, `tabletop/${campanhaId}/state`), { animMapUrl: url, animMapType: type||'gif', mapUrl: null });
}

// ═══ GRADE / ESTADO ═══
window.setGridType = async function(t) { gridType = t; await salvarEstado({ gridType: t }); renderAll(); };
window.setCellSize = async function(s) {
  cellSize = s;
  document.getElementById('grid-size-label').textContent = s;
  await salvarEstado({ cellSize: s }); renderAll();
};
window.setBoardSize = async function(cols, rows) {
  boardCols = cols; boardRows = rows;
  document.getElementById('board-cols-label').textContent = cols;
  document.getElementById('board-rows-label').textContent = rows;
  const elc = document.getElementById('board-cols'), elr = document.getElementById('board-rows');
  if (elc) elc.value = cols; if (elr) elr.value = rows;
  await salvarEstado({ boardCols: cols, boardRows: rows }); renderAll();
};

async function salvarEstado(data) {
  await update(ref(rtdb, `tabletop/${campanhaId}/state`), data);
}

// ═══ NÉVOA ═══
function cobrirCelula(cx, cy)  { fogCells[`${cx},${cy}`] = true;  renderAll(); }
function revelarCelula(cx, cy) { delete fogCells[`${cx},${cy}`];  renderAll(); }

async function sincronizarFog() {
  await set(ref(rtdb, `tabletop/${campanhaId}/fog`), fogCells);
}
window.cobrir_tudo = async function() {
  for (let x=0;x<boardCols;x++) for(let y=0;y<boardRows;y++) fogCells[`${x},${y}`]=true;
  renderAll(); await sincronizarFog();
};
window.revelar_tudo = async function() {
  fogCells = {}; renderAll(); await sincronizarFog();
};

// ═══ DESENHOS ═══
async function sincronizarDrawings() {
  const ref2 = ref(rtdb, `tabletop/${campanhaId}/drawings`);
  await set(ref2, {});
  for (const d of drawings) await push(ref2, d);
}

window.clearDrawings = async function() {
  drawings = []; drawFuture = [];
  await set(ref(rtdb, `tabletop/${campanhaId}/drawings`), {});
  renderDrawings();
  mostrarToast('🗑 Desenhos apagados.');
};
window.undoDrawing = async function() {
  if (!drawings.length) return;
  drawFuture.push(drawings.pop());
  await sincronizarDrawings(); renderDrawings(); mostrarToast('↩ Desfeito');
};
window.redoDrawing = async function() {
  if (!drawFuture.length) return;
  drawings.push(drawFuture.pop());
  await sincronizarDrawings(); renderDrawings(); mostrarToast('↪ Refeito');
};

// ═══ PING ═══
async function enviarPing(wx, wy) {
  mostrarPing(wx, wy, '#fdcb6e');
  const pingRef = push(ref(rtdb, `tabletop/${campanhaId}/pings`));
  await set(pingRef, { worldX:wx, worldY:wy, cor:'#fdcb6e', uid:currentUser.uid, ts:Date.now() });
  setTimeout(()=>remove(pingRef), 3000);
}

function mostrarPing(wx, wy, cor) {
  const layer = document.getElementById('tt-pings-layer');
  const sx = wx * camZoom + camX;
  const sy = wy * camZoom + camY;
  const el = document.createElement('div');
  el.className = 'ping-dot';
  el.style.cssText = `left:${sx}px;top:${sy}px;background:${cor};color:${cor};box-shadow:0 0 0 0 ${cor};`;
  layer.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

// ═══ ZOOM / PAN ═══
window.zoomIn  = () => { camZoom = Math.min(5, camZoom*1.2); renderAll(); renderDrawings(); };
window.zoomOut = () => { camZoom = Math.max(0.1, camZoom/1.2); renderAll(); renderDrawings(); };
window.resetView = () => {
  camZoom = 1;
  camX = (canvas.width  - boardWidth())  / 2;
  camY = (canvas.height - boardHeight()) / 2;
  renderAll(); renderDrawings();
};

// ═══ TOOLS ═══
window.setTool = function(tool) {
  activeTool = tool;
  document.querySelectorAll('.tool[id^="tool-"]').forEach(el => el.classList.remove('active'));
  document.getElementById('tool-'+tool)?.classList.add('active');
  const area = document.getElementById('tt-canvas-area');
  area.className = 'canvas-area';
  const cursorMap = { draw:'draw', eraser:'eraser', fog:'fog-mode', unfog:'fog-reveal', ping:'ping-mode', pan:'pan-mode', measure:'measure-mode' };
  if (cursorMap[tool]) area.classList.add(cursorMap[tool]);
};

// ═══ EXPORTAR ═══
window.exportarMapa = function() {
  const exp = document.createElement('canvas');
  exp.width = boardWidth(); exp.height = boardHeight();
  const ectx = exp.getContext('2d');
  if (mapImg) ectx.drawImage(mapImg, 0, 0, exp.width, exp.height);
  // Desenhar tokens
  const savedCamX=camX, savedCamY=camY, savedZoom=camZoom;
  camX=0; camY=0; camZoom=1;
  renderAll();
  ectx.drawImage(canvas,0,0);
  camX=savedCamX; camY=savedCamY; camZoom=savedZoom; renderAll();
  const link = document.createElement('a');
  link.download = 'mesa.png';
  link.href = exp.toDataURL();
  link.click();
  mostrarToast('📸 Mapa exportado!');
};

// ═══ SHARE ═══
window.shareScene = function() {
  const url = window.location.href;
  navigator.clipboard?.writeText(url).then(()=>mostrarToast('🔗 Link copiado!')) || mostrarToast('🔗 Copie a URL do navegador.');
};

// ═══ PANEL / PANES ═══
window.showPane = function(name) {
  document.querySelectorAll('.pane').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.ptab').forEach(t => t.classList.remove('active'));
  document.getElementById('pane-'+name)?.classList.add('active');
  document.getElementById('ptab-'+name)?.classList.add('active');
  if (name === 'map') _ntCarregarFichas();
  if (name === 'tokens') _ntCarregarFichas();
};
window.togglePanel = function() {
  document.getElementById('tt-panel').classList.toggle('collapsed');
};

// ═══ MODAIS ═══
window.openModal = function(id) {
  document.getElementById(id)?.classList.add('open');
  if (id === 'modal-add-token') _ntCarregarFichas();
};
window.closeModal = function(id) {
  document.getElementById(id)?.classList.remove('open');
  if (id === 'modal-add-token') limparFormToken();
};
document.querySelectorAll('.modal-bg').forEach(el => {
  el.addEventListener('click', e => {
    if (e.target === el) { el.classList.remove('open'); if(el.id==='modal-add-token') limparFormToken(); }
  });
});

// ═══ DADO 3D ═══
// Rotações finais para que a face "front" (translateZ) fique de frente
// O cubo tem face front em Z+, então rotX=0 rotY=0 = front visível
const DICE_FACE_ROTS = [
  { rx:  0,   ry:   0 },  // 1 → front
  { rx:  0,   ry: 180 },  // 2 → back
  { rx:  0,   ry:  90 },  // 3 → right
  { rx:  0,   ry: -90 },  // 4 → left
  { rx: -90,  ry:   0 },  // 5 → top
  { rx:  90,  ry:   0 },  // 6 → bottom
];

let _diceCloseTimer = null;

function mostrarDado3D(sides, result) {
  const overlay = document.getElementById('dice-overlay');
  const cube    = document.getElementById('dice-cube');
  const label   = document.getElementById('dice-result-label');

  // Gera valores aleatórios para as 6 faces do cubo (sem repetir)
  const faceValues = gerarFacesDado(sides, result);

  // Preenche as faces
  const faces = ['front','back','right','left','top','bottom'];
  faces.forEach((f, i) => {
    const el = document.getElementById(`dice-${f}`);
    el.innerHTML = `<span>${faceValues[i]}</span><span class="face-label">d${sides}</span>`;
  });

  // Escolhe em qual das 6 rotações a face com resultado vai aparecer
  // → resultado está na posição 0 (front), então usamos rot[0] + voltas extras
  const baseRot = DICE_FACE_ROTS[0]; // front
  const extraX  = (Math.floor(Math.random()*3)+2) * 360;
  const extraY  = (Math.floor(Math.random()*3)+2) * 360;
  const rz      = (Math.floor(Math.random()*4)) * 90;

  const rxEnd = baseRot.rx + extraX;
  const ryEnd = baseRot.ry + extraY;

  cube.style.setProperty('--rx-end', rxEnd + 'deg');
  cube.style.setProperty('--ry-end', ryEnd + 'deg');
  cube.style.setProperty('--rz-end', rz + 'deg');

  // Reseta e mostra
  cube.classList.remove('rolling');
  label.classList.remove('show');
  label.textContent = `🎲 d${sides} → ${result}`;
  overlay.classList.add('show');

  void cube.offsetWidth; // força reflow para reiniciar animação
  cube.classList.add('rolling');

  clearTimeout(_diceCloseTimer);
  // Mostra label de resultado após animação
  setTimeout(() => label.classList.add('show'), 880);
  // Fecha automaticamente após 3.5s
  _diceCloseTimer = setTimeout(fecharDado, 3500);
}

function gerarFacesDado(sides, resultadoFront) {
  // Face 0 = front = resultado real
  const vals = [resultadoFront];
  const used = new Set([resultadoFront]);
  for (let i = 1; i < 6; i++) {
    let v;
    let tries = 0;
    do {
      v = Math.floor(Math.random() * sides) + 1;
      tries++;
    } while (used.has(v) && tries < 20);
    used.add(v);
    vals.push(v);
  }
  return vals;
}

window.fecharDado = function() {
  clearTimeout(_diceCloseTimer);
  const overlay = document.getElementById('dice-overlay');
  const label   = document.getElementById('dice-result-label');
  overlay.classList.remove('show');
  label.classList.remove('show');
};

// ═══ TOAST ═══
window.mostrarToast = function(msg) {
  const el = document.getElementById('tt-toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(()=>el.classList.remove('show'), 2500);
};

// ═══ TEMA ═══
function aplicarTema() {
  const t = localStorage.getItem('ficha_tema') || 'medo';
  document.documentElement.setAttribute('data-tema', t);
}

// ═══ TECLADO ═══
function setupKeyboard() {
  document.addEventListener('keydown', e => {
    if (['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)) return;
    switch(e.key.toLowerCase()) {
      case 'v': setTool('select'); break;
      case 'h': setTool('pan'); break;
      case 'd': setTool('draw'); break;
      case 'e': setTool('eraser'); break;
      case 't': setTool('text'); break;
      case 'm': setTool('measure'); break;
      case 'p': setTool('ping'); break;
      case 'f': if(isMestre) setTool('fog'); break;
      case 'r': if(isMestre) setTool('unfog'); break;
      case '+': case '=': zoomIn(); break;
      case '-': zoomOut(); break;
      case '0': resetView(); break;
      case 'escape':
        document.querySelectorAll('.modal-bg.open').forEach(m=>m.classList.remove('open'));
        document.getElementById('ctx-menu').style.display='none';
        document.getElementById('hp-quick').style.display='none';
        document.getElementById('ficha-overlay').classList.remove('open');
        setTool('select');
        break;
    }
    // Arrow pan
    const step = 40;
    if (e.key==='ArrowLeft')  { camX += step; renderAll(); renderDrawings(); }
    if (e.key==='ArrowRight') { camX -= step; renderAll(); renderDrawings(); }
    if (e.key==='ArrowUp')    { camY += step; renderAll(); renderDrawings(); }
    if (e.key==='ArrowDown')  { camY -= step; renderAll(); renderDrawings(); }
    if (e.ctrlKey && e.key==='z') { e.preventDefault(); undoDrawing(); }
    if (e.ctrlKey && e.key==='y') { e.preventDefault(); redoDrawing(); }
  });
}

// Garante que o canvas começa centralizado
window.addEventListener('load', () => {
  setTimeout(() => {
    camX = (canvas.width  - boardWidth())  / 2;
    camY = (canvas.height - boardHeight()) / 2;
    renderAll();
  }, 300);
});

