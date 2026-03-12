@echo off
setlocal enabledelayedexpansion

echo ======================================
echo  MEP Ops -- Database Setup (Windows)
echo ======================================

REM -------------------------------------------------------
REM Load variables from .env file
REM Skips blank lines and lines starting with #
REM Works with values containing $ (e.g., bcrypt hashes)
REM -------------------------------------------------------
for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
    set "line=%%A"
    if not "!line!"=="" (
        set "first=!line:~0,1!"
        if not "!first!"=="#" (
            set "%%A=%%B"
        )
    )
)

echo Target: %DB_NAME% @ %DB_HOST%:%DB_PORT%
echo.

set PSQL_URL=postgresql://%DB_USER%:%DB_PASSWORD%@%DB_HOST%:%DB_PORT%/%DB_NAME%

REM -------------------------------------------------------
REM Run SQL files in order
REM -------------------------------------------------------
call :run_sql "db\01_schemas.sql"
call :run_sql "db\02_seed_data.sql"
call :run_sql "db\03_views.sql"
call :run_sql "db\04_product_schema.sql"
call :run_sql "db\05_sample_data.sql"
call :run_sql "db\06_auth.sql"
call :run_sql "db\07_jsonb_migration.sql"
call :run_sql "db\08_match_status.sql"

echo.
echo ======================================
echo  Setup complete. Run validation with:
echo  python tests\validate.py
echo ======================================
goto :eof

:run_sql
echo -^> Running %~1...
psql "%PSQL_URL%" -f %1
if errorlevel 1 (
    echo [ERROR] Failed on %~1 -- aborting.
    exit /b 1
)
echo   Done.
goto :eof
