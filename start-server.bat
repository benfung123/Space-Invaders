@echo off
echo Gravity Horizon — Starting local server...
echo.

where python >nul 2>&1
if %errorlevel% == 0 (
    echo Starting with Python...
    python -m http.server 3000
    goto end
)

where py >nul 2>&1
if %errorlevel% == 0 (
    echo Starting with Python...
    py -m http.server 3000
    goto end
)

where node >nul 2>&1
if %errorlevel% == 0 (
    echo Starting with Node...
    npx serve -l 3000
    goto end
)

echo.
echo Could not find Python or Node.js to start a server.
echo.
echo Options:
echo  1. Install Python from https://python.org (check "Add to PATH")
echo  2. Install Node.js from https://nodejs.org (then run: npm install ^&^& npm run dev)
echo  3. Use VS Code with the "Live Server" extension
echo.
pause

:end
