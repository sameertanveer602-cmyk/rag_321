# 🚀 Deployment Guide

This guide will help you deploy your Multilingual RAG Application to Vercel and get your production API endpoints.

## Prerequisites

Before deploying, make sure you have:
- ✅ GitHub account
- ✅ Vercel account (free tier is sufficient)
- ✅ Supabase project set up
- ✅ Google Gemini API key
- ✅ Your code pushed to GitHub

## Step 1: Prepare Your Repository

1. **Clean up your local repository** (already done if you followed the cleanup steps)
2. **Push to GitHub**:
   ```bash
   git add .
   git commit -m "Ready for deployment"
   git push origin main
   ```

## Step 2: Set Up Supabase for Production

1. **Create a Supabase project** at [supabase.com](https://supabase.com)
2. **Run the database setup**:
   - Go to your Supabase dashboard
   - Navigate to SQL Editor
   - Copy and paste the entire contents of `complete-database-setup.sql`
   - Click "Run"
3. **Get your API keys**:
   - Go to Settings > API
   - Copy your Project URL and anon key
   - Copy your service_role key (keep this secret!)

## Step 3: Deploy to Vercel

1. **Go to Vercel**:
   - Visit [vercel.com](https://vercel.com)
   - Sign in with your GitHub account

2. **Create New Project**:
   - Click "New Project"
   - Import your GitHub repository
   - Select your multilingual-rag repository

3. **Configure Build Settings**:
   - Framework Preset: Next.js
   - Build Command: `npm run build` (default)
   - Output Directory: `.next` (default)
   - Install Command: `npm install` (default)

4. **Set Environment Variables**:
   Click "Environment Variables" and add:
   ```
   NEXT_PUBLIC_SUPABASE_URL = https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY = your_anon_key_here
   SUPABASE_SERVICE_ROLE_KEY = your_service_role_key_here
   GEMINI_API_KEY = your_gemini_api_key_here
   ```

5. **Deploy**:
   - Click "Deploy"
   - Wait for the build to complete (usually 2-3 minutes)
   - Your app will be live at `https://your-app-name.vercel.app`

## Step 4: Test Your Deployment

Once deployed, test your API endpoints:

### Health Check
```bash
curl https://your-app-name.vercel.app/api/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2024-12-24T...",
  "database": {
    "connected": true,
    "tables_exist": true
  },
  "environment": {
    "all_variables_present": true
  }
}
```

### Upload Test
```bash
curl -X POST https://your-app-name.vercel.app/api/upload \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "test.txt",
    "content": "SGVsbG8gV29ybGQ=",
    "metadata": {"test": true}
  }'
```

### Search Test
```bash
curl -X POST https://your-app-name.vercel.app/api/rag-search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Hello",
    "top_k": 3
  }'
```

## Step 5: Get Your Production API Endpoints

After successful deployment, your API endpoints will be:

- **Health Check**: `https://your-app-name.vercel.app/api/health`
- **Document Upload**: `https://your-app-name.vercel.app/api/upload`
- **RAG Search**: `https://your-app-name.vercel.app/api/rag-search`
- **Chat Interface**: `https://your-app-name.vercel.app/api/chat`

## Step 6: Configure Custom Domain (Optional)

1. **In Vercel Dashboard**:
   - Go to your project settings
   - Click "Domains"
   - Add your custom domain
   - Follow DNS configuration instructions

2. **Update API Base URL**:
   - Your endpoints will be available at `https://yourdomain.com/api/*`

## Troubleshooting

### Common Issues

1. **Build Fails**:
   - Check that all dependencies are in `package.json`
   - Ensure TypeScript types are correct
   - Check build logs in Vercel dashboard

2. **Environment Variables Not Working**:
   - Make sure variable names match exactly
   - Redeploy after adding environment variables
   - Check that Supabase keys are correct

3. **Database Connection Issues**:
   - Verify Supabase URL and keys
   - Check that database setup SQL was run completely
   - Test connection from Supabase dashboard

4. **API Endpoints Return 500**:
   - Check function logs in Vercel dashboard
   - Verify Gemini API key is valid
   - Test endpoints locally first

### Getting Help

- **Vercel Logs**: Check function logs in your Vercel dashboard
- **Supabase Logs**: Monitor database logs in Supabase dashboard
- **Local Testing**: Always test locally before deploying

## Production Considerations

### Security
- Never commit `.env` files to GitHub
- Use environment variables for all secrets
- Enable RLS policies in Supabase for production

### Performance
- Monitor API usage in Vercel dashboard
- Set up Supabase connection pooling for high traffic
- Consider implementing rate limiting

### Monitoring
- Set up Vercel Analytics
- Monitor Supabase usage and performance
- Set up error tracking (Sentry, etc.)

## Next Steps

1. **Test thoroughly** with your actual documents
2. **Set up monitoring** and error tracking
3. **Configure custom domain** if needed
4. **Share your API endpoints** with your team
5. **Monitor usage** and optimize as needed

Your Multilingual RAG Application is now live and ready to handle document processing and multilingual queries in production! 🎉