# Vaadeh – Food Ordering MVP

Vaadeh is a **server-based, production-ready MVP** for a modern food ordering platform, designed to operate via **Telegram bots + web landing pages**, with a **full admin dashboard**, **event-driven logging**, and **clean UX**.

## ⚡ Quickstart (Phase 0 baseline)

1. Install dependencies: `npm install`
2. Copy environment template: `cp .env.example .env` and fill in secrets.
3. Start the dev server: `npm run start:dev` (NestJS + TypeScript strict mode).
4. Optional: run with Docker + PostgreSQL: `docker compose up --build`.

Key tooling already wired:
- NestJS with strict TypeScript
- ESLint + Prettier
- Prisma (PostgreSQL), BullMQ-ready, Telegram bot SDK, Winston logger

This project is intentionally built to be:
- Lean (MVP-first)
- Config-driven (no hardcoded vendors or prices)
- Deploy-once, operate-from-admin
- Fully observable (logs & insights)

---

## 🔐 Environment

The API refuses to boot if critical configuration is missing. Populate the following variables (see `.env.example`):

- `DATABASE_URL` – PostgreSQL connection string
- `JWT_SECRET` – symmetric signing key for access/refresh tokens
- `REDIS_URL` – Redis connection for OTPs and queues
- `TELEGRAM_CUSTOMER_BOT_TOKEN` / `TELEGRAM_VENDOR_BOT_TOKEN`
- `ZIBAL_MERCHANT`, `ZIBAL_CALLBACK_URL` – payment gateway credentials
- `MELIPAYAMAK_USERNAME`, `MELIPAYAMAK_PASSWORD`, `MELIPAYAMAK_FROM` – SMS provider
- Delivery knobs: `INTERNAL_DELIVERY_FEE`, `SNAPP_COD_MAX_KM`

Keep `.env` out of version control; set the same values in your deployment platform.

---

## 🚀 Core Features

### Customer Experience
- Order via **Telegram Bot (button-based, no commands)**
- Web landing pages for discovery & checkout
- Address management
- Order tracking & history
- Support for **out-of-range delivery via Snapp (pay-on-delivery)**

### Vendor Experience
- Telegram Vendor Bot
- Receive & manage orders
- Accept / Reject / Ready / Delivered flows
- Real-time notifications

### Admin Capabilities
- Full **Admin Dashboard**
- Vendor CRUD (add, edit, activate, deactivate)
- Menu & pricing management
- Manual order editing & overrides
- User & address visibility
- Event & notification logs
- Audit trail for all admin actions

### Observability & Analytics
- Event-driven logging (not just server logs)
- Funnel-ready event taxonomy
- Foundation for dashboards & insights

---

## 🧱 Tech Stack

### Backend
- **Node.js + TypeScript**
- **NestJS**
- **PostgreSQL**
- **Prisma ORM**

### Bots & Notifications
- Telegram Bot API
- SMS Provider (pluggable)

### Admin
- **AdminJS** (MVP phase)

### Infrastructure
- Docker & Docker Compose
- Single-server deployment (Germany VPS)

---

## 📁 Project Structure

src/
├─ modules/
│ ├─ users/
│ ├─ vendors/
│ ├─ menu/
│ ├─ orders/
│ ├─ delivery/
│ ├─ notifications/
│ └─ events/
│
├─ bots/
│ ├─ telegram-customer.bot.ts
│ └─ telegram-vendor.bot.ts
│
├─ admin/
│ └─ admin.module.ts
│
├─ db/
│ ├─ prisma/
│ └─ seed.ts
│
├─ common/
│ ├─ guards/
│ ├─ decorators/
│ └─ utils/
│
└─ main.ts

---

## 🗃️ Database Models (MVP)

- User
- Address
- Vendor
- MenuItem
- Order
- OrderItem
- EventLog

PostgreSQL is used as the **single source of truth**, with JSONB used **only for event metadata**.

---

## 🔄 Order Lifecycle

PENDING
→ ACCEPTED
→ DELIVERY (INTERNAL | SNAPP)
→ COMPLETED

REJECTED (terminal)

Invalid state transitions are blocked at service level.

---

## 📊 Event Logging

All meaningful actions generate structured events:

Examples:
- USER_ENTERED
- LOCATION_SET
- ORDER_CREATED
- ORDER_ACCEPTED / REJECTED
- DELIVERY_STARTED
- ORDER_COMPLETED
- NOTIFICATION_SENT
- ADMIN_EDIT_ACTION

Events are stored in the `EventLog` table and power future dashboards.

---

## 🤖 Telegram UX Principles

- **No slash commands** (except `/start`)
- Button-based navigation
- Emoji-enhanced, brand-aligned labels
- App-like experience inside Telegram

Main menu example:
- 🍽 New Order
- 📦 My Orders
- 📍 Addresses
- 💬 Support

---

## 🖥️ Web UX Principles

- Static HTML pages (fast & simple)
- Subtle, meaningful animations
- No heavy JS frameworks for landing pages
- Animations used only for:
  - State changes
  - Feedback
  - Brand feel

---

## ⚙️ Environment Variables

All configuration is done via `.env`:

```env
DATABASE_URL=postgresql://...
TELEGRAM_CUSTOMER_BOT_TOKEN=
TELEGRAM_VENDOR_BOT_TOKEN=
SMS_PROVIDER_KEY=
ADMIN_EMAIL=
ADMIN_PASSWORD=
⚠️ No secrets are hardcoded.

🐳 Running the Project (Local / Server)
1. Clone the repository

git clone <repo-url>
cd vaadeh
2. Configure environment

cp .env.example .env
# fill values
3. Start services

docker compose up -d
4. Run migrations & seed

docker exec api npx prisma migrate deploy
docker exec api npx prisma db seed
✅ MVP Definition of Done
Project deploys with one command

Admin can add vendors & menus

Telegram customer can place orders

Vendor receives & processes orders

Admin can edit orders manually

Events are logged and viewable

No code change needed for daily operations

🛡️ Backups & Logs
- Structured JSON logs rotate daily with retention configured via `LOG_RETENTION_DAYS` (defaults to 60d) and include request IDs for tracing.
- Run `deploy/backup/pg-backup.sh` with `DATABASE_URL` to generate daily Postgres dumps; tune `BACKUP_DIR` and `BACKUP_RETENTION_DAYS` for retention.

🧭 Roadmap (Post-MVP)
Custom Admin UI (Next.js)

Analytics dashboards

Vendor performance scoring

Payment gateway integration

Multi-city support

🧠 Philosophy
This project favors:

Clarity over cleverness

Control over abstraction

Observability over assumptions

It is designed to grow, without over-engineering day one.

📄 License
Private / Internal MVP


---
