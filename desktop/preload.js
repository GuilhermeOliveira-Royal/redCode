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
});
