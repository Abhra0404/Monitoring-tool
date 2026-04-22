/**
 * Admin bootstrap.
 *
 * Ensures an administrative login exists on first boot. Strategy:
 *   1. If ADMIN_EMAIL + ADMIN_PASSWORD are set, reconcile the admin user to
 *      those credentials (create if missing, update password if changed).
 *   2. Otherwise, if no non-system users exist, generate a strong random
 *      password, create `admin@theoria.local`, and write the credentials to
 *      ~/.theoria/admin-credentials.txt (mode 0600) and stderr so operators
 *      can log in on first run.
 *
 * This replaces the old "system user is always authenticated" anti-pattern.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import os from "os";
import bcrypt from "bcryptjs";
import type { FastifyBaseLogger } from "fastify";
import type store from "../../store/index.js";

type Store = typeof store;

const BCRYPT_COST = 12;

export interface BootstrapResult {
  created: boolean;
  email: string;
  generatedPassword?: string;
}

export async function bootstrapAdmin(
  memStore: Store,
  opts: {
    adminEmail?: string;
    adminPassword?: string;
    log: FastifyBaseLogger;
  },
): Promise<BootstrapResult | null> {
  const existing = memStore.Users.countNonSystem();
  const { adminEmail, adminPassword, log } = opts;

  // Case 1: explicit admin credentials via env.
  if (adminEmail && adminPassword) {
    const hash = await bcrypt.hash(adminPassword, BCRYPT_COST);
    const current = memStore.Users.findByEmail(adminEmail);
    if (current) {
      if (!(await bcrypt.compare(adminPassword, current.password || ""))) {
        memStore.Users.updatePassword(current._id, hash);
      }
      return { created: false, email: adminEmail };
    }
    memStore.Users.create({
      email: adminEmail,
      password: hash,
      role: "admin",
      isSystem: false,
    });
    log.info({ email: adminEmail }, "Admin account created from ADMIN_EMAIL/PASSWORD");
    return { created: true, email: adminEmail };
  }

  // Case 2: fresh install — generate a random admin password.
  if (existing === 0) {
    const email = "admin@theoria.local";
    const password = crypto.randomBytes(18).toString("base64url");
    const hash = await bcrypt.hash(password, BCRYPT_COST);
    memStore.Users.create({
      email,
      password: hash,
      role: "admin",
      isSystem: false,
    });

    try {
      const dir = path.join(os.homedir(), ".theoria");
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      const file = path.join(dir, "admin-credentials.txt");
      fs.writeFileSync(
        file,
        `Theoria admin credentials (generated ${new Date().toISOString()}):\n` +
          `Email:    ${email}\n` +
          `Password: ${password}\n\n` +
          `Change the password after first login, then delete this file.\n`,
        { mode: 0o600 },
      );
      log.warn(
        { email, credentialsFile: file },
        "Generated admin credentials — log in and rotate the password immediately",
      );
    } catch (err) {
      log.error({ err }, "Could not write admin-credentials.txt");
    }

    return { created: true, email, generatedPassword: password };
  }

  // Users already exist and no env override — nothing to do.
  return null;
}
