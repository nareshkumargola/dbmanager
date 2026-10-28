const pptxgen = require('pptxgenjs');

const pptx = new pptxgen();
pptx.layout = 'LAYOUT_WIDE';
pptx.author = 'Allatone DMS';
pptx.subject = 'Database Management System';
pptx.title = 'Allatone DMS - Product and Technical Presentation';
pptx.company = 'Allatone';
pptx.lang = 'en-US';
pptx.theme = { headFontFace: 'Aptos Display', bodyFontFace: 'Aptos', lang: 'en-US' };
pptx.defineSlideMaster({ title: 'MASTER', background: { color: 'F6F8FA' }, objects: [
  { rect: { x: 0, y: 0, w: 13.333, h: 0.16, fill: { color: '0B172A' }, line: { color: '0B172A' } } },
  { line: { x: 0.55, y: 7.08, w: 12.23, h: 0, line: { color: 'D8E0E8', width: 0.8 } } },
  { text: { text: 'ALLATONE DMS', options: { x: 0.55, y: 7.12, w: 2.2, h: 0.18, fontFace: 'Aptos', fontSize: 8, color: '536171', margin: 0 } } },
  { text: { text: 'Database operations, unified', options: { x: 9.7, y: 7.12, w: 2.55, h: 0.18, fontFace: 'Aptos', fontSize: 8, color: '536171', align: 'right', margin: 0 } } }
], slideNumber: { x: 12.42, y: 7.12, color: '536171', fontFace: 'Aptos', fontSize: 8 } });

const C = { navy: '0B172A', navy2: '12263F', teal: '0B7285', cyan: 'DDF3F5', orange: 'F59E0B', green: '168B62', red: 'D64545', ink: '17202A', muted: '536171', line: 'D8E0E8', white: 'FFFFFF', pale: 'F6F8FA' };

function addText(slide, text, x, y, w, h, opts = {}) {
  slide.addText(text, { x, y, w, h, margin: 0, fontFace: opts.fontFace || 'Aptos', fontSize: opts.fontSize || 16, color: opts.color || C.ink, bold: opts.bold || false, fit: 'shrink', valign: opts.valign || 'mid', align: opts.align || 'left', italic: opts.italic || false });
}

function svgData(title, subtitle, accent = C.teal, variant = 'dashboard') {
  const blocks = variant === 'query'
    ? '<rect x="36" y="116" width="470" height="118" rx="8" fill="#0B172A"/><text x="56" y="146" fill="#8CE8E2" font-size="14" font-family="Arial">SELECT * FROM customers</text><text x="56" y="173" fill="#D2E1ED" font-size="13" font-family="Arial">WHERE status = active;</text><rect x="36" y="254" width="470" height="160" rx="8" fill="#FFFFFF" stroke="#D8E0E8"/><line x1="58" y1="286" x2="482" y2="286" stroke="#D8E0E8"/><line x1="58" y1="322" x2="482" y2="322" stroke="#D8E0E8"/><line x1="58" y1="358" x2="482" y2="358" stroke="#D8E0E8"/>'
    : `<rect x="36" y="116" width="140" height="92" rx="8" fill="#DDF3F5"/><rect x="192" y="116" width="140" height="92" rx="8" fill="#FFF1D6"/><rect x="348" y="116" width="158" height="92" rx="8" fill="#E4F4EC"/><rect x="36" y="232" width="470" height="180" rx="8" fill="#FFFFFF" stroke="#D8E0E8"/><polyline points="58,374 122,328 180,344 242,280 308,314 372,266 438,292 482,252" fill="none" stroke="${accent}" stroke-width="5"/><line x1="58" y1="388" x2="482" y2="388" stroke="#D8E0E8"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="560" height="460" viewBox="0 0 560 460"><rect width="560" height="460" rx="14" fill="#F6F8FA"/><rect x="0" y="0" width="560" height="64" rx="14" fill="#0B172A"/><circle cx="30" cy="32" r="10" fill="${accent}"/><text x="54" y="31" fill="#FFFFFF" font-size="17" font-family="Arial" font-weight="700">${title}</text><text x="54" y="49" fill="#AAB9C9" font-size="10" font-family="Arial">${subtitle}</text><rect x="18" y="82" width="15" height="320" rx="7" fill="#DDE3E9"/>${blocks}<rect x="36" y="430" width="470" height="10" rx="5" fill="#D8E0E8"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

function addPlaceholder(slide, x = 7.55, y = 1.42, w = 5.18, h = 4.42, title = 'Application screen', variant = 'dashboard') {
  slide.addImage({ data: svgData(title, 'DUMMY IMAGE - replace with actual screenshot', C.teal, variant), x, y, w, h });
  addText(slide, 'Replace with actual screenshot later', x, y + h + 0.08, w, 0.18, { fontSize: 9, color: C.muted, italic: true, align: 'center' });
}

function header(slide, kicker, title, sub = '') {
  addText(slide, kicker.toUpperCase(), 0.62, 0.48, 4.8, 0.22, { fontSize: 9, color: C.teal, bold: true });
  addText(slide, title, 0.62, 0.77, 11.9, 0.52, { fontSize: 27, color: C.navy, bold: true });
  if (sub) addText(slide, sub, 0.62, 1.31, 11.6, 0.32, { fontSize: 11.5, color: C.muted });
}

function bullets(slide, items, x, y, w, fontSize = 15, gap = 0.55) {
  items.forEach((item, i) => {
    slide.addShape(pptx.ShapeType.ellipse, { x, y: y + i * gap + 0.11, w: 0.1, h: 0.1, fill: { color: i === 0 ? C.orange : C.teal }, line: { color: i === 0 ? C.orange : C.teal } });
    addText(slide, item, x + 0.22, y + i * gap, w - 0.22, gap - 0.05, { fontSize, color: C.ink, valign: 'top' });
  });
}

function card(slide, x, y, w, h, title, body, color = C.teal) {
  slide.addShape(pptx.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.06, fill: { color: C.white }, line: { color: C.line, width: 1 } });
  slide.addShape(pptx.ShapeType.rect, { x, y, w: 0.08, h, fill: { color }, line: { color } });
  addText(slide, title, x + 0.22, y + 0.18, w - 0.4, 0.28, { fontSize: 15, bold: true, color: C.navy });
  addText(slide, body, x + 0.22, y + 0.55, w - 0.4, h - 0.7, { fontSize: 11.5, color: C.muted, valign: 'top' });
}

function slideWithBullets(kicker, title, sub, items, imageTitle, variant = 'dashboard') {
  const slide = pptx.addSlide('MASTER');
  header(slide, kicker, title, sub);
  bullets(slide, items, 0.76, 1.9, 5.95, items.length > 5 ? 13.2 : 15, items.length > 5 ? 0.52 : 0.62);
  addPlaceholder(slide, 7.55, 1.55, 5.18, 4.35, imageTitle, variant);
  return slide;
}

function titleSlide() {
  const slide = pptx.addSlide();
  slide.background = { color: C.navy };
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: C.navy }, line: { color: C.navy } });
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.22, h: 7.5, fill: { color: C.orange }, line: { color: C.orange } });
  addText(slide, 'ALLATONE', 0.85, 0.82, 3.2, 0.28, { fontSize: 15, color: '8CE8E2', bold: true });
  addText(slide, 'Database Management\nSystem', 0.82, 1.62, 6.4, 1.35, { fontSize: 31, color: C.white, bold: true, valign: 'top' });
  addText(slide, 'Product, architecture and operations presentation', 0.86, 3.25, 5.9, 0.4, { fontSize: 16, color: 'C3D1DE' });
  addText(slide, 'A unified control plane for MySQL, PostgreSQL and MongoDB', 0.86, 3.82, 5.9, 0.34, { fontSize: 12, color: '8FA4B8' });
  slide.addImage({ data: svgData('DMS overview', 'DUMMY IMAGE - replace with product screenshot', C.orange), x: 7.42, y: 1.1, w: 5.1, h: 4.18 });
  addText(slide, 'Replace with your hero screenshot', 7.42, 5.46, 5.1, 0.22, { fontSize: 9, color: '8FA4B8', italic: true, align: 'center' });
  addText(slide, 'Technical walkthrough | 2026', 0.86, 6.65, 3.4, 0.25, { fontSize: 10, color: '8FA4B8' });
}

function agendaSlide() {
  const slide = pptx.addSlide('MASTER');
  header(slide, '01 / Orientation', 'What this presentation covers', 'A 45-slide story from business need to deployment and future roadmap.');
  const rows = [['01', 'Context and value', 'Why a unified database control plane matters'], ['02', 'Product experience', 'Core screens, workflows and user journeys'], ['03', 'Technical foundation', 'Architecture, APIs, storage and realtime services'], ['04', 'Trust and operations', 'Security, backups, monitoring, audit and deployment'], ['05', 'Delivery roadmap', 'Limitations, enhancements and implementation checklist']];
  rows.forEach((r, i) => { const y = 1.88 + i * 0.85; addText(slide, r[0], 0.78, y, 0.55, 0.3, { fontSize: 15, color: C.orange, bold: true }); addText(slide, r[1], 1.45, y, 3.1, 0.3, { fontSize: 16, color: C.navy, bold: true }); addText(slide, r[2], 4.7, y, 5.9, 0.3, { fontSize: 13, color: C.muted }); slide.addShape(pptx.ShapeType.line, { x: 1.45, y: y + 0.47, w: 9.3, h: 0, line: { color: C.line, width: 1 } }); });
  addPlaceholder(slide, 10.5, 1.88, 2.2, 3.72, 'Deck map');
}

titleSlide();
agendaSlide();
slideWithBullets('02 / Context', 'The database operations problem', 'Teams often manage too many database tools, credentials and operational workflows.', ['Multiple database engines require different tools and habits.', 'Operational work is spread across query clients, scripts, dashboards and email.', 'Access control and evidence collection become inconsistent at scale.', 'A single control plane can reduce context switching and operational risk.'], 'Problem landscape');
slideWithBullets('02 / Context', 'The DMS answer', 'Allatone DMS brings administration, monitoring, backup and audit into one web application.', ['One place to register and test connections.', 'One workspace for SQL and NoSQL operations.', 'One security model for users, permissions and protected routes.', 'One operational timeline for health, slow queries, alerts and audit events.'], 'Unified control plane');
slideWithBullets('02 / Context', 'Business outcomes', 'The platform is designed for speed, control and evidence.', ['Faster database operations through reusable connections and saved queries.', 'Lower operational risk with permission checks and restore safeguards.', 'Better visibility through health metrics, slow-query panels and live updates.', 'Stronger compliance posture with structured audit records and exportable evidence.'], 'Business outcomes');

let s = pptx.addSlide('MASTER');
header(s, '03 / Product map', 'Allatone DMS at a glance', 'The product is organized around five operating loops.');
card(s, 0.75, 1.9, 2.25, 1.35, 'Connect', 'Register MySQL, PostgreSQL and MongoDB targets; test and select schemas.', C.teal);
card(s, 3.15, 1.9, 2.25, 1.35, 'Operate', 'Run queries, inspect objects, manage users and work with tabs.', C.orange);
card(s, 5.55, 1.9, 2.25, 1.35, 'Protect', 'Use roles, read-only validation, backups and restore controls.', C.green);
card(s, 7.95, 1.9, 2.25, 1.35, 'Observe', 'Track health, slow queries, binlog events and alerts.', C.red);
card(s, 10.35, 1.9, 2.25, 1.35, 'Prove', 'Review query history, audit logs and operational evidence.', C.navy2);
addPlaceholder(s, 2.55, 3.75, 8.25, 2.2, 'Product map');

slideWithBullets('03 / Product map', 'Primary user personas', 'The same platform serves different responsibilities without losing control.', ['Database administrator: connections, health, backups, users and recovery.', 'Developer: query editor, schema browsing, saved queries and history.', 'Operations lead: alerts, slow queries, monitoring snapshots and status.', 'Auditor or manager: evidence, permissions, action history and reports.'], 'Personas');
slideWithBullets('03 / Product map', 'Typical end-to-end journey', 'A common workflow from access to evidence.', ['Authenticate and verify the user session.', 'Select an approved database connection and schema.', 'Inspect the target, run a query or perform an admin action.', 'Observe the result and operational impact.', 'Review history or audit evidence and close the task.'], 'User journey');

slideWithBullets('04 / Experience', 'Authentication and onboarding', 'The first gate is a protected identity and session flow.', ['Signup and login flows are exposed through dedicated auth routes.', 'OTP verification supports account verification and recovery scenarios.', 'Forgot-password and reset-password flows complete the lifecycle.', 'JWT tokens and protected routes keep database actions behind authentication.'], 'Login and OTP');
slideWithBullets('04 / Experience', 'Dashboard experience', 'The dashboard gives the user an operational starting point.', ['Quick visibility into registered connections and their current status.', 'Navigation to query, history, monitoring, backup and user workflows.', 'Widgets and panels keep repeated actions close to the working context.', 'The UI can surface alerts and health changes without leaving the workspace.'], 'Dashboard');
slideWithBullets('04 / Experience', 'Connection management', 'Connections are the foundation for every database operation.', ['Add a target with type, host, port, username and credential metadata.', 'Test connectivity before saving or using a connection.', 'Manage multiple database servers from one interface.', 'Select schemas, databases or collections dynamically at runtime.'], 'Connections');
slideWithBullets('04 / Experience', 'Database selector and schema context', 'Users operate in an explicit target context instead of guessing.', ['Choose a connection before opening database-specific features.', 'Select a schema or database where the backend supports it.', 'Expose only allowed connections based on the current user permissions.', 'Keep the selected context available across related pages and tabs.'], 'Schema selector');
slideWithBullets('04 / Experience', 'Query editor: SQL workflow', 'The editor supports operational queries against MySQL and PostgreSQL.', ['Write and execute SQL against a selected connection and schema.', 'Render result rows in a readable table for inspection.', 'Capture execution speed and query metadata for later review.', 'Use saved queries and history to reduce repeat work.'], 'SQL query editor', 'query');
slideWithBullets('04 / Experience', 'Query editor: NoSQL workflow', 'MongoDB operations fit the same control-plane experience.', ['Select a MongoDB connection and collection context.', 'Run supported NoSQL access patterns through the backend.', 'Render document-oriented results for inspection and export.', 'Apply the same authentication, permission and audit expectations.'], 'MongoDB collection', 'query');
slideWithBullets('04 / Experience', 'Query history and saved queries', 'Repeated work becomes discoverable and safer to reuse.', ['History records query activity for review and operational context.', 'Saved queries preserve known-good commands for recurring tasks.', 'Execution speed helps identify regressions and slow operations.', 'History can support audits, incident review and team handoffs.'], 'History and saved queries');
slideWithBullets('04 / Experience', 'User and role management', 'Access administration is built into the product rather than handled elsewhere.', ['Create and update application users.', 'Assign roles and fine-grained permission flags.', 'Control access to connections, backup, monitoring and user administration.', 'Support database-specific user panels for MySQL, PostgreSQL and MongoDB.'], 'User management');
slideWithBullets('04 / Experience', 'Backup and restore experience', 'Recovery workflows are designed to be explicit, visible and controlled.', ['Create full database dumps or selective table and schema exports.', 'Support JSON export for document collections.', 'Upload SQL files for restore and validate content before execution.', 'Protect restore execution with transaction-aware rollback behavior.'], 'Backup and restore');
slideWithBullets('04 / Experience', 'Monitoring and alert experience', 'Monitoring turns database signals into operational decisions.', ['Track database health, table count, size and connection health.', 'Surface slow-running queries and threshold-based conditions.', 'Stream important changes through in-app notifications.', 'Support email and Slack webhook notification paths.'], 'Monitoring and alerts');
slideWithBullets('04 / Experience', 'Audit and compliance experience', 'Every sensitive operation should leave an understandable trail.', ['Record login attempts, query activity and user actions.', 'Track exports, backups, restores, connection changes and permission updates.', 'Filter audit records by user, action, query type, connection and date.', 'Use structured evidence for governance, incident review and compliance.'], 'Audit logs');

s = pptx.addSlide('MASTER');
header(s, '05 / Architecture', 'System architecture', 'Three layers coordinate the browser, orchestration API and target databases.');
const arch = [['Client browser', 'React UI, forms, tables, charts and route protection', 0.9, C.orange], ['Frontend layer', 'Vite + React + REST client + Socket.IO client', 3.7, C.teal], ['Backend layer', 'Node.js + Express + auth + controllers + services', 6.5, C.green], ['Data and targets', 'MongoDB metadata plus MySQL, PostgreSQL and MongoDB targets', 9.3, C.navy2]];
arch.forEach((a, i) => { card(s, a[2], 2.1, 2.3, 1.42, a[0], a[1], a[3]); if (i < arch.length - 1) addText(s, '→', a[2] + 2.38, 2.55, 0.35, 0.35, { fontSize: 25, color: C.orange, bold: true, align: 'center' }); });
addText(s, 'REST API + WebSocket events', 4.55, 4.12, 4.1, 0.3, { fontSize: 13, color: C.teal, bold: true, align: 'center' });
addPlaceholder(s, 3.7, 4.55, 5.85, 1.55, 'Architecture view');

slideWithBullets('05 / Architecture', 'Frontend technology stack', 'The frontend is a modern React application with focused data and routing utilities.', ['React 19 and Vite provide the application runtime and build pipeline.', 'React Router manages pages such as dashboard, query, history and monitoring.', 'Tailwind CSS supports consistent layout and responsive UI construction.', 'Axios, Socket.IO client, Recharts and html2pdf.js support data workflows.'], 'Frontend stack');
slideWithBullets('05 / Architecture', 'Backend technology stack', 'The backend centralizes API orchestration and operational controls.', ['Node.js and Express expose route groups under the /api namespace.', 'Mongoose stores application metadata and operational records in MongoDB.', 'mysql2, pg and mongodb drivers connect to target database engines.', 'Socket.IO, Nodemailer, Multer, Helmet and rate limiting support operations and security.'], 'Backend stack');
slideWithBullets('05 / Architecture', 'API surface', 'Route groups map cleanly to product capabilities.', ['/api/auth for signup, login, OTP and password lifecycle.', '/api/connections for target registration, tests, queries, stats and binlog.', '/api/db/mysql and /api/db/mongo for database-specific operations.', '/api/history, /api/slow-queries, /api/monitor and /api/audit-logs for visibility.', '/api/users, /api/saved-queries and /api/user-tabs for administration and workspace state.'], 'API routes', 'query');
slideWithBullets('05 / Architecture', 'Application data model', 'MongoDB stores DMS metadata while target systems remain operational data sources.', ['Users and permissions describe who can do what.', 'Connection metadata describes where runtime operations happen.', 'Query history and saved queries capture reusable work.', 'Audit logs, monitoring snapshots, alerts and sessions support governance and continuity.'], 'Data model');
slideWithBullets('05 / Architecture', 'Realtime communication', 'Socket.IO shortens the distance between an event and the operator seeing it.', ['Binlog monitoring can stream change events to a connection room.', 'Health updates can reach the frontend without manual page refreshes.', 'Alert streaming keeps operational conditions visible in context.', 'Socket lifecycle should be tied to the selected connection and page state.'], 'Realtime events');
slideWithBullets('05 / Architecture', 'Background services', 'Two workers extend the request-response API with continuous observation.', ['Binlog poller service tracks change events from database logs.', 'Health monitoring service captures database operational status.', 'Services emit updates to connected frontend clients through Socket.IO.', 'Polling and service logs are important troubleshooting signals.'], 'Background services');

slideWithBullets('06 / Security', 'Security model', 'Security is layered across identity, transport, permissions and evidence.', ['JWT-based authentication protects application sessions.', 'Protected routes and role checks gate sensitive pages and APIs.', 'CORS restrictions limit trusted browser origins.', 'Helmet adds security headers and rate limits reduce abuse risk.', 'Audit logging makes sensitive actions reviewable after the fact.'], 'Security layers');
slideWithBullets('06 / Security', 'Least-privilege access', 'Permissions should follow the responsibility of the person and the scope of the target.', ['Separate application roles from database-specific capabilities.', 'Allow connection-level access rather than exposing every target to every user.', 'Gate backup, monitoring and user management independently where needed.', 'Use read-only query validation for restricted roles.'], 'Permission matrix');
slideWithBullets('06 / Security', 'Safe query execution', 'The query path should balance flexibility with operational guardrails.', ['Validate restricted queries before execution.', 'Keep credentials on the backend and out of frontend code.', 'Capture query metadata for history and audit context.', 'Return errors clearly without leaking secrets or sensitive connection details.'], 'Query safeguards', 'query');
slideWithBullets('06 / Security', 'Backup and restore safeguards', 'Recovery is powerful, so the workflow must make intent and failure visible.', ['Validate uploaded SQL content before attempting execution.', 'Use transactions where the target engine and operation support them.', 'Rollback changes when a restore statement fails.', 'Retain backup and restore evidence in logs for review.'], 'Restore safeguards');

slideWithBullets('07 / Operations', 'Monitoring signals', 'The monitoring surface combines system health and database workload signals.', ['Connection health confirms whether a target is reachable.', 'Table counts and database size reveal growth and capacity patterns.', 'Slow queries identify performance hotspots and regressions.', 'Monitoring snapshots make trends easier to compare over time.'], 'Monitoring dashboard');
slideWithBullets('07 / Operations', 'Slow query workflow', 'Slow query review connects a signal to a corrective action.', ['Open live or historical slow-query views.', 'Filter by connection, database and time context.', 'Inspect duration and query details.', 'Save or route a known query into an optimization workflow.'], 'Slow query panel', 'query');
slideWithBullets('07 / Operations', 'Binlog and change monitoring', 'Change events add a live operational lens for supported database targets.', ['Join the selected connection room for live events.', 'Start or stop monitoring from the connection context.', 'Review change history alongside current events.', 'Use the stream during incident investigation or data-change review.'], 'Binlog monitor');
slideWithBullets('07 / Operations', 'Notifications and alerts', 'Alerts should reach the right audience through the right channel.', ['In-app notifications keep active operators informed.', 'Email can support escalation and scheduled communication.', 'Slack webhooks can bring alerts into the team workflow.', 'Threshold configuration should be explicit and reviewable.'], 'Alert center');
slideWithBullets('07 / Operations', 'System status and health checks', 'A status view helps separate product issues from target database issues.', ['Check backend availability and API reachability.', 'Check frontend-to-backend routing and CORS behavior.', 'Review service and connection failures separately.', 'Use status information before escalating a database incident.'], 'System status');

s = pptx.addSlide('MASTER');
header(s, '08 / Delivery', 'Deployment topology', 'Docker Compose packages the backend and frontend for a repeatable local or server deployment.');
card(s, 0.95, 2.0, 2.65, 1.45, 'Browser', 'User access over HTTP/HTTPS', C.orange);
card(s, 4.0, 2.0, 2.65, 1.45, 'Frontend container', 'NGINX serves React and proxies /api', C.teal);
card(s, 7.05, 2.0, 2.65, 1.45, 'Backend container', 'Express API on port 5001', C.green);
card(s, 10.1, 2.0, 2.2, 1.45, 'Metadata DB', 'MongoDB records', C.navy2);
addText(s, '→', 3.62, 2.48, 0.3, 0.3, { fontSize: 25, color: C.orange, bold: true, align: 'center' });
addText(s, '→', 6.67, 2.48, 0.3, 0.3, { fontSize: 25, color: C.orange, bold: true, align: 'center' });
addText(s, '→', 9.72, 2.48, 0.3, 0.3, { fontSize: 25, color: C.orange, bold: true, align: 'center' });
addText(s, 'Shared Docker network: dbmanager-network', 3.8, 4.2, 5.75, 0.35, { fontSize: 15, color: C.teal, bold: true, align: 'center' });
addPlaceholder(s, 4.1, 4.72, 5.2, 1.34, 'Deployment diagram');

slideWithBullets('08 / Delivery', 'Local development setup', 'The project supports independent frontend and backend development loops.', ['Install dependencies in frontend and backend directories.', 'Start MongoDB and any target databases required for testing.', 'Run the backend with npm run dev.', 'Run the frontend with npm run dev.', 'Use the browser to add connections and validate the workflow.'], 'Local setup');
slideWithBullets('08 / Delivery', 'Docker Compose setup', 'Containerized deployment gives a simple path to a shared environment.', ['Backend container exposes port 5001.', 'Frontend container exposes port 80.', 'Frontend depends on the backend service.', 'Both services join dbmanager-network.', 'Use docker-compose up -d to start the stack.'], 'Docker Compose');
slideWithBullets('08 / Delivery', 'Environment configuration', 'Secrets and environment-specific values stay outside application code.', ['PORT controls the backend listener.', 'MONGODB_URI points to application metadata storage.', 'CLIENT_URL controls trusted frontend origin behavior.', 'JWT_SECRET signs and validates authentication tokens.', 'SMTP, Slack and target database values may be added for integrations.'], 'Environment settings');
slideWithBullets('08 / Delivery', 'NGINX and routing', 'The frontend server also acts as the edge for API and SPA navigation.', ['Serve the built React application from NGINX.', 'Proxy /api requests to the backend container.', 'Support SPA fallback with try_files.', 'Keep browser routing and backend routing predictable across environments.'], 'NGINX proxy');

slideWithBullets('09 / Governance', 'Audit evidence lifecycle', 'The audit trail connects identity, action, target and outcome.', ['Capture who performed an action and when.', 'Capture target connection and database context.', 'Capture query, export, backup, restore or permission details where relevant.', 'Filter evidence for incident review or compliance requests.', 'Retain logs according to the organization policy.'], 'Evidence lifecycle');
slideWithBullets('09 / Governance', 'Operational runbook', 'A simple runbook makes common incidents repeatable.', ['Confirm system status and backend reachability.', 'Check connection credentials, host, port and network access.', 'Review service logs and recent audit activity.', 'Validate permissions before retrying a protected operation.', 'Document the outcome in the incident or change record.'], 'Runbook');
slideWithBullets('09 / Governance', 'Troubleshooting guide', 'The documentation already maps common failures to focused checks.', ['MongoDB failure: verify MONGODB_URI and service availability.', 'Frontend cannot reach backend: check CORS, port and NGINX proxy.', 'Connection test fails: validate credentials, host, port and network.', 'Slow alerts: inspect polling configuration and service logs.'], 'Troubleshooting');
slideWithBullets('09 / Governance', 'Known limitations', 'The current foundation is strong, with clear areas for maturation.', ['Automated deployment pipelines are still an enhancement area.', 'Unit and integration test coverage should grow with the product.', 'RBAC can evolve toward more advanced policy rules.', 'Secrets management and backup retention can be centralized further.', 'Role-based UI customization remains an opportunity.'], 'Limitations');
slideWithBullets('10 / Roadmap', 'Future enhancement roadmap', 'The roadmap turns a capable product into a more governed platform.', ['Centralized configuration and secrets management.', 'Richer audit dashboards and report generation.', 'Advanced RBAC and policy engine.', 'Kubernetes deployment support and CI/CD automation.', 'Automated database health scoring and trend analysis.'], 'Roadmap');
slideWithBullets('10 / Roadmap', 'Implementation checklist', 'A practical launch checklist for a new environment.', ['Install frontend and backend dependencies.', 'Set environment variables and start MongoDB.', 'Start backend and frontend services.', 'Add and test database connections.', 'Create users and configure access roles.', 'Validate query, backup, restore, monitoring and audit workflows.'], 'Launch checklist');
slideWithBullets('10 / Close', 'Why Allatone DMS', 'A focused control plane for teams that need database speed with operational discipline.', ['Centralize database operations across multiple engines.', 'Make access, execution, monitoring and recovery visible.', 'Build evidence into daily workflows instead of adding it later.', 'Create a foundation for stronger automation and governance.'], 'Closing view');

const out = 'Allatone_DMS_45_Slide_Presentation.pptx';
pptx.writeFile({ fileName: out }).then(() => console.log(`Created ${out} with ${pptx._slides.length} slides.`));