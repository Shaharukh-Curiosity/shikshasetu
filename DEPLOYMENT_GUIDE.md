# 🚀 DEPLOYMENT GUIDE - Render Cloud Platform

## Step 1: Prepare GitHub Repository (5 minutes)

### 1.1 Create GitHub Account (if you don't have one)
- Go to https://github.com/signup
- Create account with your email

### 1.2 Create a New Repository
1. Go to https://github.com/new
2. Name it: `attendance-system` (or any name you prefer)
3. Choose **Public** or **Private** (Private recommended for sensitive data)
4. **Do NOT** initialize with README (you'll push existing code)
5. Click **Create repository**

### 1.3 Initialize Git & Push Your Code
Open PowerShell in your project folder and run:

```powershell
cd "c:\Users\Shaharukh\OneDrive\Pictures\FIX SMS\attendance-FRESH-START\attendance-final"

# Initialize git
git init

# Add all files
git add .

# Create first commit
git commit -m "Initial commit - Attendance System"

# Add remote repository (replace YOUR_USERNAME and YOUR_REPO_NAME)
git remote add origin https://github.com/YOUR_USERNAME/attendance-system.git

# Push to GitHub (main branch)
git branch -M main
git push -u origin main
```

**When prompted for credentials:**
- Username: Your GitHub username
- Password: Generate Personal Access Token:
  1. Go to https://github.com/settings/tokens
  2. Click "Generate new token"
  3. Select scopes: `repo` (full control of private repositories)
  4. Copy the token
  5. Use this token as your password

---

## Step 2: Set Up Render Account (5 minutes)

1. Go to https://render.com
2. Click **Sign up**
3. Choose **Sign up with GitHub** ✅ (Easiest option)
4. Authorize Render to access your GitHub account
5. Complete your profile

---

## Step 3: Deploy to Render (10 minutes)

### 3.1 Create a New Web Service

1. On Render dashboard, click **+ New** → **Web Service**
2. Click **Connect account** next to your GitHub repo
3. Select your `attendance-system` repository
4. Click **Connect**

### 3.2 Configure Deployment Settings

Fill in the following:

| Field | Value |
|-------|-------|
| **Name** | `attendance-system` |
| **Environment** | `Node` |
| **Region** | `Singapore` (closest to you, or your choice) |
| **Branch** | `main` |
| **Build Command** | `npm install` |
| **Start Command** | `node server.js` |

### 3.3 Set Environment Variables

1. Scroll down to **Environment** section
2. Click **Add Environment Variable**
3. Add these variables (copy from your `.env` file):

```
MONGODB_URI = mongodb+srv://School_Management:S%40%23rspssp@cluster0.awnlr4r.mongodb.net/StudentsData?appName=Cluster0

JWT_SECRET = your_random_secret_key_at_least_32_characters_long

PORT = 3000
```

### 3.4 Set Plan & Deploy

1. Choose **Free Plan** (for testing) or **Paid Plan** (for production)
2. Click **Deploy Web Service**
3. Wait 2-5 minutes for deployment to complete
4. You'll get a URL like: `https://attendance-system-xxxx.onrender.com`

---

## Step 4: Verify Deployment (2 minutes)

1. Click the URL provided by Render
2. You should see the **Login page**
3. Try logging in with your credentials
4. Test marking attendance
5. Test viewing reports

---

## Step 5: Manage Your App

### View Logs
1. Click **Logs** tab to see real-time logs
2. Monitor for errors

### Redeploy
1. Make changes locally
2. Commit: `git commit -am "Description of changes"`
3. Push: `git push origin main`
4. Render auto-deploys on push

### Environment Variables
- Click **Environment** tab to update variables anytime
- Changes take effect after saving

### Custom Domain (Optional)
1. On Render dashboard, click **Settings**
2. Scroll to **Custom Domain**
3. Enter your domain (requires DNS configuration)

---

## Step 6: Troubleshooting

### App Won't Start
- Check **Logs** tab for errors
- Verify all environment variables are set
- Check MongoDB connection string is correct

### Can't Login
- Check JWT_SECRET is set
- Verify MongoDB contains user data
- Check browser console for errors (F12)

### Slow Performance
- Render Free tier might be slow
- Upgrade to Paid plan for better performance
- Free tier goes to sleep after 15 mins of inactivity

### Database Connection Issues
1. Verify MongoDB URI is correct
2. Add Render IP to MongoDB whitelist:
   - Go to MongoDB Atlas dashboard
   - Network Access → Add IP
   - Use `0.0.0.0/0` to allow all IPs (less secure but simpler)

---

## Quick Reference - Commands to Run

```powershell
# 1. Go to your project folder
cd "c:\Users\Shaharukh\OneDrive\Pictures\FIX SMS\attendance-FRESH-START\attendance-final"

# 2. Initialize git (one time only)
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/attendance-system.git
git branch -M main
git push -u origin main

# 3. After making changes (push updates)
git add .
git commit -m "Description of changes"
git push origin main
```

---

## Important Security Notes ⚠️

### Before Going Live:

1. **Change JWT_SECRET**
   - Current: `your_random_secret_key_at_least_32_characters_long`
   - Generate new: Use https://generate-random.org or use this command:
   ```powershell
   # PowerShell - Generate random 32 character string
   -join (1..32 | ForEach-Object { [char]((48..122) | Get-Random) })
   ```

2. **Change MongoDB Password**
   - If database password is visible in code, change it in MongoDB Atlas
   - Create new user with strong password
   - Update connection string

3. **Use Private GitHub Repository**
   - Don't push `.env` file to public repos
   - Verify `.gitignore` includes `.env`

4. **Enable MongoDB IP Whitelist**
   - Don't use `0.0.0.0/0` in production
   - Add specific Render IP addresses

---

## Estimated Costs (Free Tier)

✅ **Free Forever:**
- MongoDB Atlas: 512 MB storage (free tier)
- Render: First 750 hours/month (free tier)
- GitHub: Unlimited repos (free tier)

🔄 **For Production:**
- MongoDB Atlas: ~$10-100/month
- Render Paid: ~$12/month upward
- Typical total: ~$15-20/month

---

## Success! 🎉

Your app is now live! Share the URL with teachers and admins:

**Live URL Format:**
```
https://your-app-name.onrender.com
```

---

## Next Steps (Optional)

1. Set up monitoring (Uptime Robot - https://uptimerobot.com)
2. Configure email notifications for errors
3. Add backup strategy for MongoDB
4. Set up CI/CD pipeline
5. Add SSL certificate (Render does this automatically)
