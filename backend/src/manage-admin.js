import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import mysql from "mysql2/promise";

const scrypt = promisify(scryptCallback);
const username = String(process.argv[2] || "").trim().toLowerCase();

if (!/^[a-z0-9_.-]{3,64}$/.test(username)) {
    console.error("Usage: npm run admin:user -- <username>");
    console.error("Username must be 3-64 characters and use only letters, numbers, dot, underscore or hyphen.");
    process.exit(1);
}

async function readHiddenLine(prompt) {
    if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
        let value = "";
        for await (const chunk of process.stdin) value += chunk;
        return value.replace(/[\r\n]+$/, "");
    }

    process.stdout.write(prompt);
    process.stdin.setRawMode(true);
    process.stdin.setEncoding("utf8");
    process.stdin.resume();

    return new Promise((resolve, reject) => {
        let value = "";
        const cleanup = () => {
            process.stdin.off("data", onData);
            process.stdin.setRawMode(false);
            process.stdin.pause();
            process.stdout.write("\n");
        };
        const onData = (chunk) => {
            for (const character of chunk) {
                if (character === "\u0003") {
                    cleanup();
                    reject(new Error("Cancelled."));
                    return;
                }
                if (character === "\r" || character === "\n") {
                    cleanup();
                    resolve(value);
                    return;
                }
                if (character === "\u007f" || character === "\b") {
                    value = value.slice(0, -1);
                    continue;
                }
                if (character >= " ") value += character;
            }
        };
        process.stdin.on("data", onData);
    });
}

async function derivePassword(password, salt) {
    return scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

const password = await readHiddenLine(`Password for ${username}: `);
if (password.length < 6 || password.length > 256) {
    console.error("Password must be 6-256 characters.");
    process.exit(1);
}

const salt = randomBytes(16).toString("hex");
const passwordHash = (await derivePassword(password, salt)).toString("hex");
const databasePassword = readFileSync(process.env.DB_PASSWORD_FILE || "/run/secrets/mysql_app_password", "utf8").trim();
const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "database",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "wgg_app",
    password: databasePassword,
    database: process.env.DB_NAME || "wgg_wedding",
    charset: "utf8mb4"
});

try {
    await connection.beginTransaction();
    const [rows] = await connection.execute("SELECT id FROM users WHERE username = ? LIMIT 1 FOR UPDATE", [username]);
    let userId;
    if (rows.length > 0) {
        userId = rows[0].id;
        await connection.execute(`UPDATE users
            SET password_hash = ?, password_salt = ?, is_active = TRUE
            WHERE id = ?`, [passwordHash, salt, userId]);
    } else {
        const [result] = await connection.execute(`INSERT INTO users
            (username, password_hash, password_salt, is_active)
            VALUES (?, ?, ?, TRUE)`, [username, passwordHash, salt]);
        userId = result.insertId;
    }
    await connection.execute("DELETE FROM admin_sessions WHERE user_id = ?", [userId]);
    await connection.commit();
    console.log(`Admin user '${username}' is ready. Existing sessions for this user were revoked.`);
} catch (error) {
    await connection.rollback();
    if (error.code === "ER_NO_SUCH_TABLE") {
        console.error("The users table does not exist. Deploy the latest project version first.");
    } else {
        console.error(error.message);
    }
    process.exitCode = 1;
} finally {
    await connection.end();
}
