// Ponte mínima entre o app desktop e a página. A página continua sem acesso ao Node;
// recursos nativos entram nas fases seguintes, um a um.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('painelDesktop', {
    desktop: true,
    // Traz a janela para frente (ex.: clique numa notificação com o app escondido na bandeja)
    mostrar: () => ipcRenderer.send('painel:mostrar'),
    // Abre o seletor de pastas do Windows (null se cancelar)
    escolherPasta: () => ipcRenderer.invoke('painel:escolher-pasta'),
    // Configurações › Sistema: iniciar com o Windows (ler e gravar) e Desenvolvedor: abrir a pasta dos logs
    inicioWindows: () => ipcRenderer.invoke('painel:inicio-windows'),
    defineInicioWindows: (ligar) => ipcRenderer.invoke('painel:define-inicio-windows', !!ligar),
    abrirLogs: () => ipcRenderer.invoke('painel:abrir-logs'),
    // Versão nova (cartão no rodapé): estado atual, avisos de mudança e ações (baixar, reiniciar, dispensar)
    atualizacao: {
        estado: () => ipcRenderer.invoke('painel:atualizacao-estado'),
        acao: (acao) => ipcRenderer.invoke('painel:atualizacao-acao', String(acao)),
        aoMudar: (fn) => ipcRenderer.on('painel:atualizacao', (ev, estado) => fn(estado)),
    },
    // Vídeo da mídia que está tocando: acha a janela de onde vem o som e ajusta a janela desanexada ao recorte
    clipe: {
        fonte: (titulo, podeEsconder, app) => ipcRenderer.invoke('painel:clipe-fonte', String(titulo || ''), podeEsconder !== false, String(app || '')),
        devolve: (id) => ipcRenderer.invoke('painel:clipe-devolve', id ? String(id) : ''),
        proporcao: (r) => ipcRenderer.invoke('painel:clipe-proporcao', Number(r) || 0),
        // Posição do <video> dentro da janela capturada (UI Automation), ou null
        player: (id) => ipcRenderer.invoke('painel:clipe-player', String(id || '')),
    },
});
