# Dickinson Dining Daily

An automated service that delivers the daily Dickinson College cafeteria menu to your inbox. Users can subscribe and filter their preferences (e.g., only "Main line" or "Island 3", only "Dinner") via a web interface.

## Project Architecture

- **Frontend**: Streamlit (`app.py`) for user subscription and preference management.
- **Backend Service**: Python script (`send_menu.py`) that fetches data, filters per user, and sends emails.
- **Data Source**: Nutrislice API (via `utils.py`).
- **Database**: Supabase (PostgreSQL) for storing user emails and preferences.
- **Automation**: GitHub Actions runs the backend script daily at 7:00 AM EST.

## Setup Instructions

### 1. Prerequisites

- Python 3.10+
- A Supabase account and project.
- A generic SMTP email account (e.g., Gmail with App Password) or SendGrid/resend API key.

### 2. Installation

1. Clone the repository.
2. Create a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

### 3. Database Setup (Supabase)

1. Go to your Supabase project's **SQL Editor**.
2. Run the SQL from `schema.sql` to create the `users` table.

### 4. Local Development

#### Frontend (Streamlit)
To run the subscription page locally:
1. Copy the secrets template: `cp .streamlit/secrets_template.toml .streamlit/secrets.toml` (or rename it).
2. Fill in your `url` and `key` from Supabase Project Settings -> API.
3. Run the app:
   ```bash
   streamlit run app.py
   ```

#### Backend (Email Script)
To test sending emails:
1. Set the following environment variables (in your terminal or `.env` file):
   - `SUPABASE_URL`
   - `SUPABASE_KEY`
   - `SMTP_EMAIL`
   - `SMTP_PASSWORD`
   - `SMTP_SERVER` (default: smtp.gmail.com)
   - `SMTP_PORT` (default: 587)
2. Run the script:
   ```bash
   python send_menu.py
   ```

## Deployment Instructions

### Part 1: Backend Automation (GitHub Actions)
This handles the daily email sending.

1. **Push to GitHub**:
   - Create a new repository on GitHub.
   - Push your code:
     ```bash
     git init
     git add .
     git commit -m "Initial commit"
     git branch -M main
     git remote add origin <YOUR_REPO_URL>
     git push -u origin main
     ```

2. **Configure Secrets**:
   - Go to your GitHub Repository -> **Settings** -> **Secrets and variables** -> **Actions**.
   - Click **New repository secret** and add the following:
     - `SUPABASE_URL`
     - `SUPABASE_KEY`
     - `SMTP_EMAIL`
     - `SMTP_PASSWORD`
     - `SMTP_SERVER` (default: `smtp.gmail.com`)
     - `SMTP_PORT` (default: `587`)

3. **Verify**:
   - Go to the **Actions** tab in GitHub.
   - Select "Daily Menu Notification" on the left.
   - Click **Run workflow** -> **Run workflow** to test it immediately.
   - Afterward, it will run automatically every day at 7:00 AM EST.

### Part 2: Frontend Hosting (Streamlit Cloud)
This makes the subscription page accessible to everyone.

1. **Sign up/Login**: Go to [share.streamlit.io](https://share.streamlit.io/).
2. **New App**: Click **New app** -> Select your GitHub repository used above.
3. **Settings**:
   - Main file path: `app.py`
4. **Advanced Settings (Secrets)**:
   - Click **Advanced settings** (or the "Manage app" menu after deploying -> Settings -> Secrets).
   - Paste the contents of your `.streamlit/secrets.toml` file here:
     ```toml
     [supabase]
     url = "YOUR_SUPABASE_URL"
     key = "YOUR_SUPABASE_KEY"
     ```
5. **Deploy**: Click **Deploy**. Your app is now live!

## Todo
- [ ] fix dark mode bug (unsubscribe page -> manage preferences(/?email=example%40gmail.com&action=) -> breaks some styling)
