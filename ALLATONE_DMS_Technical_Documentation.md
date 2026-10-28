# Allatone DMS - Technical Documentation

## 1. Overview

Allatone DMS is a database management system built to centralize database administration, monitoring, backup, restore, and audit operations across multiple database platforms. The application is designed to help developers and database administrators work with MySQL, PostgreSQL, and MongoDB through a single web-based control plane.

The system provides:
- Unified database connection management
- SQL and NoSQL query execution
- User and role administration
- Backup and restore workflows
- Monitoring and alerting
- Compliance and audit tracking
- Secure authentication and authorization

---

## 2. Objectives

The core goals of the platform are:
- Reduce the need to switch between multiple database tools
- Centralize database security and access control
- Improve operational visibility through monitoring and logs
- Provide safe backup and restore workflows
- Support compliance and audit requirements
- Provide a modern web-based dashboard for administration

---

## 3. System Architecture

### 3.1 High-Level Architecture

The application has a three-layer architecture:

1. Frontend Layer
   - React.js application
   - Provides dashboards, forms, query editors, monitoring panels, and navigation
   - Communicates with the backend through REST APIs and Socket.IO

2. Backend Layer
   - Node.js + Express application
   - Handles authentication, authorization, database connection management, API orchestration, and background services
   - Uses Socket.IO for realtime monitoring and notifications

3. Data Layer
   - MongoDB for application metadata and audit storage
   - MySQL, PostgreSQL, and MongoDB for runtime target database connections

### 3.2 Component View

```text
Client Browser
   |
   v
React Frontend
   |
   | REST API + WebSocket
   v
Node.js / Express Backend
   |
   +--> MongoDB (app metadata, logs, users, sessions)
   +--> MySQL / PostgreSQL / MongoDB (connected target databases)
   +--> Background monitoring services
   +--> Socket.IO realtime events
```

---

## 4. Technology Stack

### 4.1 Frontend
- React 19
- Vite
- React Router
- Tailwind CSS
- Socket.IO Client
- Axios
- Recharts
- html2pdf.js

### 4.2 Backend
- Node.js
- Express.js
- MongoDB + Mongoose
- PostgreSQL driver: pg
- MySQL driver: mysql2
- MongoDB driver: mongodb
- Socket.IO
- JWT for authentication
- Helmet for security headers
- Express Rate Limit
- Multer for file uploads
- Nodemailer for email notifications

### 4.3 Infrastructure
- Docker Compose
- NGINX for frontend serving and proxying
- MongoDB for metadata and audit records

---

## 5. Project Structure

```text
dbmanager/
├── backend/
│   ├── config/
│   ├── connections/
│   ├── controllers/
│   ├── middlewares/
│   ├── models/
│   ├── routes/
│   ├── services/
│   ├── sockets/
│   ├── uploads/
│   ├── utils/
│   ├── server.js
│   ├── package.json
│   └── .env
├── frontend/
│   ├── public/
│   ├── src/
│   ├── package.json
│   ├── vite.config.js
│   ├── nginx.conf
│   └── index.html
├── docker-compose.yml
├── README.md
└── ALLATONE_DMS_Technical_Documentation.md
```

---

## 6. Core Functional Modules

### 6.1 Authentication and Authorization
The backend exposes authentication flows for:
- Login
- Signup
- OTP-based verification
- Password reset and forgot-password flows

Auth is handled through JWT tokens and protected routes. Middleware validates session state and permission scopes before exposing database actions.

### 6.2 Connection Management
This module allows users to:
- Add database connections
- Test connectivity
- Save host, port, username, and credentials
- Manage multiple servers from one interface
- Select database schemas and collection structures dynamically

Connection metadata is stored in MongoDB, while runtime access is handled using database-specific drivers.

### 6.3 Query Execution
The app supports:
- SQL query execution for MySQL and PostgreSQL
- NoSQL query access for MongoDB
- Query result rendering
- Query history tracking
- Saved query management
- Execution speed metrics

The system stores query history for auditing and review.

### 6.4 User and Role Management
The platform includes user administration for:
- Creating and updating users
- Role assignment
- Privilege management
- Password reset and credential updates
- Built-in access enforcement for database roles

This ensures least-privilege access across connected database targets.

### 6.5 Backup and Restore
The system includes backup workflows for:
- Full database dumps
- Selective table or schema exports
- JSON export for document collections
- Upload and restore of SQL files
- Transaction-safe restore execution

The restore layer validates SQL content and rolls back changes when a statement fails.

### 6.6 Monitoring and Alerts
The monitoring service tracks:
- Database health
- Table count and size
- Connection health
- Slow-running queries
- Threshold-based alert conditions

Alerts can be sent via:
- Email
- Slack webhooks
- In-app notifications

### 6.7 Audit Logging and Compliance
The app records:
- Login attempts
- Query activity
- User actions
- Data exports
- Backups and restores
- Connection changes and permission updates

This creates a structured audit log useful for governance and compliance review.

---

## 7. API Structure

The backend exposes multiple route groups under the `/api` namespace.

### 7.1 Authentication Routes
- `/api/auth/signup`
- `/api/auth/login`
- `/api/auth/verify-otp`
- `/api/auth/resend-otp`
- `/api/auth/forgot-password`
- `/api/auth/reset-password`

### 7.2 Connection Routes
- `/api/connections`
- `/api/connections/test`
- `/api/connections/:id`
- `/api/connections/:id/query`
- `/api/connections/:id/stats`
- `/api/connections/:id/binlog/*`

### 7.3 Database Routes
- `/api/db/mysql/*`
- `/api/db/mongo/*`

### 7.4 History and Monitoring
- `/api/history`
- `/api/slow-queries`
- `/api/monitor`
- `/api/audit-logs`

### 7.5 User and Permissions
- `/api/users`
- `/api/saved-queries`
- `/api/user-tabs`

---

## 8. Backend Design

### 8.1 Express Server Setup
The main server file initializes:
- Express app
- CORS configuration
- Helmet security headers
- JSON parsing and cookie parsing
- Rate limit middleware
- Socket.IO server
- MongoDB connection
- Route registration
- Background services

### 8.2 Background Services
The backend starts two important background workers:
- Binlog poller service
- Health monitoring service

These services help in:
- Tracking change events from database logs
- Monitoring DB health and operational status
- Emitting live updates to the frontend

### 8.3 Socket.IO Integration
Socket.IO is used for real-time data updates, especially for:
- Binlog monitoring
- Alert streaming
- Database health updates
- Live operational notifications

---

## 9. Frontend Design

### 9.1 Routing
The frontend uses React Router to manage pages such as:
- Dashboard
- Query Editor
- History
- Backup
- User Management
- Connection Dashboard
- Monitoring
- Help Docs
- System Status

### 9.2 State and Authentication
The app uses a custom AuthContext to manage:
- Logged-in user state
- Session state
- Login/logout flow
- Route protection

### 9.3 UI Layout
The main app layout provides:
- Navigation bar
- Sidebars for connections and modules
- Dashboard widgets
- Data tables and panels
- Modal and form-based controls

---

## 10. Security Model

The application emphasizes a secure operational model:

- JWT-based authentication
- Protected routes and role checks
- CORS restrictions for trusted origins
- Helmet security headers
- Rate limit enforcement
- Privilege-based access control
- Audit logs for sensitive actions
- Transaction-based restore protection
- Read-only query validation for restricted user roles

### Security Considerations
- Credentials should never be exposed in frontend code
- Production secrets must be kept in environment variables
- MongoDB and database credentials should be centralized and managed securely
- Database access should follow least-privilege principles

---

## 11. Data Storage Model

### 11.1 MongoDB (Application Metadata)
MongoDB stores app-level records like:
- Users
- Audit logs
- Query history
- Saved queries
- Monitoring snapshots
- User tab sessions
- Alerts
- Connection metadata

### 11.2 Target Database Connections
Application users can connect to external databases by configuring:
- Database type
- Host
- Port
- Username
- Password
- Optional schema or database selection

These connections are used at runtime for administrative operations and queries.

---

## 12. Deployment Setup

### 12.1 Local Development
Frontend:
```bash
cd frontend
npm install
npm run dev
```

Backend:
```bash
cd backend
npm install
npm run dev
```

### 12.2 Docker Compose Deployment
The project includes a Docker Compose file for running the system in containerized form:

```bash
docker-compose up -d
```

This deploys:
- Backend container on port 5001
- Frontend container on port 80
- Shared Docker network for inter-service communication

### 12.3 NGINX Setup
The frontend uses NGINX configuration for:
- Serving the React app
- Proxying `/api/*` requests to the backend
- Supporting SPA routing using `try_files`

---

## 13. Environment Configuration

The backend relies on environment variables such as:

```env
PORT=5001
MONGODB_URI=mongodb://127.0.0.1:27017/dbmanager
CLIENT_URL=http://localhost:5173
JWT_SECRET=your_secret_here
```

Additional environment settings may be required for:
- Email notifications
- Slack webhooks
- Database credentials
- SMTP configuration

---

## 14. Features Summary

### Core Features
- Multi-database management
- Connection testing and registration
- SQL and NoSQL query execution
- User role management
- Backup and restore
- Performance monitoring
- Alerts notifications
- Audit logs and compliance reporting
- Saved queries and history tracking

### Business Value
- Faster database operations
- Better security and compliance
- Reduced operational risk
- Lower need for manual tool switching
- Improved admin visibility and control

---

## 15. Limitations and Considerations

The current system is highly functional but should continue to improve in areas such as:
- Automated deployment pipelines
- Unit and integration testing coverage
- More advanced RBAC policies
- Role-based UI customization
- Better centralized secrets management
- More robust backup validation and retention policies

---

## 16. Troubleshooting

### Common Issues

1. MongoDB connection failure
   - Check `MONGODB_URI`
   - Verify service is running
   - Validate port and host accessibility

2. Frontend cannot reach backend
   - Confirm CORS origins
   - Verify backend port is correct
   - Check NGINX reverse proxy config

3. Database connection test fails
   - Validate credentials
   - Check database host and port
   - Ensure network access is allowed

4. Slow monitoring or alerts
   - Check background polling settings
   - Inspect service logs for connection errors
   - Validate database permissions

---

## 17. Future Enhancements

Suggested upgrades include:
- Centralized configuration management
- Better audit dashboard visualizations
- Report generation module
- Advanced RBAC and policy engine
- Kubernetes deployment support
- CI/CD pipeline configuration
- Automated database health scoring

---

## 18. Conclusion

Allatone DMS is a comprehensive database management platform designed to streamline administration, monitoring, audit, and backup functions across multiple database technologies. It combines a modern React frontend with a secure Node.js backend to provide a centralized environment for database operations.

The system is especially useful for organizations that need to manage multiple databases while maintaining security, compliance, and operational efficiency.

---

## 19. Appendix: Quick Start Checklist

- Install dependencies for backend and frontend
- Set environment variables
- Start MongoDB and target databases
- Run backend
- Run frontend
- Add database connections
- Test connectivity
- Create users and access roles
- Execute sample queries
- Validate backups and restore flow
- Review audit logs and alerts

---

This document provides a technical foundation for project understanding, local setup, architecture review, and operational maintenance of Allatone DMS.
