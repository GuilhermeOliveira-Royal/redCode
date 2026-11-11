// Plugins do Claude Code pelo executável oficial (`claude plugin ...`): instalar, atualizar, desinstalar e
// gerenciar marketplaces. Plugin roda código no PC (hooks, servidores MCP), então nada aqui instala sem a
// confirmação da pessoa: o comando que um marketplace declara é mostrado inteiro e só vale com o sha256 que o
// próprio servidor viu na primeira fase. Os argumentos de cada ação são montados de uma lista fixa; do cliente só
// vêm o id do plugin, o nome ou a fonte do marketplace, todos validados por regex.
const { execFile } = require('child_process');
const login = require('./login');

const ID_PLUGIN = /^[a-z0-9][a-z0-9._-]{0,63}(@[a-z0-9][a-z0-9._-]{0,63})?$/i;
const NOME_MERCADO = /^[a-z0-9][a-z0-9._-]{0,63}$/i;
const FONTE_GITHUB = /^[A-Za-z0-9][\w.-]{0,38}\/[A-Za-z0-9][\w.-]{0,99}$/;
const HOSTS_GIT = ['github.com', 'gitlab.com'];
const SHA256 = /^[a-f0-9]{64}$/;
const LIMITE_COMANDO = 4096;
const VALIDADE_CONFIRMACAO = 5 * 60 * 1000;

const erro = (status, mensagem) => Object.assign(new Error(mensagem), { status });

// Uma operação de escrita por vez; o toggle do settings.json (server.js) também espera por ela
let ocupado = false;
const emAndamento = () => ocupado;
async function comTrava(fn) {
    if (ocupado) throw erro(409, 'Já há uma operação de plugin em andamento. Espere terminar.');
    ocupado = true;
    try { return await fn(); } finally { ocupado = false; }
}

// id -> { sha, em }: o sha256 que o servidor viu na fase 1; a fase 2 só vale para o mesmo id e o mesmo sha
const confirmacoes = new Map();

function roda(argumentos) {
    return new Promise((resolve) => {
        const exe = login.acharClaude();
        if (!exe) return resolve({ erro: new Error('sem executável'), saida: '', saidaErro: '' });
        // Sem TTY: o stdin fecha na hora, para o comando nunca ficar esperando uma pergunta
        const filho = execFile(exe, argumentos, { env: login.ambienteLimpo(), timeout: 180000, windowsHide: true, maxBuffer: 4e6 },
            (falha, saida, saidaErro) => resolve({ erro: falha, saida: String(saida || ''), saidaErro: String(saidaErro || '') }));
        if (filho.stdin) filho.stdin.end();
    });
}

// Uma linha só, curta, sem caminho do disco nem nada que pareça token
function linhaSegura(texto) {
    const linha = String(texto || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean)[0] || '';
    return linha.replace(/[A-Za-z]:\\[^\s"']+/g, '[caminho]').replace(/(?:\/[\w.@~-]+){2,}/g, '[caminho]')
        .replace(/[A-Za-z0-9_+/=-]{32,}/g, '[…]').slice(0, 200);
}

// O resultado --json vem na primeira linha; o texto humano depois dela nunca sai daqui
function primeiraLinhaJson(texto) {
    const primeira = String(texto || '').split(/\r?\n/).find(l => l.trim()) || '';
    try { const j = JSON.parse(primeira); return j && typeof j === 'object' ? j : null; } catch (e) { return null; }
}

function jsonCompleto(texto) {
    try { return JSON.parse(texto); } catch (e) { return null; }
}

function validaId(id) {
    const s = String(id || '').trim();
    if (!ID_PLUGIN.test(s) || /@npm$/i.test(s)) throw erro(400, 'Nome inválido. Use nome@marketplace, por exemplo hostinger@claude-plugins-official.');
    return s;
}

// Fonte de marketplace: owner/repo do GitHub, ou https de github.com/gitlab.com sem login, porta nem parâmetros
function validaFonte(texto) {
    const s = String(texto || '').trim();
    if (FONTE_GITHUB.test(s)) return s;
    let u;
    try { u = new URL(s); } catch (e) { throw erro(400, 'Fonte inválida. Use dono/repositorio ou um endereço https do GitHub ou GitLab.'); }
    const caminho = u.pathname.replace(/\.git$/, '').replace(/^\//, '');
    const ok = u.protocol === 'https:' && HOSTS_GIT.includes(u.hostname.toLowerCase()) && !u.username && !u.password && !u.port
        && !u.search && !u.hash && FONTE_GITHUB.test(caminho);
    if (!ok) throw erro(400, 'Fonte inválida. Use dono/repositorio ou um endereço https do GitHub ou GitLab.');
    return s;
}

// Fonte mostrada na tela: sem login, parâmetros nem caminho do disco
function fonteMostrada(m) {
    if (m && m.repo && FONTE_GITHUB.test(String(m.repo))) return String(m.repo);
    const bruta = m && (m.url || m.source);
    try { const u = new URL(String(bruta)); return `${u.protocol}//${u.hostname}${u.pathname}`.slice(0, 120); } catch (e) { return ''; }
}

async function estado() {
    const [a, b] = await Promise.all([roda(['plugin', 'list', '--json']), roda(['plugin', 'marketplace', 'list', '--json'])]);
    const lista = jsonCompleto(a.saida), mercados = jsonCompleto(b.saida);
    return {
        instalados: (Array.isArray(lista) ? lista : []).filter(p => p && ID_PLUGIN.test(String(p.id))).map(p => ({
            id: String(p.id), versao: String(p.version || '').slice(0, 40), ligado: !!p.enabled,
        })),
        mercados: (Array.isArray(mercados) ? mercados : []).filter(m => m && NOME_MERCADO.test(String(m.name))).map(m => ({
            nome: String(m.name), fonte: fonteMostrada(m),
        })),
        // A conta do perfil ativo é a afetada: o servidor herda o CLAUDE_CONFIG_DIR dela na subida
        contaEspecifica: !!process.env.CLAUDE_CONFIG_DIR,
    };
}

// Instalar e atualizar: em duas fases quando o marketplace declara um comando
async function instalarOuAtualizar(acao, idBruto, aceitarComando) {
    const id = validaId(idBruto);
    const chave = `${acao}:${id}`;
    return comTrava(async () => {
        const argumentos = ['plugin', acao, id, '--json', '-s', 'user'];
        if (aceitarComando) {
            const c = confirmacoes.get(chave);
            confirmacoes.delete(chave);   // cada confirmação serve uma vez só
            if (!SHA256.test(String(aceitarComando)) || !c || c.sha !== aceitarComando || Date.now() - c.em > VALIDADE_CONFIRMACAO) {
                throw erro(400, 'Confirmação inválida ou vencida. Comece de novo.');
            }
            argumentos.push('--accept-command', aceitarComando);
        }
        const r = await roda(argumentos);
        const j = primeiraLinhaJson(r.saida);
        const mostrado = j && j.shownCommand;
        if (mostrado) {
            // Na fase 2 o comando não pode ter mudado: se vier outro, nada é aceito e a pessoa começa de novo
            if (aceitarComando) throw erro(422, 'O comando do marketplace mudou desde a confirmação. Nada foi instalado; comece de novo.');
            const sha = String(mostrado.sha256 || '');
            const texto = String(mostrado.command ?? mostrado.cmd ?? mostrado.text ?? '');
            if (!SHA256.test(sha) || !texto) throw erro(422, 'Não foi possível confirmar o comando do marketplace. Nada foi instalado.');
            if (texto.length > LIMITE_COMANDO) throw erro(422, 'O comando do marketplace é grande demais para conferir na tela. Nada foi instalado.');
            confirmacoes.set(chave, { sha, em: Date.now() });
            return { precisaConfirmar: true, comando: texto, sha256: sha, mercado: id.split('@')[1] || null };
        }
        if (j && j.outcome === 'ok') { return { ok: true, mensagem: linhaSegura(j.message) || 'Pronto.' }; }
        throw erro(422, linhaSegura(j && j.message) || (r.erro && r.erro.killed ? 'Demorou demais e foi interrompido.' : 'Não foi possível concluir.'));
    });
}

const instalar = (id, aceitarComando) => instalarOuAtualizar('install', id, aceitarComando);
const atualizar = (id, aceitarComando) => instalarOuAtualizar('update', id, aceitarComando);

async function simples(argumentos, mensagemFixa) {
    const r = await roda(argumentos);
    const j = primeiraLinhaJson(r.saida);
    if (j && j.outcome === 'ok') return { ok: true, mensagem: mensagemFixa || linhaSegura(j.message) || 'Pronto.' };
    throw erro(422, linhaSegura(j && j.message) || 'Não foi possível concluir.');
}

async function desinstalar(idBruto) {
    const id = validaId(idBruto);
    return comTrava(() => simples(['plugin', 'uninstall', id, '--json', '-s', 'user']));
}

async function mercadoAdicionar(fonteBruta) {
    const fonte = validaFonte(fonteBruta);
    return comTrava(() => simples(['plugin', 'marketplace', 'add', fonte, '--json', '--scope', 'user'], 'Marketplace adicionado.'));
}

async function mercadoRemover(nomeBruto) {
    const nome = String(nomeBruto || '').trim();
    if (!NOME_MERCADO.test(nome)) throw erro(400, 'Nome de marketplace inválido.');
    return comTrava(() => simples(['plugin', 'marketplace', 'remove', nome, '--json', '--scope', 'user']));
}

module.exports = { estado, instalar, atualizar, desinstalar, mercadoAdicionar, mercadoRemover, emAndamento, validaFonte, validaId, linhaSegura };
