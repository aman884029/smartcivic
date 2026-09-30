# SmartCivic deployment

SmartCivic is one Node/Express service serving the website and API. The included `render.yaml` defines a free Render web service plus a free PostgreSQL database in Singapore. The web service uses `npm ci` / `npm start`; Render generates the JWT secret and supplies the database connection string.

The app writes uploaded images into PostgreSQL when `DATABASE_URL` is configured, so account records and images are independent of the web service's temporary local filesystem. The website is currently launched with email OTP paused: people can create accounts and log in, while password reset is disabled until email delivery is configured again.

## Important free-plan limits

- Render Free web services sleep after 15 minutes without traffic and can take about a minute to wake.
- Render Free PostgreSQL is limited to 1 GB and expires after 30 days. The data is eventually deleted if the database is not upgraded. Migrate the database to a persistent provider before that deadline if people will rely on their accounts or complaints.
- Free services are intended for demos and hobby projects, not production uptime guarantees.

## Before production use

1. Deploy the Blueprint from the private GitHub repository on Render, selecting the Free plan only.
2. Verify `/api/health`, create a throwaway citizen account, log in, create/read a complaint, and upload a photo.
3. Before opening registration to real users, replace the expiring free database with a durable database and configure email OTP through a verified SMTP provider. Keep all secrets in Render's environment settings; never commit them.
4. Create real admin and NGO accounts separately. Production demo staff accounts are disabled, and their demo passwords are no longer shown on the login screen.
