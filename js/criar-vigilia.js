/* Criação de ficha — sistema Vigília (Ordem Paranormal RPG 2 · Playtest Alpha) */
window.VGC = (function () {
    const V = window.VG, $ = id => document.getElementById(id);
    const NOMES = ['Identidade', 'Atributos', 'Perícias', 'Habilidades'];
    const f = V.novaFicha();
    let etapa = 0, ativo = false;

    // ── modo: 'sel' | 'op' | 'vg' ───────────────────────────────
    function modo(m) {
        $('sis-select').style.display = m === 'sel' ? '' : 'none';
        $('stepper').style.display    = m === 'op'  ? '' : 'none';
        $('op-app').style.display     = m === 'op'  ? '' : 'none';
        $('vg-stepper').style.display = m === 'vg'  ? '' : 'none';
        $('vg-app').style.display     = m === 'vg'  ? '' : 'none';
        window._vgSistema = (m === 'vg');
        ativo = (m === 'vg');
        const sub = $('criacao-sub');
        if (m === 'vg') sub.textContent = 'SISTEMA VIGÍLIA · ORDEM PARANORMAL RPG 2 (PLAYTEST ALPHA). TRÊS ATRIBUTOS, DADOS EM CADEIA.';
        else if (m === 'sel') sub.textContent = 'ESCOLHA O SISTEMA E PREENCHA AS INFORMAÇÕES DO NOVO AGENTE. O MEDO É REAL.';
        window.scrollTo(0, 0);
    }

    // ── render ──────────────────────────────────────────────────
    function dadoCtl(valor, onDown, onUp) {
        return `<div class="vg-dado-ctl"><button type="button" class="atributo-btn" data-act="${onDown}" aria-label="Diminuir dado">−</button>${V.die(valor)}<button type="button" class="atributo-btn" data-act="${onUp}" aria-label="Aumentar dado">+</button></div>`;
    }
    function renderPerfis() {
        $('vg-perfis').innerHTML = Object.entries(V.PERFIS).map(([n, d]) =>
            `<div class="classe-card vg-perfil ${f.perfil === n ? 'selected' : ''}" data-perfil="${n}"><div class="classe-nome">${n.toUpperCase()}</div><div class="classe-desc">${d}</div>${V.PERFIL_HAB[n] ? `<div class="classe-desc vg-esc">Habilidade: ${V.PERFIL_HAB[n].nome}</div>` : ''}</div>`).join('');
    }
    function renderAttrs() {
        $('vg-attrs').innerHTML = V.ATRIBUTOS.map(a => `
            <div class="atributo-box vg-attr" data-attr="${a.id}">
                <div class="atributo-abrev">${a.nome.slice(0, 3).toUpperCase()}</div>
                <div class="atributo-nome">${a.nome.toUpperCase()}</div>
                <div class="vg-attr-die">${V.die(f.atributos[a.id])}</div><span class="vg-esc">${V.ESCALA_ATTR[f.atributos[a.id]]}</span>
                <div class="atributo-controles"><button type="button" class="atributo-btn" data-d="-1">−</button><button type="button" class="atributo-btn" data-d="1">+</button></div>
                <p class="vg-attr-desc">${a.desc}</p>
            </div>`).join('');
    }
    function renderPericias() {
        const tag = id => V.attrInfo(id).nome.toUpperCase();
        let h = '';
        V.PERICIAS.forEach(p => {
            h += `<div class="pericia-item vg-per" data-per="${p.id}"><span class="pericia-nome">${p.nome}</span><span class="pericia-atrib">${tag(p.attr)}</span>
                <span class="vg-esc">${V.ESCALA_PER[f.pericias[p.id]]}</span><span class="vg-per-ctl"><button type="button" class="atributo-btn" data-d="-1">−</button>${V.die(f.pericias[p.id])}<button type="button" class="atributo-btn" data-d="1">+</button></span></div>`;
            if (p.id === 'aptidao') {
                Object.keys(f.aptidoes).forEach(k => {
                    h += `<div class="pericia-item vg-per vg-apt" data-apt="${k}"><span class="pericia-nome">↳ Aptidão (${k})</span><span class="pericia-atrib">MENTE</span>
                        <span class="vg-esc">${V.ESCALA_PER[f.aptidoes[k]]}</span><span class="vg-per-ctl"><button type="button" class="atributo-btn" data-d="-1">−</button>${V.die(f.aptidoes[k])}<button type="button" class="atributo-btn" data-d="1">+</button><button type="button" class="atributo-btn" data-rm="1" title="Remover">✕</button></span></div>`;
                });
                const livres = V.APTIDOES.filter(x => !(x in f.aptidoes));
                if (livres.length) h += `<div class="pericia-item vg-apt-add"><select class="form-select" id="vg-apt-sel">${livres.map(x => `<option>${x}</option>`).join('')}</select><button type="button" class="btn-nav" id="vg-apt-add" style="padding:8px 16px !important">+ ESPECIALIDADE</button></div>`;
            }
        });
        $('vg-pericias').innerHTML = h;
    }
    function renderHabs() {
        $('vg-habs').innerHTML = f.habilidades.length ? f.habilidades.map((h, i) => `
            <div class="habilidade-item vg-hab" data-i="${i}">
                <div class="row g-2">
                    <div class="col-md-7"><input class="form-control vg-hab-nome" placeholder="Nome da habilidade" value="${V.esc(h.nome)}"></div>
                    <div class="col-8 col-md-3"><select class="form-select vg-hab-tipo">${['Ação', 'Passiva', 'Reação'].map(t => `<option ${h.tipo === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
                    <div class="col-4 col-md-2"><button type="button" class="btn-nav vg-hab-rm" style="padding:10px 14px !important;width:100%">REMOVER</button></div>
                    <div class="col-12"><textarea class="form-control vg-hab-desc" rows="2" placeholder="Descrição">${V.esc(h.desc)}</textarea></div>
                </div>
            </div>`).join('') : '<p class="cr-vazio">▸ NENHUMA HABILIDADE. USE “+ HABILIDADE” PARA ADICIONAR AS DO SEU PERFIL.</p>';
    }
    function lerHabs() {
        const els = document.querySelectorAll('#vg-habs .vg-hab');
        if (!els.length) return;
        f.habilidades = [...els].map(e => ({ nome: e.querySelector('.vg-hab-nome').value, tipo: e.querySelector('.vg-hab-tipo').value, desc: e.querySelector('.vg-hab-desc').value }));
    }
    // habilidades automáticas de perfil e ocupação (o jogador começa com duas)
    function sincAuto() {
        lerHabs();
        const oc = ($('vg-ocupacao').value || '').trim().toLowerCase();
        const ocKey = Object.keys(V.OCUPACOES).find(k => k.toLowerCase() === oc);
        const want = [V.PERFIL_HAB[f.perfil], ocKey && V.OCUPACOES[ocKey]].filter(Boolean);
        const todos = new Set([...Object.values(V.PERFIL_HAB), ...Object.values(V.OCUPACOES)].map(h => h.nome));
        f.habilidades = f.habilidades.filter(h => !todos.has(h.nome) || want.some(w => w.nome === h.nome));
        want.forEach(w => { if (!f.habilidades.some(h => h.nome === w.nome)) f.habilidades.unshift(Object.assign({}, w)); });
        renderHabs();
    }
    function addHab() { lerHabs(); f.habilidades.push({ nome: '', tipo: 'Ação', desc: '' }); renderHabs(); }

    // ── navegação ───────────────────────────────────────────────
    function ir(n) {
        if (n > etapa && !validar()) return;
        etapa = Math.max(0, Math.min(3, n));
        document.querySelectorAll('#vg-app .etapa-panel').forEach((p, i) => p.classList.toggle('active', i === etapa));
        document.querySelectorAll('#vg-stepper .step-item').forEach((s, i) => {
            s.classList.toggle('active', i === etapa); s.classList.toggle('done', i < etapa);
        });
        $('vg-contador').textContent = `ETAPA 0${etapa + 1} / 04`;
        $('vg-nome-etapa').textContent = NOMES[etapa];
        $('vg-anterior').style.display = etapa > 0 ? '' : 'none';
        $('vg-proximo').style.display = etapa < 3 ? '' : 'none';
        $('vg-finalizar').style.display = etapa === 3 ? '' : 'none';
        $('vg-app').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    function validar() {
        if (etapa !== 0) return true;
        const nome = $('vg-nome').value.trim();
        $('vg-nome').style.borderColor = nome ? '' : '#ff3355';
        $('vg-alerta-perfil').style.display = f.perfil ? 'none' : 'block';
        if (!nome) $('vg-nome').focus();
        return !!nome && !!f.perfil;
    }

    // ── retrato ─────────────────────────────────────────────────
    function setAvatar(src) {
        f.avatar = src || '';
        $('vg-avatar-prev').style.backgroundImage = src ? `url(${src})` : '';
        $('vg-avatar-prev').classList.toggle('has', !!src);
        $('vg-avatar-rm').style.display = src ? '' : 'none';
    }
    function lerArquivo(file) {
        if (!file) return;
        const r = new FileReader();
        r.onload = () => {
            const img = new Image();
            img.onload = () => {
                const k = Math.min(1, 640 / Math.max(img.width, img.height));
                const c = document.createElement('canvas'); c.width = img.width * k; c.height = img.height * k;
                c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                setAvatar(c.toDataURL('image/jpeg', 0.84));
            };
            img.src = r.result;
        };
        r.readAsDataURL(file);
    }

    // ── salvar ──────────────────────────────────────────────────
    async function finalizar() {
        lerHabs();
        const id = Date.now();
        const ficha = Object.assign({}, f, {
            id, nome: $('vg-nome').value.trim(), codinome: $('vg-codinome').value.trim(), idade: $('vg-idade').value,
            nivel: +$('vg-nivel').value, ocupacao: $('vg-ocupacao').value.trim(),
            pv: { atual: Math.max(1, +$('vg-pv').value || 10), max: Math.max(1, +$('vg-pv').value || 10) },
            pd: { atual: Math.max(1, +$('vg-pd').value || 16), max: Math.max(1, +$('vg-pd').value || 16) },
            armadura: Math.max(0, +$('vg-arm').value || 0),
            habilidades: f.habilidades.filter(h => h.nome.trim()),
            equipamentos: $('vg-equip').value, personalidade: $('vg-personalidade').value, vinculo: $('vg-vinculo').value, historia: $('vg-historia').value,
            tipoFicha: getTipoFicha(), criadoEm: new Date().toLocaleDateString('pt-BR'),
        });
        ficha.classe = ficha.perfil; ficha.origem = ficha.ocupacao || 'Vigília';

        const usuario = sessionStorage.getItem('ficha_user') || localStorage.getItem('ficha_user_ativo') || '';
        if (window._firebaseDB && window._firebaseSet && window._firebaseRef && usuario) {
            try { await window._firebaseSet(window._firebaseRef(window._firebaseDB, `${getFirebaseNode()}/${usuario}/${id}`), ficha); }
            catch (e) { console.warn('Firebase indisponível, usando cache local:', e); }
        }
        const chave = getPrefix() + getListaChave();
        const lista = JSON.parse(localStorage.getItem(chave)) || [];
        lista.push(ficha); localStorage.setItem(chave, JSON.stringify(lista));

        fichaIdCriada = id;
        $('modal-nome').textContent = ficha.nome + (ficha.codinome ? ` "${ficha.codinome}"` : '');
        $('modal-classe').textContent = `${ficha.perfil} • Nível ${ficha.nivel}` + (ficha.ocupacao ? ` • ${ficha.ocupacao}` : '');
        $('modal-titulo-sucesso').textContent = isFichaNpc() ? 'NPC Registrado' : 'Agente Registrado';
        $('btn-ver-agentes').textContent = isFichaNpc() ? 'VER NPCS' : 'VER AGENTES';
        $('modal-sucesso').classList.add('show');
    }

    // ── eventos ─────────────────────────────────────────────────
    function init() {
        $('vg-nivel').innerHTML = Array.from({ length: 10 }, (_, i) => `<option value="${i + 1}">Nível ${i + 1}</option>`).join('');
        renderPerfis(); renderAttrs(); renderPericias(); renderHabs();
        $('vg-ocupacao').setAttribute('list', 'vg-ocup-list');
        $('vg-ocupacao').insertAdjacentHTML('afterend', `<datalist id="vg-ocup-list">${Object.keys(V.OCUPACOES).map(o => `<option>${o}</option>`).join('')}</datalist>`);
        $('vg-ocupacao').addEventListener('change', sincAuto);

        document.querySelectorAll('.sis-card').forEach(b => b.addEventListener('click', () => modo(b.dataset.sis === 'vigilia' ? 'vg' : 'op')));
        $('vg-perfis').addEventListener('click', e => { const c = e.target.closest('[data-perfil]'); if (!c) return; f.perfil = c.dataset.perfil; renderPerfis(); sincAuto(); $('vg-alerta-perfil').style.display = 'none'; });
        $('vg-attrs').addEventListener('click', e => {
            const b = e.target.closest('[data-d]'); if (!b) return; const id = b.closest('[data-attr]').dataset.attr;
            f.atributos[id] = V.passo(f.atributos[id], +b.dataset.d); renderAttrs();
        });
        $('vg-pericias').addEventListener('click', e => {
            if (e.target.id === 'vg-apt-add') { f.aptidoes[$('vg-apt-sel').value] = 4; return renderPericias(); }
            const row = e.target.closest('.vg-per'); const b = e.target.closest('button'); if (!row || !b) return;
            if (row.dataset.apt) {
                if (b.dataset.rm) delete f.aptidoes[row.dataset.apt]; else f.aptidoes[row.dataset.apt] = V.passo(f.aptidoes[row.dataset.apt], +b.dataset.d);
            } else f.pericias[row.dataset.per] = V.passo(f.pericias[row.dataset.per], +b.dataset.d);
            renderPericias();
        });
        $('vg-habs').addEventListener('click', e => { if (e.target.closest('.vg-hab-rm')) { lerHabs(); f.habilidades.splice(+e.target.closest('.vg-hab').dataset.i, 1); renderHabs(); } });
        $('vg-avatar-file').addEventListener('change', e => lerArquivo(e.target.files[0]));
        $('vg-proximo').addEventListener('click', () => ir(etapa + 1));
        $('vg-anterior').addEventListener('click', () => ir(etapa - 1));
        $('vg-finalizar').addEventListener('click', finalizar);
        document.querySelectorAll('#vg-stepper .step-item').forEach(s => s.addEventListener('click', () => ir(+s.dataset.vg)));

        const q = new URLSearchParams(location.search).get('sistema');
        modo(q === 'vigilia' ? 'vg' : q === 'op' ? 'op' : 'sel');
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
    return { limparAvatar: () => setAvatar(''), addHab };
})();
