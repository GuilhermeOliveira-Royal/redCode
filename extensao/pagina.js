// Red Code: avisa qual vídeo está tocando nesta aba e em que segundo. O Red Code toca uma cópia muda no canto
// (não lê a tela: só o id do vídeo, o tempo e se está pausado). Funciona com a aba de trás ou o navegador minimizado,
// porque usa os eventos do próprio <video> (timers de aba de trás são atrasados pelo navegador; eventos não).
(() => {
    // Já está nesta página (entrou pela instalação e pelo carregamento normal): não liga duas vezes
    if (window.__redcodeVideo) return;
    window.__redcodeVideo = true;
    let video = null, ultimoEnvio = 0, ultimaChave = '';
    // Id do vídeo: ?v= (watch, YouTube Music) ou /shorts/<id>, /live/<id>
    const idDoVideo = () => {
        const u = new URL(location.href);
        return u.searchParams.get('v') || (u.pathname.match(/^\/(?:shorts|live)\/([\w-]{11})/) || [])[1] || '';
    };
    const player = () => document.querySelector('#movie_player') || document.querySelector('.html5-video-player');
    // YouTube Music emenda as faixas no mesmo <video> (sem intervalo): o relógio dele não zera a cada música.
    // O tempo da faixa sai da barra de progresso, que anda de 1 em 1 s; a diferença entre os dois relógios é
    // constante na faixa, e cada leitura a estreita (barra = parte inteira do tempo da faixa): em poucos
    // segundos o tempo fica com menos de 0,1 s de erro
    let faixaId = '', difMin = Infinity, difMax = -Infinity;
    function tempoDaFaixa(v) {
        const barra = document.querySelector('ytmusic-player-bar #progress-bar') || document.querySelector('#progress-bar');
        const lido = barra ? Number(barra.getAttribute('value') || barra.getAttribute('aria-valuenow')) : NaN;
        const fim = barra ? Number(barra.getAttribute('aria-valuemax')) : NaN;
        if (!Number.isFinite(lido)) return null;
        const id = idDoVideo(), ct = v.currentTime;
        if (id !== faixaId) { faixaId = id; difMin = Infinity; difMax = -Infinity; }
        if (lido % 1) { difMin = difMax = ct - lido; }   // barra com fração: já é o tempo exato
        else {
            difMin = Math.min(difMin, ct - lido);          // a diferença real é no máximo esta
            difMax = Math.max(difMax, ct - lido - 1);      // e no mínimo esta
            // Pulo na faixa ou leitura fora de hora: as contas não fecham, recomeça
            if (difMax > difMin + 0.05) { difMin = ct - lido; difMax = ct - lido - 1; }
        }
        return { tempo: Math.max(0, ct - (difMin + difMax) / 2), duracao: Number.isFinite(fim) && fim > 0 ? fim : 0, folga: +((difMin - difMax) / 2).toFixed(3) };
    }
    // Tempo exato do player (principal.js, que roda na página e pergunta ao player): vale mais que a barra
    let exato = null;
    window.addEventListener('message', (ev) => {
        if (ev.source !== window || !ev.data || ev.data.redcode !== 'tempo') return;
        if (!ev.data.versao && exato && exato.versao && Date.now() - exato.quando < 3000) return;
        exato = ev.data;
        envia('exato', false);
    });
    function estado(motivo) {
        const v = video;
        if (!v) return null;
        const ex = exato && Date.now() - exato.quando < 1500 && Number.isFinite(exato.t) ? exato : null;
        const p = player();
        // YouTube Music: "Áudio" (ATV) mostra só a capa; "Vídeo" (OMV) é o clipe
        const ytm = document.querySelector('ytmusic-player');
        const modo = ytm ? (ytm.getAttribute('playback-mode') || '') : '';
        const faixa = ex ? null : (ytm ? tempoDaFaixa(v) : null);
        // Tempo exato: o do player no momento do aviso + o que passou até agora (se tocando)
        const tempoEx = ex ? ex.t + (v.paused ? 0 : (Date.now() - ex.quando) / 1000 * (v.playbackRate || 1)) : null;
        return {
            id: (ex && /^[w-]{11}$/.test(ex.id) ? ex.id : '') || idDoVideo(),
            tempo: tempoEx != null ? tempoEx : faixa ? faixa.tempo : Number(v.currentTime) || 0,
            duracao: ex && ex.d > 0 ? ex.d : faixa ? faixa.duracao : (Number.isFinite(v.duration) ? v.duration : 0),
            folga: ex ? 0 : faixa ? faixa.folga : 0, fonte: ex ? 'player' : faixa ? 'barra' : 'video',
            proximos: ex && Array.isArray(ex.proximos) ? ex.proximos.slice(0, 4) : [],
            // Momento da leitura (o Red Code conta o tempo a partir daqui, não de quando o aviso chega)
            quando: Date.now(),
            pausado: v.paused || v.ended, esperando: !v.paused && v.readyState < 3, taxa: v.playbackRate || 1, titulo: document.title.replace(/^\(\d+\)\s*/, ''),
            site: location.hostname, modo, anuncio: !!(p && p.classList.contains('ad-showing')), motivo,
        };
    }
    function envia(motivo, forca) {
        const e = estado(motivo);
        if (!e) return;
        const agora = Date.now();
        const chave = [e.id, e.pausado, e.esperando, e.taxa, e.anuncio, e.modo].join('|');
        // Tocando: no máximo 1 aviso por segundo (o Red Code calcula o resto); mudança de estado vai na hora
        if (!forca && chave === ultimaChave && agora - ultimoEnvio < 1000) return;
        ultimaChave = chave; ultimoEnvio = agora;
        try { chrome.runtime.sendMessage({ tipo: 'video', estado: e }); } catch (x) { /* extensão recarregada: a página antiga perde a ponte */ }
    }
    const EVENTOS = { timeupdate: false, play: true, playing: true, pause: true, waiting: true, seeked: true, ratechange: true, loadeddata: true, ended: true, emptied: true };
    function liga(v) {
        if (v === video) return;
        if (video) for (const ev in EVENTOS) video.removeEventListener(ev, video.__redcode);
        video = v;
        v.__redcode = (ev) => envia(ev.type, EVENTOS[ev.type]);
        for (const ev in EVENTOS) v.addEventListener(ev, v.__redcode);
        envia('novo', true);
    }
    // O player troca o <video> às vezes (navegação dentro do site): procura de novo
    function procura() {
        const v = document.querySelector('#movie_player video, .html5-video-player video, video');
        if (v) liga(v);
    }
    new MutationObserver(procura).observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener('yt-navigate-finish', () => { procura(); envia('navegou', true); });
    window.addEventListener('pagehide', () => { try { chrome.runtime.sendMessage({ tipo: 'fim' }); } catch (x) { /* fechando */ } });
    procura();
})();
