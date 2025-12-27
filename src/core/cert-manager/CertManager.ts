import forge from "node-forge";
import fs from "fs";
import path from "path";
export class CertManager {
  static async getCert(hostname: string) {
    const caCert = forge.pki.certificateFromPem(
      fs.readFileSync("creds/__self__/CA.crt", "utf8")
    );
    const caKey = forge.pki.privateKeyFromPem(
      fs.readFileSync("creds/__self__/key.pem", "utf8")
    );

    // *** generate full keypair ***
    const keys = forge.pki.rsa.generateKeyPair(2048);

    const cert = forge.pki.createCertificate();

    // *** set serial number (MUST be hex) ***
    cert.serialNumber = Math.floor(Math.random() * 1e16).toString(16);

    // *** validity ***
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(
      cert.validity.notBefore.getFullYear() + 1
    );

    // *** subject (leaf cert info) ***
    cert.setSubject([{ name: "commonName", value: hostname }]);

    // *** issuer = your CA ***
    cert.setIssuer(caCert.subject.attributes);

    // *** public key of leaf cert ***
    cert.publicKey = keys.publicKey;

    // *** required by browsers ***
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
        clientAuth: false,
      },
      {
        name: "subjectAltName",
        altNames: [
          { type: 2, value: hostname }, // DNS
        ],
      },
      {
        name: "authorityKeyIdentifier",
        keyIdentifier: true,
        authorityCertIssuer: true,
        serialNumber: caCert.serialNumber,
      },
      {
        name: "subjectKeyIdentifier",
      },
    ]);

    // *** sign leaf cert using CA private key ***
    cert.sign(caKey, forge.md.sha256.create());

    // const certPath = path.join(
    //   process.cwd(),
    //   "creds",
    //   `${hostname}`,
    //   "cert.crt"
    // );
    // const keyPath = path.join(process.cwd(), "creds", `${hostname}`, "key.pem");
    // fs.mkdirSync(path.dirname(certPath), { recursive: true });
    // fs.writeFileSync(
    //   certPath,
    //   forge.pki.certificateToPem(cert) // cert written
    // );
    // //   fs.mkdirSync(path.dirname(keyPath), { recursive: true });

    // fs.writeFileSync(
    //   keyPath,
    //   forge.pki.privateKeyToPem(keys.privateKey), // key written
    //   { mode: 0o600 }
    // );
    return {
      cert: forge.pki.certificateToPem(cert),
      key: forge.pki.privateKeyToPem(keys.privateKey),
    };
  }
}
