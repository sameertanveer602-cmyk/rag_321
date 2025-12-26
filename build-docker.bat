@echo off
REM =============================================================================
REM DOCKER BUILD SCRIPT FOR WINDOWS
REM Build and test Hebrew RAG system Docker image
REM =============================================================================

echo 🐳 Hebrew RAG System - Docker Build Script
echo ==========================================
echo.

REM Check if Docker is running
docker version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker is not running. Please start Docker Desktop first.
    pause
    exit /b 1
)

echo ✅ Docker is running
echo.

REM Check if .env.local exists
if not exist ".env.local" (
    echo ⚠️  .env.local not found. Creating template...
    copy ".env.production.template" ".env.local"
    echo 📝 Please edit .env.local with your actual API keys
    echo    Then run this script again.
    pause
    exit /b 1
)

echo 📋 Found .env.local configuration
echo.

REM Build Docker image
echo 🔨 Building Docker image...
docker build -t hebrew-rag-system:latest .
if %errorlevel% neq 0 (
    echo ❌ Docker build failed
    pause
    exit /b 1
)

echo ✅ Docker image built successfully
echo.

REM Check if image exists
echo 📦 Checking Docker image...
docker images hebrew-rag-system:latest
echo.

REM Ask user if they want to test locally
set /p test_local="🧪 Do you want to test the image locally? (y/n): "
if /i "%test_local%"=="y" (
    echo.
    echo 🚀 Starting container for testing...
    
    REM Stop any existing test container
    docker stop hebrew-rag-test >nul 2>&1
    docker rm hebrew-rag-test >nul 2>&1
    
    REM Run new container
    docker run -d --name hebrew-rag-test -p 3000:3000 --env-file .env.local hebrew-rag-system:latest
    if %errorlevel% neq 0 (
        echo ❌ Failed to start container
        pause
        exit /b 1
    )
    
    echo ✅ Container started successfully
    echo 📊 Container status:
    docker ps | findstr hebrew-rag-test
    echo.
    
    echo ⏳ Waiting for application to start (30 seconds)...
    timeout /t 30 /nobreak >nul
    
    echo 🌐 Testing health endpoint...
    curl -f http://localhost:3000/api/health >nul 2>&1
    if %errorlevel% equ 0 (
        echo ✅ Health check passed
        echo 🎉 Application is running at http://localhost:3000
        echo.
        echo 🧪 Run API tests with: node test-apis.js
        echo 🌐 Open browser to: http://localhost:3000
        echo.
        set /p stop_container="🛑 Stop the test container? (y/n): "
        if /i "%stop_container%"=="y" (
            docker stop hebrew-rag-test
            docker rm hebrew-rag-test
            echo ✅ Test container stopped and removed
        ) else (
            echo ℹ️  Container is still running. Stop with: docker stop hebrew-rag-test
        )
    ) else (
        echo ❌ Health check failed
        echo 📋 Container logs:
        docker logs hebrew-rag-test
        echo.
        echo 🛑 Stopping failed container...
        docker stop hebrew-rag-test
        docker rm hebrew-rag-test
    )
)

echo.
echo 🎯 Next Steps:
echo    1. If local testing passed, you're ready for Railway deployment
echo    2. Go to railway.app and deploy from GitHub
echo    3. Add the same environment variables from .env.local
echo    4. Test deployed app with: node test-apis.js --url https://your-app.railway.app
echo.
echo 📖 See BUILD_AND_DEPLOY.md for detailed instructions
echo.
pause