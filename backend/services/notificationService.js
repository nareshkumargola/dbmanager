const https = require('https');
const url = require('url');

/**
 * Dispatch an alert payload directly to a Slack Incoming Webhook
 */
exports.sendSlackNotification = (webhookUrl, alert) => {
  return new Promise((resolve) => {
    if (!webhookUrl) return resolve();

    try {
      const parsedUrl = url.parse(webhookUrl);
      const payload = JSON.stringify({
        text: `🚨 Database Alert: ${alert.severity.toUpperCase()}`,
        blocks: [
          {
            type: "header",
            text: {
              type: "plain_text",
              text: `🚨 Database Alert: ${alert.severity.toUpperCase()}`,
              emoji: true
            }
          },
          {
            type: "section",
            fields: [
              {
                type: "mrkdwn",
                text: `*Connection:*\n${alert.connectionName}`
              },
              {
                type: "mrkdwn",
                text: `*Severity:*\n${alert.severity === 'critical' ? '🔴 CRITICAL' : '🟡 WARNING'}`
              },
              {
                type: "mrkdwn",
                text: `*Event Type:*\n\`${alert.type}\``
              },
              {
                type: "mrkdwn",
                text: `*Status:*\n${alert.resolved ? '✅ RESOLVED' : '⚠️ ACTIVE'}`
              }
            ]
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*Message:*\n${alert.message}`
            }
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `Time: ${new Date().toISOString()}`
              }
            ]
          }
        ]
      });

      const options = {
        hostname: parsedUrl.hostname,
        path: parsedUrl.path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': payload.length
        }
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          resolve();
        });
      });

      req.on('error', (err) => {
        console.error('Slack webhook dispatch failed:', err.message);
        resolve();
      });

      req.write(payload);
      req.end();
    } catch (e) {
      console.error('Error constructing Slack webhook payload:', e.message);
      resolve();
    }
  });
};

const nodemailer = require('nodemailer');
require('dotenv').config();

// Create transporter dynamically based on env variables
const getTransporter = () => {
  if (process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    return nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT) || 587,
      secure: process.env.EMAIL_PORT === '465', // true for 465, false for other ports
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }
  return null;
};

/**
 * Dispatch an alert summary to a configured Email address (Simulated or Real SMTP via nodemailer)
 */
exports.sendEmailNotification = async (emailAddress, alert) => {
  if (!emailAddress) return;

  const transporter = getTransporter();
  
  if (transporter) {
    try {
      const mailOptions = {
        from: process.env.EMAIL_FROM || `"Database Alert Monitor" <${process.env.EMAIL_USER}>`,
        to: emailAddress,
        subject: `🚨 [ALERT] Database ${alert.connectionName} - ${alert.severity.toUpperCase()}`,
        html: `
          <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px; border: 1px solid #eee; border-radius: 12px; text-align: left;">
            <h2 style="color: ${alert.resolved ? '#0d9da4' : '#e53e3e'}; margin-top: 0; display: flex; align-items: center; gap: 8px;">
              ${alert.resolved ? '✅' : '🚨'} Database Event: ${alert.severity.toUpperCase()}
            </h2>
            <hr style="border: 0; border-top: 1px solid #eee; margin: 15px 0;" />
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <tr style="background: #f9f9f9;">
                <td style="padding: 10px; font-weight: bold; width: 120px; border-bottom: 1px solid #f1f1f1;">Connection:</td>
                <td style="padding: 10px; color: #1a1a1a; border-bottom: 1px solid #f1f1f1;">${alert.connectionName}</td>
              </tr>
              <tr>
                <td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #f1f1f1;">Severity:</td>
                <td style="padding: 10px; border-bottom: 1px solid #f1f1f1;">
                  <span style="font-weight: bold; color: ${alert.severity === 'critical' ? '#e53e3e' : '#dd6b20'}">
                    ${alert.severity === 'critical' ? '🔴 CRITICAL' : '🟡 WARNING'}
                  </span>
                </td>
              </tr>
              <tr style="background: #f9f9f9;">
                <td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #f1f1f1;">Event Type:</td>
                <td style="padding: 10px; font-family: monospace; border-bottom: 1px solid #f1f1f1;">${alert.type}</td>
              </tr>
              <tr>
                <td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #f1f1f1;">Status:</td>
                <td style="padding: 10px; font-weight: bold; color: ${alert.resolved ? '#0d9da4' : '#dd6b20'}; border-bottom: 1px solid #f1f1f1;">
                  ${alert.resolved ? 'RESOLVED' : 'ACTIVE'}
                </td>
              </tr>
            </table>
            
            <div style="margin-top: 20px; padding: 15px; background: #f7fafc; border-radius: 8px; border-left: 4px solid #0d9da4;">
              <p style="margin: 0; font-size: 14px; line-height: 1.5;">
                <strong>Details:</strong><br/>
                ${alert.message}
              </p>
            </div>
            
            <p style="font-size: 11px; color: #a0aec0; margin-top: 25px; text-align: center; border-top: 1px solid #eee; padding-top: 15px;">
              This is an automated notification from your Database Alert Monitor.
            </p>
          </div>
        `,
      };

      await transporter.sendMail(mailOptions);
      console.log(`[Email Alert] Successfully sent email notification to ${emailAddress}`);
    } catch (err) {
      console.error('[Email Alert] Failed to dispatch email notification via SMTP:', err.message);
    }
  } else {
    // Log the simulated email send
    console.log('\n================== 📧 SMTP MAIL SIMULATION ==================');
    console.log(`To:      ${emailAddress}`);
    console.log(`Subject: [ALERT] Database ${alert.connectionName} - ${alert.severity.toUpperCase()}`);
    console.log(`Body:`);
    console.log(`  Dear Admin,`);
    console.log(`  A database event has been captured:`);
    console.log(`  - Connection: ${alert.connectionName}`);
    console.log(`  - Event Type: ${alert.type}`);
    console.log(`  - Severity:   ${alert.severity}`);
    console.log(`  - Status:     ${alert.resolved ? 'RESOLVED' : 'ACTIVE'}`);
    console.log(`  - Details:    ${alert.message}`);
    console.log(`============================================================\n`);
    console.log(`[Email Alert] SMTP configuration missing. Simulated email log above.`);
  }
};
