# SmartCivic deployment

SmartCivic is one Node/Express service serving the website and API. The included `render.yaml` defines a free Render web service plus a free PostgreSQL database in Singapore. The web service uses `npm ci` / `npm start`; Render generates the JWT secret and supplies the database connection string.

The app writes uploaded images into PostgreSQL when `DATABASE_URL` is configured, so account records and images are independent of the web service's temporary local filesystem. Citizen email verification is required whenever an email provider is configured; until one is configured, the registration page clearly reports that verification is unavailable and keeps the existing no-OTP signup behavior.

## Enable email OTP on Render Free

Render Free blocks outbound SMTP ports, so use the Resend HTTPS API rather than SMTP:

1. Create a Resend account, add and verify a domain you control, and create an API key.
2. In the Render web service's Environment settings, add `RESEND_API_KEY` (secret) and `EMAIL_FROM` (for example, `SmartCivic <no-reply@your-verified-domain.example>`).
3. Save the settings and wait for Render to redeploy. The registration form checks `/api/health`; when `emailConfigured` is true it shows the send/verify code steps, and the backend rejects registration until that same email has been verified.
4. Send a test registration to an inbox you control and verify the code. Never put the API key in GitHub or share it in chat.

Resend requires a verified sending domain and an API key for Node.js sending. See [Resend's Node.js guide](https://resend.com/docs/send-with-nodejs). SMTP variables remain available for deployments on providers that allow SMTP egress; Render Free does not allow outbound SMTP ports 25, 465, or 587.

## Important free-plan limits

- Render Free web services sleep after 15 minutes without traffic and can take about a minute to wake.
- Render Free PostgreSQL is limited to 1 GB and expires after 30 days. The data is eventually deleted if the database is not upgraded. Migrate the database to a persistent provider before that deadline if people will rely on their accounts or complaints.
- Free services are intended for demos and hobby projects, not production uptime guarantees.

## Before production use

1. Deploy the Blueprint from the public GitHub repository on Render, selecting the Free plan only.
2. Verify `/api/health`, create a throwaway citizen account, log in, create/read a complaint, and upload a photo.
3. Before opening registration to real users, replace the expiring free database with a durable database and enable email OTP using a verified sender domain. Keep all secrets in Render's environment settings; never commit them.
4. Create real admin and NGO accounts separately. Production demo staff accounts are disabled, and their demo passwords are no longer shown on the login screen.
