$ErrorActionPreference = 'Stop'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'Node.js نصب نیست. نسخهٔ 22 را نصب کن و دوباره اجرا کن.'
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw 'npm در PATH نیست؛ نصب Node.js را بررسی کن.'
}
if (-not (Test-Path '.env.local')) {
  Copy-Item '.env.example' '.env.local'
  Write-Host 'فایل .env.local ساخته شد. برای اتصال سرور، URL و Publishable Key را در آن وارد کن.' -ForegroundColor Yellow
}

npm install
npm test
npm run build
if (-not (Test-Path 'android')) {
  npx cap add android
}
npx cap sync android
npx cap open android
