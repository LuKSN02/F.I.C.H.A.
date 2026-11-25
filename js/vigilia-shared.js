/* F.I.C.H.A. — Vigília (Ordem Paranormal RPG 2 · Playtest Alpha)
   Dados e utilidades compartilhados por criar.html, ficha-vigilia.html e a visão Tablet. */
window.VG = (function () {
    const DADOS = [4, 6, 8, 10, 12];
    const ATRIBUTOS = [
        { id: 'fisico',  nome: 'Físico',  desc: 'Força, resistência e capacidade corporal' },
        { id: 'mente',   nome: 'Mente',   desc: 'Raciocínio, percepção e conhecimento' },
        { id: 'emocao',  nome: 'Emoção',  desc: 'Instinto, presença e controle emocional' },
    ];
    // Fonte: Ordem Paranormal RPG 2 — Playtest Alpha v1.1 (Arquivos Secretos)
    const PERFIS = {
        Executor:  'Age primeiro e pensa depois. Se não dá certo, tenta de novo até conseguir, vencendo pela perseverança.',
        Analista:  'Observa, entende e se prepara para só então agir. Demora a agir, mas com a maior precisão possível.',
        Vigilante: 'Sempre atento aos arredores, aproveita brechas para agir primeiro. Se adapta a imprevistos e decide sob pressão.',
    };
    // Habilidades concedidas (apenas as que o playtest publica; as demais ficam em aberto para o jogador preencher).
    const PERFIL_HAB = {
        Executor: { nome: 'Ímpeto', tipo: 'Passiva', desc: 'Você possui uma barra de ímpeto com três espaços. Sempre que falha em um teste, preenche um espaço na barra. Você pode apagar espaços preenchidos para: (1 espaço) receber +1 passo em um teste; (3 espaços) aumentar um atributo em um passo até o fim da cena.' },
    };
    const OCUPACOES = {
        Cientista: { nome: 'Foco Mental', tipo: 'Ação', desc: 'Quando faz um teste mental, você pode gastar 2 PD para receber +1 passo no teste.' },
    };
    const ESCALA_ATTR = { 4: 'Abaixo da média', 6: 'Média humana', 8: 'Acima da média', 10: 'Muito acima da média', 12: 'Ápice humano' };
    const ESCALA_PER  = { 4: 'Destreinado', 6: 'Treinado', 8: 'Especialista', 10: 'Mestre', 12: 'Grão-mestre' };
    const APTIDOES = ['Artes', 'Atualidades', 'Burocracia', 'Exatas', 'Humanas', 'Tática'];
    // 20 perícias oficiais e seus atributos-base.
    const PERICIAS = [
        ['acrobacia', 'Acrobacia', 'fisico'], ['aptidao', 'Aptidão', 'mente'], ['atletismo', 'Atletismo', 'fisico'],
        ['crime', 'Crime', 'fisico'], ['disciplina', 'Disciplina', 'emocao'], ['enganacao', 'Enganação', 'emocao'],
        ['furtividade', 'Furtividade', 'fisico'], ['intimidacao', 'Intimidação', 'emocao'], ['intuicao', 'Intuição', 'emocao'],
        ['luta', 'Luta', 'fisico'], ['maquinas', 'Máquinas', 'mente'], ['medicina', 'Medicina', 'mente'],
        ['ocultismo', 'Ocultismo', 'mente'], ['percepcao', 'Percepção', 'mente'], ['persuasao', 'Persuasão', 'emocao'],
        ['pesquisa', 'Pesquisa', 'mente'], ['pontaria', 'Pontaria', 'fisico'], ['sobrevivencia', 'Sobrevivência', 'mente'],
        ['tecnologia', 'Tecnologia', 'mente'], ['vigor', 'Vigor', 'fisico'],
    ].map(p => ({ id: p[0], nome: p[1], attr: p[2] }));

    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const die = n => `<span class="vg-die d${n}" aria-label="d${n}"><b>${n}</b></span>`;
    const passo = (n, delta) => DADOS[Math.max(0, Math.min(DADOS.length - 1, DADOS.indexOf(+n) + delta))] || 4;
    const rolar = n => 1 + Math.floor(Math.random() * n);
    const attrInfo = id => ATRIBUTOS.find(a => a.id === id);

    function novaFicha() {
        const per = {}; PERICIAS.forEach(p => per[p.id] = 4);
        return {
            sistema: 'vigilia', nome: '', codinome: '', idade: '', nivel: 1, perfil: '', ocupacao: '', avatar: '',
            atributos: { fisico: 6, mente: 6, emocao: 6 }, pericias: per, aptidoes: {},
            pv: { atual: 10, max: 10 }, pd: { atual: 16, max: 16 }, armadura: 0,
            habilidades: [], equipamentos: '', personalidade: '', ideal: '', vinculo: '', fraqueza: '', historia: '',
        };
    }
    return { DADOS, ATRIBUTOS, PERFIS, PERFIL_HAB, OCUPACOES, ESCALA_ATTR, ESCALA_PER, APTIDOES, PERICIAS, esc, die, passo, rolar, attrInfo, novaFicha };
})();
