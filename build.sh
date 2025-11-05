# Build
echo "🚀 Building application..."

# Install dependencies
npm ci --production

# Initialize database
npm run init-db

echo "✅ Build completed successfully!"