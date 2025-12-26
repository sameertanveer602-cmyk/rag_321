#!/bin/bash

# =============================================================================
# DEPLOYMENT SCRIPT FOR HEBREW RAG SYSTEM
# Automated deployment to various platforms
# =============================================================================

set -e

echo "🚀 Hebrew RAG System Deployment Script"
echo "======================================"

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Function to build Docker image
build_image() {
    echo "🔨 Building Docker image..."
    docker build -t hebrew-rag-system:latest .
    echo "✅ Docker image built successfully"
}

# Function to test locally
test_local() {
    echo "🧪 Testing locally..."
    
    # Check if .env.production exists
    if [ ! -f ".env.production" ]; then
        echo "⚠️  .env.production not found. Creating template..."
        cat > .env.production << EOF
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Google AI Configuration
GOOGLE_API_KEY=your_google_api_key

# Optional
NEXT_PUBLIC_APP_URL=http://localhost:3000
ADMIN_KEY=dev-admin-key
EOF
        echo "📝 Please edit .env.production with your actual values"
        return 1
    fi
    
    # Run container
    echo "🏃 Starting container on port 3000..."
    docker run -d --name hebrew-rag-test -p 3000:3000 --env-file .env.production hebrew-rag-system:latest
    
    # Wait for startup
    echo "⏳ Waiting for application to start..."
    sleep 10
    
    # Test health endpoint
    if curl -f http://localhost:3000/api/health > /dev/null 2>&1; then
        echo "✅ Health check passed"
        echo "🌐 Application running at http://localhost:3000"
    else
        echo "❌ Health check failed"
        docker logs hebrew-rag-test
        docker stop hebrew-rag-test
        docker rm hebrew-rag-test
        return 1
    fi
    
    # Cleanup
    docker stop hebrew-rag-test
    docker rm hebrew-rag-test
}

# Function to deploy to Railway
deploy_railway() {
    echo "🚂 Deploying to Railway..."
    echo "1. Go to https://railway.app"
    echo "2. Connect your GitHub repository"
    echo "3. Add environment variables from .env.production"
    echo "4. Railway will automatically use the Dockerfile"
    echo "📖 See DOCKER_DEPLOYMENT.md for detailed instructions"
}

# Function to deploy to Render
deploy_render() {
    echo "🎨 Deploying to Render..."
    echo "1. Go to https://render.com"
    echo "2. Create new Web Service from GitHub"
    echo "3. Select Docker environment"
    echo "4. Add environment variables from .env.production"
    echo "📖 See DOCKER_DEPLOYMENT.md for detailed instructions"
}

# Function to deploy to Fly.io
deploy_fly() {
    echo "✈️  Deploying to Fly.io..."
    
    if ! command -v flyctl &> /dev/null; then
        echo "❌ flyctl is not installed. Installing..."
        curl -L https://fly.io/install.sh | sh
        echo "Please restart your terminal and run this script again"
        return 1
    fi
    
    echo "🔐 Please login to Fly.io:"
    flyctl auth login
    
    echo "🚀 Launching application..."
    flyctl launch --no-deploy
    
    echo "🔑 Setting environment variables..."
    if [ -f ".env.production" ]; then
        while IFS='=' read -r key value; do
            if [[ ! $key =~ ^# ]] && [[ $key ]]; then
                flyctl secrets set "$key=$value"
            fi
        done < .env.production
    fi
    
    echo "🚀 Deploying..."
    flyctl deploy
}

# Main menu
echo ""
echo "Select deployment option:"
echo "1) Build Docker image"
echo "2) Test locally"
echo "3) Deploy to Railway (recommended)"
echo "4) Deploy to Render"
echo "5) Deploy to Fly.io"
echo "6) All (build + test + instructions)"
echo ""

read -p "Enter your choice (1-6): " choice

case $choice in
    1)
        build_image
        ;;
    2)
        build_image
        test_local
        ;;
    3)
        deploy_railway
        ;;
    4)
        deploy_render
        ;;
    5)
        deploy_fly
        ;;
    6)
        build_image
        test_local
        echo ""
        echo "🎯 Next steps:"
        echo "Choose a platform for deployment:"
        deploy_railway
        echo ""
        deploy_render
        ;;
    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "🎉 Deployment process completed!"
echo "📖 For detailed instructions, see DOCKER_DEPLOYMENT.md"