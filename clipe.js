// Vídeo da mídia que está tocando (YouTube, YouTube Music no modo clipe...): captura a janela de onde vem o som e
// mostra só a área que se mexe, que é o vídeo. Só música (capa parada) = sem vídeo. Usado no quadrinho do canto
// (index.html) e na janela desanexada (clipe.html); a janela é achada pelo app desktop (painelDesktop.clipe.fonte).
(function () {
    // Retângulo do vídeo pelas bordas: dois lados do player são segmentos retos, paralelos e do mesmo tamanho
    // (a borda das faixas pretas, ou a borda do player contra a página). Texto só faz trechos curtos de borda.
    // Vale com o vídeo parado e com tela gravada. lum = luminância do quadro reduzido; mov = quantas vezes cada
    // pixel mudou nas últimas amostras (pode ser tudo zero). Devolve { x, y, w, h } de 0 a 1.
    function achaRetangulo(lum, mov, L, A) {
        const LIMIAR = 9;
        // Borda = diferença com 2 pixels antes (a redução do quadro borra a borda em dois)
        const bH = new Uint8Array(L * A), bV = new Uint8Array(L * A);
        for (let y = 2; y < A; y++) for (let x = 0; x < L; x++) if (Math.abs(lum[y * L + x] - lum[(y - 2) * L + x]) > LIMIAR) bH[(y - 1) * L + x] = 1;
        for (let y = 0; y < A; y++) for (let x = 2; x < L; x++) if (Math.abs(lum[y * L + x] - lum[y * L + x - 2]) > LIMIAR) bV[y * L + x - 1] = 1;
        // Segmentos retos (até 2 pixels de falha, 1 pixel de folga para o lado) com pelo menos 'minimo' de comprimento
        function segmentos(n, m, tem, minimo) {
            const lista = [];
            for (let i = 1; i < n - 1; i++) {
                let ini = -1, ult = -1;
                const fecha = () => { if (ult + 1 - ini >= minimo) lista.push({ p: i, a: ini, b: ult + 1 }); ini = -1; };
                for (let j = 0; j < m; j++) {
                    if (tem(i, j) || tem(i - 1, j) || tem(i + 1, j)) { if (ini < 0) ini = j; ult = j; }
                    else if (ini >= 0 && j - ult > 2) fecha();
                }
                if (ini >= 0) fecha();
            }
            // Vizinhos iguais (a borda tem 2-3 pixels de largura) viram um só
            return lista.filter((s, k) => !lista.some((o, q) => q < k && Math.abs(o.p - s.p) <= 3 && Math.abs(o.a - s.a) <= 3 && Math.abs(o.b - s.b) <= 3));
        }
        const verticais = segmentos(L, A, (x, y) => bV[y * L + x], A * 0.25);
        const horizontais = segmentos(A, L, (y, x) => bH[y * L + x], L * 0.25);
        // Movimento acumulado (soma 2D): o retângulo precisa ter a maior parte do que se mexe
        const somaM = new Float64Array((L + 1) * (A + 1));
        let movTotal = 0;
        for (let y = 0; y < A; y++) { let linha = 0; for (let x = 0; x < L; x++) { const m = mov && mov[y * L + x] >= 2 ? 1 : 0; linha += m; movTotal += m; somaM[(y + 1) * (L + 1) + x + 1] = somaM[y * (L + 1) + x + 1] + linha; } }
        const movEm = (x0, y0, x1, y1) => somaM[y1 * (L + 1) + x1] - somaM[y0 * (L + 1) + x1] - somaM[y1 * (L + 1) + x0] + somaM[y0 * (L + 1) + x0];
        let melhor = null;
        const testa = (x0, y0, x1, y1) => {
            const larg = x1 - x0, alt = y1 - y0, area = larg * alt;
            // Proporção de vídeo; nem pequeno demais, nem quase a janela toda (aí é a página, não o player)
            if (alt <= 0 || larg / alt < 1.25 || larg / alt > 2.45 || area < L * A * 0.05 || area > L * A * 0.65) return;
            // Com movimento: o retângulo tem que ter quase tudo (um quadro dentro do vídeo, como o do jogo numa live, não serve)
            if (movTotal >= 12 && movEm(x0, y0, x1, y1) / movTotal < 0.85) return;
            if (!melhor || area > melhor.area) melhor = { area, x0, y0, x1, y1 };
        };
        // Par de lados (esquerdo e direito, ou topo e pé) que começam e terminam juntos
        const pares = (lista, monta) => {
            for (let i = 0; i < lista.length; i++) for (let j = 0; j < lista.length; j++) {
                const s = lista[i], t = lista[j];
                if (t.p - s.p < 8 || Math.abs(s.a - t.a) > 4 || Math.abs(s.b - t.b) > 4) continue;
                monta(s, t);
            }
        };
        pares(verticais, (s, t) => testa(s.p, Math.max(s.a, t.a), t.p, Math.min(s.b, t.b)));
        pares(horizontais, (s, t) => testa(Math.max(s.a, t.a), s.p, Math.min(s.b, t.b), t.p));
        return melhor && { x: melhor.x0 / L, y: melhor.y0 / A, w: (melhor.x1 - melhor.x0) / L, h: (melhor.y1 - melhor.y0) / A };
    }
    // Área do que se mexe: colunas e linhas com movimento, aceitando vãos parados de até 6% (entre o jogo e as
    // webcams de uma live, por exemplo). Devolve { x, y, w, h } de 0 a 1 ou null
    function areaDoMovimento(contagem, L, A) {
        const colunas = new Array(L).fill(0), linhas = new Array(A).fill(0);
        for (let y = 0; y < A; y++) for (let x = 0; x < L; x++) if (contagem[y * L + x] >= 2) { colunas[x]++; linhas[y]++; }
        const trecho = (lista, minimo, vao) => {
            let melhor = null, ini = -1, ult = -1, soma = 0, somaMelhor = 0;
            for (let i = 0; i <= lista.length; i++) {
                if (i < lista.length && lista[i] >= minimo) { if (ini < 0) { ini = i; soma = 0; } ult = i; soma += lista[i]; }
                else if (ini >= 0 && (i === lista.length || i - ult > vao)) { if (soma > somaMelhor) { somaMelhor = soma; melhor = [ini, ult + 1]; } ini = -1; }
            }
            return melhor;
        };
        const cx = trecho(colunas, 2, Math.round(L * 0.06)), cy = trecho(linhas, 2, Math.round(A * 0.06));
        return cx && cy ? { x: cx[0] / L, y: cy[0] / A, w: (cx[1] - cx[0]) / L, h: (cy[1] - cy[0]) / A } : null;
    }
    // Alarga a área até a margem da página: cada lado anda enquanto a próxima coluna (ou linha) não for lisa.
    // O fundo da página em volta do vídeo é liso; o vídeo (mesmo com o fundo escuro) não é. Cada lado anda no máximo 15%
    function cresceAteAMargem(lum, area, L, A) {
        let x0 = Math.floor(area.x * L), x1 = Math.ceil((area.x + area.w) * L), y0 = Math.floor(area.y * A), y1 = Math.ceil((area.y + area.h) * A);
        const lisa = (pega, n) => {
            let soma = 0;
            for (let i = 0; i < n; i++) soma += pega(i);
            const media = soma / n;
            let fora = 0;
            // Fundo de página é chapado (captura sem perda): qualquer variação acima de 2 já é conteúdo
            for (let i = 0; i < n; i++) if (Math.abs(pega(i) - media) > 2) fora++;
            return fora <= n * 0.03;
        };
        const colunaLisa = (x) => lisa((i) => lum[(y0 + i) * L + x], y1 - y0);
        const linhaLisa = (y) => lisa((i) => lum[y * L + x0 + i], x1 - x0);
        const limX = Math.round(L * 0.15), limY = Math.round(A * 0.15);
        const inicio = [x0, x1, y0, y1];
        // Olha alguns pixels à frente: uma grade escura no fundo do vídeo tem colunas lisas entre as linhas dela;
        // o vão entre o vídeo e o resto da página é bem maior que isso
        const FRENTE_X = 8, FRENTE_Y = 5;
        const proxima = (passos, lisaEm) => { for (let j = 0; j < passos; j++) if (!lisaEm(j)) return j + 1; return 0; };
        for (let mudou = true; mudou;) {
            mudou = false;
            let n;
            if (x0 > 0 && inicio[0] - x0 < limX && (n = proxima(Math.min(FRENTE_X, x0), (j) => colunaLisa(x0 - 1 - j)))) { x0 -= n; mudou = true; }
            if (x1 < L && x1 - inicio[1] < limX && (n = proxima(Math.min(FRENTE_X, L - x1), (j) => colunaLisa(x1 + j)))) { x1 += n; mudou = true; }
            if (y0 > 0 && inicio[2] - y0 < limY && (n = proxima(Math.min(FRENTE_Y, y0), (j) => linhaLisa(y0 - 1 - j)))) { y0 -= n; mudou = true; }
            if (y1 < A && y1 - inicio[3] < limY && (n = proxima(Math.min(FRENTE_Y, A - y1), (j) => linhaLisa(y1 + j)))) { y1 += n; mudou = true; }
        }
        return { x: x0 / L, y: y0 / A, w: (x1 - x0) / L, h: (y1 - y0) / A };
    }
    const contem = (a, b) => b.x >= a.x - 0.02 && b.y >= a.y - 0.02 && b.x + b.w <= a.x + a.w + 0.02 && b.y + b.h <= a.y + a.h + 0.02;
    const LARGURA_AMOSTRA = 320;   // quadro reduzido onde se procuram o player e o que se mexe
    const AMOSTRAS = 16;           // ~6 s de história (uma amostra a cada 400 ms)
    window.ClipeMusica = function (caixa, opcoes) {
        const tela = caixa.querySelector('.clipe-tela');
        const aviso = caixa.querySelector('.clipe-aviso');
        const video = Object.assign(document.createElement('video'), { muted: true, autoplay: true, playsInline: true });
        tela.appendChild(video);
        const amostra = document.createElement('canvas');
        const pincel = amostra.getContext('2d', { willReadFrequently: true });
        let midia = null, titulo = '', fluxo = null, fonteId = '', buscando = false, ultimaBusca = 0;
        // Janela minimizada que o app tirou para fora da tela; se a imagem congelar lá, não tenta de novo
        let fonteEscondida = false, naoEsconder = false;
        // Posição exata do <video> dentro da janela (UI Automation do Windows); quando vem, vale mais que o detector de imagem
        let inicioFluxo = 0;
        let playerExato = null, perguntouPlayer = 0, playerRespondeu = false, fontePip = false;
        let anterior = null, mascaras = [], contagem = null, quadros = 0;
        let recorte = null, inteira = !!opcoes.inteira, paradoDesde = 0, semMovimentoDesde = 0, estado = '';
        const AVISOS = {
            janela: 'Procurando a janela do vídeo…',
            'sem-janela': 'Não achei a janela de onde vem o som. Ela pode ficar atrás de outras, mas não minimizada.',
            procurando: 'Procurando o vídeo na janela…',
            'sem-video': 'Só música: esta mídia não tem vídeo agora.',
            aba: 'O vídeo está numa aba que não está aberta, e o navegador só desenha a aba da frente. Deixe a aba do vídeo aberta (dá para arrastá-la para uma janela só dela, que pode ficar atrás ou minimizada).',
            minimizada: 'A janela do vídeo está minimizada e o navegador não desenha fora da tela. Abra o navegador com --disable-features=CalculateNativeWinOcclusion no atalho.',
            parado: 'Imagem parada: o navegador para de desenhar quando fica todo coberto. Deixe um pedaço dele à mostra ou abra-o com --disable-features=CalculateNativeWinOcclusion no atalho.',
        };
        function mudaEstado(novo) {
            if (novo === estado) return;
            estado = novo;
            aviso.textContent = AVISOS[novo] || '';
            aviso.hidden = !AVISOS[novo];
            caixa.classList.toggle('clipe-com-aviso', !!AVISOS[novo] && novo !== 'procurando');
            // Procurando o vídeo: a janela inteira aparece e o aviso fica numa faixa embaixo
            caixa.classList.toggle('clipe-procurando', novo === 'procurando');
            if (opcoes.aoEstado) opcoes.aoEstado(novo);
        }
        // Recorte: o vídeo capturado é ampliado e deslocado para a área achada preencher a caixa
        function aplicaRecorte() {
            const r = !inteira && recorte;
            Object.assign(video.style, r
                ? { width: (100 / r.w) + '%', height: (100 / r.h) + '%', left: (-r.x / r.w * 100) + '%', top: (-r.y / r.h * 100) + '%', objectFit: 'fill' }
                : { width: '100%', height: '100%', left: '0', top: '0', objectFit: 'contain' });
            const proporcao = r && video.videoWidth ? (r.w * video.videoWidth) / (r.h * video.videoHeight) : (video.videoWidth ? video.videoWidth / video.videoHeight : 16 / 9);
            if (opcoes.aoProporcao) opcoes.aoProporcao(proporcao);
        }
        function zeraHistoria() { anterior = null; mascaras = []; contagem = null; quadros = 0; paradoDesde = 0; semMovimentoDesde = 0; }
        function paraFluxo() {
            if (fonteEscondida && fonteId) window.painelDesktop.clipe.devolve(fonteId).catch(() => { });
            fonteEscondida = false; playerExato = null; playerRespondeu = false; fontePip = false;
            if (fluxo) fluxo.getTracks().forEach(t => t.stop());
            fluxo = null; fonteId = ''; video.srcObject = null; recorte = null; zeraHistoria();
        }
        async function procuraJanela() {
            if (buscando || !titulo) return;
            buscando = true; ultimaBusca = Date.now();
            try {
                const fonte = await window.painelDesktop.clipe.fonte(titulo, !naoEsconder, midia && midia.app);
                if (!fonte) { paraFluxo(); return mudaEstado(naoEsconder ? 'minimizada' : 'sem-janela'); }
                if (fonte.emAba) { paraFluxo(); return mudaEstado('aba'); }
                if (fonte.id === fonteId && fluxo) return;
                paraFluxo();
                const novo = await navigator.mediaDevices.getUserMedia({ audio: false, video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: fonte.id, maxWidth: 1920, maxHeight: 1080, maxFrameRate: 30 } } });
                fluxo = novo; fonteId = fonte.id; fonteEscondida = !!fonte.escondida; inicioFluxo = Date.now();
                // Picture-in-picture do próprio navegador: a janela inteira é o vídeo
                if (fonte.pip) { playerExato = { x: 0, y: 0, w: 1, h: 1 }; playerRespondeu = true; fontePip = true; }
                // Janela fechada: a captura acaba; a próxima volta do relógio procura de novo
                novo.getVideoTracks()[0].addEventListener('ended', () => { if (fluxo === novo) { paraFluxo(); mudaEstado('sem-janela'); } });
                video.srcObject = novo;
                video.play().catch(() => { /* toca quando carregar */ });
                mudaEstado('procurando');
                aplicaRecorte();
            } catch (e) { paraFluxo(); mudaEstado('sem-janela'); }
            finally { buscando = false; }
        }
        // Maior trecho seguido de colunas (ou linhas) com bastante movimento
        // A cada 400 ms: compara o quadro com o anterior, guarda onde mudou e, de tempos em tempos, recalcula a área do vídeo
        function olha() {
            if (!fluxo) { if (titulo && Date.now() - ultimaBusca > 5000) procuraJanela(); return; }
            if (!video.videoWidth || video.readyState < 2) return;
            if (window.painelDesktop.clipe.player && !fontePip && Date.now() - perguntouPlayer > 1500) {
                perguntouPlayer = Date.now();
                const id = fonteId;
                window.painelDesktop.clipe.player(id).then((area) => { if (id === fonteId && area !== 'lendo') { playerExato = area; playerRespondeu = true; } }).catch(() => { playerRespondeu = true; });
            }
            const L = LARGURA_AMOSTRA, A = Math.max(1, Math.round(L * video.videoHeight / video.videoWidth));
            if (amostra.width !== L || amostra.height !== A) { amostra.width = L; amostra.height = A; zeraHistoria(); }
            pincel.drawImage(video, 0, 0, L, A);
            const d = pincel.getImageData(0, 0, L, A).data;
            if (!contagem) contagem = new Uint16Array(L * A);
            const tocando = midia && midia.estado === 'Playing';
            if (anterior) {
                const mascara = new Uint8Array(L * A);
                let mudou = 0;
                for (let p = 0, i = 0; p < mascara.length; p++, i += 4) {
                    if (Math.abs(d[i] - anterior[i]) + Math.abs(d[i + 1] - anterior[i + 1]) + Math.abs(d[i + 2] - anterior[i + 2]) > 24) { mascara[p] = 1; contagem[p]++; mudou++; }
                }
                mascaras.push(mascara);
                if (mascaras.length > AMOSTRAS) { const velha = mascaras.shift(); for (let p = 0; p < velha.length; p++) contagem[p] -= velha[p]; }
                // Nenhum pixel mudou com a música tocando: a imagem congelou (navegador todo coberto)
                if (mudou === 0 && tocando) { if (!paradoDesde) paradoDesde = Date.now(); }
                else paradoDesde = 0;
                // Imagem parada na janela que estava minimizada: devolve ela (fora da tela não adianta)
                if (paradoDesde && Date.now() - paradoDesde > 6000 && fonteEscondida) { naoEsconder = true; paraFluxo(); mudaEstado('minimizada'); return; }
                if (paradoDesde && Date.now() - paradoDesde > 6000) mudaEstado('parado');
                else if (estado === 'parado') mudaEstado(recorte ? '' : 'procurando');
                if (++quadros % 3 === 0 && estado !== 'parado') calculaArea(L, A, tocando);
            }
            anterior = d;
        }
        function calculaArea(L, A, tocando) {
            // 1º: o retângulo do player; 2º (vídeo sem borda nítida): a área que se mexe
            if (playerExato) return usaArea(playerExato, true);
            // A 1ª leitura do player leva ~1 s: espera ela antes de cair no detector de imagem (senão o recorte pula)
            if (window.painelDesktop.clipe.player && !playerRespondeu && Date.now() - inicioFluxo < 6000) return;
            // Espera ~2,4 s de história: antes disso não dá para saber o que se mexe (e o recorte pularia)
            if (mascaras.length < 6) return;
            const lum = new Uint8Array(L * A);
            for (let p = 0, i = 0; p < lum.length; p++, i += 4) lum[p] = (anterior[i] * 2 + anterior[i + 1] * 5 + anterior[i + 2]) >> 3;
            const retangulo = achaRetangulo(lum, contagem, L, A);
            const movimento = areaDoMovimento(contagem, L, A);
            // Área pequena (barra de progresso, animação de botão) não é vídeo
            const mexe = movimento && movimento.w * movimento.h >= 0.02 && movimento.w >= 0.1 && movimento.h >= 0.1;
            // Retângulo das bordas que tem tudo o que se mexe: é o vídeo. Se não tem (é um quadro dentro do vídeo,
            // como o do jogo numa live), vale a área do movimento alargada até a margem da página
            if (retangulo && (!mexe || contem(retangulo, movimento))) return usaArea(retangulo);
            if (mexe) return usaArea(cresceAteAMargem(lum, movimento, L, A));
            if (retangulo) return usaArea(retangulo);
            if (tocando) {
                if (!semMovimentoDesde) semMovimentoDesde = Date.now();
                // ~8 s tocando sem nada se mexer: é só a capa da música
                if (Date.now() - semMovimentoDesde > 8000) { if (recorte) { recorte = null; aplicaRecorte(); } mudaEstado('sem-video'); }
            }
        }
        let confirmadoEm = 0;
        function usaArea(area, exata) {
            semMovimentoDesde = 0;
            const r = recorte;
            // Área menor dentro da atual (as webcams de uma live pararam um pouco): segura a maior por 30 s
            // (a posição exata do player não precisa disso)
            if (!exata && r && contem(r, area) && area.w * area.h < r.w * r.h * 0.9) { if (Date.now() - confirmadoEm < 30000) return mudaEstado(''); }
            else confirmadoEm = Date.now();
            // Só troca se mudou de verdade (o vídeo ficar escuro numa borda não faz o quadro pular)
            if (!r || Math.abs(r.x - area.x) > 0.02 || Math.abs(r.y - area.y) > 0.02 || Math.abs(r.w - area.w) > 0.03 || Math.abs(r.h - area.h) > 0.03) { recorte = area; aplicaRecorte(); }
            mudaEstado('');
        }
        const relogio = setInterval(olha, 400);
        video.addEventListener('loadedmetadata', aplicaRecorte);
        return {
            // Estado do player do Windows (a cada ~2 s): música nova = procura a janela de novo (o título dela muda)
            atualiza(m) {
                if (!m || m.nada || m.erro || !m.titulo) return;
                midia = m;
                if (m.titulo !== titulo) {
                    titulo = m.titulo;
                    if (!fluxo) mudaEstado('janela');
                    procuraJanela();
                }
            },
            // Janela inteira x só o vídeo
            alternaInteira() { inteira = !inteira; aplicaRecorte(); return inteira; },
            inteira: () => inteira,
            estado: () => estado,
            destroi() { clearInterval(relogio); paraFluxo(); video.remove(); },
        };
    };
    window.ClipeMusica.achaRetangulo = achaRetangulo;
    window.ClipeMusica.areaDoMovimento = areaDoMovimento;
    window.ClipeMusica.cresceAteAMargem = cresceAteAMargem;
})();
