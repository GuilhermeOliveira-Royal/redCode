// Player do rodapé: o que está tocando no Windows (Spotify, YouTube no navegador...) pelos controles de mídia do sistema.
// Um PowerShell só (midia.ps1) fica ligado enquanto a tela pergunta; 60 s sem perguntar, ele é desligado.
const { spawn } = require('child_process');
const path = require('path');

const COMANDOS = ['alternar', 'proxima', 'anterior'];
let proc = null, estado = { nada: true }, capa = null, versaoCapa = 0, ultimoUso = 0, timerOcioso = null, falhas = 0, esperaReligar = 0;

function liga() {
    if (proc || process.platform !== 'win32' || Date.now() < esperaReligar) return;
    proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'midia.ps1')], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    let resto = '';
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (pedaco) => {
        const linhas = (resto + pedaco).split(/\r?\n/);
        resto = linhas.pop();
        for (const linha of linhas) {
            if (!linha.trim()) continue;
            let o;
            try { o = JSON.parse(linha); } catch (e) { continue; }
            falhas = 0;
            // Capa só vem quando a música muda ('' = música sem capa)
            if (typeof o.capa === 'string') { capa = o.capa ? Buffer.from(o.capa, 'base64') : null; versaoCapa++; }
            delete o.capa;
            estado = { ...o, capa: capa ? versaoCapa : 0, lidoEm: Date.now() };
        }
    });
    const morreu = () => {
        if (!proc) return;
        proc = null;
        // Caiu sozinho: tenta de novo mais tarde (cada falha seguida espera mais, até 5 min)
        if (Date.now() - ultimoUso < 60000) { falhas++; esperaReligar = Date.now() + Math.min(300000, 5000 * 2 ** (falhas - 1)); }
    };
    proc.on('exit', morreu);
    proc.on('error', morreu);
    proc.stdin.on('error', () => { /* processo já fechou */ });
}
function desliga() {
    if (!proc) return;
    const p = proc;
    proc = null;
    try { p.stdin.end(); } catch (e) { /* já fechado */ }
    setTimeout(() => { try { p.kill(); } catch (e) { /* já saiu */ } }, 3000);
    estado = { nada: true };
}
function usado() {
    ultimoUso = Date.now();
    liga();
    clearTimeout(timerOcioso);
    timerOcioso = setTimeout(desliga, 60000);
    timerOcioso.unref();
}
function le() { usado(); return estado; }
function comando(acao) {
    if (!COMANDOS.includes(acao)) throw new Error('Comando de mídia inválido.');
    usado();
    if (!proc) throw new Error('O player do Windows não está disponível agora.');
    proc.stdin.write(acao + '\n');
}
function capaAtual() { return capa; }

module.exports = { le, comando, capaAtual, desliga };
