// Login no Claude Code. O app nunca vê senha nem token: só consulta o estado (`claude auth status`)
// e aciona o fluxo oficial (`claude auth login`, que abre o navegador). Não existe logout aqui de propósito:
// sair da conta deslogaria o Claude Code de todo o PC.
const { execFile, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Variáveis que fazem o Claude Code autenticar por fora do login próprio. Existindo no ambiente, o SDK
// funciona mesmo com `auth status` dizendo "sem login"; por isso a tela de login não bloqueia nesse caso.
const VARIAVEIS_AUTH = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_USE_BEDROCK',
    'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY', 'ANTHROPIC_BASE_URL'];
const viaAmbiente = () => VARIAVEIS_AUTH.some(k => process.env[k]);
// Ambiente dos processos de auth: sem essas variáveis, para o resultado refletir só o login da conta
function ambienteLimpo() {
    const env = { ...process.env };
    for (const k of VARIAVEIS_AUTH) delete env[k];
    return env;
}

const SYSTEM32 = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32');

// O SDK traz o executável do Claude Code; se não estiver, procura um claude.exe no PATH (nunca .cmd, nunca shell)
function acharClaude() {
    const embutido = path.join(__dirname, 'node_modules', '@anthropic-ai', 'claude-agent-sdk-win32-x64', 'claude.exe');
    if (fs.existsSync(embutido)) return embutido;
    for (const pasta of String(process.env.PATH || '').split(path.delimiter)) {
        if (!pasta) continue;
        const candidato = path.join(pasta, 'claude.exe');
        try { if (fs.statSync(candidato).isFile()) return candidato; } catch (e) { /* não existe aqui */ }
    }
    return null;
}

function mascara(email) {
    const [usuario, dominio] = String(email || '').split('@');
    return usuario && dominio ? `${usuario.slice(0, 1)}***@${dominio}` : null;
}

// Só mostra/abre endereços https dos sites da Anthropic
function urlSegura(texto) {
    try {
        const u = new URL(texto);
        const h = u.hostname.toLowerCase();
        const ok = ['claude.ai', 'claude.com', 'anthropic.com'].includes(h) || h.endsWith('.anthropic.com') || h.endsWith('.claude.ai') || h.endsWith('.claude.com');
        return u.protocol === 'https:' && ok ? u.href : null;
    } catch (e) { return null; }
}

// ---- estado ----
let cache = { em: 0, valor: null };
let consultando = null;

// Estado do login + se há um `auth login` rodando agora (a tela volta ao início se ele acabou sem concluir)
async function estado() {
    return { ...(await lerEstado()), loginEmAndamento: !!login };
}

function lerEstado() {
    if (cache.valor && Date.now() - cache.em < 3000) return Promise.resolve(cache.valor);
    if (consultando) return consultando;
    const exe = acharClaude();
    if (!exe) return Promise.resolve({ loggedIn: null, erro: 'claude não encontrado', viaAmbiente: viaAmbiente() });
    consultando = new Promise((resolve) => {
        execFile(exe, ['auth', 'status'], { env: ambienteLimpo(), timeout: 15000, windowsHide: true, maxBuffer: 1e6 }, (erro, saida) => {
            let valor;
            try {
                const j = JSON.parse(saida);
                // O e-mail só sai daqui mascarado, e só os campos filtrados ficam no cache
                valor = {
                    loggedIn: !!j.loggedIn, metodo: j.authMethod || null, plano: j.subscriptionType || null,
                    emailMascarado: mascara(j.email),
                    viaAmbiente: viaAmbiente() || !!(j.apiProvider && j.apiProvider !== 'firstParty'),
                };
            } catch (e) {
                valor = { loggedIn: null, erro: 'não foi possível ler o estado do login', viaAmbiente: viaAmbiente() };
            }
            cache = { em: Date.now(), valor };
            consultando = null;
            resolve(valor);
        });
    });
    return consultando;
}

// ---- entrar ----
let login = null;   // { filho, url, timer }

function mataArvore(filho) {
    if (!filho || filho.exitCode !== null) return;
    try { filho.kill(); } catch (e) { /* já saiu */ }
    // O claude.exe pode abrir subprocessos: derruba a árvore inteira
    try { execFile(path.join(SYSTEM32, 'taskkill.exe'), ['/PID', String(filho.pid), '/T', '/F'], { windowsHide: true }, () => {}); } catch (e) { /* sem taskkill */ }
}

function entrar(tipo) {
    const exe = acharClaude();
    if (!exe) return Promise.reject(Object.assign(new Error('O executável do Claude Code não foi encontrado neste app.'), { status: 503 }));
    // Idempotente: com um login em andamento devolve o mesmo, sem abrir outro processo
    if (login) return login.promessa;
    const argumentos = ['auth', 'login', tipo === 'console' ? '--console' : '--claudeai'];
    // stdin aberto: depois de entrar no site, ele mostra um código que a pessoa cola de volta (ver `codigo`)
    const filho = spawn(exe, argumentos, { env: ambienteLimpo(), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    filho.stdin.on('error', () => { /* o processo já saiu */ });
    const atual = { filho, url: null, timer: null };
    login = atual;
    atual.timer = setTimeout(() => mataArvore(filho), 5 * 60 * 1000);
    atual.promessa = new Promise((resolve, reject) => {
        let respondido = false;
        const responde = (fn, valor) => { if (!respondido) { respondido = true; fn(valor); } };
        const termina = (erro) => {
            clearTimeout(atual.timer);
            if (login === atual) login = null;
            cache = { em: 0, valor: null };
            // Saiu antes de responder: o login não pôde ser iniciado
            responde(reject, Object.assign(new Error('Não foi possível iniciar o login. Tente de novo.'), { status: 502 }));
        };
        filho.on('exit', termina);
        filho.on('error', termina);
        // A URL pode chegar quebrada em dois pedaços: procura no texto acumulado (limitado)
        let acumulado = '';
        const procura = (pedaco) => {
            if (atual.url) return;
            acumulado = (acumulado + pedaco).slice(-8192);
            const achado = acumulado.match(/https:\/\/[^\s"'<>]+(?=[\s"'<>])/);
            const url = achado && urlSegura(achado[0]);
            // A saída do processo nunca é gravada em log: só a URL validada é guardada
            if (url) { atual.url = url; responde(resolve, { iniciado: true, url }); }
        };
        filho.stdout.on('data', procura);
        filho.stderr.on('data', procura);
        // O navegador abre sozinho; se a URL não aparecer logo, segue sem ela (o plano B some)
        setTimeout(() => responde(resolve, { iniciado: true, url: atual.url }), 3000);
    });
    return atual.promessa;
}

// Entrega ao `auth login` o código que o site do Claude mostrou depois do login. O código só passa daqui
// para o processo: não é gravado, nem registrado em log, nem devolvido.
async function codigo(texto) {
    const atual = login;
    if (!atual || atual.filho.exitCode !== null) throw Object.assign(new Error('O login não está mais aberto. Clique em Entrar de novo.'), { status: 409 });
    const c = String(texto || '').trim();
    if (!/^[A-Za-z0-9#._~-]{8,800}$/.test(c)) throw Object.assign(new Error('Esse código não parece o do site do Claude. Copie o código inteiro.'), { status: 400 });
    atual.filho.stdin.write(c + '\r\n');
    const inicio = Date.now();
    while (atual.filho.exitCode === null && Date.now() - inicio < 90000) await new Promise(r => setTimeout(r, 300));
    if (atual.filho.exitCode === null) mataArvore(atual.filho);
    cache = { em: 0, valor: null };
    const s = await lerEstado();
    return s.loggedIn ? { logado: true } : { logado: false, erro: 'O login não foi concluído. Confira o código e tente de novo.' };
}

function cancelar() {
    if (!login) return false;
    mataArvore(login.filho);
    return true;
}

process.on('exit', () => { if (login) { try { login.filho.kill(); } catch (e) { /* já saiu */ } } });

module.exports = { estado, entrar, codigo, cancelar, ambienteLimpo, acharClaude, urlSegura, viaAmbiente };
