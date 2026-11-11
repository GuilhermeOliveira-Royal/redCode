# Vídeo no canto

Mostra, numa janelinha do Red Code, uma **cópia muda** do vídeo que está tocando no YouTube / YouTube
Music, sincronizada com o que a pessoa ouve. **Não lê a tela**: quem diz o vídeo e o segundo é a fonte
(extensão do navegador ou YouTube Music Desktop); o Red Code toca a cópia por conta própria.

## De onde vem o vídeo

```text
extensao/principal.js (mundo da página) ─postMessage─► extensao/pagina.js ─► extensao/fundo.js
        tempo exato do player, id, fila                                          │ POST /api/midia/video
ytm-desktop.js (Companion Server :9863, a cada 1 s) ──────────────────────────────┤ (aba -9863)
                                                                                  ▼
                                        video-navegador.js: estado por aba, atual(), yt-dlp
                                                                                  │ GET /api/midia/video
                                                                        clipe.js (na página)
```

- **Extensão** (`extensao/`, MV3): `principal.js` roda no mundo da página e pergunta ao player
  (`#movie_player.getCurrentTime()`, `getVideoData()`), porque no YouTube Music o `<video>.currentTime`
  é acumulado entre faixas. Também lê a fila (próximas 2 músicas e o clipe correspondente). A trava
  `window.__redcodePrincipal` tem **versão**: ao recarregar a extensão, a nova desliga a antiga
  (o mundo da página não é limpo). Subir `VERSAO` em `principal.js` quando mudar o que ele manda.
- **YouTube Music Desktop** (`ytm-desktop.js`): pareia pelo Companion Server (token em
  `ytm-desktop.json`), lê `/api/v1/state` a cada 1 s e entrega como a aba `-9863`. A tela do vídeo
  mostra o que falta (ligar "Enable companion authorization", aprovar no app).
- **Instalar a extensão**: Brave e Edge pelos atalhos com `--load-extension` (`instala-extensao.ps1`,
  com backup e reinício com as abas de volta). O Chrome 137+ ignora a opção: só à mão.

## Como a cópia toca (`clipe.js`)

- **A — player do YouTube incorporado**: entra rápido, mas muitos clipes não deixam incorporar e ele
  mostra anúncio. No app, `painel:clipe-yt` entra no quadro do player e lê o tempo exato.
- **B — endereço direto pelo yt-dlp** (`<video>` próprio, só vídeo até 720p): o mais preciso
  (~10-20 ms). O endereço leva ~4,5 s para sair, fica em cache 3 h e as **próximas da fila são
  buscadas antes** (duas de cada vez). Com o endereço já pronto (`urlPronta`), entra direto no B.
- Sem endereço pronto: A primeiro e B preparado escondido, que assume quando fica a menos de 60 ms.
- **Sincronia** (B): ritmo fino a cada 100 ms (zona morta 15 ms, ganho 0,4, até ±10%); cópia à
  **frente** pausa exatamente pela diferença; nos primeiros 8 s, pula quando passa de 0,2 s
  (compensando o atraso aprendido do pulo). Anúncio na cópia por mais de 1,5 s → vai para o B.
- Medidas: troca de música com endereço pronto ~0,8 s de imagem e 0,2-0,4 s para acertar; sem
  endereço, 6-8 s (yt-dlp).

## Na tela

- Encaixado acima do player (a lista sobe), com alça no canto de baixo à direita para diminuir.
- Arrastar: solta do canto e flutua; soltar em cima do player encaixa de volta.
- **Arrastar para fora da janela do Red Code** e soltar: vira janela própria, sempre por cima
  (`clipe.html`), nascendo onde foi solta e do mesmo tamanho (`painel:clipe-solta-em`). Também pelo
  botão Desanexar.
- `Alt+V` (configurável) abre ou fecha; com a janela solta, fecha ela. Fechar não mostra aviso.
- Enquanto carrega: pet comendo pipoca. YouTube Music em modo "Áudio" mostra "Só música".
