#requires -Version 5.1

<#
.SYNOPSIS
Open one SSH tunnel and multiple tmux clients with a single command.

.DESCRIPTION
The script opens one Windows Terminal window with one tab for each configured
tmux session. One selected tmux tab also owns every SSH local port forward, so
normal startup does not need an extra tunnel tab.

Edit only the CONFIG section below for normal use. When SshPassword is set,
the script uses PuTTY Plink's -pwfile support so the password is not placed
directly in a process command line. SSH keys remain safer and are recommended.

.EXAMPLE
  powershell.exe -ExecutionPolicy Bypass -File .\remote-dev.ps1

.EXAMPLE
  .\remote-dev.ps1 -DryRun

.EXAMPLE
  .\remote-dev.ps1 -NoTunnel
#>

[CmdletBinding()]
param(
    [switch] $NoTunnel,
    [switch] $TunnelOnly,
    [switch] $SeparateWindows,
    [switch] $SkipPortCheck,
    [switch] $DryRun
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# CONFIG: edit this block once, then run the script whenever you start work.
# ---------------------------------------------------------------------------

# Prefer an alias from C:\Users\YOU\.ssh\config, for example: notale-dev
# You may also use user@hostname directly.
$SshTarget = 'zhuyifan@188.239.60.251'

# SECURITY WARNING: anything entered here is plain text. Never commit, sync,
# upload or share your edited copy. Leave empty to use normal ssh.exe prompts.
# Password mode requires a recent plink.exe from the PuTTY package.
$SshPassword = ''

# Optional client arguments. OpenSSH and Plink use different option syntax.
# These examples apply only while SshPassword is empty:
#   @('-p', '2222')
#   @('-i', "$env:USERPROFILE\.ssh\id_ed25519")
# Leave empty when port/key are already configured in ~/.ssh/config.
$SshExtraArgs = @()

# Each name is created when missing, or attached when it already exists.
$TmuxSessions = @(
    'ws1'
    'ws2'
    'ws3'
)

# This session's SSH connection owns all configured port forwards. Keep its
# tab open while using the forwarded ports.
$TunnelOwnerSession = 'ws2'

# This tab receives focus after all tabs have opened. Use '' for no preference.
$InitialFocusSession = 'ws2'

# All entries are carried by ONE SSH connection: TunnelOwnerSession above.
$PortForwards = @(
    @{ LocalPort = 3000;  RemoteHost = '127.0.0.1'; RemotePort = 3000 }
    @{ LocalPort = 3001;  RemoteHost = '127.0.0.1'; RemotePort = 3001 }
    @{ LocalPort = 4177;  RemoteHost = '127.0.0.1'; RemotePort = 4177 }
    @{ LocalPort = 4180;  RemoteHost = '127.0.0.1'; RemotePort = 4180 }
    @{ LocalPort = 41031; RemoteHost = '127.0.0.1'; RemotePort = 41031 }
    @{ LocalPort = 45045; RemoteHost = '127.0.0.1'; RemotePort = 45045 }
    @{ LocalPort = 8722; RemoteHost = '127.0.0.1'; RemotePort = 8722 }
)

# A new named Windows Terminal window is created for every script run.
$TerminalWindowPrefix = 'notale-dev'

# ---------------------------------------------------------------------------
# END CONFIG
# ---------------------------------------------------------------------------

function ConvertTo-SingleQuotedLiteral {
    param([AllowEmptyString()][string] $Value)
    return "'" + $Value.Replace("'", "''") + "'"
}

function ConvertTo-EncodedPowerShellCommand {
    param(
        [Parameter(Mandatory = $true)][string] $Label,
        [Parameter(Mandatory = $true)][string] $Executable,
        [Parameter(Mandatory = $true)][string[]] $ClientArguments
    )

    $labelLiteral = ConvertTo-SingleQuotedLiteral $Label
    $executableLiteral = ConvertTo-SingleQuotedLiteral $Executable
    $argumentLiterals = @($ClientArguments | ForEach-Object {
        ConvertTo-SingleQuotedLiteral ([string] $_)
    })
    $argumentArray = '@(' + ($argumentLiterals -join ', ') + ')'

    $childScript = @"
`$Host.UI.RawUI.WindowTitle = $labelLiteral
Write-Host ('[remote-dev] ' + $labelLiteral) -ForegroundColor Cyan
`$clientArguments = $argumentArray
& $executableLiteral @clientArguments
`$clientExitCode = `$LASTEXITCODE
Write-Host ''
if (`$clientExitCode -eq 0) {
    Write-Host '[remote-dev] SSH connection closed.' -ForegroundColor Yellow
} else {
    Write-Host ('[remote-dev] SSH exited with code ' + `$clientExitCode + '.') -ForegroundColor Red
}
"@

    $bytes = [System.Text.Encoding]::Unicode.GetBytes($childScript)
    return [Convert]::ToBase64String($bytes)
}

function Format-CommandForDisplay {
    param(
        [string] $Executable,
        [string[]] $Arguments
    )

    $displayExecutable = $Executable
    if ($displayExecutable -match '\s') {
        $displayExecutable = '"' + $displayExecutable.Replace('"', '\"') + '"'
    }

    $displayArguments = @($Arguments | ForEach-Object {
        $value = [string] $_
        if ($value -match '[\s"'']') {
            '"' + $value.Replace('"', '\"') + '"'
        } else {
            $value
        }
    })
    return $displayExecutable + ' ' + ($displayArguments -join ' ')
}

function Assert-PortNumber {
    param(
        [object] $Value,
        [string] $FieldName
    )

    $number = 0
    if (-not [int]::TryParse([string] $Value, [ref] $number) -or
        $number -lt 1 -or $number -gt 65535) {
        throw "$FieldName must be an integer from 1 to 65535; got '$Value'."
    }
    return $number
}

function New-RestrictedPasswordFile {
    param([Parameter(Mandatory = $true)][string] $Password)

    $temporaryRoot = [System.IO.Path]::GetTempPath()
    $passwordDirectory = Join-Path `
        $temporaryRoot `
        ('remote-dev-' + [guid]::NewGuid().ToString('N'))

    [System.IO.Directory]::CreateDirectory($passwordDirectory) | Out-Null

    try {
        # Remove inherited access and grant only the current Windows identity.
        $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
        $directorySecurity = New-Object `
            -TypeName System.Security.AccessControl.DirectorySecurity
        $directorySecurity.SetOwner($identity.User)
        $directorySecurity.SetAccessRuleProtection($true, $false)

        $accessRule = New-Object `
            -TypeName System.Security.AccessControl.FileSystemAccessRule `
            -ArgumentList @(
                $identity.User,
                [System.Security.AccessControl.FileSystemRights]::FullControl,
                ([System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor
                    [System.Security.AccessControl.InheritanceFlags]::ObjectInherit),
                [System.Security.AccessControl.PropagationFlags]::None,
                [System.Security.AccessControl.AccessControlType]::Allow
            )
        $directorySecurity.AddAccessRule($accessRule)
        [System.IO.Directory]::SetAccessControl(
            $passwordDirectory,
            $directorySecurity
        )

        $passwordFile = Join-Path $passwordDirectory 'password.txt'
        $utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::WriteAllText(
            $passwordFile,
            $Password,
            $utf8WithoutBom
        )

        return @{
            Directory = $passwordDirectory
            File      = $passwordFile
        }
    } catch {
        Remove-Item `
            -LiteralPath $passwordDirectory `
            -Recurse `
            -Force `
            -ErrorAction SilentlyContinue
        throw
    }
}

function Start-PasswordFileCleanup {
    param(
        [Parameter(Mandatory = $true)][string] $PasswordDirectory,
        [int] $DelaySeconds = 300
    )

    $directoryLiteral = ConvertTo-SingleQuotedLiteral $PasswordDirectory
    $cleanupScript = @"
Start-Sleep -Seconds $DelaySeconds
Remove-Item -LiteralPath $directoryLiteral -Recurse -Force -ErrorAction SilentlyContinue
"@
    $encodedCleanup = [Convert]::ToBase64String(
        [System.Text.Encoding]::Unicode.GetBytes($cleanupScript)
    )

    Start-Process `
        -FilePath 'powershell.exe' `
        -WindowStyle Hidden `
        -ArgumentList @(
            '-NoLogo'
            '-NoProfile'
            '-EncodedCommand'
            $encodedCleanup
        ) | Out-Null
}

function Start-RemoteDevConsole {
    param(
        [Parameter(Mandatory = $true)][string] $Title,
        [Parameter(Mandatory = $true)][string] $Executable,
        [Parameter(Mandatory = $true)][string[]] $ClientArguments,
        [Parameter(Mandatory = $true)][string] $WindowName,
        [Parameter(Mandatory = $true)][bool] $UseWindowsTerminal,
        [Parameter(Mandatory = $true)][string] $PowerShellExecutable
    )

    $encodedCommand = ConvertTo-EncodedPowerShellCommand `
        -Label $Title `
        -Executable $Executable `
        -ClientArguments $ClientArguments

    $powerShellArguments = @(
        '-NoLogo'
        '-NoExit'
        '-EncodedCommand'
        $encodedCommand
    )

    if ($UseWindowsTerminal) {
        # All values passed here are whitespace-free, avoiding Start-Process's
        # legacy argument-quoting edge cases in Windows PowerShell 5.1.
        $terminalArguments = @(
            '-w'
            $WindowName
            'new-tab'
            '--title'
            $Title
            '--suppressApplicationTitle'
            'powershell.exe'
        ) + $powerShellArguments

        Start-Process -FilePath 'wt.exe' -ArgumentList $terminalArguments | Out-Null
    } else {
        Start-Process `
            -FilePath $PowerShellExecutable `
            -ArgumentList $powerShellArguments | Out-Null
    }
}

if ($NoTunnel -and $TunnelOnly) {
    throw '-NoTunnel and -TunnelOnly cannot be used together.'
}

if ([string]::IsNullOrWhiteSpace($SshTarget) -or $SshTarget -eq 'CHANGE_ME') {
    throw "Edit `$SshTarget in the CONFIG section before running this script."
}

if ($TerminalWindowPrefix -notmatch '^[A-Za-z0-9][A-Za-z0-9_-]*$') {
    throw 'TerminalWindowPrefix may contain only letters, numbers, underscore and hyphen.'
}

$useStoredPassword = -not [string]::IsNullOrEmpty($SshPassword)
if ($useStoredPassword -and $SshPassword -match '[\r\n]') {
    throw 'SshPassword cannot contain a line break.'
}

if ($useStoredPassword) {
    Write-Warning 'Plain-text password mode is enabled. Do not share or commit this edited script.'
    $clientCommand = Get-Command 'plink.exe' -ErrorAction SilentlyContinue
    if ($clientCommand) {
        $clientExecutable = $clientCommand.Source
    } else {
        $plinkCandidates = @()
        foreach ($specialFolder in @('ProgramFiles', 'ProgramFilesX86')) {
            $programFilesDirectory = [Environment]::GetFolderPath($specialFolder)
            if (-not [string]::IsNullOrWhiteSpace($programFilesDirectory)) {
                $plinkCandidates += Join-Path `
                    $programFilesDirectory `
                    'PuTTY\plink.exe'
            }
        }
        $clientExecutable = $plinkCandidates | Where-Object {
            -not [string]::IsNullOrWhiteSpace($_) -and (Test-Path -LiteralPath $_)
        } | Select-Object -First 1
    }
    if (-not $clientExecutable) {
        throw @'
SshPassword is set, but plink.exe was not found. Install a current PuTTY
release and run this script again:
  winget install --id PuTTY.PuTTY -e
'@
    }
} else {
    $clientCommand = Get-Command 'ssh.exe' -ErrorAction SilentlyContinue
    if (-not $clientCommand) {
        throw 'ssh.exe was not found. Install/enable the Windows OpenSSH Client first.'
    }
    $clientExecutable = $clientCommand.Source
}

$powerShellCommand = Get-Command 'powershell.exe' -ErrorAction SilentlyContinue
if (-not $powerShellCommand) {
    throw 'powershell.exe was not found.'
}

$normalizedSessions = @()
$seenSessions = @{}
foreach ($sessionValue in $TmuxSessions) {
    $session = ([string] $sessionValue).Trim()
    if ($session -notmatch '^[A-Za-z0-9][A-Za-z0-9_-]*$') {
        throw "Invalid tmux session name '$session'. Use letters, numbers, '_' or '-', and start with a letter or number."
    }
    if ($seenSessions.ContainsKey($session)) {
        throw "Duplicate tmux session name '$session'."
    }
    $seenSessions[$session] = $true
    $normalizedSessions += $session
}

if (-not $TunnelOnly -and $normalizedSessions.Count -eq 0) {
    throw 'Configure at least one tmux session, or run with -TunnelOnly.'
}

if (-not $TunnelOnly -and -not $NoTunnel -and
    $normalizedSessions -notcontains $TunnelOwnerSession) {
    throw "TunnelOwnerSession '$TunnelOwnerSession' is not listed in TmuxSessions."
}

if (-not [string]::IsNullOrWhiteSpace($InitialFocusSession) -and
    $normalizedSessions -notcontains $InitialFocusSession) {
    throw "InitialFocusSession '$InitialFocusSession' is not listed in TmuxSessions."
}

$normalizedForwards = @()
$seenLocalPorts = @{}
foreach ($forward in $PortForwards) {
    if (-not $forward.ContainsKey('LocalPort') -or
        -not $forward.ContainsKey('RemoteHost') -or
        -not $forward.ContainsKey('RemotePort')) {
        throw 'Every PortForwards entry needs LocalPort, RemoteHost and RemotePort.'
    }

    $localPort = Assert-PortNumber $forward.LocalPort 'LocalPort'
    $remotePort = Assert-PortNumber $forward.RemotePort 'RemotePort'
    $remoteHost = ([string] $forward.RemoteHost).Trim()

    if ([string]::IsNullOrWhiteSpace($remoteHost) -or $remoteHost -match '\s') {
        throw "Invalid RemoteHost '$remoteHost'."
    }
    if ($seenLocalPorts.ContainsKey($localPort)) {
        throw "Local port $localPort appears more than once in PortForwards."
    }

    $seenLocalPorts[$localPort] = $true
    $normalizedForwards += @{
        LocalPort  = $localPort
        RemoteHost = $remoteHost
        RemotePort = $remotePort
    }
}

$openTunnel = -not $NoTunnel -and $normalizedForwards.Count -gt 0
if ($TunnelOnly -and -not $openTunnel) {
    throw '-TunnelOnly was specified, but no PortForwards are configured.'
}

if ($openTunnel -and -not $SkipPortCheck) {
    try {
        $listeningPorts = @(
            [System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() |
                ForEach-Object { $_.Port } |
                Select-Object -Unique
        )
        $busyPorts = @($normalizedForwards.LocalPort | Where-Object {
            $listeningPorts -contains $_
        })
        if ($busyPorts.Count -gt 0) {
            $joinedPorts = $busyPorts -join ', '
            throw "Local port(s) already in use: $joinedPorts. Close the old tunnel, change the config, or use -SkipPortCheck."
        }
    } catch {
        if ($_.Exception.Message -like 'Local port(s) already in use:*') {
            throw
        }
        Write-Warning "Could not check local ports: $($_.Exception.Message)"
    }
}

$passwordFileInfo = $null
if ($useStoredPassword) {
    if ($DryRun) {
        $passwordFilePath = '<temporary-password-file>'
    } else {
        $passwordFileInfo = New-RestrictedPasswordFile -Password $SshPassword
        $passwordFilePath = $passwordFileInfo.File
        Start-PasswordFileCleanup `
            -PasswordDirectory $passwordFileInfo.Directory
    }

    $baseClientArguments = @(
        '-ssh'
        '-noagent'
        '-restrict-acl'
        '-pwfile'
        $passwordFilePath
    )
} else {
    $baseClientArguments = @(
        '-o'
        'ServerAliveInterval=30'
        '-o'
        'ServerAliveCountMax=3'
        '-o'
        'TCPKeepAlive=yes'
    ) + @($SshExtraArgs)
}

if ($useStoredPassword -and -not $DryRun) {
    # Drop the live variable after creating the short-lived password file.
    $SshPassword = $null
}

$consoles = @()

$forwardArguments = @()
if ($openTunnel) {
    if (-not $useStoredPassword) {
        $forwardArguments += @('-o', 'ExitOnForwardFailure=yes')
    }
    foreach ($forward in $normalizedForwards) {
        $mapping = "{0}:{1}:{2}" -f `
            $forward.LocalPort, $forward.RemoteHost, $forward.RemotePort
        $forwardArguments += @('-L', $mapping)
    }
}

if ($openTunnel -and $TunnelOnly) {
    $tunnelArguments = @($baseClientArguments) + @($forwardArguments)
    $tunnelArguments += @('-N', $SshTarget)
    $consoles += ,@{
        Title     = 'tunnel'
        Executable = $clientExecutable
        Arguments = $tunnelArguments
    }
}

if (-not $TunnelOnly) {
    foreach ($session in $normalizedSessions) {
        # Session names were strictly validated above, so this remote command
        # cannot inject shell syntax.
        $remoteCommand = "tmux new-session -A -s $session"
        $sessionArguments = @($baseClientArguments)
        if ($openTunnel -and $session -eq $TunnelOwnerSession) {
            $sessionArguments += @($forwardArguments)
        }
        if ($useStoredPassword) {
            $sessionArguments += '-t'
        } else {
            $sessionArguments += '-tt'
        }
        $sessionArguments += @($SshTarget, $remoteCommand)
        $consoles += ,@{
            Title     = $session
            Executable = $clientExecutable
            Arguments = $sessionArguments
        }
    }
}

Write-Host '[remote-dev] Launch plan:' -ForegroundColor Cyan
foreach ($console in $consoles) {
    Write-Host ('  [{0}] {1}' -f `
        $console.Title,
        (Format-CommandForDisplay $console.Executable $console.Arguments))
}

if ($DryRun) {
    Write-Host '[remote-dev] Dry run complete; nothing was opened.' -ForegroundColor Yellow
    exit 0
}

$windowsTerminalCommand = Get-Command 'wt.exe' -ErrorAction SilentlyContinue
$useWindowsTerminal = $null -ne $windowsTerminalCommand -and -not $SeparateWindows
$windowName = '{0}-{1}' -f $TerminalWindowPrefix, $PID

if ($useWindowsTerminal) {
    Write-Host "[remote-dev] Opening Windows Terminal window '$windowName'..." -ForegroundColor Green
} else {
    Write-Warning 'Windows Terminal is unavailable/disabled; opening separate PowerShell windows.'
}

for ($index = 0; $index -lt $consoles.Count; $index++) {
    $console = $consoles[$index]
    Start-RemoteDevConsole `
        -Title $console.Title `
        -Executable $console.Executable `
        -ClientArguments $console.Arguments `
        -WindowName $windowName `
        -UseWindowsTerminal $useWindowsTerminal `
        -PowerShellExecutable $powerShellCommand.Source

    # Give the first named Terminal window time to register before targeting
    # it with additional new-tab calls.
    if ($useWindowsTerminal -and $index -eq 0 -and $consoles.Count -gt 1) {
        Start-Sleep -Milliseconds 900
    }
}

if ($useWindowsTerminal -and -not $TunnelOnly -and
    -not [string]::IsNullOrWhiteSpace($InitialFocusSession)) {
    $focusIndex = [array]::IndexOf($normalizedSessions, $InitialFocusSession)
    if ($focusIndex -ge 0) {
        Start-Sleep -Milliseconds 350
        Start-Process -FilePath 'wt.exe' -ArgumentList @(
            '-w'
            $windowName
            'focus-tab'
            '-t'
            [string] $focusIndex
        ) | Out-Null
    }
}

Write-Host ('[remote-dev] Opened {0} console(s).' -f $consoles.Count) -ForegroundColor Green
if ($openTunnel) {
    if ($TunnelOnly) {
        Write-Host '[remote-dev] Keep the tunnel tab open while using forwarded ports.'
    } else {
        Write-Host "[remote-dev] Keep the '$TunnelOwnerSession' tab open while using forwarded ports."
    }
}
