# AWS Deploy Runbook (Single EC2 + RDS Postgres + Valkey + Docker)

This runbook deploys OpenSocial on one EC2 instance for now:
- API container
- Admin container
- Web container
- Docs container
- Valkey container
- Caddy reverse proxy container
- RDS PostgreSQL outside EC2

## 1) Recommended starter topology
- EC2: `t3.micro` (or free-tier equivalent in your account plan) with Ubuntu 24.04 LTS.
- RDS PostgreSQL: smallest free-tier-eligible class in your region/account.
- One security group for EC2 and one for RDS.
- One Elastic IP for EC2.

## 2) Create networking and security groups
1. Create EC2 security group `openchat-ec2-sg`:
   - inbound `22/tcp` from your IP only.
   - inbound `80/tcp` from `0.0.0.0/0`.
   - outbound all allowed.
2. Create RDS security group `openchat-rds-sg`:
   - inbound `5432/tcp` from `openchat-ec2-sg` (security-group source, not CIDR).
   - outbound all allowed.

## 3) Create RDS PostgreSQL
1. Engine: PostgreSQL.
2. Public access: `No`.
3. Attach `openchat-rds-sg`.
4. Keep credentials in a password manager.
5. After creation, connect once and enable extensions:

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;
```

If `vector` fails, confirm your RDS engine version supports `pgvector` in your region.

## 4) Launch EC2 and install Docker
1. Launch Ubuntu EC2 and attach `openchat-ec2-sg`.
2. Associate Elastic IP.
3. SSH in and install Docker + Compose plugin:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin git
sudo usermod -aG docker $USER
newgrp docker
docker --version
docker compose version
```

## 5) Deploy code to EC2
```bash
sudo mkdir -p /opt/opensocial
sudo chown -R $USER:$USER /opt/opensocial
git clone <your-repo-url> /opt/opensocial
cd /opt/opensocial
```

## 6) Configure environment
1. Copy template:

```bash
cp .env.production.example .env.production
```

2. Edit `.env.production` and set at minimum:
- `DATABASE_URL` to RDS endpoint with `sslmode=require`.
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `ADMIN_API_KEY`.
- `OPENAI_API_KEY`.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
- `GOOGLE_REDIRECT_URI` and `ADMIN_DASHBOARD_REDIRECT_URIS`.
- `NEXT_PUBLIC_API_BASE_URL`.

## 7) Set DNS records
Create A records pointing to EC2 Elastic IP:
- `api.opensocial.so`
- `admin.opensocial.so`
- `app.opensocial.so`
- `docs.opensocial.so`

Then adjust the same hostnames in:
- `deploy/caddy/Caddyfile`
- `.env.production` (`NEXT_PUBLIC_API_BASE_URL`, OAuth URLs)

## 8) Build and start containers
```bash
cd /opt/opensocial
docker compose -f docker-compose.prod.yml --env-file .env.production build
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm api pnpm --filter @opensocial/api prisma:migrate:deploy
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
docker compose -f docker-compose.prod.yml ps
```

## 9) Verify runtime
```bash
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f admin
docker compose -f docker-compose.prod.yml logs -f web
docker compose -f docker-compose.prod.yml logs -f docs
docker compose -f docker-compose.prod.yml logs -f valkey
```

Quick health checks:
- `curl https://api.opensocial.so/api/health`
- open `https://admin.opensocial.so`
- open `https://app.opensocial.so`
- open `https://docs.opensocial.so`

## 10) Update deployment
```bash
cd /opt/opensocial
git pull
docker compose -f docker-compose.prod.yml --env-file .env.production build
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm api pnpm --filter @opensocial/api prisma:migrate:deploy
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
```

## 11) Cost and scaling notes
- Keep one EC2 now to reduce cost/ops overhead.
- Split later when load grows:
  - EC2-1: API + workers
  - EC2-2: Admin + web
- Move Valkey to managed service when uptime requirements increase.

## 12) Hardening next
- Keep Caddy host routing aligned with `api.opensocial.so`, `admin.opensocial.so`, `app.opensocial.so`, and `docs.opensocial.so`.
- Restrict SSH ingress to your current IP only.
- Enable AWS backups/snapshots for RDS.
- Add CloudWatch metrics and alarms for CPU, memory, 5xx, and container restarts.
