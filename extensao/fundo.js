// Red Code: repassa o estado do vídeo das abas do YouTube para o Red Code (servidor local do PC).
// Daqui (e não da página) porque a extensão pode falar com o 127.0.0.1 sem o bloqueio de origem do site.
const PORTAS = [4317, 4319];
chrome.runtime.onMessage.addListener((msg, remetente) => {
    if (!msg || !remetente.tab) return;
    const corpo = JSON.stringify({ aba: remetente.tab.id, janela: remetente.tab.windowId, fim: msg.tipo === 'fim', ...(msg.estado || {}) });
    for (const porta of PORTAS) {
        fetch(`http://127.0.0.1:${porta}/api/midia/video`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Redcode-Extensao': '1' }, body: corpo })
            .catch(() => { /* Red Code fechado ou em outra porta */ });
    }
});
// Aba fechada: o Red Code esquece o vídeo dela
chrome.tabs.onRemoved.addListener((aba) => {
    for (const porta of PORTAS) {
        fetch(`http://127.0.0.1:${porta}/api/midia/video`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Redcode-Extensao': '1' }, body: JSON.stringify({ aba, fim: true }) }).catch(() => { });
    }
});
// Instalada ou recarregada: entra nas abas do YouTube que já estavam abertas (senão só valeria depois de recarregar a página)
chrome.runtime.onInstalled.addListener(async () => {
    const abas = await chrome.tabs.query({ url: ['*://www.youtube.com/*', '*://music.youtube.com/*', '*://m.youtube.com/*'] });
    for (const aba of abas) chrome.scripting.executeScript({ target: { tabId: aba.id }, files: ['pagina.js'] }).catch(() => { });
    for (const aba of abas) chrome.scripting.executeScript({ target: { tabId: aba.id }, files: ['principal.js'], world: 'MAIN' }).catch(() => { });
});
