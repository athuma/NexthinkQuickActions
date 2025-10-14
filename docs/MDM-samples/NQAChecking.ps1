# Nexthink Quick Actions – Compliance check script for Intune remediation

$ExtensionID = "pgddlkkeemmdeanlibbcmipdinbeogpk"
$UpdateURL = "https://clients2.google.com/service/update2/crx"
// Ensure you take a sufficiently large number to avoid overwriting an existing policy.
$RegistryKeyName = "43"

$ExpectedPolicyValues = @{
    mode = "overlay"
    allowUserEntries = 0
    lockManagedEntries = 1
}

$ExpectedInstance = @{
    name = "CORP"
    url  = "https://corp.eu.nexthink.cloud"
}

$RegistryTargets = @(
    @{ Path = "HKLM:\Software\Policies\Google\Chrome"; Browser = "Chrome (64-bit)" },
    @{ Path = "HKLM:\Software\WOW6432Node\Policies\Google\Chrome"; Browser = "Chrome (32-bit)" },
    @{ Path = "HKLM:\Software\Policies\Microsoft\Edge"; Browser = "Edge (64-bit)" },
    @{ Path = "HKLM:\Software\WOW6432Node\Policies\Microsoft\Edge"; Browser = "Edge (32-bit)" }
)

function Get-RegistryValue {
    param(
        [Parameter(Mandatory)] [string] $Path,
        [Parameter(Mandatory)] [string] $Name
    )
    try {
        return (Get-ItemProperty -Path $Path -Name $Name -ErrorAction Stop).$Name
    } catch {
        return $null
    }
}

function Test-ManagedPolicy {
    param(
        [Parameter(Mandatory)] [string] $ExtensionRoot,
        [Parameter(Mandatory)] [string] $Browser
    )

    $ok = $true
    if (-not (Test-Path $ExtensionRoot)) {
        Write-Host "$Browser : Configuration key $ExtensionRoot missing ❌"
        return $false
    }

    $policyRootPath = Join-Path -Path $ExtensionRoot -ChildPath "policy"
    if (-not (Test-Path $policyRootPath)) {
        Write-Host "$Browser : Subkey policy missing ❌"
        $ok = $false
    } else {
        $policySettingsPath = Join-Path -Path $policyRootPath -ChildPath "policy"
        if (-not (Test-Path $policySettingsPath)) {
            Write-Host "$Browser : Subkey policy\\policy missing ❌"
            $ok = $false
        } else {
            foreach ($kvp in $ExpectedPolicyValues.GetEnumerator()) {
                $value = Get-RegistryValue -Path $policySettingsPath -Name $kvp.Key
                if ($null -eq $value) {
                    Write-Host "$Browser : Missing policy/$($kvp.Key) value ❌"
                    $ok = $false
                } elseif ($kvp.Value -is [string]) {
                    if ($value -ne $kvp.Value) {
                        Write-Host "$Browser : Unexpected policy/$($kvp.Key) value ($value) ❌"
                        $ok = $false
                    }
                } else {
                    if ([int]$value -ne [int]$kvp.Value) {
                        Write-Host "$Browser : Unexpected policy/$($kvp.Key) value ($value) ❌"
                        $ok = $false
                    }
                }
            }
        }
    }

    $instancePath = Join-Path -Path $policyRootPath -ChildPath "instance"
    if (-not (Test-Path $instancePath)) {
        Write-Host "$Browser : Subkey instance missing ❌"
        $ok = $false
    } else {
        foreach ($kvp in $ExpectedInstance.GetEnumerator()) {
            $value = Get-RegistryValue -Path $instancePath -Name $kvp.Key
            if ($null -eq $value -or $value -ne $kvp.Value) {
                Write-Host "$Browser : Incorrect instance/$($kvp.Key) value ($value) ❌"
                $ok = $false
            }
        }
    }

    $exportPrefsPath = Join-Path -Path $policyRootPath -ChildPath "exportPrefs"
    if (-not (Test-Path $exportPrefsPath)) {
        Write-Host "$Browser : Subkey exportPrefs missing ❌"
        $ok = $false
    }

    if ($ok) {
        Write-Host "$Browser : Managed configuration compliant ✅"
    }
    return $ok
}

function Test-ForceInstall {
    param(
        [Parameter(Mandatory)] [string] $BasePath,
        [Parameter(Mandatory)] [string] $Browser
    )

    $forceListPath = Join-Path -Path $BasePath -ChildPath "ExtensionInstallForcelist"
    if (-not (Test-Path $forceListPath)) {
        Write-Host "$Browser : ExtensionInstallForcelist key missing ❌"
        return $false
    }

    $expectedValue = "$ExtensionID;$UpdateURL"
    $currentValue = Get-RegistryValue -Path $forceListPath -Name $RegistryKeyName
    if ($currentValue -ne $expectedValue) {
        Write-Host "$Browser : Unexpected ExtensionInstallForcelist/$RegistryKeyName value ($currentValue) ❌"
        return $false
    }

    Write-Host "$Browser : Forced extension configured ✅"
    return $true
}

function Test-ExtensionSettings {
    param(
        [Parameter(Mandatory)] [string] $BasePath,
        [Parameter(Mandatory)] [string] $Browser
    )

    $settingsPath = Join-Path -Path $BasePath -ChildPath "ExtensionSettings"
    if (-not (Test-Path $settingsPath)) {
        Write-Host "$Browser : ExtensionSettings key missing ❌"
        return $false
    }

    $raw = Get-RegistryValue -Path $settingsPath -Name $ExtensionID
    if (-not $raw) {
        Write-Host "$Browser : ExtensionSettings/$ExtensionID missing ❌"
        return $false
    }

    try {
        $json = $raw | ConvertFrom-Json -ErrorAction Stop
    } catch {
        Write-Host "$Browser : ExtensionSettings/$ExtensionID is not valid JSON ❌"
        return $false
    }

    $installModeOk = ($json.installation_mode -eq "force_installed")
    $updateUrlOk   = ($json.update_url -eq $UpdateURL)

    if (-not $installModeOk) {
        Write-Host "$Browser : Unexpected installation_mode ($($json.installation_mode)) ❌"
    }
    if (-not $updateUrlOk) {
        Write-Host "$Browser : Unexpected update_url ($($json.update_url)) ❌"
    }

    if ($installModeOk -and $updateUrlOk) {
        Write-Host "$Browser : ExtensionSettings conformes ✅"
        return $true
    }

    return $false
}

Write-Host "----------------------------------------------"
Write-Host "Checking Nexthink Quick Actions configuration…"
Write-Host "----------------------------------------------"

$hasIssue = $false
foreach ($target in $RegistryTargets) {
    $basePath = $target.Path
    $browser  = $target.Browser

    $forceOk = Test-ForceInstall -BasePath $basePath -Browser $browser
    $settingsOk = Test-ExtensionSettings -BasePath $basePath -Browser $browser

    $extensionRoot = Join-Path -Path $basePath -ChildPath "3rdparty\extensions\$ExtensionID"
    $policyOk = Test-ManagedPolicy -ExtensionRoot $extensionRoot -Browser $browser

    if (-not ($forceOk -and $settingsOk -and $policyOk)) {
        $hasIssue = $true
    }
}

if ($hasIssue) {
    Write-Host "Configuration incomplete or incorrect. Trigger remediation."
    exit 1
}

Write-Host "Configuration validated on all Chrome/Edge architectures."
exit 0
