// Red Code: roda dentro da própria página do YouTube / YouTube Music (mundo da página, não o isolado da extensão),
// onde dá para perguntar ao player o tempo exato da faixa e o id do vídeo que está tocando de verdade. Manda para
// o pagina.js (que fala com a extensão) por postMessage, a cada evento do <video>.
(() => {
    // Trava por versão: recarregar a extensão injeta de novo, e a versão nova desliga a anterior (o mundo da página não
    // é limpo quando a extensão recarrega)
    const VERSAO = 2;
    if (window.__redcodePrincipal && window.__redcodePrincipal.versao >= VERSAO) return;
    if (window.__redcodePrincipal && window.__redcodePrincipal.desliga) window.__redcodePrincipal.desliga();
    let desligado = false;
    window.__redcodePrincipal = { versao: VERSAO, desliga: () => { desligado = true; } };
    const player = () => document.querySelector('#movie_player');
    let video = null;
    // Próximas 2 da fila do YouTube Music: id da música e o do clipe correspondente (modo Vídeo toca o clipe)
    function proximos(idAgora) {
        const itens = [...document.querySelectorAll('ytmusic-player-queue-item')];
        const dadosDe = (i) => i.data || (i.__data && i.__data.data) || null;
        // A que toca: a marcada como selecionada ou, se nenhuma, a com o id do player
        let atual = itens.findIndex(i => i.hasAttribute('selected') || i.selected);
        if (atual < 0 && idAgora) atual = itens.findIndex(i => { const d = dadosDe(i); return d && d.videoId === idAgora; });
        if (atual < 0) return [];
        const ids = [];
        for (const i of itens.slice(atual + 1, atual + 3)) {
            const d = dadosDe(i);
            if (!d) continue;
            if (d.videoId) ids.push(d.videoId);
            const par = d.counterpart && d.counterpart[0] && d.counterpart[0].counterpartRenderer && d.counterpart[0].counterpartRenderer.playlistPanelVideoRenderer;
            if (par && par.videoId) ids.push(par.videoId);
        }
        return ids.filter(x => /^[\w-]{11}$/.test(x));
    }
    let filaEm = 0, fila = [];
    function avisa(motivo) {
        const p = player();
        if (desligado || !p || typeof p.getCurrentTime !== 'function') return;
        let dados = null;
        try { dados = p.getVideoData ? p.getVideoData() : null; } catch (e) { dados = null; }
        // A fila muda pouco: lê de 5 em 5 s (ou quando a música troca)
        if (Date.now() - filaEm > 5000 || motivo === 'loadeddata') { filaEm = Date.now(); try { fila = proximos(dados && dados.video_id); } catch (e) { fila = []; } }
        window.postMessage({ redcode: 'tempo', t: p.getCurrentTime(), d: typeof p.getDuration === 'function' ? p.getDuration() : 0, id: dados && dados.video_id || '', quando: Date.now(), proximos: fila, versao: VERSAO, motivo }, location.origin);
    }
    const EVENTOS = ['timeupdate', 'play', 'playing', 'pause', 'waiting', 'seeked', 'ratechange', 'loadeddata', 'ended'];
    function liga() {
        const v = document.querySelector('#movie_player video') || document.querySelector('video');
        if (!v || v === video) return;
        if (video) for (const ev of EVENTOS) video.removeEventListener(ev, video.__redcodeTempo);
        video = v;
        v.__redcodeTempo = (ev) => avisa(ev.type);
        for (const ev of EVENTOS) v.addEventListener(ev, v.__redcodeTempo);
    }
    new MutationObserver(() => { if (!desligado) liga(); }).observe(document.documentElement, { childList: true, subtree: true });
    liga();
})();
