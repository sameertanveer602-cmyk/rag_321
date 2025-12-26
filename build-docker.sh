#!/bin/bash

# =============================================================================
# DOCKER BUILD SCRIPT FOR LINUX/MAC
# Build and test Hebrew RAG system Docker image
# =============================================================================

set -e

echo "🐳 Hebrew RAG System - Docker Build Script"
echo "=========================================="
echo ""

# Check if Docker is running
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

if ! docker info &> /dev/null; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

echo "✅ Docker is running"
echo ""

# Check if .env.local exists
if [ ! -f ".env.local" ]; then
    echo "⚠️  .env.local not found. Creating template..."
    cp ".env.production.template" ".env.local"
    echo "📝 Please edit .env.local with your actual API keys"
    echo "   Then run this script again."
    exit 1
fi

echo "📋 Found .env.local configuration"
echo ""

# Build Docker image
echo "🔨 Building Docker image..."
docker build -t hebrew-rag-system:latest .

echo "✅ Docker image built successfully"
echo ""

# Check if image exists
echo "📦 Checking Docker image..."
docker images hebrew-rag-system:latest
echo ""

# Ask user if they want to test locally
read -p "🧪 Do you want to test the image locally? (y/n): " test_local
if [[ $test_local =~ ^[Yy]$ ]]; then
    echo ""
    echo "🚀 Starting container for testing..."
    
    # Stop any existing test container
    docker stop hebrew-rag-test 2>/dev/null || true
    docker rm hebrew-rag-test 2>/dev/null || true
    
    # Run new container
    docker run -d --name hebrew-rag-test -p 3000:3000 --env-file .env.local hebrew-rag-system:latest
    
    echo "✅ Container started successfully"
    echo "📊 Container status:"
    docker ps | grep hebrew-rag-test
    echo ""
    
    echo "⏳ Waiting for application to start (30 seconds)..."
    sleep 30
    
    echo "🌐 Testing health endpoint..."
    if curl -f http://localhost:3000/api/health > /dev/null 2>&1; then
        echo "✅ Health check passed"
        echo "🎉 Application is running at http://localhost:3000"
        echo ""
        echo "🧪 Run API tests with: node test-apis.js"
        echo "🌐 Open browser to: http://localhost:3000"
        echo ""
        read -p "🛑 Stop the test container? (y/n): " stop_container
        if [[ $stop_container =~ ^[Yy]$ ]]; then
            docker stop hebrew-rag-test
            docker rm hebrew-rag-test
            echo "✅ Test container stopped and removed"
        else
            echo "ℹ️  Container is still running. Stop with: docker stop hebrew-rag-test"
        fi
    else
        echo "❌ Health check failed"
        echo "📋 Container logs:"
        docker logs hebrew-rag-test
        echo ""
        echo "🛑 Stopping failed container..."
        docker stop hebrew-rag-test
        docker rm hebrew-rag-test
    fi
fi

echo ""
echo "🎯 Next Steps:"
echo "   1. If local testing passed, you're ready for Railway deployment"
echo "   2. Go to railway.app and deploy from GitHub"
echo "   3. Add the same environment variables from .env.local"
echo "   4. Test deployed app with: node test-apis.js --url https://your-app.railway.app"
echo ""
echo "📖 See BUILD_AND_DEPLOY.md for detailed instructions"
echo ""