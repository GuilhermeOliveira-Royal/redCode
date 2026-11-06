// Formatador do Red Code: roda no iframe escondido /formatador.html e formata texto como o
// Alt+Shift+F do VS Code (os formatadores nativos dele são os mesmos que vêm no Monaco:
// TypeScript para JS/TS, css-languageservice para CSS/SCSS/LESS, html-languageservice, JSON).
// Só conversa com a própria origem e só devolve texto; nunca grava nada.
/* global require, monaco */
require.config({ paths: { vs: '/vendor/monaco' } });
require(['vs/editor/editor.main'], async () => {
    const host = document.getElementById('host');
    // Amostra "desformatada" de cada linguagem: serve para esquentar o formatador
    const AMOSTRAS = {
        javascript: 'function a(){return 1}', typescript: 'function a(){return 1}',
        css: '.a{color:red}', scss: '.a{color:red}', less: '.a{color:red}',
        html: '<div><p>a</p></div>', json: '{"a":1}',
    };
    async function formata(texto, ling) {
        const model = monaco.editor.createModel(String(texto), ling);
        // Igual ao padrão do VS Code do usuário: 4 espaços; fim de linha \n (o Windows usaria \r\n)
        model.updateOptions({ tabSize: 4, insertSpaces: true });
        model.setEOL(monaco.editor.EndOfLineSequence.LF);
        const editor = monaco.editor.create(host, { model, automaticLayout: false });
        try {
            const acao = editor.getAction('editor.action.formatDocument');
            if (!acao) throw new Error('Formatador indisponível para ' + ling);
            await acao.run();
            const saida = model.getValue().replace(/\r\n/g, '\n');
            return ling === 'javascript' || ling === 'typescript' ? respiro(saida) : saida;
        } finally { editor.dispose(); model.dispose(); }
    }
    // Linha em branco entre blocos (só no visual): grupo de const/let/var, antes de função ou
    // classe, depois de um bloco fechado e antes de comentário. Não mexe dentro de template `...`.
    function respiro(texto) {
        const tipo = (t) => /^(export\s+)?(const|let|var)\s/.test(t) ? 'decl'
            : /^(export\s+(default\s+)?)?(async\s+)?(function\b|class\s)/.test(t) ? 'func'
            : /^(\/\/|\/\*|\*)/.test(t) ? 'coment' : 'outro';
        const fechaBloco = (t) => t === '}' || /^\}.*;$/.test(t);
        const continua = (t) => /^([}\])]|else\b|catch\b|finally\b|case\b|default\b|\.|\?|:)/.test(t);
        const out = [];
        let emCrase = false;
        const ultimoTipo = {};   // indentação -> tipo da última instrução começada nela
        for (const linha of texto.split('\n')) {
            const t = linha.trim();
            const ind = linha.length - linha.trimStart().length;
            const ant = out[out.length - 1];
            if (!emCrase && t && ant !== undefined && ant.trim()) {
                const tAnt = ant.trim();
                const indAnt = ant.length - ant.trimStart().length;
                const k = tipo(t), kAnt = ultimoTipo[ind];
                let pula = false;
                if (indAnt === ind && !continua(t) && tipo(tAnt) !== 'coment') {
                    if (k === 'coment') pula = true;
                    else if (k === 'func' || kAnt === 'func') pula = true;
                    else if (fechaBloco(tAnt)) pula = true;
                    else if ((k === 'decl') !== (kAnt === 'decl') && kAnt) pula = true;
                }
                if (pula) out.push('');
            }
            out.push(linha);
            if (!emCrase && t && !continua(t)) ultimoTipo[ind] = tipo(t);
            // Fecha os níveis mais fundos: ao voltar para a indentação, o tipo anterior vale de novo
            for (const n of Object.keys(ultimoTipo)) if (+n > ind && t) delete ultimoTipo[n];
            if (((linha.match(/(^|[^\\])`/g) || []).length) % 2) emCrase = !emCrase;
        }
        return out.join('\n');
    }
    // O Monaco só registra o formatador de cada linguagem depois que ela é usada pela 1ª vez:
    // formata a amostra até ela mudar (ou 5 s) antes de avisar que está pronto
    for (const [ling, amostra] of Object.entries(AMOSTRAS)) {
        const ate = Date.now() + 5000;
        while (Date.now() < ate) {
            try { if (await formata(amostra, ling) !== amostra) break; } catch (e) { break; }
            await new Promise(r => setTimeout(r, 150));
        }
    }
    window.addEventListener('message', async (e) => {
        if (e.origin !== location.origin || e.source !== window.parent || !e.data || e.data.tipo !== 'formatar') return;
        const { id, texto, ling } = e.data;
        let saida = null, erro = null;
        if (!AMOSTRAS[ling]) erro = 'Linguagem sem formatador: ' + ling;
        else { try { saida = await formata(texto, ling); } catch (x) { erro = String((x && x.message) || x); } }
        window.parent.postMessage({ tipo: 'formatado', id, saida, erro }, location.origin);
    });
    window.parent.postMessage({ tipo: 'formatador-pronto' }, location.origin);
});
