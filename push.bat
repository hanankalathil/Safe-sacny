@echo off
title Git Auto Push
color 0A

echo =========================================
echo            Git Auto Push
echo =========================================
echo.

:: Check Git
git --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Git is not installed or not added to PATH.
    pause
    exit /b
)

:: Get commit message
set /p COMMIT=Enter commit message:

if "%COMMIT%"=="" set COMMIT=Update

echo.
echo ==============================
echo Adding files...
echo ==============================
git add .

:: Check for changes
git diff --cached --quiet
if %errorlevel%==0 (
    echo.
    echo No changes detected.
    pause
    exit /b
)

echo.
echo ==============================
echo Creating commit...
echo ==============================
git commit -m "%COMMIT%"

if errorlevel 1 (
    echo.
    echo Commit failed.
    pause
    exit /b
)

echo.
echo ==============================
echo Pushing to GitHub...
echo ==============================
git push origin main

if errorlevel 1 (
    echo.
    echo =========================================
    echo Push failed!
    echo =========================================
    pause
    exit /b
)

echo.
echo =========================================
echo Push completed successfully!
echo =========================================

git log --oneline -1

echo.
pause