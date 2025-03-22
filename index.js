require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");


const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const fs = require("fs"); // File system module (built-in)
const PDFDocument = require("pdfkit"); // For generating PDFs
const { Parser } = require("json2csv"); // For converting JSON to CSV
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const nodemailer = require("nodemailer");

const app = express();
const port = process.env.PORT || 5000;



// dotenv.config();





// middleware
app.use(cors());
app.use(express.json());
app.use(helmet());



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.gvvjm.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
});

async function run() {
    try {

        const db = client.db("cms")
        // const usersCollection = client.db("cms").collection("users");


        const employeesCollection = client.db("cms").collection("employee");
        const contactsCollection = client.db("cms").collection("contacts");

        app.post("/api/login", async (req, res) => {
            const { email, password, rememberMe } = req.body;

            if (!email || !password) return res.status(400).json({ message: "Email and Password are required" });

            try {
                const user = await db.collection("users").findOne({ email });
                if (!user) return res.status(401).json({ message: "Invalid Credentials" });

                const isMatch = await bcrypt.compare(password, user.password);
                if (!isMatch) return res.status(401).json({ message: "Invalid Credentials" });

                const tokenExpiry = rememberMe ? "7d" : "24h"; // Remember Me: 7 days, Otherwise: 1 hour
                const token = jwt.sign({ id: user._id, email: user.email }, "c8d996142b8c1cca52ba95861637de7e53f21e1b4f4584e193acea16af41725b716cedecbd749922c08b245415ec9055568c2053405e80db6fb288e895d7d1f1", { expiresIn: tokenExpiry });


                res.status(200).json({ message: "Login successful", token, user: { fullName: user.fullName, email: user.email } });
            } catch (err) {

                res.status(500).json({ message: "Internal Server Error" });
            }
        });



        app.post("/api/signup", async (req, res) => {
            const { fullName, email, password } = req.body;

            if (!fullName || !email || !password) {
                return res.status(400).json({ message: "All fields are required" });
            }

            try {

                const usersCollection = db.collection("users");

                // Check if email already exists
                const existingUser = await usersCollection.findOne({ email });
                if (existingUser) {
                    return res.status(400).json({ message: "Email already exists" });
                }

                // Hash password
                const hashedPassword = await bcrypt.hash(password, 10);

                // Store new user in MongoDB
                const newUser = { fullName, email, password: hashedPassword, createdAt: new Date() };
                await usersCollection.insertOne(newUser);
                const token = jwt.sign({ email: newUser.email }, "c8d996142b8c1cca52ba95861637de7e53f21e1b4f4584e193acea16af41725b716cedecbd749922c08b245415ec9055568c2053405e80db6fb288e895d7d1f1", { expiresIn: "24h" });
                // res.status(201).json({ message: "User registered successfully" });
                res.status(201).json({
                    message: "User registered successfully",
                    token,
                    user: { fullName: newUser.fullName, email: newUser.email }
                });
            } catch (error) {
                console.error("Signup error:", error);
                res.status(500).json({ message: "Server error" });
            }
        });


        app.post("/api/contact", async (req, res) => {
            const { fullName, email, message, } = req.body;

            const contact = { fullName, email, message, createdAt: new Date() };

            // console.log("69", contact)
            const result = await contactsCollection.insertOne(contact);
            await sendEmailWithPDF(contact);

            res.status(200).json({ message: "Message submitted successfully", id: result.insertedId });
        });

        // Send Email with PDF
        const sendEmailWithPDF = async (contact) => {
            // console.log(contact)
            const doc = new PDFDocument();
            doc.text(`Name: ${contact?.fullName}\nEmail: ${contact.email}\nMessage: ${contact.message}`);

            const buffers = [];
            doc.on("data", buffers.push.bind(buffers));
            doc.on("end", async () => {
                const pdfBuffer = Buffer.concat(buffers);

                const transporter = nodemailer.createTransport({
                    service: "Gmail",
                    auth: { user: "razu01.ph@gmail.com", pass: "ojixfnfshpdltxew" }
                });


                await transporter.sendMail({
                    // from: "razubiswas114@gmail.com",
                    to: "razu01.ph@gmail.com",
                    subject: "New Contact Us Submission",
                    text: "A new contact form submission has been received.",
                    attachments: [{ filename: "contact.pdf", content: pdfBuffer }]
                });
            });

            doc.end();
        };






        app.get("/api/employees", async (req, res) => {
            try {
                const { page = 1, limit = 10, search = "" } = req.query;
                let searchQuery = {};

                // Only filter if search term is provided
                if (search) {
                    searchQuery = {
                        $or: [
                            { name: { $regex: search, $options: "i" } },
                            { email: { $regex: search, $options: "i" } },
                            { department: { $regex: search, $options: "i" } },
                            { designation: { $regex: search, $options: "i" } }
                        ],
                    };
                }

                const totalRecords = await employeesCollection.countDocuments(searchQuery);
                const employees = await employeesCollection
                    .find(searchQuery)
                    .skip((page - 1) * limit)
                    .limit(parseInt(limit))
                    .toArray();

                // console.log(employees)
                res.status(200).json({
                    totalRecords,
                    totalPages: Math.ceil(totalRecords / limit),
                    currentPage: Number(page),
                    employees,
                });
            } catch (err) {
                res.status(500).json({ error: "Failed to fetch employees" });
            }
        });



        /**
        * 📌 DELETE Employee
        // * @param {id} - Employee ID
        */
        app.delete("/api/employees/:id", async (req, res) => {
            try {
                const result = await employeesCollection.deleteOne({
                    _id: new ObjectId(req.params.id),
                });

                if (result.deletedCount === 0) {
                    return res.status(404).json({ error: "Employee not found" });
                }

                res.status(200).json({ message: "Employee deleted successfully" });
            } catch (err) {
                res.status(500).json({ error: "Error deleting employee" });
            }
        });



        //contacts list

        app.get("/api/contactsList", async (req, res) => {
            try {
                const { page = 1, limit = 10, search = "" } = req.query;
                let searchQuery = {};

                // Only filter if search term is provided
                if (search) {
                    searchQuery = {
                        $or: [
                            { name: { $regex: search, $options: "i" } },
                            { email: { $regex: search, $options: "i" } },

                        ],
                    };
                }

                const totalRecords = await contactsCollection.countDocuments(searchQuery);
                const contacts = await contactsCollection
                    .find(searchQuery)
                    .skip((page - 1) * limit)
                    .limit(parseInt(limit))
                    .toArray();


                res.status(200).json({
                    totalRecords,
                    totalPages: Math.ceil(totalRecords / limit),
                    currentPage: Number(page),
                    contacts,
                });
            } catch (err) {
                res.status(500).json({ error: "Failed to fetch contacts" });
            }
        });



        /**
        * 📌 DELETE Contacts single data 
       
        */
        app.delete("/api/contact/:id", async (req, res) => {
            try {
                const result = await contactsCollection.deleteOne({
                    _id: new ObjectId(req.params.id),
                });

                if (result.deletedCount === 0) {
                    return res.status(404).json({ error: "Contact not found" });
                }

                res.status(200).json({ message: "Contact deleted successfully" });
            } catch (err) {
                res.status(500).json({ error: "Error deleting contact" });
            }
        });







        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log(
            "Pinged your deployment. You successfully connected to MongoDB!"
        );
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);

app.get("/", (req, res) => {
    res.send("CMS SERVER IS RUNNING");
});

app.listen(port, () => {
    console.log(`listening on port ${port}`);
});






