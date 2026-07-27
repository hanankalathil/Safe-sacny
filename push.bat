@echo off
title Git Auto Push
color 0A

echo =====================================
echo          Git Auto Push Tool
echo =====================================
echo.

REM Check if Git is installed
git --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Git is not installed or not in PATH.
    pause
    exit /b
)

REM Get commit message
set /p COMMIT=Enter your commit message:

if "%COMMIT%"=="" set COMMIT=Update

echo.
echo [1/3] Adding files...
git add .

echo.
echo [2/3] Creating commit...
git diff --cached --quiet
if %errorlevel%==0 (
    echo No changes to commit.
) else (
    git commit -m "%COMMIT%"
)

echo.
echo [3/3] Pushing to GitHub...
git push origin HEAD

if %errorlevel%==0 (
    echo.
    echo =====================================
    echo        Push Successful!
    echo =====================================
) else (
    echo.
    echo =====================================
    echo          Push Failed!
    echo =====================================
    echo.
    echo Read the error message above.
)

echo.
pause