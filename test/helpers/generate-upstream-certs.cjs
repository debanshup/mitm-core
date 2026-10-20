const fs = require("node:fs");
const path = require("node:path");
const forge = require("node-forge");

const CERT_DIR = path.resolve(__dirname, "../fixtures/certs");

const CERT_PATH = path.join(CERT_DIR, "upstream-cert.pem");
const KEY_PATH = path.join(CERT_DIR, "upstream-key.pem");

function generateUpstreamCertificates() {
  if (fs.existsSync(CERT_PATH) && fs.existsSync(KEY_PATH)) {
    return;
  }

  fs.mkdirSync(CERT_DIR, { recursive: true });

  const keys = forge.pki.rsa.generateKeyPair(2048);

  const cert = forge.pki.createCertificate();

  cert.publicKey = keys.publicKey;
  cert.serialNumber = `01${Date.now().toString(16)}`;

  cert.validity.notBefore = new Date();
  cert.validity.notBefore.setMinutes(cert.validity.notBefore.getMinutes() - 5);

  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notAfter.getFullYear() + 1);

  const attributes = [
    {
      name: "commonName",
      value: "localhost",
    },
  ];

  cert.setSubject(attributes);
  cert.setIssuer(attributes);

  cert.setExtensions([
    {
      name: "basicConstraints",
      cA: false,
    },
    {
      name: "keyUsage",
      digitalSignature: true,
      keyEncipherment: true,
    },
    {
      name: "extKeyUsage",
      serverAuth: true,
    },
    {
      name: "subjectAltName",
      altNames: [
        { type: 2, value: "localhost" },
        { type: 7, ip: "127.0.0.1" },
        { type: 7, ip: "::1" },
      ],
    },
  ]);

  cert.sign(keys.privateKey, forge.md.sha256.create());

  const certificatePem = forge.pki.certificateToPem(cert);
  const privateKeyPem = forge.pki.privateKeyToPem(keys.privateKey);

  fs.writeFileSync(CERT_PATH, certificatePem, { mode: 0o644 });
  fs.writeFileSync(KEY_PATH, privateKeyPem, { mode: 0o600 });
}

generateUpstreamCertificates();
