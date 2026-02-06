# Deployment Guide

This project uses a **Hybrid Free-Tier Architecture**:
*   **Frontend**: Firebase Hosting
*   **Backend**: Vercel (Serverless Functions)
*   **Database**: Supabase (PostgreSQL)
*   **Cron Jobs**: cron-job.org (External Trigger)

## Prerequisites

1.  **GitHub Account**: For version control.
2.  **Vercel Account**: For backend hosting.
3.  **Firebase Account**: For frontend hosting.
4.  **Supabase Account**: For the database.
5.  **cron-job.org Account**: For scheduled price checks.
6.  **Telegram Bot**: Token from BotFather.

---

## 1. Database Setup (Supabase)

1.  Create a new project on [Supabase](https://supabase.com).
2.  Go to **Project Settings** (cog icon at bottom left) -> **Database**.
3.  Scroll down to the **Connection parameters** section.
4.  Copy the **URI** (it starts with `postgresql://`).
    *   *Tip*: You can also click the green **Connect** button in the top header to see different connection options.
    *   **Password**: You will need the database password you created when setting up the project. If you forgot it, you can reset it in **Project Settings** -> **Database**.

---

## 2. Backend Deployment (Vercel)

1.  Push your code to GitHub.
2.  Log in to [Vercel](https://vercel.com) and **Add New Project**.
3.  Import your repository.
4.  **Root Directory**: Select `backend`.
5.  **Framework Preset**: Select `Other`.
6.  **Environment Variables**:
    *   `DATABASE_URL`: Your Supabase connection string.
    *   `TELEGRAM_BOT_TOKEN`: Your Telegram Bot Token.
    *   `ADMIN_TOKEN`: A secure secret string (for frontend login).
    *   `CRON_SECRET`: "MySuperSecretCronPassword123" (or any random string). This allows cron-job.org to trigger alerts without full admin access.
    *   `TELEGRAM_POLLING`: `false`
7.  **Deploy**.

### Post-Deployment (Backend)

1.  **Get Backend URL**: e.g., `https://your-project.vercel.app`.
2.  **Set Telegram Webhook**:
    Run this in your terminal (replace values):
    ```bash
    curl -F "url=https://your-project.vercel.app/api/telegram/webhook" https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook
    ```
    *Success response*: `{"ok":true, "result":true, "description":"Webhook was set"}`

---

## 3. Frontend Deployment (Firebase)

1.  Install Firebase CLI (if not installed):
    ```bash
    npm install -g firebase-tools
    ```
2.  Login to Firebase:
    ```bash
    firebase login
    ```
3.  Initialize project (inside `frontend/` folder):
    ```bash
    cd frontend
    firebase init hosting
    ```
    *   **Existing project**: Select yes if you created one in Firebase Console.
    *   **Public directory**: `dist` (Important! Vite builds to `dist`).
    *   **Configure as a single-page app**: `Yes` (Important for React Router).
    *   **Set up automatic builds and deploys with GitHub**: `No` (unless you want to).
    *   **Overwrite index.html**: `No`.

4.  **Build the Frontend**:
    You need to tell the frontend where your Vercel backend is.
    ```bash
    # Replace with your actual Vercel Backend URL
    export VITE_API_URL=https://your-backend-project.vercel.app/api
    npm run build
    ```
    *(Windows users: `set VITE_API_URL=...` or create a `.env.production` file)*

5.  **Deploy**:
    ```bash
    firebase deploy
    ```

---

## 4. Cron Job Setup (cron-job.org)

Since Vercel's free tier limits cron jobs to once per day, we use **cron-job.org** (free) to check prices every 5 minutes.

1.  Register at [cron-job.org](https://cron-job.org/en/).
2.  **Create Cronjob**:
    *   **Title**: Crypto Price Check
    *   **URL**: `https://your-project.vercel.app/api/cron/check-alerts?secret=YOUR_CRON_SECRET`
        *   Replace `YOUR_CRON_SECRET` with the value you set in Vercel Environment Variables.
    *   **Execution schedule**: Every 5 minutes.
    *   **Request method**: GET.
    *   *(Optional)* **Advanced**: You can also use Header `x-cron-secret` instead of the URL parameter if you prefer.
3.  **Create**.

---

## 5. Verification

1.  Open your **Firebase URL**.
2.  Login with your `ADMIN_TOKEN`.
3.  Create a test alert.
4.  Send `/start` to your Telegram bot.
5.  Wait for the cron job to run (or click "Test Run" on cron-job.org).
