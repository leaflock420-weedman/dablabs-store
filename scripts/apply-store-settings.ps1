# Dab Labs — Shopify store bootstrap helper
# Run after creating your Shopify store and logging in via CLI

param(
    [Parameter(Mandatory = $true)]
    [string]$StoreUrl  # e.g. dablabs-au.myshopify.com
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$ThemePath = Join-Path $ProjectRoot "theme\dablabs"

Write-Host "`n=== Dab Labs Store Setup ===" -ForegroundColor Green
Write-Host "Store: $StoreUrl"
Write-Host "Theme: $ThemePath`n"

# Step 1: Authenticate (opens browser)
Write-Host "[1/3] Authenticating with Shopify..." -ForegroundColor Cyan
cmd /c "shopify auth login --store $StoreUrl"

# Step 2: Push theme
Write-Host "[2/3] Pushing Dab Labs theme..." -ForegroundColor Cyan
Push-Location $ThemePath
cmd /c "shopify theme push --store $StoreUrl --unpublished --json"
Pop-Location

# Step 3: Print manual steps for payments/shipping
Write-Host "`n[3/3] Manual admin steps (payments & shipping cannot be automated via CLI):" -ForegroundColor Cyan
Write-Host @"

  PAYMENTS (Settings > Payments):
    [x] Complete Shopify Payments setup (ABN + AU bank account)
    [x] Install & enable Afterpay app
    [x] Install & enable Zip - Buy Now Pay Later app

  SHIPPING (Settings > Shipping and delivery):
    [x] Set origin address (your house)
    [x] Australia zone: Standard `$9.95 / Free over `$100 / Express `$14.95

  DOMAIN (Settings > Domains):
    [x] Connect dablabs.com.au — update DNS at your registrar

  BRANDING (Online Store > Themes > Customize):
    [x] Upload logo from: $ProjectRoot\brand\logo-canva.png
    [x] Upload favicon from: $ProjectRoot\brand\favicon.png

  See full checklist: $ProjectRoot\config\SETUP-CHECKLIST.md

"@ -ForegroundColor Yellow

Write-Host "Done! Preview theme with: shopify theme dev --store $StoreUrl" -ForegroundColor Green