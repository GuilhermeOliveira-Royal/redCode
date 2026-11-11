// Publica a release da versão do package.json no GitHub: cria a tag v<versão> no main, põe as notas do
// novidades.js e sobe o dist/RedCode-portatil-win64.zip (rodar antes: node empacotar.js).
// O token vem do gerenciador de credenciais do git (o mesmo do push); nunca é impresso nem gravado.
// Uso: node ferramentas/publicar-release.js
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const REPO = 'HickysDev/redCode';
const ZIP = path.join(RAIZ, 'dist', 'RedCode-portatil-win64.zip');

(async () => {
    const versao = JSON.parse(fs.readFileSync(path.join(RAIZ, 'package.json'), 'utf8')).version;
    const entrada = require(path.join(RAIZ, 'novidades.js')).find(v => v.versao === versao);
    if (!entrada) throw new Error(`O novidades.js não tem a versão ${versao}: registre o que entrou antes de publicar.`);
    if (!fs.existsSync(ZIP)) throw new Error('Falta o zip: rode node empacotar.js antes.');
    // O zip precisa ser desta versão (gerado depois da última mudança no package.json)
    if (fs.statSync(ZIP).mtimeMs < fs.statSync(path.join(RAIZ, 'package.json')).mtimeMs) throw new Error('O zip é anterior ao package.json: rode node empacotar.js de novo.');

    const credencial = execSync('git credential fill', { input: 'protocol=https\nhost=github.com\n\n', cwd: RAIZ }).toString();
    const token = (credencial.match(/^password=(.*)$/m) || [])[1];
    if (!token) throw new Error('Sem credencial do GitHub no git (faça um push antes, para o Windows guardar o login).');
    const H = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'User-Agent': 'redcode-release' };

    const corpo = entrada.itens.map(i => '- ' + i).join('\n');
    let r = await fetch(`https://api.github.com/repos/${REPO}/releases`, { method: 'POST', headers: H, body: JSON.stringify({ tag_name: 'v' + versao, target_commitish: 'main', name: 'Red Code ' + versao, body: corpo }) });
    const release = await r.json();
    if (!r.ok) throw new Error(`O GitHub recusou a release (${r.status}): ${release.message}`);
    console.log('release', release.html_url);

    // O app procura o asset por /portatil.*\.zip$/ (desktop/atualizacao.js): não trocar o nome
    const url = release.upload_url.replace(/\{.*$/, '') + '?name=' + path.basename(ZIP);
    r = await fetch(url, { method: 'POST', headers: { ...H, 'Content-Type': 'application/zip', 'Content-Length': String(fs.statSync(ZIP).size) }, body: fs.readFileSync(ZIP), duplex: 'half' });
    const asset = await r.json();
    if (!r.ok) throw new Error(`O upload do zip falhou (${r.status}): ${asset.message}`);
    console.log(`zip enviado: ${Math.round(asset.size / 1048576)} MB`);

    // Confere como o app vê: a versão anterior tem de achar esta
    const atualizacao = require(path.join(RAIZ, 'desktop', 'atualizacao.js'));
    const p = versao.split('.').map(Number);
    const anterior = p[2] > 0 ? `${p[0]}.${p[1]}.${p[2] - 1}` : null;
    if (anterior) { const vista = await atualizacao.releaseNova(anterior); console.log(`a ${anterior} vê: ${vista ? vista.versao : 'nada (confira a release)'}`); }
})().catch(e => { console.error('ERRO: ' + e.message); process.exit(1); });
