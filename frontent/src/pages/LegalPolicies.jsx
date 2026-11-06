import Navbar from '../components/Navbar';
import './LegalPolicies.css';

const LAST_UPDATED = '5 November 2026';

const SECTIONS = [
  { id: 'privacy', title: 'Privacy Policy' },
  { id: 'terms', title: 'Terms of Service' },
  { id: 'security', title: 'Security' },
  { id: 'sessions', title: 'Sessions & Browser Storage' },
];

const RETENTION = [
  ['Query history', '10 days, then deleted automatically. It can’t be deleted by hand.'],
  ['Monitoring data', '7 days, then deleted automatically.'],
  ['Alerts', 'Until resolved, then deleted automatically after 5 days.'],
  ['System and connection audit logs', 'No automatic deletion. The app has no option to edit or delete them.'],
  ['Binlog, WAL, Oplog and Redo history', 'Until a user with the Binlog permission clears it.'],
  ['Slow query records and saved queries', 'Until they are deleted in the app.'],
  ['Backup files', 'Created on the server for download, then deleted once the download ends. Files uploaded for a restore are also deleted afterwards.'],
  ['Accounts and connections', 'Until an administrator or the connection’s owner deletes them.'],
];

function Clause({ title, wide, children }) {
  return (
    <article className={`lp-clause ${wide ? 'is-wide' : ''}`}>
      <h3>{title}</h3>
      {children}
    </article>
  );
}

function Section({ id, title, intro, children }) {
  return (
    <section id={id} className="lp-section" aria-labelledby={`${id}-title`}>
      <header>
        <h2 id={`${id}-title`}>{title}</h2>
        <p>{intro}</p>
      </header>
      <div className="lp-clauses">{children}</div>
    </section>
  );
}

export default function LegalPolicies() {
  return (
    <div className="lp-page text-left">
      <Navbar backTo="/dashboard" backText="Dashboard" />

      <header className="lp-hero">
        <h1>Legal &amp; Security <span>Policies</span></h1>
        <p>How Allatone DMS handles your account, your database connections and your activity, based on how the product works today.</p>
        <small>Last updated: {LAST_UPDATED}</small>
        <nav aria-label="Policy sections">
          {SECTIONS.map((section) => (
            <a key={section.id} href={`#${section.id}`}>{section.title}</a>
          ))}
        </nav>
      </header>

      <Section id="privacy" title="Privacy Policy" intro="What the app stores, how long it keeps it, and who else receives it.">
        <Clause title="Information we collect">
          <ul>
            <li><b>Account:</b> name, email, role, permissions, profile settings and a hashed password.</li>
            <li><b>Multi-factor sign-in:</b> your authenticator secret, stored encrypted, and backup codes, stored hashed.</li>
            <li><b>Connections:</b> name, database type, host, port, username, database name, SSL setting, cloud provider and service, and CA certificate.</li>
            <li><b>Activity:</b> queries you run, actions you take, and system alerts.</li>
          </ul>
        </Clause>

        <Clause title="How saved database passwords are protected">
          <p className="lp-note">Saved database passwords and connection strings are encrypted with AES-256-GCM before they are stored. API responses never include a saved password.</p>
          <p>Other connection details, such as host, port and username, are stored unencrypted so the app can show and use them.</p>
        </Clause>

        <Clause title="Query history and audit logs">
          <p>Each query you run records its text, connection, database, result, rows affected, run time and your user account.</p>
          <p>System audit logs are visible to administrators only. Connection audit logs need the Audit Logs permission, and query history needs the History permission.</p>
        </Clause>

        <Clause title="How long we keep data" wide>
          <div className="lp-table-wrap">
            <table className="lp-table">
              <thead>
                <tr><th scope="col">Data</th><th scope="col">Kept for</th></tr>
              </thead>
              <tbody>
                {RETENTION.map(([data, kept]) => (
                  <tr key={data}><th scope="row">{data}</th><td>{kept}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Clause>

        <Clause title="Who else receives data">
          <p>We do not sell or rent your account details, database credentials or query data, and the app has no advertising or analytics trackers. Data reaches these services only as described:</p>
          <ul>
            <li><b>Your database servers and cloud providers:</b> receive your credentials and queries when you connect.</li>
            <li><b>Email service:</b> Microsoft Graph or the configured mail server sends alert and account emails.</li>
            <li><b>Slack and Discord:</b> receive alerts only if a webhook is set in alert settings.</li>
            <li><b>Google Fonts:</b> your browser downloads fonts from Google, which can see your IP address.</li>
          </ul>
        </Clause>

        <Clause title="Deleting your data">
          <p>Ask your administrator to delete your account. This removes your account and the connections you own.</p>
          <p>Audit logs stay after an account is deleted, and any remaining query history is removed on its 10-day schedule.</p>
        </Clause>

        <Clause title="Laws and standards">
          <p>If your data falls under a law or standard such as GDPR or HIPAA, your organization is responsible for confirming that this deployment meets it. This page is not a certification.</p>
        </Clause>
      </Section>

      <Section id="terms" title="Terms of Service" intro="The rules for using Allatone DMS and connecting databases to it.">
        <Clause title="Acceptance">
          <p>By signing in, connecting a database or running a query, you agree to these terms.</p>
        </Clause>

        <Clause title="Authorized use">
          <p>You confirm that you have permission to access and change every database you connect.</p>
        </Clause>

        <Clause title="Accounts">
          <p>Administrators create accounts; there is no public sign-up. Keep your password, authenticator and backup codes private.</p>
          <p>Administrators can change your role and permissions, reset your multi-factor sign-in, or remove your account.</p>
        </Clause>

        <Clause title="Your queries and liability">
          <p className="lp-note is-warn">You are responsible for every query and restore you run. To the extent the law allows, we are not liable for downtime, lost tables, deleted rows (for example from DROP, TRUNCATE or DELETE), or security incidents caused by user negligence.</p>
        </Clause>

        <Clause title="Cloud services">
          <p>You are responsible for your cloud account, its charges, its firewall settings and the provider’s terms.</p>
          <p>A provider can limit what a feature can do, such as managing users or reading logs. Services marked Coming soon can’t be used yet.</p>
        </Clause>

        <Clause title="Backups">
          <p>Backup files contain your data, so store them safely. Test a backup before you rely on it.</p>
        </Clause>

        <Clause title="Monitoring information">
          <p>Monitoring is for guidance, and a connection’s status label may not show its live state.</p>
          <p className="lp-note is-warn">The WAL and Oplog monitors currently show simulated events. The Binlog monitor does too when binary logs are off or access is denied. These events have a Simulated type. Don’t use them as an audit record or to make decisions.</p>
        </Clause>

        <Clause title="Changes to these policies">
          <p>We may update these policies as the product changes. The date at the top of this page shows the latest version.</p>
        </Clause>
      </Section>

      <Section id="security" title="Security" intro="The protections built into the app, and where they stop.">
        <Clause title="Credentials stay on the server">
          <p>The browser never receives a saved password. A connection string’s password is hidden as ****.</p>
          <p>If you change the host of a saved connection, you must enter the password again, so it can’t be sent to a different server by mistake.</p>
        </Clause>

        <Clause title="Sign-in protection">
          <ul>
            <li>Account passwords are hashed with bcrypt.</li>
            <li>Authenticator sign-in is on by default, and each user can turn it off in their profile.</li>
            <li>Five wrong codes lock multi-factor sign-in for 15 minutes.</li>
            <li>Too many failed attempts block further tries for 15 minutes.</li>
            <li>Changing your password ends your other sessions.</li>
          </ul>
        </Clause>

        <Clause title="Access control">
          <p>Users have an Administrator or Developer role and individual permissions. Each connection can be Read Only or Read &amp; Write, and owners can share it with chosen users.</p>
        </Clause>

        <Clause title="Encryption in transit" wide>
          <ul>
            <li><b>Your browser to the app:</b> encrypted only when the deployment uses HTTPS. Your administrator is responsible for turning it on.</li>
            <li><b>Cloud Services connections:</b> the app always uses TLS and checks the server’s certificate. Oracle Cloud uses TCPS.</li>
            <li><b>Database tab connections:</b> SSL is optional for MySQL and PostgreSQL, and the server’s certificate isn’t checked. MongoDB follows its connection string. The app doesn’t encrypt Oracle connections from this tab, so use a private network or VPN.</li>
          </ul>
        </Clause>

        <Clause title="Audit logging">
          <p>The app records actions such as sign-ins, connection changes and queries. It has no option to edit or delete system and connection audit logs. Users with the Binlog permission can clear Binlog, WAL, Oplog and Redo history.</p>
        </Clause>

        <Clause title="Administrator responsibilities">
          <p>Protect the server’s settings file, which holds the encryption keys. If the connection encryption key is lost or changed, saved database passwords can’t be read and must be entered again.</p>
          <p>No system is completely secure, so report anything suspicious to your administrator.</p>
        </Clause>
      </Section>

      <Section id="sessions" title="Sessions & Browser Storage" intro="What stays in your browser, and how long you stay signed in.">
        <Clause title="Sign-in token, not cookies">
          <p>The app sets no sign-in or tracking cookies. Your sign-in token is kept in your browser’s local storage and sent with each request.</p>
        </Clause>

        <Clause title="How long you stay signed in">
          <p>By default, you are signed out after 30 minutes without activity, and a sign-in token lasts up to 1 hour. Your administrator can change these limits.</p>
        </Clause>

        <Clause title="What else your browser stores">
          <p>Theme and layout choices, open query tabs, recent queries for each connection, which audit logs you have seen, and your name for the welcome message.</p>
          <p>Queries saved in your browser stay there until the site’s data is cleared, so be careful on shared devices.</p>
        </Clause>
      </Section>

      <p className="lp-contact">Questions about these policies? Contact your system administrator.</p>
    </div>
  );
}
