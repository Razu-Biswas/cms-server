import express from "express";
import db from "../config/db.js";
import nodemailer from "nodemailer";
import pdfkit from "pdfkit";

const router = express.Router();
const contactsCollection = db.collection("contacts");

router.post("/", async (req, res) => {
    const { name, email, message } = req.body;

    const doc = new pdfkit();
    doc.text(`Name: ${name}\nEmail: ${email}\nMessage: ${message}`);
    doc.end();

    const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: process.env.EMAIL, pass: process.env.EMAIL_PASSWORD },
    });

    const mailOptions = {
        from: process.env.EMAIL,
        to: "md@nusaiba.com.bd",
        subject: "New Contact Submission",
        text: `Name: ${name}\nEmail: ${email}\nMessage: ${message}`,
        attachments: [{ filename: "contact.pdf", content: doc }],
    };

    await transporter.sendMail(mailOptions);
    await contactsCollection.insertOne({ name, email, message });

    res.json({ message: "Contact submitted successfully" });
});

export default router;
