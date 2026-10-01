# ShaliniKart E-Commerce

- Frontend: https://shalinikart.netlify.app
- Backend: https://shalini-kart.onrender.com

The backend provides the multi-tenant store, product, account, and order APIs.
MongoDB stores application data. Online payment is not configured; orders are
placed for the store to confirm and arrange payment.

## Deploy the backend on Render

- Root directory: `backend`
- Build command: `npm install`
- Start command: `npm start`

Set these environment variables in Render:

- `MONGO_URI`: MongoDB Atlas connection string
- `JWT_SECRET`: a private random signing secret
- `FRONTEND_URL`: `https://shalinikart.netlify.app`

The health endpoint is `GET /api/health`.
