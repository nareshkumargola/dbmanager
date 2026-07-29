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
const querystring = require('querystring');
require('dotenv').config();

// Helper to execute HTTPS requests natively
const makeHttpsRequest = (options, postData = '') => {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body
        });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
};

const sendAzureGraphMail = async (emailAddress, alert) => {
  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  const senderEmail = process.env.AZURE_MAIL_SENDER;

  if (!tenantId || !clientId || !clientSecret || !senderEmail) {
    throw new Error('Missing Azure Mail Configuration variables');
  }

  // 1. Fetch Access Token via OAuth client credentials flow
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const tokenParams = querystring.stringify({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default'
  });

  const parsedTokenUrl = new URL(tokenUrl);
  const tokenOptions = {
    hostname: parsedTokenUrl.hostname,
    path: parsedTokenUrl.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(tokenParams)
    }
  };

  const tokenRes = await makeHttpsRequest(tokenOptions, tokenParams);
  if (tokenRes.statusCode !== 200) {
    throw new Error(`Failed to fetch Azure token: ${tokenRes.statusCode} - ${tokenRes.body}`);
  }

  const tokenJson = JSON.parse(tokenRes.body);
  const accessToken = tokenJson.access_token;

  // 2. Construct sendMail JSON payload
  const mailBody = {
    message: {
      subject: `🚨 [ALERT] Database ${alert.connectionName} - ${alert.severity.toUpperCase()}`,
      body: {
        contentType: 'HTML',
        content: `
          <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px; border: 1px solid #eee; border-radius: 12px; text-align: left;">
            <h2 style="color: ${alert.resolved ? '#0d9da4' : '#e53e3e'}; margin-top: 0;">
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
        `
      },
      toRecipients: [
        {
          emailAddress: {
            address: emailAddress
          }
        }
      ]
    },
    saveToSentItems: "false"
  };

  const mailParams = JSON.stringify(mailBody);
  const mailUrl = `https://graph.microsoft.com/v1.0/users/${senderEmail}/sendMail`;

  const parsedMailUrl = new URL(mailUrl);
  const mailOptions = {
    hostname: parsedMailUrl.hostname,
    path: parsedMailUrl.pathname,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(mailParams)
    }
  };

  const mailRes = await makeHttpsRequest(mailOptions, mailParams);
  if (mailRes.statusCode !== 202) {
    throw new Error(`Graph API sendMail failed: ${mailRes.statusCode} - ${mailRes.body}`);
  }
  console.log(`[Azure Graph Mail Alert] Successfully sent email notification to ${emailAddress}`);
};

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
 * Dispatch a generic email via configured channel (Azure Graph API, SMTP or console logger)
 */
exports.sendGenericEmail = async (emailAddress, subject, htmlContent) => {
  if (!emailAddress) return;

  // Use Azure Graph API if credentials are provided in configurations
  if (process.env.AZURE_CLIENT_SECRET) {
    try {
      const tenantId = process.env.AZURE_TENANT_ID;
      const clientId = process.env.AZURE_CLIENT_ID;
      const clientSecret = process.env.AZURE_CLIENT_SECRET;
      const senderEmail = process.env.AZURE_MAIL_SENDER;

      // 1. Fetch Access Token via OAuth client credentials flow
      const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
      const tokenParams = querystring.stringify({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://graph.microsoft.com/.default'
      });

      const parsedTokenUrl = new URL(tokenUrl);
      const tokenOptions = {
        hostname: parsedTokenUrl.hostname,
        path: parsedTokenUrl.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(tokenParams)
        }
      };

      const tokenRes = await makeHttpsRequest(tokenOptions, tokenParams);
      if (tokenRes.statusCode === 200) {
        const tokenJson = JSON.parse(tokenRes.body);
        const accessToken = tokenJson.access_token;

        // 2. Construct sendMail JSON payload
        const mailBody = {
          message: {
            subject: subject,
            body: {
              contentType: 'HTML',
              content: htmlContent
            },
            toRecipients: [
              {
                emailAddress: {
                  address: emailAddress
                }
              }
            ]
          },
          saveToSentItems: "false"
        };

        const mailParams = JSON.stringify(mailBody);
        const mailUrl = `https://graph.microsoft.com/v1.0/users/${senderEmail}/sendMail`;

        const parsedMailUrl = new URL(mailUrl);
        const mailOptions = {
          hostname: parsedMailUrl.hostname,
          path: parsedMailUrl.pathname,
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(mailParams)
          }
        };

        const mailRes = await makeHttpsRequest(mailOptions, mailParams);
        if (mailRes.statusCode === 202) {
          console.log(`[Azure Graph Email] Successfully sent email to ${emailAddress}`);
          return;
        } else {
          console.warn(`[Azure Graph Email] Send mail failed status ${mailRes.statusCode}: ${mailRes.body}`);
        }
      } else {
        console.warn(`[Azure Graph Email] OAuth token fetch failed status ${tokenRes.statusCode}: ${tokenRes.body}`);
      }
    } catch (err) {
      console.error('[Azure Graph Email] Failed to send email via Azure:', err.message);
    }
  }

  // Fallback to standard SMTP
  const transporter = getTransporter();
  if (transporter) {
    try {
      const mailOptions = {
        from: process.env.EMAIL_FROM || `"Allatone Admin" <${process.env.EMAIL_USER}>`,
        to: emailAddress,
        subject: subject,
        html: htmlContent,
      };
      await transporter.sendMail(mailOptions);
      console.log(`[SMTP Email] Successfully sent email via SMTP to ${emailAddress}`);
    } catch (err) {
      console.error('[SMTP Email] Failed to send email via SMTP:', err.message);
    }
  } else {
    // Log simulated email
    console.log('\n================== 📧 SMTP MAIL SIMULATION ==================');
    console.log(`To:      ${emailAddress}`);
    console.log(`Subject: ${subject}`);
    console.log(`Body:    (HTML content printed to console logs)`);
    console.log(htmlContent);
    console.log(`============================================================\n`);
  }
};

/**
 * Dispatch an alert summary to a configured Email address (Simulated or Real SMTP via nodemailer)
 */
exports.sendEmailNotification = async (emailAddress, alert) => {
  if (!emailAddress) return;

  const subject = `🚨 [ALERT] Database ${alert.connectionName} - ${alert.severity.toUpperCase()}`;
  const htmlContent = `
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
  `;

  await exports.sendGenericEmail(emailAddress, subject, htmlContent);
};

/**
 * Dispatch an alert payload directly to a Discord Incoming Webhook
 */
exports.sendDiscordNotification = (webhookUrl, alert) => {
  return new Promise((resolve) => {
    if (!webhookUrl) return resolve();

    try {
      const parsedUrl = url.parse(webhookUrl);
      const payload = JSON.stringify({
        content: `🚨 **Database Alert Notification**`,
        embeds: [
          {
            title: `System Alert: ${alert.severity.toUpperCase()}`,
            color: alert.resolved ? 3066993 : alert.severity === 'critical' ? 15158332 : 15105570,
            fields: [
              {
                name: "Connection",
                value: alert.connectionName,
                inline: true
              },
              {
                name: "Severity",
                value: alert.severity === 'critical' ? "🔴 CRITICAL" : "🟡 WARNING",
                inline: true
              },
              {
                name: "Event Type",
                value: `\`${alert.type}\``,
                inline: true
              },
              {
                name: "Status",
                value: alert.resolved ? "✅ RESOLVED" : "⚠️ ACTIVE",
                inline: true
              },
              {
                name: "Message",
                value: alert.message
              }
            ],
            footer: {
              text: `Time: ${new Date().toISOString()}`
            }
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
        console.error('Discord webhook dispatch failed:', err.message);
        resolve();
      });

      req.write(payload);
      req.end();
    } catch (e) {
      console.error('Error constructing Discord webhook payload:', e.message);
      resolve();
    }
  });
};
