# Shared helpers for the GNDJ ops scripts (backup-db.ps1 + healthcheck.ps1).
# Loads the gitignored secrets config (deploy\ops-alert.config.json) and sends alert emails.
# Dot-sourced by the other scripts:  . (Join-Path $PSScriptRoot "ops-common.ps1")

function Get-OpsConfig {
    param([string]$ConfigPath)
    if (-not $ConfigPath) { $ConfigPath = Join-Path $PSScriptRoot "ops-alert.config.json" }
    if (-not (Test-Path $ConfigPath)) {
        throw "Ops config not found at '$ConfigPath'. Copy ops-alert.config.example.json to ops-alert.config.json and fill it in (see deploy\OPS.md)."
    }
    return (Get-Content $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json)
}

# Sends a plain-text alert to every address in $Config.alertTo via the SMTP block in the config.
# Uses Send-MailMessage (obsolete but adequate for internal ops mail). Per-recipient failures are
# warned, not thrown, so one bad address cannot abort the whole backup/health run.
function Send-OpsAlert {
    param(
        [Parameter(Mandatory)] $Config,
        [Parameter(Mandatory)] [string]$Subject,
        [Parameter(Mandatory)] [string]$Body
    )
    $s = $Config.smtp
    if (-not $s -or -not $s.host) { Write-Warning "No SMTP config - alert not sent: $Subject"; return }
    $sec = ConvertTo-SecureString $s.password -AsPlainText -Force
    $cred = New-Object System.Management.Automation.PSCredential ($s.username, $sec)
    $useSsl = [bool]$s.useSsl
    foreach ($to in $Config.alertTo) {
        try {
            Send-MailMessage -SmtpServer $s.host -Port ([int]$s.port) -UseSsl:$useSsl `
                -Credential $cred -From "$($s.fromName) <$($s.from)>" -To $to `
                -Subject $Subject -Body $Body -Encoding ([System.Text.Encoding]::UTF8) -ErrorAction Stop
        } catch {
            Write-Warning "Failed to send ops alert to '$to': $($_.Exception.Message)"
        }
    }
}
