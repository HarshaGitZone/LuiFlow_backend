# LuiFlow - Personal Finance Tracker

LuiFlow is a full-stack personal finance web app for tracking transactions, budgeting, debt repayment, salary planning, analytics, and stock portfolio performance.

---

## Table of Contents
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Environment Variables](#environment-variables)
- [Local Setup](#local-setup)
- [Run Commands](#run-commands)
- [API Overview](#api-overview)
- [Data Models](#data-models)
- [Deployment](#deployment)
- [Security](#security)
- [Known Limitations](#known-limitations)

---

## Features

- User authentication (register, login, profile, password update)
- Transaction management (create, read, update, delete)
- Transaction summary and analytics
- CSV import workflow
- CSV preview before import
- CSV dry-run validation
- CSV import history tracking
- Budget planning and tracking
- Debt manager with payment tracking
- Salary planner (fixed bills, variable expenses, savings goals, subscriptions)
- Dashboard and calendar views
- Reports and analytics charts
- Stock portfolio tracking
- Stock search, quote, historical data, and company overview

---

## Tech Stack

### Frontend
- React 18
- TypeScript
- Vite
- React Router DOM
- Redux Toolkit + React Redux
- Axios
- Tailwind CSS
- Recharts
- Lucide React

### Backend
- Node.js
- Express.js
- MongoDB + Mongoose
- JWT authentication
- bcryptjs
- Joi validation
- Multer (file upload)
- csv-parser + csv-writer
- Helmet
- CORS
- express-rate-limit
- Morgan
- Dotenv

### Deployment
- Frontend: Vercel
- Backend: Render
- Database: MongoDB Atlas

---

## Architecture

- `frontend/`: React + TypeScript SPA built with Vite.
- `backend/`: Express REST API with MongoDB.
- Auth is token-based using JWT.
- Frontend sends Bearer token from local storage via Axios interceptor.
- Backend uses protected routes with auth middleware.
- CSV import is handled server-side with parsing, preview, and import-history persistence.

---

## Project Structure

```text
LuiFlow/
|- frontend/
|  |- src/
|  |  |- components/
|  |  |- pages/
|  |  |- contexts/
|  |  '- api.ts
|  |- package.json
|  |- vite.config.ts
|  '- vercel.json
|- backend/
|  |- src/
|  |  |- controllers/
|  |  |- models/
|  |  |- services/
|  |  |- routes/
|  |  |- utils/
|  |  '- data/
|  |- index.js
|  |- package.json
|  '- render.yaml
|- sample_transactions.csv
'- DEPLOYMENT_GUIDE.md
```

---

## Prerequisites

- Node.js (LTS recommended)
- npm
- MongoDB Atlas (or local MongoDB)
- Vercel account (frontend deployment)
- Render account (backend deployment)

---

## Environment Variables

### Backend (`backend/.env`)
```env
PORT=10000
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>/<db-name>
JWT_SECRET=your_super_secret_jwt_key
FRONTEND_URL=http://localhost:5173
NODE_ENV=development
ENABLE_HTTP_LOGS=true
ALPHA_VANTAGE_API_KEY=your_alpha_vantage_api_key
```

### Frontend (`frontend/.env`)
```env
VITE_API_URL=http://localhost:10000
```

---

## Local Setup

1. Clone the repository.
2. Install backend dependencies.
3. Install frontend dependencies.
4. Create `.env` files for backend and frontend.
5. Start backend server.
6. Start frontend dev server.

```bash
cd backend
npm install

cd ../frontend
npm install
```

---

## Run Commands

### Backend
```bash
cd backend
npm run dev
```

or

```bash
cd backend
npm start
```

### Frontend
```bash
cd frontend
npm run dev
```

### Frontend Production Build
```bash
cd frontend
npm run build
npm run preview
```

---

## API Overview

### Auth
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/profile`
- `PUT /api/auth/profile`
- `PUT /api/auth/update-password`

### Transactions
- `GET /api/transactions`
- `POST /api/transactions`
- `PUT /api/transactions/:id`
- `DELETE /api/transactions/:id`
- `GET /api/transactions/summary`

### CSV
- `POST /api/csv/preview`
- `POST /api/csv/import`
- `POST /api/csv/dry-run`
- `GET /api/csv/history`

### Budgets
- `GET /api/budgets`
- `POST /api/budgets`
- `PUT /api/budgets/:id`
- `DELETE /api/budgets/:id`

### Analytics
- `GET /api/analytics`

### Salary Planner
- `GET /api/salary-planner`
- `PUT /api/salary-planner`
- `POST /api/salary-planner/fixed-bill`
- `PUT /api/salary-planner/fixed-bill`
- `DELETE /api/salary-planner/fixed-bill`
- `PUT /api/salary-planner/variable-expense`
- `POST /api/salary-planner/savings-goal`
- `PUT /api/salary-planner/savings-goal`
- `DELETE /api/salary-planner/savings-goal`
- `POST /api/salary-planner/subscription`
- `PUT /api/salary-planner/subscription`
- `DELETE /api/salary-planner/subscription`
- `GET /api/salary-planner/subscriptions`
- `PUT /api/salary-planner/cumulative-savings`
- `GET /api/salary-planner/cumulative-savings`

### Debts
- `POST /api/debts`
- `GET /api/debts`
- `GET /api/debts/:id`
- `PATCH /api/debts/:id`
- `PATCH /api/debts/:id/close`
- `DELETE /api/debts/:id`
- `POST /api/debts/:id/payments`
- `GET /api/debts/:id/payments`
- `PATCH /api/debts/:id/payments/:paymentId`
- `DELETE /api/debts/:id/payments/:paymentId`

### Portfolio / Stocks
- `GET /api/portfolio`
- `POST /api/portfolio`
- `PUT /api/portfolio/:id`
- `DELETE /api/portfolio/:id`
- `POST /api/portfolio/update-prices`
- `GET /api/portfolio/analytics`
- `GET /api/stocks/search`
- `GET /api/stocks/quote/:symbol`
- `GET /api/stocks/historical/:symbol`
- `GET /api/stocks/overview/:symbol`

### System
- `GET /api/health`
- `DELETE /api/clear-all-data`

---

## Data Models

- User
- Transaction
- Budget
- Debt
- DebtPayment
- SalaryPlanner
- Portfolio
- ImportHistory

---

## Deployment

### Frontend (Vercel)
- Build command: `npm run build`
- Output directory: `dist`
- SPA rewrite to `index.html` configured in `frontend/vercel.json`

### Backend (Render)
- Configured via `backend/render.yaml`
- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/api/health`

### Database
- MongoDB Atlas cluster

---

## Security

- Password hashing with bcryptjs
- JWT-based protected routes
- Helmet for secure headers
- CORS allowlist configuration
- Rate limiting on API
- Request body limits and controlled file upload size

---


