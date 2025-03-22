import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import usersCollection from "../models/userModel.js";

const router = express.Router();

router.post("/signup", async (req, res) => {
    const { name, email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    await usersCollection.insertOne({ name, email, password: hashedPassword });
    res.json({ message: "User registered successfully" });
});

router.post("/login", async (req, res) => {
    const { email, password } = req.body;
    const user = await usersCollection.findOne({ email });

    if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "1h" });
    res.json({ token });
});

export default router;
