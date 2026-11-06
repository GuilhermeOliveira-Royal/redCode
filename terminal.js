// Terminal de verdade (PowerShell) para a página, por WebSocket.
// É o que o navegador sozinho não faz: um console na pasta do projeto, com php, git, npm...
// Segurança: só aceita conexão da própria página (Host e Origin locais + token secreto que
// vai no HTML; outro site não consegue ler o HTML por causa do CORS) e só em pastas conhecidas.
const { WebSocketServer } = require('ws');
const pty = require('@lydell/node-pty');
const os = require('os');

const MAXIMO = 8;
const abertos = new Set();

function liga(servidorHttp, { porta, token, pastaPermitida, envDaConversa }) {
    const hostsOk = new Set([`127.0.0.1:${porta}`, `localhost:${porta}`]);
    const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });

    servidorHttp.on('upgrade', (req, socket, cabeca) => {
        const recusa = (motivo) => { socket.write(`HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n`); socket.destroy(); console.log('terminal recusado:', motivo); };
        let url;
        try { url = new URL(req.url, 'http://127.0.0.1'); } catch (e) { return recusa('url'); }
        if (url.pathname !== '/ws/terminal') return recusa('caminho');
        const host = req.headers.host || '';
        if (!hostsOk.has(host)) return recusa('host');                     // contra DNS rebinding
        const origem = req.headers.origin || '';
        if (origem !== `http://${host}`) return recusa('origem');
        if (url.searchParams.get('token') !== token) return recusa('token');
        const cwd = url.searchParams.get('cwd') || os.homedir();
        if (!pastaPermitida(cwd)) return recusa('pasta');
        if (abertos.size >= MAXIMO) return recusa('limite');
        // Login de uma conta do Claude (Configurações › Perfis): a página manda só o id; o servidor monta o env
        let login = null;
        const pedidoLogin = url.searchParams.get('login');
        if (pedidoLogin) {
            const m = /^claude:([a-z0-9-]{1,32})$/.exec(pedidoLogin);
            const pasta = m && require('./perfis').pastaDaConta(m[1]);
            if (!pasta) return recusa('login');
            if (!require('fs').existsSync(CLAUDE_EXE)) return recusa('login: claude.exe do SDK não encontrado em ' + CLAUDE_EXE);
            // Conta padrão: sem CLAUDE_CONFIG_DIR (apontar para ~/.claude faria o Claude procurar o .claude.json no lugar errado)
            login = m[1] === 'padrao' ? { __sem: ['CLAUDE_CONFIG_DIR'] } : { CLAUDE_CONFIG_DIR: pasta };
        }
        // Terminal de uma conversa: o servidor monta o env dela (conta + identidade do Git); a página só manda a chave
        let envConversa = null;
        const pedidoConversa = url.searchParams.get('conversa');
        if (pedidoConversa && !login) {
            if (!/^[^\\/]+\/[0-9a-f-]{36}$/i.test(pedidoConversa) || !envDaConversa) return recusa('conversa');
            try { envConversa = envDaConversa(pedidoConversa); } catch (e) { return recusa('conversa: ' + e.message); }
        }
        wss.handleUpgrade(req, socket, cabeca, (ws) => conecta(ws, cwd, url, login, envConversa));
    });
}

// Executável do Claude que vem com o SDK (o mesmo que as conversas usam)
const CLAUDE_EXE = require('path').join(__dirname, 'node_modules', '@anthropic-ai', 'claude-agent-sdk-win32-' + (process.arch === 'arm64' ? 'arm64' : 'x64'), 'claude.exe');
function conecta(ws, cwd, url, login, envConversa) {
    const cols = Math.max(20, Math.min(400, Number(url.searchParams.get('cols')) || 100));
    const rows = Math.max(5, Math.min(200, Number(url.searchParams.get('rows')) || 24));
    let p;
    try {
        // Login: abre o Claude da conta pedindo /login; ao sair dele, o PowerShell fica (dá para fechar a aba)
        const args = login ? ['-NoLogo', '-NoExit', '-Command', `& '${CLAUDE_EXE.replace(/'/g, "''")}' /login`] : ['-NoLogo'];
        p = pty.spawn('powershell.exe', args, { name: 'xterm-256color', cwd, cols, rows, env: login ? (() => { const e = { ...process.env, ...login }; for (const k of (login.__sem || [])) delete e[k]; delete e.__sem; return e; })() : (envConversa || process.env), useConpty: true });
    } catch (e) {
        ws.send(`\r\nNão consegui abrir o terminal: ${e.message}\r\n`);
        return ws.close();
    }
    p.__cwd = cwd;
    abertos.add(p);
    p.onData((dados) => { if (ws.readyState === 1) ws.send(dados); });
    p.onExit(() => { abertos.delete(p); if (ws.readyState === 1) ws.close(); });
    ws.on('message', (bruto) => {
        let m;
        try { m = JSON.parse(String(bruto)); } catch (e) { return; }
        if (m.tipo === 'entrada' && typeof m.dados === 'string') p.write(m.dados);
        else if (m.tipo === 'tamanho') {
            const c = Math.max(20, Math.min(400, Number(m.cols) || 0)), r = Math.max(5, Math.min(200, Number(m.rows) || 0));
            try { p.resize(c, r); } catch (e) { /* terminal já saiu */ }
        }
    });
    ws.on('close', () => { abertos.delete(p); try { p.kill(); } catch (e) { /* já saiu */ } });
}

// Pastas onde há terminal aberto (um terminal segura a pasta: não dá para remover um worktree com ele)
const pastasAbertas = () => [...abertos].map(p => p.__cwd).filter(Boolean);

module.exports = { liga, quantos: () => abertos.size, pastasAbertas };
