<#
.SYNOPSIS
  One-shot elevated setup step for Kiln Dashboard's first-run WSL2
  provisioning. Everything that genuinely needs admin lives here, in one
  script, behind one UAC prompt - not spread across several separately
  elevated calls from the Electron app.

.DESCRIPTION
  1. Self-elevates if not already running as Administrator.
  2. Ensures the Microsoft-Windows-Subsystem-Linux and
     VirtualMachinePlatform optional features are enabled.
  3. If enabling either required a restart, writes a HKCU RunOnce entry
     pointing back at the dashboard (so it reopens automatically at next
     logon) and exits with code 3010 - the DISM/MSI convention for
     "succeeded, reboot required". This script emits that code itself;
     nothing here signals it automatically, it's a contract with the
     caller (electron/main.js), not an OS-level guarantee.
  4. Otherwise runs `wsl --update` and `wsl --set-default-version 2`,
     then exits 0.

  Deliberately does NOT touch distro import or kiln provisioning - those
  don't need admin at all (WSL distro registration is per-user), and stay
  in electron/main.js where they're easier to make idempotent/resumable
  and to test without repeatedly clicking through a UAC prompt.

.PARAMETER InstallPath
  Path to the Kiln Dashboard executable (Electron's own process.execPath),
  used only to build the RunOnce resume command - this script doesn't
  otherwise need to know where the app lives.
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$InstallPath
)

$ErrorActionPreference = "Stop"

function Test-IsAdmin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)
}

if (-not (Test-IsAdmin)) {
    # Re-invoke ourselves elevated. `-Wait` so the non-elevated caller
    # (electron/main.js) blocks on us and can read our real exit code
    # rather than the launcher's.
    $scriptPath = $MyInvocation.MyCommand.Path
    $argList = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$scriptPath`"", "-InstallPath", "`"$InstallPath`"")
    $proc = Start-Process -FilePath "powershell.exe" -ArgumentList $argList -Verb RunAs -Wait -PassThru
    exit $proc.ExitCode
}

$features = @("Microsoft-Windows-Subsystem-Linux", "VirtualMachinePlatform")
$restartNeeded = $false
$anyChanged = $false

foreach ($name in $features) {
    $state = Get-WindowsOptionalFeature -Online -FeatureName $name
    if ($state.State -ne "Enabled") {
        $result = Enable-WindowsOptionalFeature -Online -FeatureName $name -All -NoRestart
        $anyChanged = $true
        if ($result.RestartNeeded) {
            $restartNeeded = $true
        }
    }
}

if ($restartNeeded) {
    # Standard "run this once at next interactive logon" mechanism.
    # Runs unelevated in the user's own session next time, which is fine -
    # resuming just means relaunching the ordinary (non-elevated) app.
    $runOnceValue = "`"$InstallPath`" --resume-setup"
    New-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\RunOnce" `
        -Name "KilnDashboardResumeSetup" -Value $runOnceValue -PropertyType String -Force | Out-Null
    exit 3010
}

# Features are enabled (either already were, or just got enabled without
# needing a restart) - make sure the WSL2 platform itself is current and
# set as the default version for anything imported next.
if ($anyChanged) {
    # A feature was *just* enabled without a restart being reported as
    # necessary - wsl.exe may not be fully usable yet in this same
    # process's environment (PATH/feature state can lag a beat behind
    # the API call). Tolerate failure here rather than treating it as
    # fatal: main.js's own detection will simply see WSL still isn't
    # ready and retry on the next launch.
    try { & wsl.exe --update *> $null } catch {}
    try { & wsl.exe --set-default-version 2 *> $null } catch {}
} else {
    & wsl.exe --update
    & wsl.exe --set-default-version 2
}

exit 0
