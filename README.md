# saikart E-Commerce

- Frontend: https://saikart.netlify.app
- Backend: https://ecommerce-6-w8zx.onrender.com/api

The backend provides the multi-tenant store, product, account, and order APIs.
MySQL stores application data. Online payment is not configured; orders are
placed for the store to confirm and arrange payment.

## Deploy the backend on Render

- Root directory: `backend`
- Build command: `npm install`
- Start command: `npm start`

Create a MySQL database with a database provider, then set these environment
variables in Render:

- `MYSQL_URL`: MySQL connection URL from the database provider
- `JWT_SECRET`: a private random signing secret
- `FRONTEND_URL`: `https://saikart.netlify.app/`
- `MYSQL_SSL`: set to `true` if the provider requires TLS

The backend creates its tables on startup. The health endpoint is
`GET /api/health`.
