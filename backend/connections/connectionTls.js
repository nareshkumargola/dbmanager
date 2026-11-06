// TLS rules for database connections. A connection from the Database tab keeps its SSL setting.
// A cloud connection always uses TLS and checks the server's certificate.
const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const path = require('path');

const AWS_CA_FILE = path.join(__dirname, '../certs/aws-rds-global-bundle.pem');
const MAX_CA_LENGTH = 64 * 1024;
const CERTIFICATE_BLOCK = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g;
const INVALID_CA = 'Paste a valid CA certificate. It starts with -----BEGIN CERTIFICATE-----.';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const INSECURE_MONGO_OPTION = /[?&](tls|ssl|sslValidate)=false\b|[?&](tlsInsecure|tlsAllowInvalidCertificates|tlsAllowInvalidHostnames)=true\b/i;

let awsCa;
const builtInCa = (provider) => {
  if (provider !== 'aws') return undefined;
  if (!awsCa) awsCa = fs.readFileSync(AWS_CA_FILE, 'utf8');
  return awsCa;
};

// Options for mysql2 and pg
const tlsOptions = (config) => {
  if (!config.cloudProvider) return config.ssl ? { rejectUnauthorized: false } : false;

  const ca = config.caCertificate || builtInCa(config.cloudProvider);
  // Cloud SQL certificates don't name the IP address. The pasted CA belongs to that one instance,
  // so it is what proves the server. Without it, the host name check stays on.
  const skipHostName = config.cloudProvider === 'gcp' && net.isIP(String(config.host)) !== 0 && Boolean(config.caCertificate);
  return {
    rejectUnauthorized: true,
    minVersion: 'TLSv1.2',
    verifyIdentity: !skipHostName, // mysql2 checks the host name only when this is on
    ...(ca ? { ca } : {}),
    ...(skipHostName ? { checkServerIdentity: () => undefined } : {}), // same setting for pg
  };
};

const mongoTlsOptions = (config) => {
  if (!config.cloudProvider) return {};
  const uri = String(config.connectionString);
  const hosts = uri.replace(/^[a-z+]+:\/\//i, '').split('@').pop().split(/[/?]/)[0].split(',');
  // A database on this machine, or a cloud database reached through an SSH tunnel
  if (hosts.every((host) => LOCAL_HOSTS.has(host.replace(/:\d+$/, '').toLowerCase()))) return {};
  if (INSECURE_MONGO_OPTION.test(uri)) {
    throw new Error('This connection string turns off TLS security. Remove those options.');
  }
  return { tls: true };
};

const oracleConnectOptions = (config) => {
  const credentials = { user: config.username, password: config.password };
  if (!config.cloudProvider) {
    return { ...credentials, connectString: `${config.host}:${config.port || 1521}/${config.database}` };
  }
  return { ...credentials, connectString: `tcps://${config.host}:${config.port || 2484}/${config.database}`, sslServerDNMatch: true };
};

const caCertificateError = (pem) => {
  if (!pem) return null;
  if (typeof pem !== 'string' || pem.length > MAX_CA_LENGTH) return INVALID_CA;
  if (pem.includes('PRIVATE KEY')) return 'Paste only the CA certificate, not a private key.';
  const blocks = pem.match(CERTIFICATE_BLOCK);
  if (!blocks) return INVALID_CA;
  try {
    blocks.forEach((block) => new crypto.X509Certificate(block));
    return null;
  } catch {
    return INVALID_CA;
  }
};

// A cloud connection with no endpoint must not fall through to a database on this server
const cloudConfigError = (config) => {
  const endpoint = config.type === 'mongodb' ? config.connectionString : config.host;
  if (!String(endpoint || '').trim()) return 'Enter the cloud endpoint first.';
  return caCertificateError(config.caCertificate);
};

const isCertificateError = (err) => /certificate|self.signed|DEPTH_ZERO|UNABLE_TO_|CERT_/i.test(`${err.code || ''} ${err.message || ''}`);

module.exports = {
  CERTIFICATE_ERROR: 'The server certificate could not be verified. Check the endpoint name and the CA certificate.',
  cloudConfigError,
  isCertificateError,
  mongoTlsOptions,
  oracleConnectOptions,
  tlsOptions,
};
