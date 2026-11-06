// Perfis do Red Code (como os perfis do navegador): cada perfil junta uma conta do Claude e uma identidade do Git.
// Trocar de perfil = o servidor sobe de novo com outro env (desktop/main.js e lancador.js chamam envDoPerfil a cada spawn):
// - CLAUDE_CONFIG_DIR: login, settings, agentes e conversas (projects/) da conta do Claude
// - GIT_CONFIG_GLOBAL: nome/e-mail da identidade + namespace próprio no Git Credential Manager (o login da empresa fica intocado)
// - GH_CONFIG_DIR: pasta vazia da identidade (o gh nunca cai no login real; o app passa GH_TOKEN só nas chamadas dele)
// O perfil "padrao" não define nada: fica idêntico ao Red Code de antes dos perfis.
// Nenhum token é gravado aqui: os logins ficam no .credentials.json de cada conta e no Gerenciador de Credenciais do Windows.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const PASTA_PERFIS = process.env.PAINEL_PERFIS || path.join(process.env.APPDATA || os.homedir(), 'Red Code', 'perfis');
const ARQ_PERFIS = path.join(PASTA_PERFIS, 'perfis.json');
const PASTA_CLAUDE_PADRAO = path.join(os.homedir(), '.claude');
const ID = /^[a-z0-9-]{1,32}$/;
const COR = /^#[0-9a-f]{6}$/i;
const USUARIO_GITHUB = /^[A-Za-z0-9-]{1,39}$/;
const CONTROLE = /[\u0000-\u001f\u007f]/;

const PERFIL_PADRAO = { id: 'padrao', nome: 'Padrão', cor: '#d4372c', claude: 'padrao', git: 'padrao' };
const CONTA_PADRAO = { id: 'padrao', nome: 'Conta padrão' };
const IDENTIDADE_PADRAO = { id: 'padrao', nome: 'Git padrão' };

// Executáveis por caminho absoluto (no Windows a busca começa pela pasta atual do processo)
function exe(nome) {
    for (const p of (process.env.PATH || '').split(path.delimiter)) {
        if (!p || !path.isAbsolute(p)) continue;
        const arq = path.join(p, process.platform === 'win32' ? nome + '.exe' : nome);
        if (fs.existsSync(arq)) return arq;
    }
    return null;
}
const GIT_EXE = exe('git') || 'git';

function erroPerfil(msg, status = 400) { const e = new Error(msg); e.status = status; return e; }

// ---------- perfis.json ----------
function vazio() { return { ativo: 'padrao', perfis: [], contasClaude: [], identidadesGit: [] }; }
function le() {
    let d;
    try { d = JSON.parse(fs.readFileSync(ARQ_PERFIS, 'utf8')); } catch (e) {
        if (e.code === 'ENOENT') return vazio();
        throw erroPerfil('Não deu para ler o perfis.json (' + (e.code || 'JSON inválido') + '). Nada foi alterado; tente de novo ou restaure o perfis.json.bak.', 500);
    }
    const lista = (v) => (Array.isArray(v) ? v : []).filter(x => x && ID.test(String(x.id)) && x.id !== 'padrao');
    const r = { ativo: ID.test(String(d.ativo)) ? d.ativo : 'padrao', perfis: lista(d.perfis), contasClaude: lista(d.contasClaude), identidadesGit: lista(d.identidadesGit) };
    // Conta e identidade escolhidas para o perfil Padrão (sem escolha = as de sempre)
    r.padraoClaude = r.contasClaude.some(c => c.id === d.padraoClaude) ? d.padraoClaude : 'padrao';
    r.padraoGit = r.identidadesGit.some(g => g.id === d.padraoGit) ? d.padraoGit : 'padrao';
    // Perfil apagado ou corrompido: volta para o padrão
    if (r.ativo !== 'padrao' && !r.perfis.some(p => p.id === r.ativo)) r.ativo = 'padrao';
    return r;
}
function grava(d) {
    fs.mkdirSync(PASTA_PERFIS, { recursive: true });
    // Cópia da versão anterior: se algo der errado, dá para voltar
    try { fs.copyFileSync(ARQ_PERFIS, ARQ_PERFIS + '.bak'); } catch (e) { /* primeira gravação */ }
    const tmp = ARQ_PERFIS + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(d, null, 2) + '\n');
    fs.renameSync(tmp, ARQ_PERFIS);
}
const todosPerfis = (d) => [{ ...PERFIL_PADRAO, claude: d.padraoClaude || 'padrao', git: d.padraoGit || 'padrao' }, ...d.perfis];
const todasContas = (d) => [CONTA_PADRAO, ...d.contasClaude];
const todasIdentidades = (d) => [IDENTIDADE_PADRAO, ...d.identidadesGit];
const pastaConta = (id) => path.join(PASTA_PERFIS, 'claude', id);
const pastaIdentidade = (id) => path.join(PASTA_PERFIS, 'git', id);

// ---------- validação ----------
function texto(v, max, campo, obrigatorio = true) {
    const s = String(v == null ? '' : v).trim();
    if (!s && obrigatorio) throw erroPerfil(`Preencha ${campo}.`);
    if (s.length > max) throw erroPerfil(`${campo[0].toUpperCase() + campo.slice(1)} pode ter até ${max} letras.`);
    if (CONTROLE.test(s)) throw erroPerfil(`${campo[0].toUpperCase() + campo.slice(1)} tem caractere inválido.`);
    return s;
}
function idNovo(nome, existentes) {
    const base = String(nome).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'perfil';
    let id = base === 'padrao' ? 'padrao-2' : base, n = 2;
    while (existentes.some(x => x.id === id)) id = `${base}-${n++}`;
    return id;
}
function validaIdentidade(c) {
    const email = texto(c.email, 120, 'o e-mail');
    if (/\s/.test(email) || !email.includes('@')) throw erroPerfil('E-mail inválido.');
    const usuarioGithub = String(c.usuarioGithub || '').trim();
    if (usuarioGithub && !USUARIO_GITHUB.test(usuarioGithub)) throw erroPerfil('Usuário do GitHub inválido (letras, números e hífen).');
    return { nome: texto(c.nome, 40, 'o nome da identidade'), usuario: texto(c.usuario, 80, 'o nome do autor dos commits'), email, usuarioGithub };
}

// ---------- gitconfig da identidade ----------
// Valores sempre entre aspas (";" e "#" sem aspas viram comentário); \ e " escapados; caminhos com "/"
const aspas = (v) => '"' + String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
const barra = (p) => String(p).replace(/\\/g, '/');
function arquivoGitconfig(id) { return path.join(pastaIdentidade(id), 'gitconfig'); }
function geraGitconfig(ident) {
    const linhas = [
        '# Gerado pelo Red Code (perfil). É sobrescrito: edite a identidade em Configurações › Perfis.',
    ];
    const globalReal = path.join(os.homedir(), '.gitconfig');
    if (fs.existsSync(globalReal)) linhas.push('[include]', '\tpath = ' + aspas(barra(globalReal)));
    linhas.push('[user]', '\tname = ' + aspas(ident.usuario), '\temail = ' + aspas(ident.email));
    linhas.push('[credential]', '\tnamespace = ' + aspas('redcode-' + ident.id));
    if (ident.usuarioGithub) linhas.push('[credential "https://github.com"]', '\tusername = ' + aspas(ident.usuarioGithub));
    fs.mkdirSync(path.join(pastaIdentidade(ident.id), 'gh'), { recursive: true });
    fs.writeFileSync(arquivoGitconfig(ident.id), linhas.join('\n') + '\n');
    return arquivoGitconfig(ident.id);
}

// ---------- env do perfil (chamado a cada spawn do servidor) ----------
function envDoPerfil(id) {
    const d = le();
    const perfil = todosPerfis(d).find(p => p.id === id) || PERFIL_PADRAO;
    // DISABLE_AUTOUPDATER: o claude.exe do SDK se "atualiza" como npm-global, renomeia a si mesmo
    // para .old e o SDK fica sem binário. A versão é a do package.json (atualizar pelo npm).
    const env = { PAINEL_PERFIL: perfil.id, DISABLE_AUTOUPDATER: '1' };
    const conta = d.contasClaude.find(c => c.id === perfil.claude);
    if (conta) {
        fs.mkdirSync(pastaConta(conta.id), { recursive: true });
        env.CLAUDE_CONFIG_DIR = pastaConta(conta.id);
    }
    const ident = d.identidadesGit.find(g => g.id === perfil.git);
    if (ident) {
        try {
            env.GIT_CONFIG_GLOBAL = geraGitconfig(ident);
            env.GH_CONFIG_DIR = path.join(pastaIdentidade(ident.id), 'gh');
        } catch (e) { /* sem gravar: sobe sem a identidade (cai no git padrão) */ }
    }
    return env;
}
// Pasta do Claude do servidor em execução (o env já vem do perfil ativo)
function pastaClaude() { return process.env.CLAUDE_CONFIG_DIR || PASTA_CLAUDE_PADRAO; }
function perfilEmUso() { return process.env.PAINEL_PERFIL || 'padrao'; }

// ---------- Git Credential Manager: o único lugar que chama "git credential" ----------
function rodaGit(args, env, entrada, tempo) {
    return new Promise((resolve) => {
        const filho = execFile(GIT_EXE, args, { env, timeout: tempo, windowsHide: true, maxBuffer: 1024 * 1024 }, (falha, saida, saidaErro) => {
            resolve({ ok: !falha, saida: String(saida || ''), erro: falha ? String(saidaErro || falha.message).trim() : '' });
        });
        filho.stdin.on('error', () => {});
        filho.stdin.end(entrada || '');
    });
}
function rodaCmdkey() {
    return new Promise((resolve) => execFile(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmdkey.exe'), ['/list'], { windowsHide: true, timeout: 10000, encoding: 'latin1' }, (falha, saida) => resolve(String(saida || ''))));
}
// Entradas git:/gh: do cofre (alvo + linha seguinte, que é o usuário): para provar que nada real mudou
async function fotoDoCofre() {
    const linhas = (await rodaCmdkey()).split(/\r?\n/).map(l => l.trim());
    const out = [];
    linhas.forEach((l, i) => { if (/target=(git|gh):/i.test(l)) out.push(l + ' | ' + (linhas[i + 2] || '') + ' | ' + (linhas[i + 1] || '')); });
    return out.sort().join('\n');
}
const loginsEmAndamento = new Set();
async function credencialIdentidade(id, acao) {
    const d = le();
    const ident = d.identidadesGit.find(g => g.id === id);
    if (!ident) throw erroPerfil('Identidade não encontrada.');
    const namespace = 'redcode-' + ident.id;
    // Trava: gitconfig regerado agora, namespace no env e conferido antes de chamar o GCM
    const env = { ...process.env, GIT_CONFIG_GLOBAL: geraGitconfig(ident), GCM_NAMESPACE: namespace, GIT_TERMINAL_PROMPT: '0' };
    delete env.GH_TOKEN; delete env.GITHUB_TOKEN;
    const conf = await rodaGit(['config', '--get', 'credential.namespace'], env, '', 10000);
    if (conf.saida.trim() !== namespace) throw erroPerfil('Trava de segurança: o namespace da identidade não foi aplicado. Nada foi feito.', 500);
    if (acao === 'prova') {
        // Credencial falsa num host inventado: tem de aparecer no namespace da identidade, e o git:/gh: real não pode mudar
        const antes = await fotoDoCofre();
        const falsa = 'protocol=https\nhost=redcode-teste.invalid\nusername=redcode\npassword=redcode-prova\n\n';
        await rodaGit(['credential', 'approve'], { ...env, GCM_INTERACTIVE: 'never' }, falsa, 20000);
        const lista = await rodaCmdkey();
        const apareceu = lista.toLowerCase().includes((namespace + ':https://redcode-teste.invalid').toLowerCase());
        await rodaGit(['credential', 'reject'], { ...env, GCM_INTERACTIVE: 'never' }, falsa, 20000);
        const depois = await fotoDoCofre();
        const ok = apareceu && antes === depois;
        if (ok) { const d2 = le(); const i2 = d2.identidadesGit.find(g => g.id === id); if (i2) { i2.namespaceOk = true; grava(d2); } }
        return { ok, apareceu, cofreIgual: antes === depois };
    }
    if (!ident.usuarioGithub) throw erroPerfil('Informe o usuário do GitHub da identidade.');
    const pedido = `protocol=https\nhost=github.com\nusername=${ident.usuarioGithub}\n\n`;
    if (acao === 'fill') {
        const r = await rodaGit(['credential', 'fill'], { ...env, GCM_INTERACTIVE: 'never' }, pedido, 10000);
        const m = r.ok && r.saida.match(/^password=(.+)$/m);
        return m ? m[1].trim() : null;
    }
    if (acao === 'reject') { await rodaGit(['credential', 'reject'], { ...env, GCM_INTERACTIVE: 'never' }, pedido, 20000); return true; }
    if (acao === 'login') {
        if (!ident.namespaceOk) throw erroPerfil('Antes do primeiro login, rode a verificação de segurança da identidade.');
        if (loginsEmAndamento.has(id)) throw erroPerfil('Já há um login desta identidade aberto.');
        loginsEmAndamento.add(id);
        try {
            // Credencial antiga (ex.: token revogado) faria o fill devolver ela mesma sem abrir a janela
            await rodaGit(['credential', 'reject'], { ...env, GCM_INTERACTIVE: 'never' }, pedido, 20000);
            const r = await rodaGit(['credential', 'fill'], env, pedido, 5 * 60 * 1000);
            if (!r.ok || !/^password=/m.test(r.saida)) throw erroPerfil('O login não foi concluído' + (r.erro ? ': ' + r.erro.split('\n').filter(l => !/password/i.test(l)).slice(-1)[0] : '.'));
            const salvo = await rodaGit(['credential', 'approve'], { ...env, GCM_INTERACTIVE: 'never' }, r.saida.trim() + '\n\n', 20000);
            if (!salvo.ok) throw erroPerfil('O GitHub aceitou, mas não deu para guardar o login.');
            tokensGh.delete(id);
            return true;
        } finally { loginsEmAndamento.delete(id); }
    }
    throw erroPerfil('Ação desconhecida.');
}
// Token do gh da identidade do perfil em uso: só para as chamadas do gh que o próprio app faz (avatar, PRs)
const tokensGh = new Map();
async function envGh() {
    const d = le();
    const perfil = todosPerfis(d).find(p => p.id === perfilEmUso()) || PERFIL_PADRAO;
    const ident = d.identidadesGit.find(g => g.id === perfil.git);
    if (!ident || !ident.usuarioGithub) return {};
    const c = tokensGh.get(ident.id);
    if (c && Date.now() - c.em < 600000) return c.token ? { GH_TOKEN: c.token } : {};
    let token = null;
    try { token = await credencialIdentidade(ident.id, 'fill'); } catch (e) { token = null; }
    tokensGh.set(ident.id, { token, em: Date.now() });
    return token ? { GH_TOKEN: token } : {};
}

// ---------- contas, identidades e perfis (CRUD) ----------
const ITENS_COPIA = ['settings.json', 'CLAUDE.md', 'agents', 'commands', 'skills', 'hooks', 'rules', 'plugins'];
// Chaves que são credencial: não vão para a conta nova (ela tem de fazer o próprio login)
const SEGREDO = /key|token|secret|senha|password|auth/i;
function semSegredos(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    const r = Array.isArray(obj) ? [] : {};
    for (const [k, v] of Object.entries(obj)) {
        if (['apiKeyHelper', 'awsAuthRefresh', 'awsCredentialExport', 'otelHeadersHelper'].includes(k)) continue;
        if ((k === 'env' || k === 'headers') && v && typeof v === 'object') { r[k] = Object.fromEntries(Object.entries(v).filter(([n]) => !SEGREDO.test(n))); continue; }
        r[k] = semSegredos(v);
    }
    return r;
}
function copiaConfiguracoes(destino) {
    for (const item of ITENS_COPIA) {
        const de = path.join(PASTA_CLAUDE_PADRAO, item);
        if (!fs.existsSync(de)) continue;
        if (item === 'settings.json') {
            try { fs.writeFileSync(path.join(destino, item), JSON.stringify(semSegredos(JSON.parse(fs.readFileSync(de, 'utf8'))), null, 2)); } catch (e) { /* settings com erro: não copia */ }
            continue;
        }
        fs.cpSync(de, path.join(destino, item), { recursive: true, force: false, errorOnExist: false });
    }
    // Servidores MCP de nível usuário ficam no ~/.claude.json: só a chave mcpServers
    try {
        const j = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude.json'), 'utf8'));
        if (j.mcpServers && !fs.existsSync(path.join(destino, '.claude.json'))) fs.writeFileSync(path.join(destino, '.claude.json'), JSON.stringify({ mcpServers: semSegredos(j.mcpServers) }, null, 2));
    } catch (e) { /* sem ~/.claude.json */ }
}
function backupPasta(pasta, rotulo) {
    if (!fs.existsSync(pasta)) return null;
    const d = new Date(), z = (n) => String(n).padStart(2, '0');
    const destino = path.join(PASTA_PERFIS, 'backups', `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}_${z(d.getHours())}-${z(d.getMinutes())}-${z(d.getSeconds())}`, rotulo);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.renameSync(pasta, destino);
    return destino;
}
// pendente: perfil que vai entrar na próxima subida (não pode ser apagado)
async function acao(corpo, pendente) {
    const d = le();
    const emUso = new Set([perfilEmUso(), pendente].filter(Boolean));
    const perfisUsando = (campo, id) => todosPerfis(d).filter(p => p[campo] === id && emUso.has(p.id));
    switch (corpo.acao) {
        case 'criar-conta': {
            const nome = texto(corpo.nome, 40, 'o nome da conta');
            const id = idNovo(nome, todasContas(d));
            fs.mkdirSync(pastaConta(id), { recursive: true });
            if (corpo.copiar !== false) copiaConfiguracoes(pastaConta(id));
            d.contasClaude.push({ id, nome });
            grava(d);
            return { id };
        }
        case 'editar-conta': {
            const c = d.contasClaude.find(x => x.id === corpo.id);
            if (!c) throw erroPerfil('Conta não encontrada.');
            c.nome = texto(corpo.nome, 40, 'o nome da conta');
            grava(d);
            return {};
        }
        case 'apagar-conta': {
            const c = d.contasClaude.find(x => x.id === corpo.id);
            if (!c) throw erroPerfil('Conta não encontrada.');
            const emExecucao = process.env.CLAUDE_CONFIG_DIR && path.resolve(process.env.CLAUDE_CONFIG_DIR).toLowerCase() === path.resolve(pastaConta(c.id)).toLowerCase();
            if (emExecucao || perfisUsando('claude', c.id).length) throw erroPerfil('Esta conta está em uso pelo perfil atual (ou pelo que vai entrar).');
            // Tira o login antes de guardar a pasta no backup
            try { fs.unlinkSync(path.join(pastaConta(c.id), '.credentials.json')); } catch (e) { /* sem login */ }
            const bk = backupPasta(pastaConta(c.id), 'claude-' + c.id);
            d.contasClaude = d.contasClaude.filter(x => x.id !== c.id);
            d.perfis.forEach(p => { if (p.claude === c.id) p.claude = 'padrao'; });
            grava(d);
            return { backup: bk };
        }
        case 'criar-identidade': {
            const v = validaIdentidade(corpo);
            const id = idNovo(v.nome, todasIdentidades(d));
            const ident = { id, ...v, namespaceOk: false };
            d.identidadesGit.push(ident);
            grava(d);
            geraGitconfig(ident);
            return { id };
        }
        case 'editar-identidade': {
            const g = d.identidadesGit.find(x => x.id === corpo.id);
            if (!g) throw erroPerfil('Identidade não encontrada.');
            Object.assign(g, validaIdentidade(corpo));
            grava(d);
            geraGitconfig(g);
            gitconfigsProntos.delete(g.id);
            tokensGh.delete(g.id);
            return {};
        }
        case 'apagar-identidade': {
            const g = d.identidadesGit.find(x => x.id === corpo.id);
            if (!g) throw erroPerfil('Identidade não encontrada.');
            const emExecucao = process.env.GIT_CONFIG_GLOBAL && path.resolve(process.env.GIT_CONFIG_GLOBAL).toLowerCase() === path.resolve(arquivoGitconfig(g.id)).toLowerCase();
            if (emExecucao || perfisUsando('git', g.id).length) throw erroPerfil('Esta identidade está em uso pelo perfil atual (ou pelo que vai entrar).');
            if (g.usuarioGithub) await credencialIdentidade(g.id, 'reject');
            const bk = backupPasta(pastaIdentidade(g.id), 'git-' + g.id);
            const d2 = le();
            d2.identidadesGit = d2.identidadesGit.filter(x => x.id !== g.id);
            d2.perfis.forEach(p => { if (p.git === g.id) p.git = 'padrao'; });
            grava(d2);
            tokensGh.delete(g.id);
            return { backup: bk };
        }
        case 'prova-identidade': return credencialIdentidade(String(corpo.id || ''), 'prova');
        case 'login-identidade': {
            const id = String(corpo.id || '');
            // Primeira vez: a verificação de segurança roda junto (antes ficava num botão à parte)
            if (!(d.identidadesGit.find(g => g.id === id) || {}).namespaceOk) {
                const prova = await credencialIdentidade(id, 'prova');
                if (!prova.ok) throw erroPerfil('A verificação de segurança falhou: o login no GitHub fica bloqueado para não arriscar o login de sempre.');
            }
            return { ok: await credencialIdentidade(id, 'login') };
        }
        case 'claude-login': {
            const id = String(corpo.id || '');
            if (id === 'padrao' && corpo.confirmado !== true) throw erroPerfil('Entrar na conta padrão troca o login do Claude de sempre: confirme antes.');
            return claudeLoginInicia(id);
        }
        case 'claude-login-codigo': return claudeLoginCodigo(String(corpo.id || ''), corpo.codigo);
        case 'claude-login-estado': return claudeLoginEstado(String(corpo.id || ''));
        case 'claude-login-cancelar': claudeLoginCancela(String(corpo.id || '')); return {};
        case 'criar-perfil':
        case 'editar-perfil': {
            const nome = texto(corpo.nome, 40, 'o nome do perfil');
            const cor = COR.test(String(corpo.cor || '')) ? corpo.cor.toLowerCase() : '#7aa2f7';
            const claude = todasContas(d).some(c => c.id === corpo.claude) ? corpo.claude : 'padrao';
            const git = todasIdentidades(d).some(g => g.id === corpo.git) ? corpo.git : 'padrao';
            if (corpo.acao === 'criar-perfil') {
                const id = idNovo(nome, todosPerfis(d));
                d.perfis.push({ id, nome, cor, claude, git });
                grava(d);
                return { id };
            }
            const p = d.perfis.find(x => x.id === corpo.id);
            if (corpo.id === 'padrao') {
                // Padrão: só a conta e a identidade mudam (nome e cor são fixos)
                d.padraoClaude = claude;
                d.padraoGit = git;
                grava(d);
                return {};
            }
            if (!p) throw erroPerfil('Perfil não encontrado.');
            Object.assign(p, { nome, cor, claude, git });
            grava(d);
            return {};
        }
        case 'apagar-perfil': {
            if (emUso.has(corpo.id)) throw erroPerfil('Não dá para apagar o perfil em uso (ou o que vai entrar).');
            d.perfis = d.perfis.filter(x => x.id !== corpo.id);
            grava(d);
            return {};
        }
        default: throw erroPerfil('Ação desconhecida.');
    }
}
// Grava o perfil ativo (chamado pelo servidor logo antes de sair para subir de novo)
function gravaAtivo(id) {
    let d;
    try { d = le(); } catch (e) { return false; }
    if (!todosPerfis(d).some(p => p.id === id)) return false;
    d.ativo = id;
    grava(d);
    return true;
}
// ---------- Login do Claude sem terminal: "claude auth login" abre o navegador; o site devolve um código para colar ----------
// O login da conta padrão (~/.claude, usada também no VS Code) só acontece com confirmação explícita da tela.
const CLAUDE_EXE = path.join(__dirname, 'node_modules', '@anthropic-ai', 'claude-agent-sdk-win32-' + (process.arch === 'arm64' ? 'arm64' : 'x64'), 'claude.exe');
function envDaConta(id) {
    const env = { ...process.env };
    // Conta padrão: sem CLAUDE_CONFIG_DIR (com ele apontando para ~/.claude, o Claude procuraria o .claude.json no lugar errado)
    delete env.CLAUDE_CONFIG_DIR;
    if (id !== 'padrao') {
        if (!le().contasClaude.some(c => c.id === id)) throw erroPerfil('Conta não encontrada.');
        fs.mkdirSync(pastaConta(id), { recursive: true });
        env.CLAUDE_CONFIG_DIR = pastaConta(id);
    }
    return env;
}
const statusContas = new Map();
// Quem está conectado em cada conta (e-mail e organização), com cache de 5 min
function statusConta(id, forcar) {
    const c = statusContas.get(id);
    if (!forcar && c && Date.now() - c.em < 300000) return c.promessa;
    const promessa = new Promise((resolve) => {
        let env;
        try { env = envDaConta(id); } catch (e) { return resolve({ logada: false }); }
        if (!fs.existsSync(CLAUDE_EXE)) return resolve({ logada: fs.existsSync(path.join(env.CLAUDE_CONFIG_DIR || PASTA_CLAUDE_PADRAO, '.credentials.json')) });
        execFile(CLAUDE_EXE, ['auth', 'status', '--json'], { env, timeout: 20000, windowsHide: true }, (falha, saida) => {
            try {
                const j = JSON.parse(String(saida || '{}'));
                resolve({ logada: !!j.loggedIn, email: j.email || '', organizacao: j.orgName || '', metodo: j.authMethod || '' });
            } catch (e) { resolve({ logada: fs.existsSync(path.join(env.CLAUDE_CONFIG_DIR || PASTA_CLAUDE_PADRAO, '.credentials.json')) }); }
        });
    });
    statusContas.set(id, { em: Date.now(), promessa });
    return promessa;
}
const loginsClaude = new Map();
function claudeLoginInicia(id) {
    const antigo = loginsClaude.get(id);
    if (antigo && antigo.vivo) { try { antigo.proc.kill(); } catch (e) { /* já saiu */ } }
    if (!fs.existsSync(CLAUDE_EXE)) throw erroPerfil('Não achei o Claude que vem com o Red Code (' + CLAUDE_EXE + ').');
    const proc = require('child_process').spawn(CLAUDE_EXE, ['auth', 'login'], { env: envDaConta(id), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const l = { proc, vivo: true, url: '', saida: '', codigo: null, inicio: Date.now() };
    loginsClaude.set(id, l);
    const junta = (d) => {
        l.saida = (l.saida + d).slice(-4000);
        const m = l.saida.match(/https:\/\/\S+oauth\S+/);
        if (m && !l.url) l.url = m[0];
    };
    proc.stdout.on('data', junta);
    proc.stderr.on('data', junta);
    proc.stdin.on('error', () => {});
    proc.on('exit', (codigo) => { l.vivo = false; l.codigo = codigo; statusContas.delete(id); });
    // Desiste sozinho depois de 10 min sem terminar
    setTimeout(() => { if (l.vivo) try { proc.kill(); } catch (e) { /* já saiu */ } }, 600000).unref();
    return new Promise((resolve) => {
        const t0 = Date.now();
        const espera = () => {
            if (l.url || !l.vivo || Date.now() - t0 > 20000) return resolve({ url: l.url, vivo: l.vivo });
            setTimeout(espera, 200);
        };
        espera();
    });
}
// O que o processo disse, sem nada que pareça código ou token
const saidaLimpa = (t) => String(t || '').replace(/https:\/\/\S+/g, '[link]').replace(/[A-Za-z0-9#._~-]{30,}/g, '[…]').split(/\r?\n/).map(s => s.trim()).filter(Boolean).slice(-4).join(' · ');
async function claudeLoginCodigo(id, codigo) {
    const l = loginsClaude.get(id);
    if (!l || !l.vivo) throw erroPerfil('O login não está mais aberto. Clique em Entrar de novo.');
    const c = String(codigo || '').trim();
    if (!/^[A-Za-z0-9#._~-]{8,800}$/.test(c)) throw erroPerfil('Esse código não parece o do site do Claude. Copie o código inteiro.');
    l.proc.stdin.write(c + '\r\n');
    const t0 = Date.now();
    while (l.vivo && Date.now() - t0 < 90000) await new Promise(r => setTimeout(r, 300));
    if (l.vivo) { try { l.proc.kill(); } catch (e) { /* já saiu */ } }
    const st = await statusConta(id, true);
    return st.logada ? st : { ...st, erro: 'O login não foi concluído' + (saidaLimpa(l.saida) ? ': ' + saidaLimpa(l.saida) : '.') };
}
async function claudeLoginEstado(id) {
    const l = loginsClaude.get(id);
    if (!l) return { aberto: false };
    if (l.vivo) return { aberto: true, url: l.url };
    return { aberto: false, ...(await statusConta(id, true)) };
}
function claudeLoginCancela(id) {
    const l = loginsClaude.get(id);
    if (l && l.vivo) { try { l.proc.kill(); } catch (e) { /* já saiu */ } }
    loginsClaude.delete(id);
}
// Identidade do Git de sempre (o ~/.gitconfig real), para mostrar na tela
let gitPadraoCache = null;
function gitPadrao() {
    if (gitPadraoCache && Date.now() - gitPadraoCache.em < 300000) return gitPadraoCache.promessa;
    const env = { ...process.env };
    delete env.GIT_CONFIG_GLOBAL;
    const le1 = (chave) => new Promise((resolve) => execFile(GIT_EXE, ['config', '--global', '--get', chave], { env, timeout: 10000, windowsHide: true }, (f, s) => resolve(String(s || '').trim())));
    const promessa = Promise.all([le1('user.name'), le1('user.email')]).then(([usuario, email]) => ({ usuario, email }));
    gitPadraoCache = { em: Date.now(), promessa };
    return promessa;
}

// ---------- Por conversa: env completo a partir do env do servidor (que já é o do perfil em uso) ----------
// entrada = { claude, git } (ids). Só a parte definida é limpa e redefinida; sem entrada, fica o env do servidor.
const gitconfigsProntos = new Set();
function envDaConversa(entrada) {
    const env = { ...process.env };
    if (!entrada) return env;
    const d = le();
    if (entrada.claude) {
        delete env.CLAUDE_CONFIG_DIR;
        if (entrada.claude !== 'padrao') {
            if (!d.contasClaude.some(c => c.id === entrada.claude)) throw erroPerfil('A conta do Claude desta conversa não existe mais.');
            fs.mkdirSync(pastaConta(entrada.claude), { recursive: true });
            env.CLAUDE_CONFIG_DIR = pastaConta(entrada.claude);
        }
    }
    if (entrada.git) {
        for (const k of ['GIT_CONFIG_GLOBAL', 'GH_CONFIG_DIR', 'GCM_NAMESPACE', 'GH_TOKEN', 'GITHUB_TOKEN']) delete env[k];
        if (entrada.git !== 'padrao') {
            const ident = d.identidadesGit.find(g => g.id === entrada.git);
            if (!ident) throw erroPerfil('A identidade do Git desta conversa não existe mais.');
            // gitconfig gerado uma vez por identidade (não regrava a cada comando do git)
            if (!gitconfigsProntos.has(ident.id) || !fs.existsSync(arquivoGitconfig(ident.id))) { geraGitconfig(ident); gitconfigsProntos.add(ident.id); }
            env.GIT_CONFIG_GLOBAL = arquivoGitconfig(ident.id);
            env.GH_CONFIG_DIR = path.join(pastaIdentidade(ident.id), 'gh');
        }
    }
    return env;
}
// Pasta da conta do Claude que um env usa (para comparar contas pela pasta resolvida)
function contaDoEnv(env) { return path.resolve((env && env.CLAUDE_CONFIG_DIR) || PASTA_CLAUDE_PADRAO).toLowerCase(); }
// projects/ de uma conta (onde ficam as conversas dela)
function raizDaConta(id) { return path.join(id === 'padrao' ? PASTA_CLAUDE_PADRAO : pastaConta(id), 'projects'); }
function existeConta(id) { return id === 'padrao' || le().contasClaude.some(c => c.id === id); }
function existeIdentidade(id) { return id === 'padrao' || le().identidadesGit.some(g => g.id === id); }
// Token do gh para uma identidade específica (a da conversa); padrão = o gh de sempre
async function envGhDaIdentidade(id) {
    if (!id || id === 'padrao') return {};
    const ident = le().identidadesGit.find(g => g.id === id);
    if (!ident || !ident.usuarioGithub) return {};
    const c = tokensGh.get(ident.id);
    if (c && Date.now() - c.em < 600000) return c.token ? { GH_TOKEN: c.token } : {};
    let token = null;
    try { token = await credencialIdentidade(ident.id, 'fill'); } catch (e) { token = null; }
    tokensGh.set(ident.id, { token, em: Date.now() });
    return token ? { GH_TOKEN: token } : {};
}
// Lista para a tela (sem token nenhum)
async function lista() {
    const d = le();
    const contas = await Promise.all(todasContas(d).map(async c => ({ ...c, ...(await statusConta(c.id)), loginAberto: !!(loginsClaude.get(c.id) && loginsClaude.get(c.id).vivo) })));
    const identidades = await Promise.all(todasIdentidades(d).map(async g => {
        if (g.id === 'padrao') return { ...g, ...(await gitPadrao()), logada: true };
        let logada = false;
        if (g.usuarioGithub && g.namespaceOk) {
            const c = tokensGh.get(g.id);
            if (c && Date.now() - c.em < 600000) logada = !!c.token;
            else { let token = null; try { token = await credencialIdentidade(g.id, 'fill'); } catch (e) { token = null; } tokensGh.set(g.id, { token, em: Date.now() }); logada = !!token; }
        }
        return { id: g.id, nome: g.nome, usuario: g.usuario, email: g.email, usuarioGithub: g.usuarioGithub || '', namespaceOk: !!g.namespaceOk, logada };
    }));
    return { ativo: perfilEmUso(), perfis: todosPerfis(d), contas, identidades, pasta: PASTA_PERFIS };
}
function perfilInfo(id) {
    const d = le();
    const p = todosPerfis(d).find(x => x.id === (id || perfilEmUso())) || PERFIL_PADRAO;
    return { id: p.id, nome: p.nome, cor: p.cor };
}
// Env que a tela mostra (só caminhos; nunca token)
function envVisivel(id, d = le()) {
    const perfil = todosPerfis(d).find(p => p.id === id) || PERFIL_PADRAO;
    const env = { PAINEL_PERFIL: perfil.id };
    if (d.contasClaude.some(c => c.id === perfil.claude)) env.CLAUDE_CONFIG_DIR = pastaConta(perfil.claude);
    if (d.identidadesGit.some(g => g.id === perfil.git)) { env.GIT_CONFIG_GLOBAL = arquivoGitconfig(perfil.git); env.GH_CONFIG_DIR = path.join(pastaIdentidade(perfil.git), 'gh'); }
    return env;
}
function existePerfil(id) { return todosPerfis(le()).some(p => p.id === id); }
// Pasta da conta para o terminal de login do Claude
function pastaDaConta(id) {
    const d = le();
    if (id === 'padrao') return PASTA_CLAUDE_PADRAO;
    return d.contasClaude.some(c => c.id === id) ? pastaConta(id) : null;
}

module.exports = { envDaConversa, contaDoEnv, raizDaConta, existeConta, existeIdentidade, envGhDaIdentidade, existePerfil, PASTA_PERFIS, le, grava, envDoPerfil, pastaClaude, perfilEmUso, credencialIdentidade, envGh, acao, gravaAtivo, lista, perfilInfo, envVisivel, pastaDaConta, ID };
