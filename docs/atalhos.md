# Atalhos de teclado

## Configuráveis (Configurações › Atalhos)

| Atalho | Padrão | Observação |
|---|---|---|
| Abrir ou fechar o vídeo no canto | `Alt+V` | |
| Procurar em todas as conversas | `Ctrl+Shift+F` | |
| Abrir ou fechar o terminal | ``Ctrl+` `` | |
| Mostrar ou esconder a lista de conversas | `Ctrl+B` | |
| Quebra de linha no editor ao vivo | `Alt+Z` | só com o editor ao vivo aberto e fora de campo de texto |
| Código formatado no editor ao vivo | `Alt+Shift+F` | idem |
| Mostrar ou esconder o Red Code | `Ctrl+Shift+Espaço` | **global**: funciona de qualquer programa |

## Como funciona

- Um registro só, `ATALHOS` no `index.html`, e um único `keydown` que procura a combinação. Atalho
  novo com Ctrl/Alt entra nessa lista (não criar `keydown` solto).
- Combinação guardada como `Ctrl+Alt+Shift+Tecla` pela **tecla física** (`evt.code`), então vale igual
  em teclado ABNT e americano. Preferência em `painelPref_atalhos` (só o que foi trocado).
- Gravar: clicar na combinação e apertar as teclas. Precisa de Ctrl ou Alt (ou F1-F12); Esc cancela.
  Recusa combinação de outro atalho e as reservadas (`ATALHOS_RESERVADOS`: `Ctrl+C/V/X/A/Z/Y/S/F/R`,
  `Alt+F4`...).
- **Global**: registrado no processo principal (`globalShortcut`), guardado em
  `%APPDATA%\Red Code\atalhos.json`. Trocar pela tela chama `painel:atalho-janela`; se outro programa
  já usa a combinação, volta para a anterior e avisa.
- As teclas de uma letra (`/`, `?`, `j`, `k`, `1`-`7`...) são fixas e aparecem na ajuda (`?`).
