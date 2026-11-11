# Lista de conversas

## Estados (`situacaoItem` no `index.html`)

Na ordem em que são decididos:

| Estado | Quando | Na lista |
|---|---|---|
| Pergunta | o Claude fez uma pergunta ou pede permissão | selo vermelho pulsando |
| Agente rodando | resposta parada, mas com agente em segundo plano | selo "Agente rodando" |
| Trabalhando | o Claude está no meio de uma resposta | símbolo girando + o que está fazendo |
| Trabalhando (segundo plano) | resposta terminou, mas a conversa aberta pelo Red Code tem **tarefa em segundo plano** rodando (`tarefasBg` do `chat.js`, ex.: um teste longo) | símbolo girando + "Em segundo plano: <tarefa>" ou "N tarefas em segundo plano" |
| Respondeu | terminou há menos de 30 min e você ainda não viu | "✓ Respondeu, há X min" |
| Parada | o resto | só o tempo |

- O estado entra na contagem do topo e nos avisos do Windows (`verificaAvisos`).
- Tarefa em segundo plano só é conhecida para conversas rodando **pelo Red Code** (o SDK avisa o
  `chat.js`). Lançada no VS Code ou no terminal, o Red Code não fica sabendo.

## Troca de conversa

- `abreSessao(chave)` troca a conversa; `atualizaSessao()` busca os dados dela (ao abrir e a cada 2 s).
- Cada pedido guarda **de qual conversa é** e a resposta é descartada se a pessoa trocou de conversa
  antes dela chegar. Sem isso, com o Claude rodando (transcript grande, resposta lenta), a resposta
  atrasada redesenhava a conversa anterior por cima da nova e a tela "voltava".
- Regra geral para código novo: toda resposta assíncrona que desenha algo da conversa aberta confere
  `sessaoAtual` depois do `await`.

## Ao abrir o app

Uma tela de carregando (estrela + barrinha) cobre tudo até a **primeira lista de conversas** chegar e
ser desenhada (`carregouInicio`). Passados 12 s, o texto avisa que o servidor está demorando.
