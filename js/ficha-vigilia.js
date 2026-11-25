/* Ficha Vigília — ficha completa + visão Tablet */
(function () {
    const V = window.VG, $ = id => document.getElementById(id), esc = V.esc;
    const params = new URLSearchParams(location.search);
    const npc = params.get('tipo') === 'npc';
    const usuario = () => sessionStorage.getItem('ficha_user') || localStorage.getItem('ficha_user_ativo') || '';
    const prefix = () => (usuario() ? usuario() + '_' : '');
    const chave = () => prefix() + (npc ? 'lista_npcs' : 'lista_agentes');
    const node = npc ? 'npcs' : 'agentes';
    let ficha = null, editId = null, editar = false, aba = 'hab', busca = '', habEdit = -1, tmr = null;
    $('lnk-voltar').href = npc ? 'index.html?view=agentes&sub=npcs' : 'index.html?view=agentes';

    // ── carregar / salvar ───────────────────────────────────────
    async function carregar() {
        const id = params.get('id');
        const lista = JSON.parse(localStorage.getItem(chave()) || '[]');
        let f = id ? lista.find(a => String(a.id) === String(id)) : lista[lista.length - 1];
        if (!f && id) {
            for (let i = 0; i < 30 && !(window._firebaseGet && usuario()); i++) await new Promise(r => setTimeout(r, 100));
            try {
                const snap = await window._firebaseGet(window._firebaseRef(window._firebaseDB, `${node}/${usuario()}/${id}`));
                if (snap.exists()) { f = snap.val(); lista.push(f); localStorage.setItem(chave(), JSON.stringify(lista)); }
            } catch (e) { console.warn(e); }
        }
        if (!f) { $('sheet').innerHTML = '<p class="empty" style="grid-column:1/-1">Agente não encontrado.</p>'; return; }
        const base = V.novaFicha();
        ficha = Object.assign({}, base, f);
        ficha.atributos = Object.assign(base.atributos, f.atributos || {});
        ficha.pericias = Object.assign(base.pericias, f.pericias || {});
        ficha.aptidoes = f.aptidoes || {}; ficha.habilidades = f.habilidades || [];
        ficha.pv = Object.assign({ atual: 10, max: 10 }, f.pv); ficha.pd = Object.assign({ atual: 16, max: 16 }, f.pd);
        ficha.dt = Object.assign({ pv: 7, pd: 7 }, f.dt);
        ficha.ev = Object.assign({ bonus: [0, 0], passos: 0, pavor: 6, pavorOn: false, pavorBonus: false }, f.ev);
        document.title = `${ficha.nome} · Vigília — F.I.C.H.A.`;
        render();
    }
    function salvar() {
        clearTimeout(tmr);
        tmr = setTimeout(async () => {
            const lista = JSON.parse(localStorage.getItem(chave()) || '[]');
            const i = lista.findIndex(a => String(a.id) === String(ficha.id));
            if (i >= 0) lista[i] = ficha; else lista.push(ficha);
            localStorage.setItem(chave(), JSON.stringify(lista));
            if (window._firebaseDB && window._firebaseSet && usuario()) {
                try { await window._firebaseSet(window._firebaseRef(window._firebaseDB, `${node}/${usuario()}/${ficha.id}`), ficha); } catch (e) { console.warn(e); }
            }
        }, 500);
    }

    // ── rolagem ─────────────────────────────────────────────────
    function rolar(titulo, dadoAttr, dadoPer) {
        const ev = ficha.ev, partes = [], dadosRolados = [];
        const add = (rot, n) => { const v = V.rolar(n); partes.push(`${rot} d${n}: ${v}`); dadosRolados.push(v); return v; };
        let soma = 0;
        if (dadoAttr) soma += add('Atributo', dadoAttr);
        if (dadoPer) soma += add('Perícia', V.passo(dadoPer, ev.passos));
        ev.bonus.forEach(b => { if (b) soma += add('Bônus', b); });
        let pavorTxt = '';
        if (ev.pavorOn) { const p = V.rolar(ev.pavor); if (ev.pavorBonus) { soma += p; dadosRolados.push(p); partes.push(`Pavor d${ev.pavor}: ${p}`); } else pavorTxt = ` · Pavor d${ev.pavor}: ${p}`; }
        const ra = Math.max(...dadosRolados), rb = Math.min(...dadosRolados);
        const el = document.createElement('div'); el.className = 'rl';
        const cont = {}; dadosRolados.forEach(v => cont[v] = (cont[v] || 0) + 1);
        const critOk = Object.keys(cont).some(v => cont[v] >= 2 && +v >= 6);
        const critFalha = dadosRolados.length > 0 && dadosRolados.every(v => v === 1);
        const DT = 7;
        const res = critFalha ? '<b style="color:#ff4d6d">FALHA CRÍTICA</b>' : critOk ? '<b style="color:#4dff9a">SUCESSO CRÍTICO</b>' : (soma >= DT ? `<b style="color:#4dff9a">Sucesso</b> (DT ${DT})` : `<b style="color:#ff4d6d">Falha</b> (DT ${DT})`);
        el.innerHTML = `<h5>${esc(titulo)}</h5><div class="tt">${soma}</div><p>${res}</p><p>${partes.join(' · ')}</p><p>RA ${ra} · RB ${rb}${pavorTxt}</p>`;
        $('roll').appendChild(el);
        while ($('roll').children.length > 4) $('roll').firstChild.remove();
        setTimeout(() => el.remove(), 9000);
    }

    // ── render da ficha ─────────────────────────────────────────
    function linhasPericias() {
        const rows = [];
        V.PERICIAS.forEach(p => {
            if (p.id === 'aptidao') {
                const ks = Object.keys(ficha.aptidoes);
                if (!ks.length) rows.push({ k: 'p:aptidao', nome: 'Aptidão', attr: 'mente', d: ficha.pericias.aptidao });
                ks.forEach(k => rows.push({ k: 'a:' + k, nome: `Aptidão (${k})`, attr: 'mente', d: ficha.aptidoes[k], sub: true }));
            } else rows.push({ k: 'p:' + p.id, nome: p.nome, attr: p.attr, d: ficha.pericias[p.id] });
        });
        return rows;
    }
    const PERFIL_COR = { Executor: '#d9461f', Analista: '#2f8f9a', Vigilante: '#8a6bd1' };
    const PEN = '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
    const HEART = '<svg viewBox="0 0 24 24"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M7 9.5c1-1.5 2.5-2 4-1.5M12 21V12M12 12l4-2.5"/></svg>';
    const BRAIN = '<svg viewBox="0 0 24 24"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/><path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/><path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/><path d="M3.477 10.896a4 4 0 0 1 .585-.396"/><path d="M19.938 10.5a4 4 0 0 1 .585.396"/><path d="M6 18a4 4 0 0 1-1.967-.516"/><path d="M19.967 17.484A4 4 0 0 1 18 18"/></svg>';
    function linhaEd(id, rotulo, valor, inputHtml) {
        if (editId === id) return `<div class="row ed">${inputHtml}</div>`;
        return `<div class="row">${rotulo}<button class="pen" data-pen="${id}" title="Editar" aria-label="Editar">${PEN}</button></div>`;
    }
    function render() {
        const f = ficha, ev = f.ev;
        const pct = o => Math.max(0, Math.min(100, (o.atual / (o.max || 1)) * 100));
        const habs = f.habilidades.map((h, i) => ({ h, i })).filter(x => !busca || (x.h.nome + x.h.desc).toLowerCase().includes(busca));
        const per = linhasPericias().map(r => `
            <div class="pr" data-k="${esc(r.k)}"><span class="${r.sub ? 'apt-sub' : ''}">${esc(r.nome)}</span>
                <span class="edt"><button data-d="-1">−</button><button data-d="1">+</button></span>
                <span class="plus">▲+</span>${V.die(r.d)}<span class="vg-die d${f.atributos[r.attr]} at-die" title="Dado do atributo"><b>${f.atributos[r.attr]}</b></span>
                <span class="tg">${V.attrInfo(r.attr).nome}</span></div>`).join('');
        const slot = i => `<button class="slot" data-slot="${i}" title="Clique para trocar o dado">${ev.bonus[i] ? V.die(ev.bonus[i]) : '✕'}</button>`;
        const cor = PERFIL_COR[f.perfil] || '#d9461f';
        $('sheet').className = 'vg-sheet' + (editar ? ' edit' : '');
        $('sheet').innerHTML = `
        <div class="col">
            <section class="pn">
                <div class="idc" style="--perfil:${cor}">
                    <div class="ph" data-foto="1" role="button" tabindex="0" title="Trocar foto" style="${f.avatar ? `background-image:url(${f.avatar})` : ''}"><span>${f.avatar ? 'TROCAR<br>FOTO' : 'ADICIONAR<br>FOTO'}</span></div>
                    <div class="info">
                        ${editId === 'nome' ? `<div class="row ed"><input id="ed-nome" maxlength="40" value="${esc(f.nome)}"></div>`
                            : `<div class="row"><div class="nm">${esc(f.nome)}${f.codinome ? ` <span style="opacity:.55;font-weight:400">"${esc(f.codinome)}"</span>` : ''}</div><button class="pen" data-pen="nome" title="Editar nome" aria-label="Editar nome">${PEN}</button></div>`}
                        ${linhaEd('perfil', `<span class="tag">${esc(f.perfil || 'Perfil')}</span><span style="flex:1"></span>`, f.perfil,
                            `<select id="ed-perfil">${Object.keys(V.PERFIS).map(p => `<option ${f.perfil === p ? 'selected' : ''}>${p}</option>`).join('')}</select>`)}
                        ${linhaEd('ocup', `<span class="tx">${esc(f.ocupacao || 'Ocupação')}</span>`, f.ocupacao,
                            `<input id="ed-ocup" maxlength="40" placeholder="Ocupação" value="${esc(f.ocupacao)}">`)}
                        ${linhaEd('nivel', `<span class="lbl nv">Nível <b>${f.nivel}</b></span><span style="flex:1"></span>`, f.nivel,
                            `<select id="ed-nivel">${Array.from({ length: 10 }, (_, i) => `<option value="${i + 1}" ${f.nivel === i + 1 ? 'selected' : ''}>Nível ${i + 1}</option>`).join('')}</select>`)}
                    </div>
                </div>
            </section>
            <section class="pn">
                <div class="pn-h">ATRIBUTOS</div>
                <div class="attrs">${V.ATRIBUTOS.map(a => `
                    <div class="at" data-at="${a.id}"><h4>${a.nome.toUpperCase()}</h4><span data-roll="${a.id}" title="Rolar ${a.nome}">${V.die(f.atributos[a.id])}</span>
                        <div class="ct"><button data-d="-1">−</button><button data-d="1">+</button></div></div>`).join('')}</div>
                <div class="bars">
                    <div class="bar"><div class="ic">${HEART}</div>
                        <div class="dt"><button data-dt="pv:-1">−</button><b>DT ${String(f.dt.pv).padStart(2, '0')}</b><button data-dt="pv:1">+</button></div>
                        <div class="bd"><div class="fill" style="width:${pct(f.pv)}%"></div><button data-pv="-1">‹</button><span class="val" data-edit="pv">PV&nbsp; ${f.pv.atual}<small>/${f.pv.max}</small></span><button data-pv="1">›</button></div></div>
                    <div class="bar"><div class="ic">${BRAIN}</div>
                        <div class="dt"><button data-dt="pd:-1">−</button><b>DT ${String(f.dt.pd).padStart(2, '0')}</b><button data-dt="pd:1">+</button></div>
                        <div class="bd"><div class="fill" style="width:${pct(f.pd)}%"></div><button data-pd="-1">‹</button><span class="val" data-edit="pd">PD&nbsp; ${f.pd.atual}<small>/${f.pd.max}</small></span><button data-pd="1">›</button></div></div>
                </div>
            </section>
        </div>
        <div class="col">
            <section class="pn">
                <div class="pn-h">MODIFICADORES</div>
                <div class="mods">
                    <div><span class="lab">Dados Bônus</span><div class="slots">${slot(0)}<span>+</span>${slot(1)}</div></div>
                    <div><span class="lab">Passos das Perícias</span><span class="stp"><button data-ps="-1">−</button><b>${ev.passos}</b><button data-ps="1">+</button></span></div>
                    <div><span class="lab">Dado de Pavor</span><span class="stp"><button data-pv2="-1">−</button><b>${ev.pavor}</b><button data-pv2="1">+</button></span></div>
                    <div><label class="chk"><input type="checkbox" id="pv-on" ${ev.pavorOn ? 'checked' : ''}>Ativar Dado de Pavor</label><label class="chk"><input type="checkbox" id="pv-bonus" ${ev.pavorBonus ? 'checked' : ''}>Usar como Bônus</label></div>
                </div>
            </section>
            <section class="pn">
                <div class="pn-h">PERÍCIAS <button class="mini ${editar ? 'on' : ''}" id="btn-editar">EDITAR DADOS</button></div>
                <div class="per" id="per">${per}</div>
            </section>
        </div>
        <div class="col">
            <section class="pn">
                <div class="pn-h"><div class="tabs"><button class="${aba === 'hab' ? 'on' : ''}" data-aba="hab">HABILIDADES</button><button class="${aba === 'eq' ? 'on' : ''}" data-aba="eq">EQUIPAMENTOS</button></div>
                    ${aba === 'hab' ? '<button class="mini" id="btn-add-hab" title="Nova habilidade">＋</button>' : ''}</div>
                ${aba === 'hab' ? `
                    <input class="srch" id="busca" placeholder="Buscar habilidade…" value="${esc(busca)}">
                    <div class="arm"><span>Pontos de Armadura</span><span class="stp" style="gap:6px"><button style="width:36px;height:30px" data-ar="-1">−</button><b style="min-width:36px;font-size:1.1rem;padding:4px 0">${f.armadura}</b><button style="width:36px;height:30px" data-ar="1">+</button></span></div>
                    ${habs.length ? habs.map(x => `
                        <div class="hb" data-h="${x.i}"><div class="hb-h"><span>${esc(x.h.nome)}</span><small>${esc(x.h.tipo)}</small></div>
                            <div class="hb-b">${esc(x.h.desc) || '—'}<div class="acts"><button class="vg-btn ghost" data-hedit="${x.i}">Editar</button><button class="vg-btn ghost" data-hdel="${x.i}">Remover</button></div></div></div>`).join('') : '<p class="empty">▸ NENHUMA HABILIDADE.</p>'}`
                : `<textarea class="eqp" id="eqp" placeholder="Equipamentos, um por linha">${esc(f.equipamentos)}</textarea>`}
            </section>
        </div>`;
        if (editId) { const el = $('ed-' + editId); if (el) { el.focus(); if (el.select) el.select(); } }
    }

    // ── eventos (delegação) ─────────────────────────────────────
    $('sheet').addEventListener('click', e => {
        const t = e.target, f = ficha;
        const at = t.closest('.at');
        if (t.closest('.ct button')) { f.atributos[at.dataset.at] = V.passo(f.atributos[at.dataset.at], +t.dataset.d); salvar(); return render(); }
        if (t.closest('[data-roll]')) { const id = t.closest('[data-roll]').dataset.roll; return rolar(V.attrInfo(id).nome, f.atributos[id], 0); }
        if (t.dataset.pv) { f.pv.atual = Math.max(0, Math.min(f.pv.max, f.pv.atual + +t.dataset.pv)); salvar(); return render(); }
        if (t.dataset.pd) { f.pd.atual = Math.max(0, Math.min(f.pd.max, f.pd.atual + +t.dataset.pd)); salvar(); return render(); }
        if (t.dataset.edit) {
            const o = f[t.dataset.edit], n = prompt(`${t.dataset.edit.toUpperCase()} máximo:`, o.max);
            if (n !== null && +n > 0) { o.max = Math.floor(+n); o.atual = Math.min(o.atual, o.max); salvar(); render(); } return;
        }
        if (t.closest('[data-foto]')) return $('foto-input').click();
        const pen = t.closest('[data-pen]'); if (pen) { editId = pen.dataset.pen; return render(); }
        if (t.dataset.dt) { const [k, d] = t.dataset.dt.split(':'); f.dt[k] = Math.max(0, f.dt[k] + +d); salvar(); return render(); }
        const sl = t.closest('[data-slot]'); if (sl) { const c = [0, 4, 6, 8, 10, 12], i = +sl.dataset.slot; f.ev.bonus[i] = c[(c.indexOf(f.ev.bonus[i]) + 1) % c.length]; salvar(); return render(); }
        if (t.dataset.ps) { f.ev.passos = Math.max(-4, Math.min(4, f.ev.passos + +t.dataset.ps)); salvar(); return render(); }
        if (t.dataset.pv2) { f.ev.pavor = V.passo(f.ev.pavor, +t.dataset.pv2); salvar(); return render(); }
        if (t.dataset.ar) { f.armadura = Math.max(0, f.armadura + +t.dataset.ar); salvar(); return render(); }
        if (t.id === 'btn-editar') { editar = !editar; return render(); }
        if (t.dataset.aba) { aba = t.dataset.aba; return render(); }
        if (t.id === 'btn-add-hab') return abrirHab(-1);
        if (t.dataset.hedit) return abrirHab(+t.dataset.hedit);
        if (t.dataset.hdel) { if (confirm('Remover esta habilidade?')) { f.habilidades.splice(+t.dataset.hdel, 1); salvar(); render(); } return; }
        const hb = t.closest('.hb-h'); if (hb) return hb.parentNode.classList.toggle('open');
        const pr = t.closest('.pr');
        if (pr) {
            const [tipo, id] = [pr.dataset.k.slice(0, 1), pr.dataset.k.slice(2)];
            const mapa = tipo === 'a' ? f.aptidoes : f.pericias;
            if (t.closest('.edt button')) { mapa[id] = V.passo(mapa[id], +t.dataset.d); salvar(); return render(); }
            const nome = tipo === 'a' ? `Aptidão (${id})` : V.PERICIAS.find(p => p.id === id).nome;
            const attr = tipo === 'a' ? 'mente' : V.PERICIAS.find(p => p.id === id).attr;
            return rolar(nome, f.atributos[attr], mapa[id]);
        }
    });
    function confirmarEd() {
        if (!editId) return; const f = ficha, v = $('ed-' + editId) ? $('ed-' + editId).value.trim() : null;
        if (v !== null) {
            if (editId === 'nome' && v) f.nome = v;
            if (editId === 'perfil' && v) { f.perfil = v; f.classe = v; }
            if (editId === 'ocup') { f.ocupacao = v; f.origem = v || 'Vigília'; }
            if (editId === 'nivel') f.nivel = Math.max(1, Math.min(10, +v || 1));
            if (editId === 'nome' && v) document.title = `${f.nome} · Vigília — F.I.C.H.A.`;
        }
        editId = null; salvar(); render();
    }
    $('sheet').addEventListener('focusout', e => { if (e.target.id && e.target.id.startsWith('ed-')) setTimeout(() => { if (editId && !document.activeElement.id.startsWith('ed-')) confirmarEd(); }, 0); });
    $('sheet').addEventListener('keydown', e => { if (e.target.id && e.target.id.startsWith('ed-')) { if (e.key === 'Enter') { e.preventDefault(); confirmarEd(); } if (e.key === 'Escape') { editId = null; render(); } } });
    $('sheet').addEventListener('change', e => {
        const t = e.target, f = ficha;
        if (t.tagName === 'SELECT' && t.id.startsWith('ed-')) return confirmarEd();
        if (t.dataset.b !== undefined) { f.ev.bonus[+t.dataset.b] = +t.value; salvar(); }
        if (t.id === 'pv-on') { f.ev.pavorOn = t.checked; salvar(); }
        if (t.id === 'pv-bonus') { f.ev.pavorBonus = t.checked; salvar(); }
    });
    $('sheet').addEventListener('input', e => {
        if (e.target.id === 'busca') { busca = e.target.value.toLowerCase(); const p = e.target.selectionStart; render(); const b = $('busca'); b.focus(); b.setSelectionRange(p, p); }
        if (e.target.id === 'eqp') { ficha.equipamentos = e.target.value; salvar(); }
    });

    // troca de foto
    $('foto-input').addEventListener('change', e => {
        const file = e.target.files[0]; e.target.value = ''; if (!file || !ficha) return;
        const r = new FileReader();
        r.onload = () => {
            if (file.type === 'image/gif' && file.size < 900 * 1024) { ficha.avatar = r.result; salvar(); return render(); }
            const img = new Image();
            img.onload = () => {
                const k = Math.min(1, 640 / Math.max(img.width, img.height)), c = document.createElement('canvas');
                c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
                c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                ficha.avatar = c.toDataURL('image/jpeg', 0.84); salvar(); render();
            };
            img.onerror = () => alert('Não foi possível ler essa imagem.');
            img.src = r.result;
        };
        r.readAsDataURL(file);
    });
    $('sheet').addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset && e.target.dataset.foto) { e.preventDefault(); $('foto-input').click(); } });

    // modal de habilidade
    function abrirHab(i) {
        habEdit = i; const h = i >= 0 ? ficha.habilidades[i] : { nome: '', tipo: 'Ação', desc: '' };
        $('mh-titulo').textContent = i >= 0 ? 'Editar habilidade' : 'Nova habilidade';
        $('mh-nome').value = h.nome; $('mh-tipo').value = h.tipo; $('mh-desc').value = h.desc;
        $('modal-hab').classList.add('show'); $('mh-nome').focus();
    }
    $('mh-cancel').onclick = () => $('modal-hab').classList.remove('show');
    $('mh-ok').onclick = () => {
        const h = { nome: $('mh-nome').value.trim(), tipo: $('mh-tipo').value, desc: $('mh-desc').value };
        if (!h.nome) return $('mh-nome').focus();
        if (habEdit >= 0) ficha.habilidades[habEdit] = h; else ficha.habilidades.push(h);
        $('modal-hab').classList.remove('show'); salvar(); render();
    };

    // ── Visão Tablet ────────────────────────────────────────────
    function tablet() {
        const f = ficha;
        const rows = linhasPericias(), meio = Math.ceil(rows.length / 2);
        const col = rs => `<div class="cl">${rs.map(r => `<div class="rw"><span>${esc(r.nome)}</span>${V.die(r.d)}</div>`).join('')}</div>`;
        const longo = (f.nome || '').length > 6;
        $('tb-stage').innerHTML = `
            ${f.avatar ? `<div class="tb-ph" style="background-image:url(${f.avatar})"></div>`
                       : `<div class="tb-ph none"><svg viewBox="0 0 100 120"><circle cx="50" cy="34" r="22"/><path d="M8 118c0-30 18-46 42-46s42 16 42 46z"/></svg></div>`}
            <div class="tb-nome ${longo ? 'long' : ''}">${esc(f.nome)}</div>
            <div class="tb-meta"><span>Nível ${f.nivel}</span><span class="hl">${esc(f.perfil || '—')}</span><span>${esc(f.ocupacao || '')}</span></div>
            <div class="tb-atrs">${V.ATRIBUTOS.map(a => `<div><span>${a.nome}</span>${V.die(f.atributos[a.id])}</div>`).join('')}</div>
            <div class="tb-per">${col(rows.slice(0, meio))}${col(rows.slice(meio))}</div>
            <div class="tb-hab">${f.habilidades.slice(0, 5).map(h => `
                <div class="tb-hb"><div class="t"><span>${esc(h.nome)}</span><small>${esc(h.tipo).toUpperCase()}</small></div><div class="d">${esc(h.desc)}</div></div>`).join('')}</div>
            <div class="tb-logo"><img src="assets/img/ui/selo-nao-oficial.png" alt="Projeto não oficial"><span>F.I.C.H.A.</span></div>`;
        $('tb').classList.add('show'); document.body.style.overflow = 'hidden';
    }
    function fechar() { $('tb').classList.remove('show'); document.body.style.overflow = ''; if (document.fullscreenElement) document.exitFullscreen(); }
    // Portrait "Vigilante" (overlay para OBS)
    function urlPortrait() {
        const u = new URL('portrait-vigilante.html', location.href);
        u.searchParams.set('id', ficha.id); if (usuario()) u.searchParams.set('usuario', usuario()); if (npc) u.searchParams.set('tipo', 'npc');
        return u.href;
    }
    $('btn-portrait').onclick = () => { if (!ficha) return; $('mp-url').value = urlPortrait(); $('modal-portrait').classList.add('show'); };
    $('mp-fechar').onclick = () => $('modal-portrait').classList.remove('show');
    $('mp-abrir').onclick = () => window.open(urlPortrait(), '_blank');
    $('mp-copiar').onclick = () => { $('mp-url').select(); (navigator.clipboard ? navigator.clipboard.writeText($('mp-url').value) : Promise.resolve(document.execCommand('copy'))).then(() => { $('mp-copiar').textContent = 'Copiado ✓'; setTimeout(() => $('mp-copiar').textContent = 'Copiar link', 1600); }); };
    $('btn-tablet').onclick = () => ficha && tablet();
    $('tb-close').onclick = fechar;
    $('tb-full').onclick = () => { const el = $('tb'); document.fullscreenElement ? document.exitFullscreen() : el.requestFullscreen && el.requestFullscreen().then(() => { try { screen.orientation.lock('landscape').catch(() => {}); } catch (e) {} }).catch(() => {}); };
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('tb').classList.contains('show') && !document.fullscreenElement) fechar(); });

    carregar().then(() => { if (params.get('tablet') === '1' && ficha) tablet(); });
})();
