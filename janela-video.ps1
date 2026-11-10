# Janela do video minimizada (Red Code, desktop/main.js): o Windows nao desenha janela minimizada, entao nao ha
# imagem para capturar. Aqui ela e restaurada sem ativar e posta fora da tela (continua desenhando, ninguem ve).
#   -Acao lista               janelas minimizadas visiveis: [{hwnd, titulo}]
#   -Acao esconde -Hwnd N     restaura fora da tela, escreve a posicao original e fica vigiando: se a janela for
#                             ativada (clique na barra de tarefas), volta para o lugar e sai
#   -Acao devolve -Hwnd N -X -Y -L -A [-Max]   volta para o lugar e minimiza de novo
#   -Acao abas                abas de todas as janelas do Brave/Chrome/Edge: [{hwnd, aba}] (aba de tras nao tem imagem;
#                             serve para avisar que o video esta numa aba que nao esta aberta)
#   -Acao guarda -Hwnd N -X -Y -L -A -Pai P   processo solto (fora do Red Code, que leva junto os filhos quando cai):
#                             se o Red Code (P) sumir com a janela ainda fora da tela, devolve ela ao lugar, minimizada
#   -Acao player -Hwnd N -Pai P   a cada 1,5 s: onde esta o <video> dentro da janela (UI Automation, a mesma dos
#                             leitores de tela), em fracao da janela: {x, y, w, h} ou {} se nao achou. Sai se o Red Code (P) sair
param([string]$Acao, [long]$Hwnd = 0, [int]$X = 0, [int]$Y = 0, [int]$L = 0, [int]$A = 0, [switch]$Max, [int]$Pai = 0)
$ErrorActionPreference = 'Stop'
# Titulos com acento: a saida vai em UTF-8 (o Node le assim)
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System; using System.Text; using System.Runtime.InteropServices;
public class JanelaVideo {
    public delegate bool CB(IntPtr h, IntPtr p);
    [DllImport("user32.dll")] public static extern bool EnumWindows(CB cb, IntPtr p);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr h);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int cx, int cy, uint f);
    [StructLayout(LayoutKind.Sequential)] public struct Ponto { public int x, y; }
    [StructLayout(LayoutKind.Sequential)] public struct Ret { public int l, t, r, b; }
    [StructLayout(LayoutKind.Sequential)] public struct Posicao { public int tamanho, flags, mostra; public Ponto min, max; public Ret normal; }
    [DllImport("user32.dll")] public static extern bool GetWindowPlacement(IntPtr h, ref Posicao p);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out Ret r);
}
"@
$SEM_ATIVAR = 0x0010; $SEM_ORDEM = 0x0004
function Json($o) { [Console]::Out.WriteLine((ConvertTo-Json -InputObject $o -Compress)); [Console]::Out.Flush() }

if ($Acao -eq 'lista') {
    $lista = New-Object System.Collections.ArrayList
    [JanelaVideo]::EnumWindows({ param($h, $p)
        if ([JanelaVideo]::IsWindowVisible($h) -and [JanelaVideo]::IsIconic($h)) {
            $s = New-Object Text.StringBuilder 512; [void][JanelaVideo]::GetWindowText($h, $s, 512)
            if ($s.Length) { [void]$lista.Add(@{ hwnd = $h.ToInt64(); titulo = $s.ToString() }) }
        }
        $true }, [IntPtr]::Zero) | Out-Null
    Json @($lista)
    exit
}
if ($Acao -eq 'abas') {
    Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
    $navegadores = @{}
    Get-Process brave, chrome, msedge -ErrorAction SilentlyContinue | ForEach-Object { $navegadores[[uint32]$_.Id] = $true }
    $janelas = New-Object System.Collections.ArrayList
    [JanelaVideo]::EnumWindows({ param($w, $p)
        $o = [uint32]0; [void][JanelaVideo]::GetWindowThreadProcessId($w, [ref]$o)
        if ($navegadores.ContainsKey($o) -and [JanelaVideo]::IsWindowVisible($w)) { [void]$janelas.Add($w) }
        $true }, [IntPtr]::Zero) | Out-Null
    $tipo = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::TabItem)
    $lista = New-Object System.Collections.ArrayList
    foreach ($w in $janelas) {
        try { foreach ($item in [System.Windows.Automation.AutomationElement]::FromHandle($w).FindAll([System.Windows.Automation.TreeScope]::Descendants, $tipo)) { [void]$lista.Add(@{ hwnd = $w.ToInt64(); aba = $item.Current.Name }) } } catch { }
    }
    Json @($lista)
    exit
}
$h = [IntPtr]$Hwnd
if (-not [JanelaVideo]::IsWindow($h)) { Json @{ erro = 'sem-janela' }; exit }

if ($Acao -eq 'player') {
    Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
    $ultimo = ''
    while ($true) {
        if (-not [JanelaVideo]::IsWindow($h)) { exit }
        if ($Pai -and -not (Get-Process -Id $Pai -ErrorAction SilentlyContinue)) { exit }
        $saida = @{}
        try {
            $janela = [System.Windows.Automation.AutomationElement]::FromHandle($h)
            $j = $janela.Current.BoundingRectangle
            $melhor = $null; $area = 0; $barra = $null
            $todos = $janela.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
            foreach ($e in $todos) {
                $c = $e.Current
                # Barra de controles do YouTube Music: em janela estreita ela fica por cima do pe do video
                if ($c.ClassName -match '(^| )ytmusic-player-bar( |$)') { $barra = $c.BoundingRectangle; continue }
                # Player do YouTube/YouTube Music (html5-main-video) ou qualquer <video> (tipo "video" no Chromium)
                $ehVideo = ($c.ClassName -match '(^| )html5-main-video( |$)') -or ($c.ClassName -notmatch 'button' -and $c.LocalizedControlType -match '^v.deo$')
                if (-not $ehVideo) { continue }
                $b = $c.BoundingRectangle
                if ($b.Width * $b.Height -gt $area) { $area = $b.Width * $b.Height; $melhor = $b }
            }
            if ($melhor -and $j.Width -gt 0 -and $j.Height -gt 0) {
                # So a parte do video que esta dentro da janela (rolou a pagina: corta o que saiu)
                $x0 = [Math]::Max($melhor.X, $j.X); $y0 = [Math]::Max($melhor.Y, $j.Y)
                $x1 = [Math]::Min($melhor.X + $melhor.Width, $j.X + $j.Width); $y1 = [Math]::Min($melhor.Y + $melhor.Height, $j.Y + $j.Height)
                if ($barra -and $barra.Height -gt 0 -and $barra.Y -gt $y0 -and $barra.Y -lt $y1) { $y1 = $barra.Y }
                if ($x1 - $x0 -gt 20 -and $y1 - $y0 -gt 20) {
                    $saida = @{ x = ($x0 - $j.X) / $j.Width; y = ($y0 - $j.Y) / $j.Height; w = ($x1 - $x0) / $j.Width; h = ($y1 - $y0) / $j.Height; jl = $j.Width; ja = $j.Height }
                }
            }
        } catch { $saida = @{} }
        $json = ConvertTo-Json -InputObject $saida -Compress
        if ($json -ne $ultimo) { [Console]::Out.WriteLine($json); [Console]::Out.Flush(); $ultimo = $json }
        Start-Sleep -Milliseconds 1500
    }
}

if ($Acao -eq 'esconde') {
    $pos = New-Object JanelaVideo+Posicao; $pos.tamanho = [Runtime.InteropServices.Marshal]::SizeOf($pos)
    [void][JanelaVideo]::GetWindowPlacement($h, [ref]$pos)
    # flags 2 = WPF_RESTORETOMAXIMIZED: estava maximizada antes de minimizar
    $max = ($pos.flags -band 2) -ne 0
    $n = $pos.normal; $largura = $n.r - $n.l; $altura = $n.b - $n.t
    # Fora da tela fica grande: o video sai com mais resolucao e a pagina usa o layout largo
    $largFora = [Math]::Max($largura, 1280); $altFora = [Math]::Max($altura, 760)
    # 4 = SW_SHOWNOACTIVATE: sai do minimizado sem roubar o foco; depois vai para a esquerda de todas as telas
    [void][JanelaVideo]::ShowWindow($h, 4)
    $v = [System.Windows.Forms.SystemInformation]::VirtualScreen
    [void][JanelaVideo]::SetWindowPos($h, [IntPtr]::Zero, $v.Left - $largFora - 64, $n.t, $largFora, $altFora, $SEM_ATIVAR -bor $SEM_ORDEM)
    Json @{ x = $n.l; y = $n.t; l = $largura; a = $altura; max = $max }
    while ($true) {
        Start-Sleep -Milliseconds 400
        if (-not [JanelaVideo]::IsWindow($h)) { exit }
        # O Red Code saiu sem devolver (caiu, foi encerrado): volta ao lugar, minimizada
        if ($Pai -and -not (Get-Process -Id $Pai -ErrorAction SilentlyContinue)) {
            [void][JanelaVideo]::SetWindowPos($h, [IntPtr]::Zero, $n.l, $n.t, $largura, $altura, $SEM_ATIVAR -bor $SEM_ORDEM)
            [void][JanelaVideo]::ShowWindow($h, 7)
            exit
        }
        # A pessoa quis a janela (barra de tarefas, Alt+Tab): devolve para o lugar, aberta
        if ([JanelaVideo]::GetForegroundWindow() -eq $h) {
            [void][JanelaVideo]::SetWindowPos($h, [IntPtr]::Zero, $n.l, $n.t, $largura, $altura, $SEM_ATIVAR -bor $SEM_ORDEM)
            if ($max) { [void][JanelaVideo]::ShowWindow($h, 3) }
            Json @{ voltou = $true }
            exit
        }
    }
}

if ($Acao -eq 'guarda') {
    $v = [System.Windows.Forms.SystemInformation]::VirtualScreen
    while ($true) {
        Start-Sleep -Seconds 1
        if (-not [JanelaVideo]::IsWindow($h)) { exit }
        $r = New-Object JanelaVideo+Ret; [void][JanelaVideo]::GetWindowRect($h, [ref]$r)
        # Ja voltou (devolvida, aberta pela pessoa ou minimizada): nada a fazer
        if ([JanelaVideo]::IsIconic($h) -or $r.r -gt $v.Left) { exit }
        if ($Pai -and -not (Get-Process -Id $Pai -ErrorAction SilentlyContinue)) {
            [void][JanelaVideo]::SetWindowPos($h, [IntPtr]::Zero, $X, $Y, $L, $A, $SEM_ATIVAR -bor $SEM_ORDEM)
            [void][JanelaVideo]::ShowWindow($h, 7)
            exit
        }
    }
}

if ($Acao -eq 'devolve') {
    [void][JanelaVideo]::SetWindowPos($h, [IntPtr]::Zero, $X, $Y, $L, $A, $SEM_ATIVAR -bor $SEM_ORDEM)
    # 7 = SW_SHOWMINNOACTIVE: minimizada de novo, como a pessoa deixou
    [void][JanelaVideo]::ShowWindow($h, 7)
    Json @{ ok = $true }
}
