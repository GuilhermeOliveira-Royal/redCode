// Vídeo no canto: a extensão do navegador (pasta extensao/) avisa qual vídeo do YouTube toca em cada aba e em que
// segundo; o Red Code toca uma cópia muda dele (player do YouTube ou, se o vídeo não deixa incorporar, o endereço
// direto só do vídeo, tirado pelo yt-dlp). Nada de ler a tela.
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const abas = new Map();   // aba do navegador -> último estado recebido
let ultimoAviso = 0;      // quando a extensão falou pela última vez (saber se ela está instalada)

function recebe(c) {
    ultimoAviso = Date.now();
    const aba = Number(c.aba);
    if (!Number.isFinite(aba)) throw new Error('Aba inválida.');
    if (c.fim) { abas.delete(aba); return; }
    const id = String(c.id || '');
    if (id && !/^[\w-]{11}$/.test(id)) throw new Error('Vídeo inválido.');
    // Vídeo novo numa aba: já pede o endereço direto (fica em cache) para a opção B entrar sem esperar o yt-dlp
    const antes = abas.get(aba);
    if (id && (!antes || antes.id !== id) && caminhoYtdlp()) urlDoVideo(id).catch(() => { });
    // Próximas da fila: já busca o endereço, para a troca de música no B ser na hora
    if (Array.isArray(c.proximos) && caminhoYtdlp()) for (const p of c.proximos.slice(0, 4)) if (/^[\w-]{11}$/.test(String(p))) buscaAntes(String(p));
    const num = (v, max) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= max ? n : 0; };
    abas.set(aba, {
        aba, id, tempo: num(c.tempo, 1e7), duracao: num(c.duracao, 1e7), pausado: !!c.pausado, taxa: num(c.taxa, 16) || 1,
        titulo: String(c.titulo || '').slice(0, 300), site: String(c.site || '').slice(0, 60), modo: String(c.modo || '').slice(0, 40),
        anuncio: !!c.anuncio, esperando: !!c.esperando, folga: num(c.folga, 2),
        proximos: Array.isArray(c.proximos) ? c.proximos.slice(0, 4).map(String) : [],
        // Momento da leitura na página (se o relógio bate): a conta do tempo parte dele, sem o atraso do envio
        recebidoEm: Number(c.quando) > 0 && Math.abs(Date.now() - Number(c.quando)) < 5000 ? Math.min(Date.now(), Number(c.quando)) : Date.now(),
    });
}
// O vídeo a mostrar: o que está tocando e falou por último; sem nenhum tocando, o pausado mais recente
function atual() {
    const agora = Date.now();
    for (const [aba, e] of abas) if (agora - e.recebidoEm > 6 * 3600e3) abas.delete(aba);
    const lista = [...abas.values()].filter(e => e.id);
    // Tocando sem avisar há 15 s: a aba travou ou foi descarregada; não conta como tocando
    const tocando = lista.filter(e => !e.pausado && agora - e.recebidoEm < 15000).sort((a, b) => b.recebidoEm - a.recebidoEm);
    const escolhido = tocando[0] || lista.sort((a, b) => b.recebidoEm - a.recebidoEm)[0] || null;
    // urlPronta: o endereço direto já está no cache (a cópia pode ir direto para o B, sem passar pelo A)
    const c = escolhido && cacheUrls.get(escolhido.id);
    const video = escolhido ? { ...escolhido, urlPronta: !!(c && agora - c.em < 3 * 3600e3) } : null;
    return { extensao: ultimoAviso > 0 && agora - ultimoAviso < 24 * 3600e3, agora, video };
}

// ---------- yt-dlp (opção B): endereço direto só do vídeo, para os vídeos que não deixam incorporar ----------
let PASTA_BIN = null;
const configura = (pastaDados) => { PASTA_BIN = path.join(pastaDados, 'bin'); };
const caminhoYtdlp = () => (PASTA_BIN && fs.existsSync(path.join(PASTA_BIN, 'yt-dlp.exe'))) ? path.join(PASTA_BIN, 'yt-dlp.exe') : null;
const cacheUrls = new Map();   // id -> { url, em }
// Busca antecipada: duas de cada vez (cada uma leva ~4 s), sem repetir o que já está no cache ou na espera
const esperaBusca = [], buscando = new Set();
const BUSCAS_JUNTAS = 2;
function buscaAntes(id) {
    const c = cacheUrls.get(id);
    if ((c && Date.now() - c.em < 3 * 3600e3) || buscando.has(id) || esperaBusca.includes(id)) return;
    esperaBusca.push(id);
    if (esperaBusca.length > 8) esperaBusca.shift();
    if (buscando.size < BUSCAS_JUNTAS) proximaBusca();
}
function proximaBusca() {
    const id = esperaBusca.shift();
    if (!id) return;
    buscando.add(id);
    urlDoVideo(id).catch(() => { }).finally(() => { buscando.delete(id); proximaBusca(); });
}
const emCurso = new Map();   // id -> busca do yt-dlp em andamento (quem pede o mesmo id espera a mesma)
function urlDoVideo(id) {
    if (!/^[\w-]{11}$/.test(String(id))) return Promise.reject(new Error('Vídeo inválido.'));
    const c = cacheUrls.get(id);
    // O endereço do YouTube vence em ~6 h: usa por 3 h
    if (c && Date.now() - c.em < 3 * 3600e3) return Promise.resolve(c.url);
    const exe = caminhoYtdlp();
    if (!exe) return Promise.reject(Object.assign(new Error('O yt-dlp não está instalado.'), { codigo: 'sem-ytdlp' }));
    if (emCurso.has(id)) return emCurso.get(id);
    const busca = new Promise((resolve, rejeita) => {
        // Só o vídeo (sem áudio: a cópia é muda), até 720p
        execFile(exe, ['-g', '--no-playlist', '--no-warnings', '-f', 'bv*[height<=720]/b[height<=720]/bv*/b', 'https://www.youtube.com/watch?v=' + id], { timeout: 45000, windowsHide: true }, (erro, saida, saidaErro) => {
            const url = String(saida || '').split(/\r?\n/).find(l => /^https?:\/\//.test(l));
            if (erro || !url) return rejeita(new Error('O yt-dlp não conseguiu o vídeo: ' + String(saidaErro || (erro && erro.message) || '').trim().split(/\r?\n/).pop().slice(0, 200)));
            cacheUrls.set(id, { url, em: Date.now() });
            if (cacheUrls.size > 50) cacheUrls.delete(cacheUrls.keys().next().value);
            resolve(url);
        });
    });
    emCurso.set(id, busca);
    busca.catch(() => { }).finally(() => emCurso.delete(id));
    return busca;
}
// Baixa o yt-dlp oficial (GitHub do projeto) para a pasta de dados do Red Code. Só quando a pessoa clica em instalar
async function instalaYtdlp() {
    if (!PASTA_BIN) throw new Error('Pasta de dados não configurada.');
    fs.mkdirSync(PASTA_BIN, { recursive: true });
    const r = await fetch('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe', { signal: AbortSignal.timeout(180000) });
    if (!r.ok) throw new Error('Não deu para baixar o yt-dlp (' + r.status + ').');
    const destino = path.join(PASTA_BIN, 'yt-dlp.exe');
    fs.writeFileSync(destino + '.novo', Buffer.from(await r.arrayBuffer()));
    fs.renameSync(destino + '.novo', destino);
    return destino;
}

// Pasta fixa da extensão (a do programa troca a cada versão do exe): o navegador aponta para esta
function copiaExtensao(raiz, pastaDados) {
    const de = path.join(raiz, 'extensao'), para = path.join(pastaDados, 'extensao-navegador');
    if (!fs.existsSync(de)) return null;
    // Rodando pelo código (git clone) os dados ficam na própria pasta, que não troca: usa a extensao/ direto
    if (path.resolve(raiz) === path.resolve(pastaDados)) return de;
    fs.mkdirSync(para, { recursive: true });
    for (const nome of fs.readdirSync(de)) {
        const a = path.join(de, nome), b = path.join(para, nome);
        const novo = fs.readFileSync(a);
        if (!fs.existsSync(b) || !fs.readFileSync(b).equals(novo)) fs.writeFileSync(b, novo);
    }
    return para;
}

// ---------- Instalar a extensão no navegador (com a permissão da pessoa) ----------
// Navegador nenhum deixa um programa instalar extensão sozinho; o que funciona sem loja é abrir o navegador com
// --load-extension: vai nos atalhos dele (instala-extensao.ps1, com backup) e ele reinicia com as abas de volta.
// O Google Chrome ignora essa opção desde a versão 137: nele só dá pelo passo a passo (Carregar sem compactação)
const NAVEGADORES = [
    { id: 'brave', nome: 'Brave', exe: ['BraveSoftware\\Brave-Browser\\Application\\brave.exe'], suporta: true },
    { id: 'edge', nome: 'Microsoft Edge', exe: ['Microsoft\\Edge\\Application\\msedge.exe'], suporta: true },
    { id: 'chrome', nome: 'Google Chrome', exe: ['Google\\Chrome\\Application\\chrome.exe'], suporta: false },
];
function achaExe(n) {
    for (const raiz of [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA]) {
        if (!raiz) continue;
        for (const rel of n.exe) { const c = path.join(raiz, rel); if (fs.existsSync(c)) return c; }
    }
    return null;
}
function navegadores() {
    return NAVEGADORES.map(n => ({ id: n.id, nome: n.nome, suporta: n.suporta, instalado: !!achaExe(n) })).filter(n => n.instalado);
}
function instalaExtensao(id, pastaExtensao, pastaDados, reiniciar) {
    const n = NAVEGADORES.find(x => x.id === id && x.suporta);
    const exe = n && achaExe(n);
    if (!exe) return Promise.reject(new Error('Navegador não encontrado.'));
    if (!pastaExtensao) return Promise.reject(new Error('Pasta da extensão não encontrada.'));
    const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'instala-extensao.ps1'),
        '-Exe', exe, '-Extensao', pastaExtensao, '-Backup', path.join(pastaDados, 'backup-atalhos-navegador'), ...(reiniciar ? ['-Reiniciar'] : [])];
    return new Promise((resolve, rejeita) => {
        execFile('powershell.exe', args, { timeout: 60000, windowsHide: true }, (erro, saida) => {
            if (erro) return rejeita(new Error('Não deu para instalar: ' + erro.message.split('\n')[0]));
            try { const r = JSON.parse(String(saida).trim().split(/\r?\n/).pop()); if (r.erro) return rejeita(new Error(r.erro)); resolve({ navegador: n.nome, ...r }); }
            catch (e) { rejeita(new Error('Resposta estranha do instalador.')); }
        });
    });
}

module.exports = { recebe, atual, configura, caminhoYtdlp, urlDoVideo, instalaYtdlp, copiaExtensao, navegadores, instalaExtensao };
