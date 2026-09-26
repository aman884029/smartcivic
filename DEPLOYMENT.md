# SmartCivic deployment

This is one Node/Express service serving both the website and API from the same URL. Use the included Render Blueprint (`render.yaml`), or create a Node web service with build command `npm ci`, start command `npm start`, and health check `/api/health`.

The Blueprint provisions a persistent disk at `/var/data` for SQLite data and uploaded complaint photos. Keep `DATA_DIR=/var/data/data` and `UPLOAD_DIR=/var/data/uploads`. Render persistent disks require a paid service plan.

## Email configuration

Before launch, set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and `EMAIL_FROM` in Render using a real SMTP account and verified sender address. The app sends registration and password-reset codes by email and never prints OTPs to logs. OTP requests return an error until SMTP is configured. Render generates `JWT_SECRET`; other hosts need a random secret of at least 32 characters.

## Launch checklist

1. Upload this folder to a private GitHub repository.
2. Connect the repo to Render and create the service from `render.yaml`.
3. Add SMTP secrets in Render and deploy.
4. Check `/api/health`, register a test citizen, receive and verify the emailed OTP, sign in, and create/read a complaint. Also test password reset.
5. Restart the service and confirm the account and an uploaded photo remain available.

The supplied demo database and demo records are intentionally omitted. A new database is initialized on startup. For security, configure production admin and NGO users separately before using staff-only features.

