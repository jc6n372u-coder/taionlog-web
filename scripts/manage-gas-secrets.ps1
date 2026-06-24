[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("GenerateAdmin", "Status", "Rotate", "Revoke", "ClearClipboard")]
    [string]$Action,

    [Parameter(Mandatory = $false)]
    [ValidatePattern('^https://script\.google\.com/macros/s/.+/exec$')]
    [string]$GasUrl
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function New-StrongSecret {
    $bytes = New-Object byte[] 48
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $rng.GetBytes($bytes)
        return [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
    }
    finally {
        $rng.Dispose()
        [Array]::Clear($bytes, 0, $bytes.Length)
    }
}

function Read-SecretPlainText {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Prompt
    )

    $secure = Read-Host -Prompt $Prompt -AsSecureString
    Set-Clipboard -Value " "
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
        $secure.Dispose()
    }
}

function Assert-GasUrl {
    if ([string]::IsNullOrWhiteSpace($GasUrl)) {
        throw "Status、Rotate、Revokeでは -GasUrl に既存GAS WebアプリURLを指定してください。"
    }
}

function Invoke-AdminAction {
    param(
        [Parameter(Mandatory = $true)]
        [hashtable]$Body
    )

    Assert-GasUrl
    $json = $Body | ConvertTo-Json -Compress -Depth 5
    try {
        $response = Invoke-RestMethod `
            -Uri $GasUrl `
            -Method Post `
            -ContentType "application/json; charset=utf-8" `
            -Body $json
    }
    finally {
        $json = $null
    }

    if ($null -eq $response -or $response.ok -ne $true) {
        $code = if ($response.error.code) { [string]$response.error.code } else { "UNKNOWN" }
        $message = if ($response.error.message) { [string]$response.error.message } else { "管理者APIに失敗しました" }
        throw "[$code] $message"
    }

    return $response.data
}

switch ($Action) {
    "GenerateAdmin" {
        $adminSecret = New-StrongSecret
        try {
            Set-Clipboard -Value $adminSecret
            Write-Host "ADMIN_SECRET候補をクリップボードへコピーしました。"
            Write-Host "GASのスクリプトプロパティ ADMIN_SECRET へ貼り付けた後、ClearClipboardを実行してください。"
        }
        finally {
            $adminSecret = $null
        }
    }

    "Status" {
        Assert-GasUrl
        $adminSecret = Read-SecretPlainText -Prompt "ADMIN_SECRET"
        try {
            $data = Invoke-AdminAction -Body @{
                action       = "get_secret_status"
                admin_secret = $adminSecret
            }
            [pscustomobject]@{
                ApiSecretConfigured      = [bool]$data.api_secret_configured
                PreviousSecretEnabled    = [bool]$data.previous_secret_enabled
                AdminSecretConfigured    = [bool]$data.admin_secret_configured
                SecretsAreSeparated      = [bool]$data.secrets_are_separated
                MinimumSecretLength      = [int]$data.minimum_secret_length
            } | Format-List
        }
        finally {
            $adminSecret = $null
        }
    }

    "Rotate" {
        Assert-GasUrl
        $adminSecret = Read-SecretPlainText -Prompt "ADMIN_SECRET"
        $newApiSecret = New-StrongSecret
        try {
            $data = Invoke-AdminAction -Body @{
                action         = "rotate_secret"
                admin_secret   = $adminSecret
                new_secret     = $newApiSecret
                keep_previous  = $true
            }

            if ($data.rotated -ne $true -or $data.previous_secret_enabled -ne $true) {
                throw "秘密値ローテーションの応答が期待値と一致しません。"
            }

            Set-Clipboard -Value $newApiSecret
            Write-Host "API_SECRETをローテーションし、新しいVITE_API_SECRETをクリップボードへコピーしました。"
            Write-Host "Cloudflare Pagesへ貼り付けて再デプロイした後、ClearClipboardを実行してください。"
        }
        finally {
            $adminSecret = $null
            $newApiSecret = $null
        }
    }

    "Revoke" {
        Assert-GasUrl
        $adminSecret = Read-SecretPlainText -Prompt "ADMIN_SECRET"
        try {
            $data = Invoke-AdminAction -Body @{
                action       = "revoke_previous_secret"
                admin_secret = $adminSecret
            }
            Write-Host ("API_SECRET_PREVIOUS失効処理完了: revoked={0}" -f [bool]$data.revoked)
        }
        finally {
            $adminSecret = $null
        }
    }

    "ClearClipboard" {
        Set-Clipboard -Value " "
        Write-Host "クリップボードを消去しました。"
    }
}
