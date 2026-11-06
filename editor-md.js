// Visualização de Markdown do Editor (como a do VS Code): ao lado do código (Ctrl+K V) ou sozinha (Ctrl+Shift+V).
// Atualiza enquanto você digita, rola junto com o código, colore os blocos de código pelo Monaco e abre links:
// .md do projeto no Editor, #âncora no próprio texto, http(s) no navegador. Só visualização: nada é gravado.
// Usa o marked (GFM) e o DOMPurify que já vêm com o Monaco; o HTML do arquivo passa sempre pelo DOMPurify.
(function () {
    const TOKEN_MD = document.querySelector('meta[name="painel-token"]').content;
    const CWD_MD = new URLSearchParams(location.search).get('cwd') || '';
    const previa = document.getElementById('previa');
    const area = document.getElementById('area');
    const ehMd = (aba) => !!aba && /\.(md|markdown|mdx)$/i.test(aba.rel);
    // Modo por aba: 'codigo' | 'lado' | 'previa'
    const modos = new WeakMap();
    let ligadoA = null, espera = null, rolandoPor = null;

    // Título vira âncora como no GitHub/VS Code: minúsculo, sem acento nem pontuação, espaço vira hífen
    const ancora = (texto) => String(texto).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
    function pastaDoArquivo(rel) { const p = rel.split('/'); p.pop(); return p.join('/'); }
    function resolveRelativo(rel, alvo) {
        const partes = (pastaDoArquivo(rel) ? pastaDoArquivo(rel).split('/') : []);
        for (const p of alvo.replace(/\\/g, '/').split('/')) {
            if (!p || p === '.') continue;
            if (p === '..') partes.pop(); else partes.push(p);
        }
        return partes.join('/');
    }
    function desenha() {
        const aba = window.abaAtualEditor && window.abaAtualEditor();
        if (!aba || !ehMd(aba) || modos.get(aba) === 'codigo' || !modos.get(aba)) return;
        const fonte = aba.modelo.getValue();
        let html = '';
        try { html = window.marked.parse(fonte, { gfm: true, breaks: false }); } catch (e) { html = '<p>Não deu para ler este Markdown: ' + String(e.message).replace(/</g, '&lt;') + '</p>'; }
        const limpo = window.DOMPurify.sanitize(html, { USE_PROFILES: { html: true }, ADD_ATTR: ['target'] });
        const topo = previa.scrollTop;
        previa.innerHTML = '<article class="md">' + limpo + '</article>';
        const usados = new Map();
        previa.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(hh => {
            let id = ancora(hh.textContent) || 'secao';
            const n = usados.get(id) || 0; usados.set(id, n + 1);
            if (n) id += '-' + n;
            hh.id = id;
        });
        // Imagens do projeto: pela rota do Editor (caminho relativo ao arquivo .md)
        previa.querySelectorAll('img').forEach(img => {
            const src = img.getAttribute('src') || '';
            if (/^(https?:|data:)/i.test(src)) { if (/^https?:/i.test(src)) img.removeAttribute('src'); return; }
            img.src = '/api/editor/imagem?' + new URLSearchParams({ cwd: CWD_MD, caminho: resolveRelativo(aba.rel, decodeURIComponent(src.split('#')[0])), t: TOKEN_MD });
        });
        // Blocos de código com a cor do Monaco (a mesma do editor)
        previa.querySelectorAll('pre > code').forEach(code => {
            const m = (code.className || '').match(/language-([\w-]+)/);
            const ling = m ? ({ js: 'javascript', ts: 'typescript', sh: 'shell', bash: 'shell', ps1: 'powershell', yml: 'yaml', py: 'python' }[m[1]] || m[1]) : 'plaintext';
            window.monaco.editor.colorize(code.textContent, ling, { tabSize: 4 }).then(cor => { code.innerHTML = cor; code.classList.add('colorido'); }).catch(() => {});
        });
        previa.querySelectorAll('input[type="checkbox"]').forEach(c => { c.disabled = true; });
        previa.scrollTop = topo;
    }
    function agenda() { clearTimeout(espera); espera = setTimeout(desenha, 120); }
    function aplicaModo(aba) {
        // .md abre já formatado (como uma aba de visualização); "Ver código" volta ao texto
        if (ehMd(aba) && !modos.get(aba)) modos.set(aba, 'previa');
        const modo = ehMd(aba) ? modos.get(aba) : 'codigo';
        area.dataset.modo = modo;
        previa.hidden = modo === 'codigo';
        document.getElementById('editor').classList.toggle('escondido-md', modo === 'previa');
        document.getElementById('btnMdLado').hidden = !ehMd(aba);
        document.getElementById('btnMdSo').hidden = !ehMd(aba);
        document.getElementById('btnMdLado').setAttribute('aria-pressed', String(modo === 'lado'));
        document.getElementById('btnMdSo').setAttribute('aria-pressed', String(modo === 'previa'));
        document.getElementById('btnMdSo').textContent = modo === 'previa' ? 'Ver código' : 'Só visualização';
        if (modo !== 'codigo') {
            if (ligadoA !== aba) { ligadoA = aba; aba.modelo.onDidChangeContent(() => { if (window.abaAtualEditor() === aba) agenda(); }); }
            desenha();
        }
        window.editorMonaco && window.editorMonaco().layout();
    }
    function troca(modo) {
        const aba = window.abaAtualEditor && window.abaAtualEditor();
        if (!ehMd(aba)) return;
        modos.set(aba, modos.get(aba) === modo ? 'codigo' : modo);
        aplicaModo(aba);
    }
    window.mdAbaAtivada = (aba) => aplicaModo(aba);
    document.getElementById('btnMdLado').addEventListener('click', () => troca('lado'));
    document.getElementById('btnMdSo').addEventListener('click', () => troca('previa'));
    // Atalhos do VS Code: Ctrl+Shift+V (só a visualização) e Ctrl+K V (ao lado)
    let ctrlK = 0;
    document.addEventListener('keydown', (ev) => {
        if (ev.ctrlKey && ev.shiftKey && ev.key.toLowerCase() === 'v') { ev.preventDefault(); troca('previa'); return; }
        if (ev.ctrlKey && !ev.shiftKey && ev.key.toLowerCase() === 'k') { ctrlK = Date.now(); return; }
        if (ctrlK && Date.now() - ctrlK < 1500 && ev.key.toLowerCase() === 'v' && !ev.shiftKey) { ev.preventDefault(); ctrlK = 0; troca('lado'); }
    }, true);
    // Links da visualização
    previa.addEventListener('click', (ev) => {
        const a = ev.target.closest('a[href]');
        if (!a) return;
        ev.preventDefault();
        const href = a.getAttribute('href');
        const aba = window.abaAtualEditor();
        if (href.startsWith('#')) { const alvo = previa.querySelector('#' + CSS.escape(decodeURIComponent(href.slice(1)))); if (alvo) alvo.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
        if (/^(https?:|mailto:)/i.test(href)) { window.open(href, '_blank', 'noopener'); return; }
        // Arquivo do projeto: abre no Editor (um .md já abre visualizando)
        const [caminho] = href.split('#');
        const rel = resolveRelativo(aba.rel, decodeURIComponent(caminho));
        window.abreArquivoEditor(rel).then(() => {
            const nova = window.abaAtualEditor();
            if (ehMd(nova) && modos.get(aba) === 'lado') { modos.set(nova, 'lado'); aplicaModo(nova); }
        });
    });
    // Rolagem junto: código -> visualização e visualização -> código (proporcional)
    function ligaRolagem() {
        const ed = window.editorMonaco && window.editorMonaco();
        if (!ed) return setTimeout(ligaRolagem, 300);
        ed.onDidScrollChange(() => {
            if (area.dataset.modo !== 'lado' || rolandoPor === 'previa') return;
            const total = ed.getScrollHeight() - ed.getLayoutInfo().height;
            rolandoPor = 'codigo';
            previa.scrollTop = total > 0 ? (ed.getScrollTop() / total) * (previa.scrollHeight - previa.clientHeight) : 0;
            requestAnimationFrame(() => { rolandoPor = null; });
        });
        previa.addEventListener('scroll', () => {
            if (area.dataset.modo !== 'lado' || rolandoPor === 'codigo') return;
            const total = previa.scrollHeight - previa.clientHeight;
            rolandoPor = 'previa';
            ed.setScrollTop(total > 0 ? (previa.scrollTop / total) * (ed.getScrollHeight() - ed.getLayoutInfo().height) : 0);
            requestAnimationFrame(() => { rolandoPor = null; });
        });
    }
    ligaRolagem();
})();
