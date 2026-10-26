# Deploying FMS with GitHub Actions

Every push to `main` builds FMS and deploys it to the VPS (Ubuntu 24.04, 2 GB).

```
git push (main)
   │
   ▼
GitHub Actions: npm ci ► npm run build (into backend/Fms.Api/wwwroot) ► dotnet publish
   │  SSH as "deploy"
   ▼
VPS  /var/www/fms/releases/<time>-<commit>/api   ◄── current (symlink)
      Nginx :80/:443 ──► fms-api (Kestrel 127.0.0.1:5000) ──► MySQL 8 (localhost only)
      /var/lib/fms/uploads   claim receipts (kept across deploys)
      /var/backups/fms       daily DB + receipts backup, 02:00, 14 days
```

When the app starts, it creates the tables (schema.sql) and the first users itself.
If a new release doesn't start, the server switches back to the previous one automatically.

---

## Step 1 — Add the files to your project

Unzip and copy these into `C:\Users\SSVABMUH\Documents\GT\fms\` (next to `Fms.sln`):

```
fms\
├── .github\workflows\deploy.yml     (new)
├── .gitattributes                   (new — keeps .sh files with Linux line endings)
├── deploy\                          (new folder)
├── backend\  frontend\  database\   (your existing code, no changes needed)
└── Fms.sln
```

No code changes are required. The workflow uses your existing setup (`vite.config.ts` builds into `wwwroot`).

## Step 2 — Put the project on GitHub (private repo)

1. On github.com: **New repository** → name `fms` → **Private** → don't add a README → Create.
2. In PowerShell:

```powershell
cd C:\Users\SSVABMUH\Documents\GT\fms
git init -b main
git add .
git commit -m "Initial commit with deploy pipeline"
git remote add origin https://github.com/YOUR_USERNAME/fms.git
git push -u origin main
```

The first push starts a deploy that will **fail**, because the server and secrets aren't ready yet. That's expected.

Your `.gitignore` already excludes `bin/`, `obj/`, `node_modules/`, `wwwroot/*` and `appsettings.Production.json`.

## Step 3 — Create the deploy key (on your PC)

```powershell
cd $HOME\.ssh
ssh-keygen -t ed25519 -f fms_deploy -C "github-actions"
```

Press Enter twice (no passphrase). This creates:
- `fms_deploy` (private key) → goes into GitHub
- `fms_deploy.pub` (public key) → goes on the server

## Step 4 — Set up the server (one time, about 5 minutes)

Copy the `deploy` folder to the server:

```powershell
cd C:\Users\SSVABMUH\Documents\GT\fms
scp -r deploy root@YOUR_SERVER_IP:/root/
```

Show your public key and copy the whole line:

```powershell
type $HOME\.ssh\fms_deploy.pub
```

Log in and run the setup, pasting the key between the quotes:

```bash
ssh root@YOUR_SERVER_IP
cd /root/deploy
DEPLOY_PUBKEY="ssh-ed25519 AAAA...paste here... github-actions" bash server-setup.sh
```

If you get `$'\r': command not found`, the files picked up Windows line endings. Fix them with
`sed -i 's/\r$//' /root/deploy/*.sh` and run it again.

At the end, the script prints the **first-login passwords** for `pengurus` and `kerani`.
**Save them**, because they're only shown once. They're also stored in `/etc/fms/api.env`.

The script installs Nginx, the .NET 8 runtime, MySQL 8 (tuned for 2 GB), 2 GB swap, the firewall,
fail2ban, and the daily backup. It also generates the DB password and JWT key.

## Step 5 — Add the GitHub secrets

Get the server's host key (on your PC):

```powershell
ssh-keyscan -p 22 YOUR_SERVER_IP
```

On GitHub: **repo → Settings → Environments → New environment** → name it `production` →
**Add environment secret** for each:

| Secret | Value |
|---|---|
| `SSH_HOST` | your server IP |
| `SSH_PORT` | `22` |
| `SSH_USER` | `deploy` |
| `SSH_PRIVATE_KEY` | full contents of `fms_deploy` (`type $HOME\.ssh\fms_deploy`), including the BEGIN/END lines |
| `SSH_KNOWN_HOSTS` | the full output of `ssh-keyscan` above |

## Step 6 — Deploy

**Actions** tab → **Build and deploy FMS** → **Run workflow** (or just push to `main`).

When it turns green, open `http://YOUR_SERVER_IP/` and log in as `pengurus` with the password from
step 4. Then **change both passwords** in the app.

---

## Later: domain + HTTPS

Point the domain's A record to the server IP, then on the server:

```bash
sudo sed -i 's/server_name _;/server_name fms.yourdomain.com;/' /etc/nginx/sites-available/fms
sudo certbot --nginx -d fms.yourdomain.com --redirect -m you@email.com --agree-tos
```

## Day-to-day (on the server)

| Task | Command |
|---|---|
| App logs (live) | `journalctl -u fms-api -f` |
| Restart the app | `sudo systemctl restart fms-api` |
| Roll back one release | `sudo -u deploy bash /var/www/fms/current/deploy/rollback.sh` |
| Which commit is live | `cat /var/www/fms/current/REVISION` |
| Change settings (company name, SST rate…) | `sudo nano /etc/fms/api.env`, then restart the app |
| Run a backup now | `sudo /usr/local/bin/fms-backup.sh` |
| Open MySQL | `sudo mysql fms` |

**Restore a backup:**

```bash
gunzip -c /var/backups/fms/fms_db_YYYYMMDD_HHMMSS.sql.gz | sudo mysql fms
sudo tar -xzf /var/backups/fms/fms_uploads_YYYYMMDD_HHMMSS.tar.gz -C /var/lib/fms
sudo systemctl restart fms-api
```

**Offsite backup:** the backups sit on the same disk as the data. Set up `rclone` (Google Drive works)
and uncomment the last line in `/usr/local/bin/fms-backup.sh`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Action fails at "Configure SSH" / `Host key verification failed` | `SSH_KNOWN_HOSTS` missing or wrong; redo `ssh-keyscan` |
| `Permission denied (publickey)` | wrong `SSH_PRIVATE_KEY`, or the `.pub` wasn't passed to `server-setup.sh` |
| "App did not start" + rollback | read the logs printed in the Action. Common causes: MySQL down, wrong `ConnectionStrings__Default`, or a `Jwt__Key` shorter than 32 characters |
| `App:ManagerPassword dan App:ClerkPassword mesti diisi` | passwords missing from `/etc/fms/api.env` (only needed while the DB is empty) |
| 502 Bad Gateway | app not running: `journalctl -u fms-api -n 50` |
| Claim receipts missing after a deploy | check `App__UploadFolder=/var/lib/fms/uploads` is in the service file |

## Notes about the project

- **.NET 8 support ends on 10 Nov 2026.** After that the app still runs, but gets no security patches.
  Moving to .NET 10 is blocked on Pomelo (the MySQL provider), which has no stable EF Core 10
  release yet. Plan it as a separate task. When ready, change `net8.0` → `net10.0`, update the
  packages, set `DOTNET_VERSION: '10.0.x'` in the workflow, and install `aspnetcore-runtime-10.0` on the server.
- `README.md` sections 2 and 4 and `database/seed.sql` still describe **SQLite**, but the code uses
  **MySQL** (Pomelo). The deploy follows the code. `seed.sql` won't run on MySQL, and isn't needed,
  because `DbSeeder` creates the base data.
