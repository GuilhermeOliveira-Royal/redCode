# Red Code

App desktop para Windows (Electron) que acompanha e conversa com o **Claude Code**. Reúne numa janela só as suas conversas, um chat com o Claude, terminal, editor, painel Git e um navegador de testes.

Ele usa a conta do Claude Code que já está logada no seu PC. Não pede chave de API.

## O que ele faz

**Conversas**
- Lista todas as conversas do Claude Code (lidas de `~/.claude/projects`), agrupadas por projeto, com o estado de cada uma: trabalhando, fez uma pergunta, respondeu, agente rodando.
- Acompanha o que o Claude está fazendo ao vivo, numa linha do tempo com filtros (comandos, edições, leituras, agentes, erros) e um mapa dos agentes em segundo plano.
- Mostra os limites de uso do plano e o consumo da conversa.
- Avisa no Windows quando uma conversa termina ou faz uma pergunta.

**Conversar pelo app**
- Dois modos, no alternador do topo da barra lateral:
  - **Código** (`</>`): conversa dentro de uma pasta de projeto, com arquivos, terminal e todas as ferramentas do Claude Code.
  - **Chat** (balão): conversa comum, sem pasta e sem ferramentas. Não lê arquivos, não roda comandos e não acessa a internet.
- Permissões e perguntas de múltipla escolha do Claude são respondidas na própria página.
- Modo de permissão, modelo e esforço escolhidos por conversa; anexos de imagens e arquivos; `/` para comandos e skills; `@` para citar arquivos do projeto.
- Voltar os arquivos ao estado de uma mensagem anterior (checkpoint).
- Continuar uma conversa grande numa conversa nova, com um resumo, mantendo as duas ligadas.
- Painel **Tarefas em segundo plano** acima do campo de mensagem, com botão para parar cada tarefa.

**Ferramentas junto da conversa**
- Terminal PowerShell embutido, na pasta do projeto.
- Editor de arquivos (Monaco) que preserva codificação, BOM e fim de linha.
- Painel Git: estado, diff, grafo, branches, stash, commit, fetch/pull/push e worktrees.
- Conversas em paralelo no mesmo projeto, cada uma numa cópia isolada (worktree, branch `painel/...`).
- Navegador embutido que o Claude controla (abrir páginas, ler, clicar, digitar, tirar print).
- Ponte com o VS Code aberto: o Claude enxerga erros do editor, a seleção e as abas.
- Integrações: GitHub pelo `gh` (só leitura: PRs e CI), lista dos hooks configurados e card do Trello ligado a cada conversa.
- Tarefas agendadas e fila de pedidos. Nada é aprovado sozinho: pedidos de permissão sempre esperam você.
- Busca em todas as conversas, resumo do dia, linha do tempo de um arquivo e modelos de pedido.

## Requisitos

- **Windows.** O terminal e o empacotamento são para Windows.
- **Claude Code instalado e com login feito** na sua conta. O app usa essa conta.
- **Git**, para o painel Git e os worktrees.
- Opcionais: **VS Code** (ponte com o editor) e **GitHub CLI (`gh`)** (aba de PRs e CI).
- **Node 24 ou superior**, só para rodar pelo código ou gerar o exe. O exe portátil não precisa de Node.

## Instalação

Ainda não há versão pronta publicada na página de Releases do repositório. Rode pelo código ou gere você mesmo o exe portátil.

### Rodar pelo código

```bash
git clone https://github.com/HickysDev/redCode.git
cd redCode
npm install
npm run desktop
```

Na primeira vez, o Electron é baixado durante o `npm install` ou na primeira abertura, então pode demorar.

Para abrir de novo depois, use `npm run desktop` ou o arquivo `abrir-painel-desktop.cmd`. Você pode criar um atalho na área de trabalho apontando para `node_modules\electron\dist\electron.exe` com o argumento `desktop\main.js`.

### Só no navegador

```bash
npm install
npm start
```

Abre o servidor local e a página fica em `http://127.0.0.1:4317`. Esse modo não tem bandeja, atalho global, seletor de pastas do Windows nem navegador embutido.

Não abra o `index.html` direto da pasta: a página precisa do servidor e fica em branco sem ele.

### Gerar o exe portátil

```bash
npm install
npm run empacotar
```

Gera `dist\Red Code\Red Code.exe` e `dist\RedCode-portatil-win64.zip`. Não baixa nada além das dependências do `npm install`. O exe traz o próprio Node, então quem for usar não precisa instalar Node. A pasta `Red Code` pode ficar em qualquer lugar (por exemplo, `Documentos`), menos em `Arquivos de Programas`.

## Primeiros passos

1. Abra o app. A lista da esquerda mostra as conversas que você já tem no Claude Code.
2. Clique em **Nova conversa**.
   - No modo **Código**, escolha o projeto na lista, **Outra pasta…** (abre o seletor de pastas do Windows) ou **Sem pasta específica**. Marque a cópia isolada (worktree) se for rodar ao mesmo tempo que outra conversa no mesmo projeto.
   - No modo **Chat**, só escolha modelo, esforço e escreva a mensagem.
3. Escolha o modelo e o esforço, escreva o pedido e clique em **Começar conversa**.
4. Acompanhe na linha do tempo. Se o Claude pedir permissão ou fizer uma pergunta, o cartão aparece acima do campo de mensagem.

O botão **ⓘ** (canto superior direito) mostra os detalhes da conversa: modelo, saúde do contexto e números. O botão **▥** abre o painel lateral com agentes e Git. Os dois lembram a sua escolha.

## Atalhos

| Atalho | O que faz |
|---|---|
| `Ctrl` + `Shift` + `Espaço` | Mostrar ou esconder a janela (global, funciona de qualquer lugar) |
| `Ctrl` + `Shift` + `F` | Buscar em todas as conversas |
| `Ctrl` + acento grave | Abrir ou fechar o terminal |
| `/` | Procurar nesta sessão |
| `1` a `7` | Trocar o filtro da linha do tempo |
| `e` / `r` | Expandir / recolher todos os blocos de ações |
| `f` | Ligar ou desligar o acompanhamento do fim |
| `j` / `k` | Próxima / anterior conversa da lista |
| `n` | Continuar a conversa atual numa conversa nova |
| `c` | Escrever na caixa de mensagem |
| `m` | Abrir ou fechar o mapa de agentes |
| `Esc` | Interromper a resposta em andamento |
| `/` ou `@` na caixa | Comandos e skills / citar arquivo do projeto |
| `F5` ou `Ctrl` + `R` | Recarregar a página |

Fechar a janela só a esconde na bandeja do sistema. Para encerrar o app de verdade, use **Sair** no ícone da bandeja.

## Perfis (conta do Claude + identidade do Git)

Funcionam como os perfis do navegador. O seletor ao lado do logo troca o Red Code inteiro de perfil. Monte os perfis em **Configurações › Perfis**.

- **Conta do Claude:** cada conta tem a própria pasta, com login, configurações e conversas. Ela é usada pelo Claude Code por meio de `CLAUDE_CONFIG_DIR`.
  - Ao criar, dá para copiar suas configurações da conta padrão: CLAUDE.md, hooks, agentes, skills, plugins e MCP.
  - Login e conversas nunca são copiados.
  - **Entrar** abre o `/login` do Claude num terminal.
- **Identidade do Git:** nome e e-mail dos commits, mais o usuário do GitHub.
  - O login do GitHub é feito pelo Git Credential Manager, guardado num espaço só da identidade (`credential.namespace`). O login de sempre não muda.
  - Antes do primeiro login, **Verificar segurança** confirma isso: grava e apaga uma credencial falsa num endereço inventado.
- **Perfil:** junta uma conta e uma identidade, por exemplo "Pessoal" ou "Claude pessoal + Git da empresa".
  - O perfil **Padrão** é o Red Code de sempre, sem nenhuma variável.
  - A lista de conversas mostra só as da conta do perfil em uso.
  - Agendamentos e fila só rodam no perfil em que foram criados.
- **Trocar de perfil** reinicia o servidor do Red Code assim que nenhuma conversa ou terminal estiver rodando. Dá para cancelar ou usar **Trocar agora**, que para tudo antes.
- **Dados dos perfis** ficam em `%APPDATA%\Red Code\perfis`; a variável `PAINEL_PERFIS` troca esse caminho. Nenhum token fica nesse arquivo.
- **Dentro de um perfil**, o `git config --global` grava num arquivo do Red Code que é refeito a cada subida.

## Onde ficam os dados

- **App desktop:** favoritos, vínculos entre conversas, anexos e logs em `%APPDATA%\Red Code`. Trocar a pasta do app por uma versão nova não apaga esses dados.
- **Só servidor (`npm start`):** o `dados.json` e a pasta de anexos ficam ao lado do `server.js`.
- **Conversas:** lidas de `~/.claude/projects`. O app não copia nem envia esse conteúdo.
- **Conversas do modo Chat:** gravadas pelo Claude Code em `~/.claude/projects`, na pasta que corresponde a `%APPDATA%\Red Code\chat`.

## Segurança

- O servidor escuta apenas em `127.0.0.1:4317`, nunca na rede.
- O terminal só aceita conexão da própria página, com um token secreto gerado a cada abertura.
- O navegador embutido roda numa janela isolada, sem acesso ao token do painel.
- Segredos que o app desktop passa ao servidor são lidos uma vez e apagados do ambiente, para não vazarem para os processos que o servidor inicia.
- O editor e as operações de arquivo ficam presos dentro da pasta do projeto.
- No modo Chat, o Claude roda sem ferramentas, sem servidores MCP e sem carregar o seu `CLAUDE.md`.

## Problemas comuns

- **SmartScreen avisa na primeira execução do exe.** O exe não é assinado. Clique em **Mais informações** e depois em **Executar assim mesmo**.
- **O exe mostra o ícone do Electron no Explorer.** A janela e a barra de tarefas mostram o ícone vermelho do Red Code.
- **Alterei o código e nada mudou.** O servidor e o app desktop só carregam o código na abertura. Feche pela bandeja (**Sair**) e abra de novo. Para mudanças só na página, `F5` basta.
- **O atalho `Ctrl` + `Shift` + `Espaço` não funciona.** Outro programa está usando. O app avisa no log e segue funcionando sem ele.
- **A página abre em branco.** Confirme que o servidor está rodando e acesse `http://127.0.0.1:4317`, ou abra pelo app desktop.
- **A porta 4317 está ocupada.** Defina outra com a variável de ambiente `PAINEL_PORTA` antes de abrir.
- **A lista vem vazia.** O app só mostra o que o Claude Code já gravou em `~/.claude/projects`. Confirme que o Claude Code está instalado e que você já fez alguma conversa.

## Estrutura do projeto

| Arquivo | Função |
|---|---|
| `desktop/main.js`, `preload.js` | Casca Electron: janela, bandeja, atalho global, seletor de pastas |
| `desktop/navegador.js` | Navegador embutido controlado pelo Claude |
| `server.js` | Servidor local: lê as conversas e serve a página e a API |
| `chat.js` | Conversa com o Claude Code pelo SDK oficial, permissões e modo Chat |
| `index.html`, `editor.html`, `editor.js` | Interface da página e editor |
| `terminal.js` | Terminal PowerShell por WebSocket |
| `git-scm.js`, `worktrees.js` | Painel Git e worktrees |
| `editor-arquivos.js` | Árvore, leitura e gravação de arquivos para o editor |
| `integracoes.js` | GitHub (`gh`), hooks e Trello |
| `automacao.js` | Tarefas agendadas e fila de pedidos |
| `alem.js` | Busca global, resumo do dia, linha do tempo de arquivo |
| `vscode-ponte.js` | Ponte com o VS Code aberto |
| `segredos.js` | Leitura única dos segredos do app desktop |
| `lancador.js` | Sobe o servidor e o reinicia quando ele pede |
| `empacotar.js` | Gera o exe portátil |
| `ferramentas/medir.js` | Mede elementos e tira prints da página para depuração |

## Desenvolvimento

```bash
npm install
npm run desktop     # app completo
npm start           # só o servidor, em http://127.0.0.1:4317
npm run empacotar   # exe portátil em dist\
```

Não há testes automatizados no projeto.

## Licença

O `package.json` declara a licença ISC, mas o repositório ainda não tem um arquivo `LICENSE`.
