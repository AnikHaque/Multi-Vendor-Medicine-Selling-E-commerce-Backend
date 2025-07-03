const express = require("express");
require('dotenv').config();
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY); 

const app = express();
const port = 8800;

const JWT_SECRET = process.env.jwt_secret;


app.use(express.json());
app.use(cors());

const uri =
  "mongodb+srv://freelance:SJ5HW66Mk5XOobot@cluster0.ahhvv5a.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(403).send("Unauthorized");
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).send("Invalid token");
  }
}

async function run() {
  try {
    const db = client.db("freelance-marketplace");
const users = db.collection("users");
  const categories = db.collection("categories");
const medicines = db.collection("medicines");


// Create a new medicine category
app.post("/api/categories", verifyToken, async (req, res) => {
  const { category, image } = req.body;
  if (!category) return res.status(400).json({ message: "Category name is required" });

  try {
    const existing = await categories.findOne({ category });
    if (existing) return res.status(409).json({ message: "Category already exists" });
    const result = await categories.insertOne({ category, image: image || "" });
    res.status(201).json({ message: "Category created",  });
  } catch (error) {
    console.error("Error creating category:", error);
    res.status(500).json({ message: "Error creating category" });
  }
});

// Get all categories with medicine count 
app.get("/api/categories", async (req, res) => {
  try {
    const data = await categories
      .aggregate([
        {
          $lookup: {
            from: "medicines",
            localField: "category",
            foreignField: "category",
            as: "medicines",
          },
        },
        {
          $addFields: {
            count: { $size: "$medicines" },
          },
        },
        {
          $project: {
            medicines: 0, 
          },
        },
      ])
      .toArray();

    res.json(data); 
  } catch (err) {
    console.error("Failed to fetch categories:", err);
    res.status(500).json({ message: "Failed to fetch categories" });
  }
});

// Update category
app.put("/api/categories/:id", verifyToken, async (req, res) => {
  const { id } = req.params;
  const { category, image } = req.body;
  if (!category) return res.status(400).json({ message: "Category name required" });
  try {
    await categories.updateOne(
      { _id: new ObjectId(id) },
      { $set: { category, image: image || "" } }
    );
    res.json({ message: "Category updated" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to update category" });
  }
});

// Delete category 
app.delete("/api/categories/:id", verifyToken, async (req, res) => {
  const { id } = req.params;
  try {
    await categories.deleteOne({ _id: new ObjectId(id) });
    res.json({ message: "Category deleted" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to delete category" });
  }
});


    // Other routes and logic...
  } catch (err) {
    console.error("❌ Error connecting to MongoDB:", err);
  }
}

run().catch(console.dir);

// 🌐 Root route to check DB connection
app.get("/", async (req, res) => {
  try {
    await client.db("admin").command({ ping: 1 });
    res.send(" MongoDB is connected. Server is running on port " + port);
  } catch (error) {
    res.status(500).send(" MongoDB connection failed: " + error.message);
  }
});

// 🚀 Start the server
app.listen(port, () => {
  console.log(`🚀 Server is running on http://localhost:${port}`);
});
