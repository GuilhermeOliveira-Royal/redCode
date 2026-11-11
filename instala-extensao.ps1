# Red Code: poe a extensao do video no canto nos atalhos do navegador (--load-extension) e, se pedido, reinicia o
# navegador com as abas restauradas. Chamado pelo servidor quando a pessoa aceita instalar (video-navegador.js).
#   -Exe <navegador.exe> -Extensao <pasta> -Backup <pasta> [-Reiniciar] [-Simular]
# Saida: JSON { atalhos: [{ arquivo, antes, depois }], reiniciou, rodando }
param([string]$Exe, [string]$Extensao, [string]$Backup, [switch]$Reiniciar, [switch]$Simular)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
if (-not (Test-Path -LiteralPath $Exe)) { [Console]::Out.WriteLine((ConvertTo-Json -InputObject @{ erro = 'navegador nao encontrado' } -Compress)); exit }
$flag = '--load-extension="' + $Extensao + '"'
$locais = @(
    "$env:APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar",
    "$env:APPDATA\Microsoft\Windows\Start Menu\Programs",
    [Environment]::GetFolderPath('Desktop')
)
$sh = New-Object -ComObject WScript.Shell
$mudados = New-Object System.Collections.ArrayList
$carimbo = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
foreach ($l in $locais) {
    if (-not (Test-Path -LiteralPath $l)) { continue }
    foreach ($arq in Get-ChildItem -LiteralPath $l -Recurse -Filter *.lnk -ErrorAction SilentlyContinue) {
        $a = $sh.CreateShortcut($arq.FullName)
        # O navegador ou o chrome_proxy.exe da mesma pasta (abre os apps instalados, como o YouTube Music)
        if (-not $a.TargetPath) { continue }
        if ([IO.Path]::GetDirectoryName($a.TargetPath) -ne [IO.Path]::GetDirectoryName($Exe) -or @([IO.Path]::GetFileName($Exe), 'chrome_proxy.exe') -notcontains [IO.Path]::GetFileName($a.TargetPath)) { continue }
        # Ja tem a extensao do Red Code: deixa como esta
        if ($a.Arguments -like '*--load-extension=*') { continue }
        $depois = ($a.Arguments.Trim() + ' ' + $flag).Trim()
        [void]$mudados.Add(@{ arquivo = $arq.FullName; antes = $a.Arguments; depois = $depois })
        if ($Simular) { continue }
        # Backup do atalho original antes de mexer
        $pasta = Join-Path $Backup $carimbo
        New-Item -ItemType Directory -Force -Path $pasta | Out-Null
        Copy-Item -LiteralPath $arq.FullName -Destination (Join-Path $pasta ($mudados.Count.ToString() + ' - ' + $arq.Name))
        $a.Arguments = $depois
        try { $a.Save() } catch { $mudados[$mudados.Count - 1].erro = 'sem permissao' }
    }
}
$nome = [IO.Path]::GetFileName($Exe)
$rodando = [bool](Get-Process -Name ([IO.Path]::GetFileNameWithoutExtension($Exe)) -ErrorAction SilentlyContinue)
$reiniciou = $false
if ($Reiniciar -and -not $Simular) {
    # O navegador grava a sessao o tempo todo: encerra e reabre com --restore-last-session (as abas e janelas voltam)
    if ($rodando) {
        Start-Sleep -Seconds 2
        & taskkill.exe /IM $nome /F | Out-Null
        for ($i = 0; $i -lt 20; $i++) { Start-Sleep -Milliseconds 500; if (-not (Get-Process -Name ([IO.Path]::GetFileNameWithoutExtension($Exe)) -ErrorAction SilentlyContinue)) { break } }
    }
    Start-Process -FilePath $Exe -ArgumentList @('--restore-last-session', $flag)
    $reiniciou = $true
}
[Console]::Out.WriteLine((ConvertTo-Json -InputObject @{ atalhos = @($mudados); reiniciou = $reiniciou; rodando = $rodando } -Compress -Depth 4))
