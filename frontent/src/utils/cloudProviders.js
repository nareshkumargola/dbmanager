import alibabaLogo from '../assets/cloud/alibaba-cloud.svg';
import awsLogo from '../assets/cloud/aws.svg';
import azureLogo from '../assets/cloud/azure.svg';
import googleCloudLogo from '../assets/cloud/google-cloud.svg';
import ibmLogo from '../assets/cloud/ibm.svg';
import mongodbLogo from '../assets/cloud/mongodb.svg';
import oracleLogo from '../assets/cloud/oracle.svg';

// Cloud options for Add Connection. Each service runs on an engine the app already supports,
// so the provider only sets defaults and a label. "comingSoon" services need work the app
// doesn't have yet, such as a new engine or wallet sign-in.
const soon = (key, label) => ({ key, label, comingSoon: true });

export const CLOUD_PROVIDERS = [
  {
    key: 'aws',
    label: 'AWS',
    summary: 'RDS, Aurora',
    logo: awsLogo,
    ca: 'optional',
    caHint: 'AWS certificates are already built in. Paste one only if your database uses a different CA.',
    services: [
      { key: 'rds-mysql', label: 'RDS for MySQL', engine: 'mysql', hostHint: 'my-db.abc123.ap-south-1.rds.amazonaws.com' },
      { key: 'rds-postgresql', label: 'RDS for PostgreSQL', engine: 'postgresql', hostHint: 'my-db.abc123.ap-south-1.rds.amazonaws.com' },
      { key: 'aurora-mysql', label: 'Aurora MySQL', engine: 'mysql', hostHint: 'my-cluster.cluster-abc123.ap-south-1.rds.amazonaws.com', tip: 'Use the cluster writer endpoint.' },
      { key: 'aurora-postgresql', label: 'Aurora PostgreSQL', engine: 'postgresql', hostHint: 'my-cluster.cluster-abc123.ap-south-1.rds.amazonaws.com', tip: 'Use the cluster writer endpoint.' },
      soon('documentdb', 'DocumentDB'),
    ],
  },
  {
    key: 'azure',
    label: 'Microsoft Azure',
    summary: 'Azure Database',
    logo: azureLogo,
    ca: 'optional',
    caHint: 'Azure uses public certificates, which are trusted automatically. Paste one only if the check fails.',
    services: [
      { key: 'azure-mysql', label: 'Azure Database for MySQL', engine: 'mysql', hostHint: 'my-server.mysql.database.azure.com' },
      { key: 'azure-postgresql', label: 'Azure Database for PostgreSQL', engine: 'postgresql', hostHint: 'my-server.postgres.database.azure.com' },
      soon('azure-sql', 'Azure SQL Database'),
    ],
  },
  {
    key: 'gcp',
    label: 'Google Cloud',
    summary: 'Cloud SQL, AlloyDB',
    logo: googleCloudLogo,
    ca: 'required',
    caHint: 'Download the server CA certificate from your Google Cloud console and paste the full text here.',
    services: [
      { key: 'cloudsql-mysql', label: 'Cloud SQL for MySQL', engine: 'mysql', hostHint: 'Public or private IP of the instance' },
      { key: 'cloudsql-postgresql', label: 'Cloud SQL for PostgreSQL', engine: 'postgresql', hostHint: 'Public or private IP of the instance' },
      { key: 'alloydb', label: 'AlloyDB', engine: 'postgresql', hostHint: 'IP address of the AlloyDB instance' },
      soon('firestore', 'Firestore'),
    ],
  },
  {
    key: 'atlas',
    label: 'MongoDB Atlas',
    summary: 'Managed MongoDB',
    logo: mongodbLogo,
    services: [
      { key: 'atlas', label: 'MongoDB Atlas', engine: 'mongodb', uriHint: 'mongodb+srv://username:password@cluster.mongodb.net/database', tip: 'Copy the connection string from Connect in Atlas.' },
    ],
  },
  {
    key: 'oci',
    label: 'Oracle Cloud',
    summary: 'Oracle Database',
    logo: oracleLogo,
    services: [
      { key: 'oci-database', label: 'Oracle Database', engine: 'oracle', port: '2484', hostHint: 'Host name of the database', tip: 'Needs a TCPS listener with a certificate from a public CA.' },
      soon('autonomous', 'Autonomous Database'),
      soon('database-at-azure', 'Oracle Database@Azure'),
    ],
  },
  {
    key: 'ibm',
    label: 'IBM Cloud',
    summary: 'Databases for MySQL, PostgreSQL',
    logo: ibmLogo,
    ca: 'required',
    caHint: 'Download the CA certificate from your IBM Cloud console and paste the full text here.',
    services: [
      { key: 'ibm-mysql', label: 'Databases for MySQL', engine: 'mysql', hostHint: 'my-db.databases.appdomain.cloud' },
      { key: 'ibm-postgresql', label: 'Databases for PostgreSQL', engine: 'postgresql', hostHint: 'my-db.databases.appdomain.cloud' },
      soon('db2', 'Db2 on Cloud'),
    ],
  },
  {
    key: 'alibaba',
    label: 'Alibaba Cloud',
    summary: 'ApsaraDB RDS, PolarDB',
    logo: alibabaLogo,
    ca: 'required',
    caHint: 'Download the CA certificate from your Alibaba Cloud console and paste the full text here.',
    services: [
      { key: 'apsaradb-mysql', label: 'ApsaraDB RDS for MySQL', engine: 'mysql', hostHint: 'rm-abc123.mysql.rds.aliyuncs.com' },
      { key: 'apsaradb-postgresql', label: 'ApsaraDB RDS for PostgreSQL', engine: 'postgresql', hostHint: 'pgm-abc123.pg.rds.aliyuncs.com' },
      { key: 'polardb-mysql', label: 'PolarDB for MySQL', engine: 'mysql', hostHint: 'pc-abc123.mysql.polardb.rds.aliyuncs.com' },
      { key: 'polardb-postgresql', label: 'PolarDB for PostgreSQL', engine: 'postgresql', hostHint: 'pc-abc123.pg.polardb.rds.aliyuncs.com' },
    ],
  },
];

export const DEFAULT_PORTS = { mysql: '3306', postgresql: '5432', mongodb: '27017', oracle: '1521' };

// Text for a saved connection, e.g. "AWS · Aurora MySQL"
export const cloudLabel = (providerKey, serviceLabel) => {
  const provider = CLOUD_PROVIDERS.find((item) => item.key === providerKey);
  if (!provider) return '';
  return serviceLabel && serviceLabel !== provider.label ? `${provider.label} · ${serviceLabel}` : provider.label;
};
