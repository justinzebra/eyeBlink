@echo off
chcp 65001 >nul
setlocal
pushd "%~dp0" || exit /b 1
set "BLINK_ASSIST_URL=http://127.0.0.1:5173/"

rem 如果前端已經開著，直接開啟同一個網址。
curl.exe --noproxy "*" --fail --silent --max-time 2 "%BLINK_ASSIST_URL%" | findstr.exe /L /C:"Blink Assist" >nul
if not errorlevel 1 (
    start "" "%BLINK_ASSIST_URL%"
    exit /b 0
)

node -e "const [major, minor] = process.versions.node.split('.').map(Number); process.exit((major === 20 && minor >= 19) || (major === 22 && minor >= 12) || major > 22 ? 0 : 1);" >nul 2>&1
if errorlevel 1 (
    echo 請先安裝 Node.js 22 或 24 LTS，再雙擊此檔案。
    pause
    exit /b 1
)

where.exe npm.cmd >nul 2>&1
if errorlevel 1 (
    echo 找不到 npm。請確認安裝 Node.js 時有一併安裝 npm。
    pause
    exit /b 1
)

if not exist "node_modules\.bin\vite.cmd" (
    echo 正在安裝前端套件，第一次需要網路連線。
    call npm.cmd ci
    if errorlevel 1 (
        echo 安裝套件失敗。請查看上方訊息，再雙擊重試。
        pause
        exit /b 1
    )
)

echo 正在啟動 Blink Assist。使用期間請保留此視窗。
call npm.cmd run dev -- --port 5173 --strictPort --open
if errorlevel 1 (
    echo 啟動失敗。若 5173 埠已被其他程式使用，請先關閉該程式再重試。
    pause
    exit /b 1
)
