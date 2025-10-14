# Nexthink Quick Actions – Remediation script for Intune

$ExtensionID = "pgddlkkeemmdeanlibbcmipdinbeogpk"
$UpdateURL = "https://clients2.google.com/service/update2/crx"

// Ensure you take a sufficiently large number to avoid overwriting an existing policy.
$RegistryKeyName = "43"

$PolicyMode = "overlay"
$AllowUserEntries = 0
$LockManagedEntries = 1

$InstanceSettings = @{
    name = "CORP"
    url  = "https://corp.eu.nexthink.cloud"
}

$ExportPrefs = @{
    csvDelimiter    = ";"
    clipboardFormat = "html"
}

$MenuItems = @(
    @{ Index = "1"; Name = "Nexthink Action 1"; Url = "http://{instance_name}.tool1.com/{PH1}" },
    @{ Index = "2"; Name = "Nexthink Action 2"; Url = "http://{instance_name}.tool2.com/{PH2}" },
    @{ Index = "3"; Name = "Nexthink Action 3"; Url = "http://{instance_name}.tool3.com/{PH3}" },
    @{ Index = "4"; Name = "Nexthink Action 4"; Url = "http://{instance_name}.tool3.com/{PH4}" },
    @{ Index = "5"; Name = "Nexthink Action 5"; Url = "http://{instance_name}.tool4.com/{PH5}" }
)

$RegistryTargets = @(
    @{ Path = "HKLM:\Software\Policies\Google\Chrome"; Browser = "Chrome (64-bit)" },
    @{ Path = "HKLM:\Software\WOW6432Node\Policies\Google\Chrome"; Browser = "Chrome (32-bit)" },
    @{ Path = "HKLM:\Software\Policies\Microsoft\Edge"; Browser = "Edge (64-bit)" },
    @{ Path = "HKLM:\Software\WOW6432Node\Policies\Microsoft\Edge"; Browser = "Edge (32-bit)" }
)

function Ensure-Key {
    param([Parameter(Mandatory)] [string] $Path)
    if (-not (Test-Path $Path)) {
        New-Item -Path $Path -Force | Out-Null
    }
}

function Set-StringValue {
    param(
        [Parameter(Mandatory)] [string] $Path,
        [Parameter(Mandatory)] [string] $Name,
        [Parameter(Mandatory)] [string] $Value
    )
    New-ItemProperty -Path $Path -Name $Name -Value $Value -PropertyType String -Force | Out-Null
}

function Set-DWordValue {
    param(
        [Parameter(Mandatory)] [string] $Path,
        [Parameter(Mandatory)] [string] $Name,
        [Parameter(Mandatory)] [int] $Value
    )
    New-ItemProperty -Path $Path -Name $Name -Value $Value -PropertyType DWord -Force | Out-Null
}

Write-Host "----------------------------------------------"
Write-Host "Applying Nexthink Quick Actions configuration…"
Write-Host "----------------------------------------------"

foreach ($target in $RegistryTargets) {
    $basePath = $target.Path
    $browser  = $target.Browser

    Write-Host "--- $browser ---"

    $forceListPath = Join-Path -Path $basePath -ChildPath "ExtensionInstallForcelist"
    Ensure-Key -Path $forceListPath
    Set-StringValue -Path $forceListPath -Name $RegistryKeyName -Value "$ExtensionID;$UpdateURL"

    $settingsPath = Join-Path -Path $basePath -ChildPath "ExtensionSettings"
    Ensure-Key -Path $settingsPath
    $settingsPayload = @{ installation_mode = "force_installed"; update_url = $UpdateURL; toolbar_pin = "force_pinned" }
    $settingsJson = ($settingsPayload | ConvertTo-Json -Compress)
    Set-StringValue -Path $settingsPath -Name $ExtensionID -Value $settingsJson

    $extensionRoot = Join-Path -Path $basePath -ChildPath "3rdparty\extensions\$ExtensionID"
    Ensure-Key -Path $extensionRoot

    $policyRootPath = Join-Path -Path $extensionRoot -ChildPath "policy"
    Ensure-Key -Path $policyRootPath

    $policySettingsPath = Join-Path -Path $policyRootPath -ChildPath "policy"
    Ensure-Key -Path $policySettingsPath
    Set-StringValue -Path $policySettingsPath -Name "mode" -Value $PolicyMode
    Set-DWordValue -Path $policySettingsPath -Name "allowUserEntries" -Value $AllowUserEntries
    Set-DWordValue -Path $policySettingsPath -Name "lockManagedEntries" -Value $LockManagedEntries

    $instancePath = Join-Path -Path $policyRootPath -ChildPath "instance"
    Ensure-Key -Path $instancePath
    Set-StringValue -Path $instancePath -Name "name" -Value $InstanceSettings.name
    Set-StringValue -Path $instancePath -Name "url"  -Value $InstanceSettings.url

    $exportPrefsPath = Join-Path -Path $policyRootPath -ChildPath "exportPrefs"
    Ensure-Key -Path $exportPrefsPath
    Set-StringValue -Path $exportPrefsPath -Name "csvDelimiter" -Value $ExportPrefs.csvDelimiter
    Set-StringValue -Path $exportPrefsPath -Name "clipboardFormat" -Value $ExportPrefs.clipboardFormat

    $menuPath = Join-Path -Path $policyRootPath -ChildPath "menu"
    if (Test-Path $menuPath) {
        Remove-Item -Path $menuPath -Recurse -Force
    }
    Ensure-Key -Path $menuPath

    foreach ($item in $MenuItems) {
        $entryPath = Join-Path -Path $menuPath -ChildPath $item.Index
        Ensure-Key -Path $entryPath
        Set-StringValue -Path $entryPath -Name "name" -Value $item.Name
        Set-StringValue -Path $entryPath -Name "url"  -Value $item.Url
    }

    Write-Host "$browser : Configuration applied ✅"
}

Write-Host "Remediation completed."
exit 0
