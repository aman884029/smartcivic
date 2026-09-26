const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

require("dotenv").config();
/* =====================================================
   FORGOT PASSWORD / OTP
===================================================== */

const otpStore = new Map();




function generateOTP() {
    return Math.floor(
        100000 + Math.random() * 900000
    ).toString();
}

const app = express();

const PORT = process.env.PORT || 3000;

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET must be configured with at least 32 characters.");
}

const mailer = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: String(process.env.SMTP_SECURE || "false") === "true",
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    })
    : null;

async function sendOTPEmail(to, otp, purpose) {
    if (!mailer) throw new Error("Email delivery is not configured.");
    await mailer.sendMail({
        from: process.env.EMAIL_FROM || process.env.SMTP_USER,
        to,
        subject: purpose === "verify" ? "Verify your SmartCivic email" : "Your SmartCivic password reset code",
        text: `Your SmartCivic ${purpose === "verify" ? "email verification" : "password reset"} code is ${otp}. It expires in 5 minutes. If you did not request this, ignore this email.`,
        html: `<p>Your SmartCivic ${purpose === "verify" ? "email verification" : "password reset"} code is:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px">${otp}</p><p>It expires in 5 minutes. If you did not request this, ignore this email.</p>`
    });
}

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.join(ROOT, "data");
const UPLOAD_DIR = process.env.UPLOAD_DIR
    ? path.resolve(process.env.UPLOAD_DIR)
    : path.join(ROOT, "uploads");

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(UPLOAD_DIR));
app.use(express.static(PUBLIC_DIR));

/* =====================================================
   DATABASE
===================================================== */

const db = new sqlite3.Database(
    path.join(DATA_DIR, "smartcivic.db"),
    function (err) {
        if (err) {
            console.error("Database connection error:", err);
        } else {
            console.log("SQLite database connected.");
        }
    }
);

db.run("PRAGMA foreign_keys = ON");

function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) {
                reject(err);
            } else {
                resolve({
                    lastID: this.lastID,
                    changes: this.changes
                });
            }
        });
    });
}

function get(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, function (err, row) {
            if (err) {
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
}

function all(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, function (err, rows) {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

async function initializeDatabase() {
    await run(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            mobile TEXT,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'citizen',
            created_at TEXT NOT NULL
        )
    `);

    await run(`
        CREATE TABLE IF NOT EXISTS complaints (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            citizen_name TEXT,
            category TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            latitude REAL,
            longitude REAL,
            area_name TEXT,

            priority TEXT NOT NULL,
            department TEXT,
            assigned_officer TEXT,

            status TEXT NOT NULL DEFAULT 'Submitted',

            sla_hours REAL,
            deadline TEXT,

            escalation_level TEXT DEFAULT 'Normal',
            escalation_reason TEXT,

            duplicate_group_id TEXT,
            duplicate_count INTEGER DEFAULT 1,

            ai_category TEXT,
            ai_severity TEXT,
            ai_confidence REAL,
            ai_summary TEXT,

            photo_url TEXT,
            before_photo_url TEXT,
            after_photo_url TEXT,

            resolution_note TEXT,
            resolved_at TEXT,

            ngo_status TEXT,
            ngo_remarks TEXT,
            ngo_action_date TEXT,
            ngo_evidence_url TEXT,

            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,

            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    `);

    await run(`
        CREATE TABLE IF NOT EXISTS complaint_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            complaint_id TEXT NOT NULL,
            action TEXT NOT NULL,
            old_status TEXT,
            new_status TEXT,
            note TEXT,
            actor_id TEXT,
            created_at TEXT NOT NULL
        )
    `);

    console.log("Database tables ready.");
}

/* =====================================================
   FILE UPLOAD
===================================================== */

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, UPLOAD_DIR);
    },

    filename: function (req, file, cb) {
        const ext =
            path.extname(file.originalname).toLowerCase();

        cb(
            null,
            Date.now() +
                "-" +
                crypto.randomUUID() +
                ext
        );
    }
});

const upload = multer({
    storage,

    limits: {
        fileSize: 8 * 1024 * 1024
    },

    fileFilter: function (req, file, cb) {
        if (
            file.mimetype &&
            file.mimetype.startsWith("image/")
        ) {
            cb(null, true);
        } else {
            cb(
                new Error(
                    "Only image files are allowed."
                )
            );
        }
    }
});

/* =====================================================
   CONSTANTS
===================================================== */

const CATEGORY_CONFIG = {
    "Dangerous / Fallen Electrical Wire": {
        department: "Electricity Department",
        threshold: 2,
        sla: 2,
        emergency: true
    },

    "Road Waterlogging / Flooded Street": {
        department: "Municipal Corporation",
        threshold: 3,
        sla: 4
    },

    "Traffic Signal / Road Safety": {
        department: "Traffic Police",
        threshold: 3,
        sla: 4
    },

    "Garbage / Waste Dump": {
        department: "Municipal Corporation",
        threshold: 5,
        sla: 24
    },

    "Pothole / Broken Road": {
        department: "PWD",
        threshold: 5,
        sla: 48
    },

    "Streetlight Not Working": {
        department: "Electricity Department",
        threshold: 7,
        sla: 72
    },

    "Water Supply / Leakage": {
        department: "Water Department",
        threshold: 5,
        sla: 12
    },

    "Blocked Drain / Sewer Overflow": {
        department: "Municipal Corporation",
        threshold: 3,
        sla: 8
    },

    "Fallen / Dangerous Tree": {
        department: "Municipal Corporation",
        threshold: 3,
        sla: 8
    },

    "Road Obstruction / Encroachment": {
        department: "Municipal Corporation",
        threshold: 5,
        sla: 24
    },

    "Public Toilet / Sanitation": {
        department: "Municipal Corporation",
        threshold: 5,
        sla: 24
    },

    "Smoke / Pollution / Burning Waste": {
        department: "Pollution Control Department",
        threshold: 3,
        sla: 6
    },

    "Stray Animal / Animal Hazard": {
        department: "Animal Control Department",
        threshold: 5,
        sla: 12
    },

    "Other Civic Problem": {
        department: "Municipal Corporation",
        threshold: 10,
        sla: 48
    }
};

const STATUS_LIST = [
    "Submitted",
    "Assigned",
    "In Progress",
    "On Hold",
    "Resolved",
    "Rejected",
    "Reopened"
];

/* =====================================================
   AUTH HELPERS
===================================================== */

function createToken(user) {
    return jwt.sign(
        {
            id: user.id,
            role: user.role,
            email: user.email
        },
        JWT_SECRET,
        {
            expiresIn: "7d"
        }
    );
}

function auth(req, res, next) {
    const header =
        req.headers.authorization || "";

    const token =
        header.startsWith("Bearer ")
            ? header.substring(7)
            : null;

    if (!token) {
        return res.status(401).json({
            message: "Authentication required."
        });
    }

    try {
        req.user = jwt.verify(
            token,
            JWT_SECRET
        );

        next();
    } catch (error) {
        return res.status(401).json({
            message: "Invalid or expired token."
        });
    }
}

function requireRole(...roles) {
    return function (req, res, next) {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                message: "Access denied."
            });
        }

        next();
    };
}

/* =====================================================
   AI CLASSIFICATION
===================================================== */

function classifyComplaint(
    description,
    title,
    selectedCategory
) {
    const text = (
        `${title} ${description} ${selectedCategory}`
    ).toLowerCase();

    let category =
        selectedCategory ||
        "Other Civic Problem";

    let severity = "Medium";
    let confidence = 0.72;

    let summary =
        "AI-assisted civic issue classification.";

    if (
        text.includes("electric") ||
        text.includes("wire") ||
        text.includes("current") ||
        text.includes("bijli") ||
        text.includes("तार")
    ) {
        category =
            "Dangerous / Fallen Electrical Wire";

        severity = "Emergency";
        confidence = 0.94;

        summary =
            "Possible electrical hazard detected.";
    }

    else if (
        text.includes("waterlogging") ||
        text.includes("flood") ||
        text.includes("paani") ||
        text.includes("water accumulated")
    ) {
        category =
            "Road Waterlogging / Flooded Street";

        severity = "High";
        confidence = 0.91;

        summary =
            "Possible road flooding/waterlogging detected.";
    }

    else if (
        text.includes("pothole") ||
        text.includes("gaddha") ||
        text.includes("broken road")
    ) {
        category =
            "Pothole / Broken Road";

        severity = "High";
        confidence = 0.90;

        summary =
            "Road surface damage detected.";
    }

    else if (
        text.includes("garbage") ||
        text.includes("kachra") ||
        text.includes("waste")
    ) {
        category =
            "Garbage / Waste Dump";

        severity = "Medium";
        confidence = 0.89;

        summary =
            "Waste accumulation detected.";
    }

    else if (
        text.includes("streetlight") ||
        text.includes("street light") ||
        text.includes("light not working")
    ) {
        category =
            "Streetlight Not Working";

        severity = "Medium";
        confidence = 0.88;

        summary =
            "Streetlight issue detected.";
    }

    else if (
        text.includes("traffic signal") ||
        text.includes("signal") ||
        text.includes("traffic")
    ) {
        category =
            "Traffic Signal / Road Safety";

        severity = "High";
        confidence = 0.86;

        summary =
            "Possible traffic safety issue detected.";
    }

    return {
        category,
        severity,
        confidence,
        summary
    };
}

/* =====================================================
   PHOTO AI DEMO
===================================================== */

function analyzePhotoDemo(
    category,
    description
) {
    const text =
        `${category} ${description}`.toLowerCase();

    let detected = category;
    let severity = "Medium";

    if (
        text.includes("electric") ||
        text.includes("wire")
    ) {
        detected =
            "Possible electrical hazard";

        severity = "Emergency";
    }

    else if (
        text.includes("pothole") ||
        text.includes("road")
    ) {
        detected =
            "Possible road damage";

        severity = "High";
    }

    else if (
        text.includes("garbage") ||
        text.includes("waste")
    ) {
        detected =
            "Possible waste accumulation";

        severity = "Medium";
    }

    return {
        mode: "AI-assisted demo verification",
        detectedProblem: detected,
        severity
    };
}

/* =====================================================
   SLA
===================================================== */

function calculateDeadline(hours) {
    return new Date(
        Date.now() +
            Number(hours) *
                60 *
                60 *
                1000
    ).toISOString();
}

/* =====================================================
   DISTANCE
===================================================== */

function distanceMeters(
    lat1,
    lon1,
    lat2,
    lon2
) {
    if (
        lat1 === null ||
        lon1 === null ||
        lat2 === null ||
        lon2 === null ||
        lat1 === undefined ||
        lon1 === undefined ||
        lat2 === undefined ||
        lon2 === undefined
    ) {
        return Infinity;
    }

    const R = 6371000;

    const p1 =
        lat1 * Math.PI / 180;

    const p2 =
        lat2 * Math.PI / 180;

    const dp =
        (lat2 - lat1) *
        Math.PI / 180;

    const dl =
        (lon2 - lon1) *
        Math.PI / 180;

    const a =
        Math.sin(dp / 2) ** 2 +
        Math.cos(p1) *
            Math.cos(p2) *
            Math.sin(dl / 2) ** 2;

    return (
        2 *
        R *
        Math.atan2(
            Math.sqrt(a),
            Math.sqrt(1 - a)
        )
    );
}

/* =====================================================
   DUPLICATE DETECTION
===================================================== */

async function findRelatedComplaints(
    category,
    latitude,
    longitude
) {
    if (
        latitude === null ||
        longitude === null ||
        latitude === undefined ||
        longitude === undefined
    ) {
        return [];
    }

    const complaints = await all(
        `
        SELECT *
        FROM complaints
        WHERE category = ?
        AND status NOT IN ('Resolved','Rejected')
        AND created_at >= datetime('now','-48 hours')
        `,
        [category]
    );

    return complaints.filter(function (c) {
        return (
            distanceMeters(
                Number(latitude),
                Number(longitude),
                Number(c.latitude),
                Number(c.longitude)
            ) <= 150
        );
    });
}

/* =====================================================
   ESCALATION
===================================================== */

function calculateEscalation(
    category,
    priority,
    relatedCount
) {
    const config =
        CATEGORY_CONFIG[category] ||
        CATEGORY_CONFIG["Other Civic Problem"];

    if (priority === "Emergency") {
        return {
            level: "Emergency",
            reason:
                "Immediate alert required."
        };
    }

    if (relatedCount >= 10) {
        return {
            level:
                "High Priority Civic Cluster",
            reason:
                `${relatedCount} related complaints detected.`
        };
    }

    if (relatedCount >= 5) {
        return {
            level: "NGO Escalation",
            reason:
                `${relatedCount} related complaints detected.`
        };
    }

    if (relatedCount >= 3) {
        return {
            level: "Warning",
            reason:
                `${relatedCount} related complaints detected.`
        };
    }

    if (relatedCount >= config.threshold) {
        return {
            level:
                "Category Threshold Escalation",
            reason:
                `Category threshold reached: ${config.threshold}.`
        };
    }

    return {
        level: "Normal",
        reason: ""
    };
}

/* =====================================================
   EVENT
===================================================== */

async function addEvent(
    complaintId,
    action,
    oldStatus,
    newStatus,
    note,
    actorId
) {
    await run(
        `
        INSERT INTO complaint_events
        (
            complaint_id,
            action,
            old_status,
            new_status,
            note,
            actor_id,
            created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
            complaintId,
            action,
            oldStatus || null,
            newStatus || null,
            note || "",
            actorId || null,
            new Date().toISOString()
        ]
    );
}

/* =====================================================
   SEED USERS
===================================================== */

async function seedUsers() {
    const users = [
        {
            id: "admin-001",
            name: "Government Admin",
            email: "admin@smartcivic.com",
            mobile: "9999999999",
            password: "admin123",
            role: "admin"
        },

        {
            id: "ngo-001",
            name: "Smart Civic NGO",
            email: "ngo@smartcivic.com",
            mobile: "8888888888",
            password: "ngo123",
            role: "ngo"
        }
    ];

    for (const user of users) {
        const hash =
            bcrypt.hashSync(
                user.password,
                10
            );

        await run(
            `
            INSERT OR IGNORE INTO users
            (
                id,
                name,
                email,
                mobile,
                password_hash,
                role,
                created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            `,
            [
                user.id,
                user.name,
                user.email,
                user.mobile,
                hash,
                user.role,
                new Date().toISOString()
            ]
        );
    }

    console.log("Demo users ready.");
}
/* =====================================================
   EMAIL VERIFICATION OTP
===================================================== */

app.post(
    "/api/auth/send-verification-otp",
    async function (req, res) {
        try {
            const email =
                String(req.body.email || "")
                    .trim()
                    .toLowerCase();

            if (!email) {
                return res.status(400).json({
                    message: "Email is required."
                });
            }

            const existing =
                await get(
                    `
                    SELECT id
                    FROM users
                    WHERE email = ?
                    `,
                    [email]
                );

            if (existing) {
                return res.status(409).json({
                    message:
                        "Email already registered."
                });
            }

            const otp = generateOTP();

            otpStore.set(
                "verify:" + email,
                {
                    otp: otp,
                    expiresAt:
                        Date.now() + 5 * 60 * 1000
                }
            );

            await sendOTPEmail(email, otp, "verify");

            res.json({
                success: true,
                message:
                    "Verification code sent to your email."
            });

        } catch (error) {

            console.error(
                "Email verification OTP error:",
                error
            );

            res.status(500).json({
                message:
                    "Unable to generate verification OTP."
            });
        }
    }
);
/* =====================================================
   VERIFY EMAIL OTP
===================================================== */

app.post(
    "/api/auth/verify-email-otp",
    async function (req, res) {

        try {

            const email =
                String(req.body.email || "")
                    .trim()
                    .toLowerCase();

            const otp =
                String(req.body.otp || "")
                    .trim();

            if (!email || !otp) {

                return res.status(400).json({
                    message:
                        "Email and OTP are required."
                });
            }

            if (!/^\d{6}$/.test(otp)) {

                return res.status(400).json({
                    message:
                        "OTP must be exactly 6 digits."
                });
            }

            const stored =
                otpStore.get(
                    "verify:" + email
                );

            if (!stored) {

                return res.status(400).json({
                    message:
                        "OTP not found or expired."
                });
            }

            if (
                Date.now() >
                stored.expiresAt
            ) {

                otpStore.delete(
                    "verify:" + email
                );

                return res.status(400).json({
                    message:
                        "OTP has expired."
                });
            }

            if (stored.otp !== otp) {

                return res.status(400).json({
                    message:
                        "Invalid OTP."
                });
            }

            otpStore.set(
                "verify:" + email,
                {
                    ...stored,
                    verified: true,
                    verifiedAt: Date.now()
                }
            );

            res.json({
                success: true,
                message:
                    "Email verified successfully."
            });

        } catch (error) {

            console.error(
                "Email OTP verification error:",
                error
            );

            res.status(500).json({
                message:
                    "Email verification failed."
            });
        }
    }
);
/* =====================================================
   REGISTER
===================================================== */

app.post(
    "/api/auth/register",
    async function (req, res) {
        try {
            const {
                name,
                email,
                mobile,
                password
            } = req.body;

            if (
                !name ||
                !email ||
                !password
            ) {
                return res.status(400).json({
                    message:
                        "Name, email and password are required."
                });
            }

            const cleanEmail =
                String(email)
                    .trim()
                    .toLowerCase();

            const existing =
                await get(
                    `
                    SELECT id
                    FROM users
                    WHERE email = ?
                    `,
                    [cleanEmail]
                );

            if (existing) {
                return res.status(409).json({
                    message:
                        "Email already registered."
                });
            }

            const id =
                "citizen-" +
                crypto.randomUUID();

            const hash =
                await bcrypt.hash(
                    password,
                    10
                );

            await run(
                `
                INSERT INTO users
                (
                    id,
                    name,
                    email,
                    mobile,
                    password_hash,
                    role,
                    created_at
                )
                VALUES (?, ?, ?, ?, ?, 'citizen', ?)
                `,
                [
                    id,
                    name.trim(),
                    cleanEmail,
                    mobile || "",
                    hash,
                    new Date().toISOString()
                ]
            );

            res.json({
                success: true,
                message:
                    "Citizen account created successfully."
            });

        } catch (error) {
            console.error(error);

            res.status(500).json({
                message:
                    "Registration failed."
            });
        }
    }
);
/* =====================================================
   FORGOT PASSWORD - SEND OTP
===================================================== */

app.post(
    "/api/auth/forgot-password",
    async function (req, res) {
        try {
            const email =
                String(req.body.email || "")
                    .trim()
                    .toLowerCase();

            if (!email) {
                return res.status(400).json({
                    message: "Email is required."
                });
            }

            const user =
                await get(
                    `
                    SELECT id, name, email
                    FROM users
                    WHERE email = ?
                    `,
                    [email]
                );

            if (!user) {
                return res.status(404).json({
                    message:
                        "No account found with this email."
                });
            }

            const otp = generateOTP();

            otpStore.set(email, {
                otp: otp,
                expiresAt:
                    Date.now() + 5 * 60 * 1000
            });

            await sendOTPEmail(email, otp, "reset");
            res.json({
                success: true,
                message:
                    "Password reset code sent to your email."
            });

        } catch (error) {
            console.error(
                "Forgot password error:",
                error
            );

            res.status(500).json({
                message:
                    "Unable to send OTP."
            });
        }
    }
);
/* =====================================================
   VERIFY OTP
===================================================== */

app.post(
    "/api/auth/verify-otp",
    async function (req, res) {
        try {
            const email =
                String(req.body.email || "")
                    .trim()
                    .toLowerCase();

            const otp =
                String(req.body.otp || "").trim();

            if (!email || !otp) {
                return res.status(400).json({
                    message:
                        "Email and OTP are required."
                });
            }

            const stored =
                otpStore.get(email);

            if (!stored) {
                return res.status(400).json({
                    message:
                        "OTP not found or expired."
                });
            }

            if (
                Date.now() >
                stored.expiresAt
            ) {
                otpStore.delete(email);

                return res.status(400).json({
                    message:
                        "OTP has expired."
                });
            }

            if (stored.otp !== otp) {
                return res.status(400).json({
                    message:
                        "Invalid OTP."
                });
            }

            otpStore.set(email, {
                ...stored,
                verified: true,
                verifiedAt: Date.now()
            });

            res.json({
                success: true,
                message:
                    "OTP verified successfully."
            });

        } catch (error) {
            console.error(error);

            res.status(500).json({
                message:
                    "OTP verification failed."
            });
        }
    }
);
/* =====================================================
   RESET PASSWORD
===================================================== */

app.post(
    "/api/auth/reset-password",
    async function (req, res) {
        try {
            const email =
                String(req.body.email || "")
                    .trim()
                    .toLowerCase();

            const newPassword =
                String(req.body.newPassword || "");

            if (!email || !newPassword) {
                return res.status(400).json({
                    message:
                        "Email and new password are required."
                });
            }

            if (newPassword.length < 6) {
                return res.status(400).json({
                    message:
                        "Password must be at least 6 characters."
                });
            }

            const stored =
                otpStore.get(email);

            if (
                !stored ||
                stored.verified !== true
            ) {
                return res.status(400).json({
                    message:
                        "Please verify OTP first."
                });
            }

            if (
                Date.now() >
                stored.expiresAt
            ) {
                otpStore.delete(email);

                return res.status(400).json({
                    message:
                        "OTP verification has expired."
                });
            }

            const user =
                await get(
                    `
                    SELECT id
                    FROM users
                    WHERE email = ?
                    `,
                    [email]
                );

            if (!user) {
                return res.status(404).json({
                    message:
                        "User not found."
                });
            }

            const passwordHash =
                await bcrypt.hash(
                    newPassword,
                    10
                );

            await run(
                `
                UPDATE users
                SET password_hash = ?
                WHERE email = ?
                `,
                [
                    passwordHash,
                    email
                ]
            );

            otpStore.delete(email);

            res.json({
                success: true,
                message:
                    "Password reset successfully. You can now login."
            });

        } catch (error) {
            console.error(
                "Reset password error:",
                error
            );

            res.status(500).json({
                message:
                    "Password reset failed."
            });
        }
    }
);

/* =====================================================
   LOGIN
===================================================== */

app.post(
    "/api/auth/login",
    async function (req, res) {
        try {
            const {
                email,
                password
            } = req.body;

            const user =
                await get(
                    `
                    SELECT *
                    FROM users
                    WHERE email = ?
                    `,
                    [
                        String(email || "")
                            .trim()
                            .toLowerCase()
                    ]
                );

            if (!user) {
                return res.status(401).json({
                    message:
                        "Invalid email or password."
                });
            }

            const valid =
                await bcrypt.compare(
                    password,
                    user.password_hash
                );

            if (!valid) {
                return res.status(401).json({
                    message:
                        "Invalid email or password."
                });
            }

            const token =
                createToken(user);

            res.json({
                token,

                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    mobile: user.mobile,
                    role: user.role
                }
            });

        } catch (error) {
            console.error(error);

            res.status(500).json({
                message:
                    "Login failed."
            });
        }
    }
);

/* =====================================================
   CURRENT USER
===================================================== */

app.get(
    "/api/auth/me",
    auth,
    async function (req, res) {
        try {
            const user =
                await get(
                    `
                    SELECT
                        id,
                        name,
                        email,
                        mobile,
                        role,
                        created_at
                    FROM users
                    WHERE id = ?
                    `,
                    [req.user.id]
                );

            if (!user) {
                return res.status(404).json({
                    message:
                        "User not found."
                });
            }

            res.json(user);

        } catch (error) {
            console.error(error);

            res.status(500).json({
                message:
                    "Unable to get user."
            });
        }
    }
);

/* =====================================================
   CREATE COMPLAINT
===================================================== */

app.post(
    "/api/complaints",
    auth,
    requireRole("citizen"),
    upload.single("photo"),
    async function (req, res) {
        try {
            const {
                category,
                title,
                description,
                latitude,
                longitude,
                areaName,
                anonymous
            } = req.body;

            if (
                !category ||
                !title ||
                !description
            ) {
                return res.status(400).json({
                    message:
                        "Category, title and description are required."
                });
            }

            const user =
                await get(
                    `
                    SELECT *
                    FROM users
                    WHERE id = ?
                    `,
                    [req.user.id]
                );

            if (!user) {
                return res.status(404).json({
                    message:
                        "Citizen account not found."
                });
            }

            const ai =
                classifyComplaint(
                    description,
                    title,
                    category
                );

            const config =
                CATEGORY_CONFIG[ai.category] ||
                CATEGORY_CONFIG[
                    "Other Civic Problem"
                ];

            let priority =
                ai.severity;

            if (
                category ===
                "Dangerous / Fallen Electrical Wire"
            ) {
                priority = "Emergency";
            }

            const lat =
                latitude !== undefined &&
                latitude !== ""
                    ? Number(latitude)
                    : null;

            const lon =
                longitude !== undefined &&
                longitude !== ""
                    ? Number(longitude)
                    : null;

            const related =
                await findRelatedComplaints(
                    ai.category,
                    lat,
                    lon
                );

            const duplicateCount =
                related.length + 1;

            const duplicateGroup =
                related.length > 0
                    ? (
                        related[0]
                            .duplicate_group_id ||
                        related[0].id
                    )
                    : crypto.randomUUID();

            const escalation =
                calculateEscalation(
                    ai.category,
                    priority,
                    duplicateCount
                );

            const deadline =
                calculateDeadline(
                    config.sla
                );

            const id =
                "SC-" +
                Date.now() +
                "-" +
                Math.floor(
                    Math.random() * 1000
                );

            const photoUrl =
                req.file
                    ? "/uploads/" +
                      req.file.filename
                    : "";

            const now =
                new Date().toISOString();

            await run(
                `
                INSERT INTO complaints
                (
                    id,
                    user_id,
                    citizen_name,
                    category,
                    title,
                    description,
                    latitude,
                    longitude,
                    area_name,
                    priority,
                    department,
                    assigned_officer,
                    status,
                    sla_hours,
                    deadline,
                    escalation_level,
                    escalation_reason,
                    duplicate_group_id,
                    duplicate_count,
                    ai_category,
                    ai_severity,
                    ai_confidence,
                    ai_summary,
                    photo_url,
                    created_at,
                    updated_at
                )
                VALUES
                (
                    ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?, ?,
                    'Submitted',
                    ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?,
                    ?, ?
                )
                `,
                [
                    id,
                    user.id,

                    anonymous === "true"
                        ? "Anonymous Citizen"
                        : user.name,

                    ai.category,

                    title.trim(),

                    description.trim(),

                    lat,
                    lon,

                    areaName ||
                        "Location not specified",

                    priority,

                    config.department,

                    "Pending Assignment",

                    config.sla,

                    deadline,

                    escalation.level,

                    escalation.reason,

                    duplicateGroup,

                    duplicateCount,

                    ai.category,

                    ai.severity,

                    ai.confidence,

                    ai.summary,

                    photoUrl,

                    now,
                    now
                ]
            );

            await addEvent(
                id,
                "Complaint Submitted",
                null,
                "Submitted",
                "Complaint created.",
                user.id
            );

            for (const c of related) {
                await run(
                    `
                    UPDATE complaints
                    SET
                        duplicate_group_id = ?,
                        duplicate_count = ?,
                        updated_at = ?
                    WHERE id = ?
                    `,
                    [
                        duplicateGroup,
                        duplicateCount,
                        new Date().toISOString(),
                        c.id
                    ]
                );
            }

            const photoAnalysis =
                req.file
                    ? analyzePhotoDemo(
                        ai.category,
                        description
                    )
                    : null;

            const complaint =
                await get(
                    `
                    SELECT *
                    FROM complaints
                    WHERE id = ?
                    `,
                    [id]
                );

            res.status(201).json({
                complaint,

                intelligence: {
                    classification: ai,
                    photoAnalysis,
                    relatedComplaints:
                        duplicateCount,
                    escalation,
                    department:
                        config.department,
                    slaHours:
                        config.sla
                }
            });

        } catch (error) {
            console.error(error);

            res.status(500).json({
                message:
                    error.message ||
                    "Complaint submission failed."
            });
        }
    }
);

/* =====================================================
   CITIZEN COMPLAINTS
===================================================== */

app.get(
    "/api/complaints/my",
    auth,
    requireRole("citizen"),
    async function (req, res) {
        try {
            const rows =
                await all(
                    `
                    SELECT *
                    FROM complaints
                    WHERE user_id = ?
                    ORDER BY created_at DESC
                    `,
                    [req.user.id]
                );

            res.json(rows);

        } catch (error) {
            console.error(error);

            res.status(500).json({
                message:
                    "Unable to load complaints."
            });
        }
    }
);

/* =====================================================
   ALL COMPLAINTS
===================================================== */

app.get(
    "/api/complaints",
    auth,
    requireRole("admin", "ngo"),
    async function (req, res) {
        try {
            const rows =
                await all(
                    `
                    SELECT *
                    FROM complaints
                    ORDER BY
                        CASE
                            WHEN priority = 'Emergency'
                            THEN 0
                            ELSE 1
                        END,
                        created_at DESC
                    `
                );

            res.json(rows);

        } catch (error) {
            console.error(error);

            res.status(500).json({
                message:
                    "Unable to load complaints."
            });
        }
    }
);

/* =====================================================
   COMPLAINT DETAIL
===================================================== */

app.get(
    "/api/complaints/:id",
    auth,
    async function (req, res) {
        try {
            const complaint =
                await get(
                    `
                    SELECT *
                    FROM complaints
                    WHERE id = ?
                    `,
                    [req.params.id]
                );

            if (!complaint) {
                return res.status(404).json({
                    message:
                        "Complaint not found."
                });
            }

            if (
                req.user.role === "citizen" &&
                complaint.user_id !==
                    req.user.id
            ) {
                return res.status(403).json({
                    message:
                        "Access denied."
                });
            }

            const events =
                await all(
                    `
                    SELECT *
                    FROM complaint_events
                    WHERE complaint_id = ?
                    ORDER BY created_at ASC
                    `,
                    [req.params.id]
                );

            res.json({
                complaint,
                events
            });

        } catch (error) {
            console.error(error);

            res.status(500).json({
                message:
                    "Unable to load complaint."
            });
        }
    }
);

/* =====================================================
   ADMIN STATUS UPDATE
===================================================== */

app.patch(
    "/api/complaints/:id/status",
    auth,
    requireRole("admin"),
    upload.fields([
        {
            name: "beforePhoto",
            maxCount: 1
        },
        {
            name: "afterPhoto",
            maxCount: 1
        }
    ]),
    async function (req, res) {
        try {
            const complaint =
                await get(
                    `
                    SELECT *
                    FROM complaints
                    WHERE id = ?
                    `,
                    [req.params.id]
                );

            if (!complaint) {
                return res.status(404).json({
                    message:
                        "Complaint not found."
                });
            }

            const newStatus =
                req.body.status;

            if (
                !STATUS_LIST.includes(
                    newStatus
                )
            ) {
                return res.status(400).json({
                    message:
                        "Invalid status."
                });
            }

            const oldStatus =
                complaint.status;

            let beforeUrl =
                complaint.before_photo_url;

            let afterUrl =
                complaint.after_photo_url;

            if (
                req.files &&
                req.files.beforePhoto
            ) {
                beforeUrl =
                    "/uploads/" +
                    req.files
                        .beforePhoto[0]
                        .filename;
            }

            if (
                req.files &&
                req.files.afterPhoto
            ) {
                afterUrl =
                    "/uploads/" +
                    req.files
                        .afterPhoto[0]
                        .filename;
            }

            let resolvedAt =
                complaint.resolved_at;

            if (
                newStatus === "Resolved"
            ) {
                resolvedAt =
                    new Date().toISOString();
            }

            if (
                newStatus === "Reopened"
            ) {
                resolvedAt = null;
            }

            await run(
                `
                UPDATE complaints
                SET
                    status = ?,
                    assigned_officer = ?,
                    before_photo_url = ?,
                    after_photo_url = ?,
                    resolution_note = ?,
                    resolved_at = ?,
                    updated_at = ?
                WHERE id = ?
                `,
                [
                    newStatus,

                    req.body.assignedOfficer ||
                        complaint.assigned_officer,

                    beforeUrl,

                    afterUrl,

                    req.body.resolutionNote ||
                        complaint.resolution_note,

                    resolvedAt,

                    new Date().toISOString(),

                    complaint.id
                ]
            );

            await addEvent(
                complaint.id,
                "Status Updated",
                oldStatus,
                newStatus,
                req.body.resolutionNote ||
                    "",
                req.user.id
            );

            const updated =
                await get(
                    `
                    SELECT *
                    FROM complaints
                    WHERE id = ?
                    `,
                    [complaint.id]
                );

            res.json(updated);

        } catch (error) {
            console.error(error);

            res.status(500).json({
                message:
                    "Status update failed."
            });
        }
    }
);

/* =====================================================
   CITIZEN REOPEN
===================================================== */

app.post(
    "/api/complaints/:id/reopen",
    auth,
    requireRole("citizen"),
    async function (req, res) {
        try {
            const complaint =
                await get(
                    `
                    SELECT *
                    FROM complaints
                    WHERE id = ?
                    `,
                    [req.params.id]
                );

            if (!complaint) {
                return res.status(404).json({
                    message:
                        "Complaint not found."
                });
            }

            if (
                complaint.user_id !==
                req.user.id
            ) {
                return res.status(403).json({
                    message:
                        "Access denied."
                });
            }

            if (
                complaint.status !==
                "Resolved"
            ) {
                return res.status(400).json({
                    message:
                        "Only resolved complaints can be reopened."
                });
            }

            await run(
                `
                UPDATE complaints
                SET
                    status = 'Reopened',
                    updated_at = ?
                WHERE id = ?
                `,
                [
                    new Date().toISOString(),
                    complaint.id
                ]
            );

            await addEvent(
                complaint.id,
                "Citizen Dispute",
                "Resolved",
                "Reopened",
                req.body.reason ||
                    "Citizen disputed resolution.",
                req.user.id
            );

            res.json({
                success: true,
                message:
                    "Complaint reopened successfully."
            });

        } catch (error) {
            console.error(error);

            res.status(500).json({
                message:
                    "Unable to reopen complaint."
            });
        }
    }
);

/* =====================================================
   NGO ACTION
===================================================== */

app.post(
    "/api/complaints/:id/ngo-action",
    auth,
    requireRole("ngo"),
    upload.single("evidence"),
    async function (req, res) {
        try {
            const complaint =
                await get(
                    `
                    SELECT *
                    FROM complaints
                    WHERE id = ?
                    `,
                    [req.params.id]
                );

            if (!complaint) {
                return res.status(404).json({
                    message:
                        "Complaint not found."
                });
            }

            const evidence =
                req.file
                    ? "/uploads/" +
                      req.file.filename
                    : complaint.ngo_evidence_url;

            const now =
                new Date().toISOString();

            await run(
                `
                UPDATE complaints
                SET
                    ngo_status = ?,
                    ngo_remarks = ?,
                    ngo_action_date = ?,
                    ngo_evidence_url = ?,
                    updated_at = ?
                WHERE id = ?
                `,
                [
                    req.body.status ||
                        "NGO Investigating",

                    req.body.remarks ||
                        "",

                    now,

                    evidence,

                    now,

                    complaint.id
                ]
            );

            await addEvent(
                complaint.id,
                "NGO Action",
                complaint.status,
                complaint.status,
                req.body.remarks ||
                    "NGO action recorded.",
                req.user.id
            );

            res.json({
                success: true,
                message:
                    "NGO action recorded."
            });

        } catch (error) {
            console.error(error);

            res.status(500).json({
                message:
                    "NGO action failed."
            });
        }
    }
);

/* =====================================================
   ANALYTICS
===================================================== */

app.get(
    "/api/analytics",
    auth,
    requireRole("admin"),
    async function (req, res) {
        try {
            const totalRow =
                await get(
                    `
                    SELECT COUNT(*) AS count
                    FROM complaints
                    `
                );

            const resolvedRow =
                await get(
                    `
                    SELECT COUNT(*) AS count
                    FROM complaints
                    WHERE status = 'Resolved'
                    `
                );

            const pendingRow =
                await get(
                    `
                    SELECT COUNT(*) AS count
                    FROM complaints
                    WHERE status NOT IN
                    ('Resolved','Rejected')
                    `
                );

            const emergencyRow =
                await get(
                    `
                    SELECT COUNT(*) AS count
                    FROM complaints
                    WHERE priority = 'Emergency'
                    AND status NOT IN
                    ('Resolved','Rejected')
                    `
                );

            const breachedRow =
                await get(
                    `
                    SELECT COUNT(*) AS count
                    FROM complaints
                    WHERE deadline < ?
                    AND status NOT IN
                    ('Resolved','Rejected')
                    `,
                    [new Date().toISOString()]
                );

            const ngoRow =
                await get(
                    `
                    SELECT COUNT(*) AS count
                    FROM complaints
                    WHERE ngo_status IS NOT NULL
                    `
                );

            const categories =
                await all(
                    `
                    SELECT
                        category,
                        COUNT(*) AS count
                    FROM complaints
                    GROUP BY category
                    ORDER BY count DESC
                    `
                );

            const areas =
                await all(
                    `
                    SELECT
                        COALESCE(
                            area_name,
                            'Unknown'
                        ) AS area,
                        COUNT(*) AS count
                    FROM complaints
                    GROUP BY area_name
                    ORDER BY count DESC
                    LIMIT 10
                    `
                );

            const total =
                totalRow.count;

            const resolved =
                resolvedRow.count;

            res.json({
                total,
                resolved,
                pending:
                    pendingRow.count,
                emergency:
                    emergencyRow.count,
                breached:
                    breachedRow.count,

                ngoEscalated:
                    ngoRow.count,

                resolutionRate:
                    total
                        ? Math.round(
                            resolved /
                            total *
                            100
                        )
                        : 0,

                categories,
                areas
            });

        } catch (error) {
            console.error(error);

            res.status(500).json({
                message:
                    "Analytics failed."
            });
        }
    }
);

/* =====================================================
   MAP DATA
===================================================== */

app.get(
    "/api/map",
    auth,
    requireRole("admin"),
    async function (req, res) {
        try {
            const rows =
                await all(
                    `
                    SELECT
                        id,
                        category,
                        title,
                        priority,
                        status,
                        latitude,
                        longitude,
                        area_name,
                        duplicate_count,
                        escalation_level
                    FROM complaints
                    WHERE latitude IS NOT NULL
                    AND longitude IS NOT NULL
                    `
                );

            res.json(rows);

        } catch (error) {
            console.error(error);

            res.status(500).json({
                message:
                    "Map data failed."
            });
        }
    }
);

/* =====================================================
   SLA CHECK
===================================================== */

async function runSLACheck() {
    try {
        const now =
            new Date().toISOString();

        await run(
            `
            UPDATE complaints
            SET
                escalation_level =
                    CASE
                        WHEN priority = 'Emergency'
                        THEN 'Emergency'
                        ELSE 'SLA Breached'
                    END,

                escalation_reason =
                    CASE
                        WHEN priority = 'Emergency'
                        THEN 'Immediate alert required.'
                        ELSE 'SLA deadline exceeded.'
                    END,

                updated_at = ?

            WHERE deadline < ?
            AND status NOT IN
            ('Resolved','Rejected')
            `,
            [now, now]
        );

    } catch (error) {
        console.error(
            "SLA check error:",
            error.message
        );
    }
}

setInterval(
    runSLACheck,
    60 * 1000
);

/* =====================================================
   HEALTH
===================================================== */

app.get(
    "/api/health",
    function (req, res) {
        res.json({
            success: true,
            service:
                "SmartCivic Backend",
            time:
                new Date().toISOString()
        });
    }
);

/* =====================================================
   FRONTEND FALLBACK
===================================================== */

app.get(
    "*",
    function (req, res) {
        res.sendFile(
            path.join(
                PUBLIC_DIR,
                "index.html"
            )
        );
    }
);

/* =====================================================
   ERROR HANDLER
===================================================== */

app.use(
    function (err, req, res, next) {
        console.error(err);

        res.status(500).json({
            message:
                err.message ||
                "Server error."
        });
    }
);

/* =====================================================
   START SERVER
===================================================== */

async function startServer() {
    try {
        await initializeDatabase();
        await seedUsers();
        await runSLACheck();

        app.listen(
            PORT,
            function () {
                console.log("");
                console.log(
                    "================================="
                );
                console.log(
                    `SmartCivic running at http://localhost:${PORT}`
                );
                console.log(
                    "================================="
                );
                console.log(
                    "Admin:"
                );
                console.log(
                    "admin@smartcivic.com / admin123"
                );
                console.log("");
                console.log(
                    "NGO:"
                );
                console.log(
                    "ngo@smartcivic.com / ngo123"
                );
                console.log(
                    "================================="
                );
            }
        );

    } catch (error) {
        console.error(
            "Server startup failed:",
            error
        );
    }
}

startServer();
