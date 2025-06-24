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

// Medicine create 
app.post("/api/medicines", verifyToken, async (req, res) => {
  const {
    name,
    genericName,
    description,
    image,
    category,
    company,
    unit,
    price,
    discount = 0,
  } = req.body;

  if (!name || !category || !company || !unit || price == null) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {
    const sellerEmail = req.user.email;

    const newMedicine = {
      name,
      genericName,
      description: description || "",
      image: image || "",
      category,
      company,
      unit,
      price,
      discount,
      sellerEmail,
      isBanner: false,
      createdAt: new Date(),
    };

    await medicines.insertOne(newMedicine);
    res.status(201).json({ message: "Medicine added successfully" });
  } catch (error) {
    console.error("Error adding medicine:", error);
    res.status(500).json({ message: "Failed to add medicine" });
  }
});

// Get all medicines
app.get("/api/medicines", async (req, res) => {
  try {
    const allMedicines = await client
      .db("freelance-marketplace")
      .collection("medicines")
      .find()
      .toArray();

    res.status(200).json(allMedicines);
  } catch (error) {
    console.error("Error fetching all medicines:", error);
    res.status(500).json({ message: "Error fetching medicines" });
  }
});

// Get my medicines 
app.get("/api/my-medicines", verifyToken, async (req, res) => {
  try {
    const email = req.user.email;
    const sellerMeds = await medicines.find({ sellerEmail: email }).toArray();
    res.json(sellerMeds);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch seller medicines" });
  }
});

// seller payment 
app.get("/api/seller-payments", verifyToken, async (req, res) => {
  const sellerEmail = req.user.email;

  try {
    const sellerOrders = await orders.aggregate([
      { $unwind: "$line_items" },
      {
        $lookup: {
          from: "medicines",
          localField: "line_items.medicineId",
          foreignField: "_id",
          as: "medicineDetails"
        }
      },
      { $unwind: "$medicineDetails" },
      {
        $match: {
          "medicineDetails.sellerEmail": sellerEmail
        }
      },
      {
        $project: {
          _id: 0,
          medicineName: "$medicineDetails.name",
          buyerEmail: "$userEmail",
          quantity: "$line_items.quantity",
          amount: "$line_items.amount",
          payment_status: 1,
          status: 1,
          createdAt: 1
        }
      },
      { $sort: { createdAt: -1 } }
    ]).toArray();

    res.json(sellerOrders);
  } catch (error) {
    console.error("Error fetching seller payments:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// GET medicines by category
app.get("/api/medicines/category/:category", async (req, res) => {
  const { category } = req.params;
  try {
    const medicinesList = await db.collection("medicines")
      .find({ category })
      .toArray();
    res.status(200).json(medicinesList);
  } catch (error) {
    console.error("Error fetching medicines by category:", error);
    res.status(500).json({ message: "Error fetching medicines" });
  }
});

// PUT /api/medicines/:id/toggle-banner
app.put("/api/medicines/:id/toggle-banner", verifyToken,  async (req, res) => {
  const { id } = req.params;

  try {
    const medicine = await medicines.findOne({ _id: new ObjectId(id) });
    if (!medicine) return res.status(404).json({ message: "Medicine not found" });

    const updated = await medicines.updateOne(
      { _id: new ObjectId(id) },
      { $set: { isBanner: !medicine.isBanner } }
    );

    res.status(200).json({ message: `Banner status updated`, isBanner: !medicine.isBanner });
  } catch (err) {
    res.status(500).json({ message: "Failed to update banner status" });
  }
});

// GET /api/medicines/banner
app.get("/api/medicines/banner", async (req, res) => {
  try {
    const banners = await medicines.find({ isBanner: true }).toArray();
    res.status(200).json(banners);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch banner medicines" });
  }
});

app.post("/api/advertise", verifyToken, async (req, res) => {
  const { medicineId, image, description } = req.body;
  const sellerEmail = req.user.email;

  if (!medicineId || !image || !description) {
    return res.status(400).json({ message: "All fields are required." });
  }

  try {
    const ad = {
      sellerEmail,
      medicineId: new ObjectId(medicineId),
      image,
      description,
      approved: false,
      createdAt: new Date(),
    };

    const result = await client.db("freelance-marketplace").collection("advertisements").insertOne(ad);
    res.status(201).json({ message: "Advertisement request submitted", ad: result });
  } catch (error) {
    console.error("Error submitting ad:", error);
    res.status(500).json({ message: "Error submitting advertisement" });
  }
});

app.get("/api/advertise/mine", verifyToken, async (req, res) => {
  try {
    const ads = await client
      .db("freelance-marketplace")
      .collection("advertisements")
      .find({ sellerEmail: req.user.email })
      .toArray();

    res.json(ads);
  } catch (err) {
    res.status(500).json({ message: "Error fetching advertisements" });
  }
});

const carts = db.collection("carts");
// Get cart items for logged in user
app.get("/api/cart", verifyToken, async (req, res) => {
  try {
    const userEmail = req.user.email;

    // Populate cart with medicine info
    const userCart = await carts.aggregate([
      { $match: { userEmail } },
      {
        $lookup: {
          from: "medicines",
          localField: "medicineId",
          foreignField: "_id",
          as: "medicineDetails",
        },
      },
      { $unwind: "$medicineDetails" },
      {
        $project: {
          _id: 1,
          medicineId: 1,
          quantity: 1,
          "medicineDetails._id": 1,
          "medicineDetails.name": 1,
          "medicineDetails.company": 1,
          "medicineDetails.price": 1,
          "medicineDetails.discount": 1,
          "medicineDetails.image": 1,
        },
      },
    ]).toArray();

    res.status(200).json(userCart);
  } catch (error) {
    console.error("Error fetching cart:", error);
    res.status(500).json({ message: "Error fetching cart" });
  }
});

// Add medicine to cart or increment quantity
app.post("/api/cart", verifyToken, async (req, res) => {
  const { medicineId } = req.body;
  const userEmail = req.user.email;

  if (!medicineId) {
    return res.status(400).json({ message: "medicineId is required" });
  }

  try {
    const medObjectId = new ObjectId(medicineId);

    // Check if medicine exists
    const medicine = await db.collection("medicines").findOne({ _id: medObjectId });
    if (!medicine) {
      return res.status(404).json({ message: "Medicine not found" });
    }

    // Check if already in cart
    const existing = await carts.findOne({ userEmail, medicineId: medObjectId });

    if (existing) {
      // Increment quantity by 1
      await carts.updateOne(
        { _id: existing._id },
        { $inc: { quantity: 1 } }
      );
    } else {
      // Insert new cart item with quantity 1
      await carts.insertOne({
        userEmail,
        medicineId: medObjectId,
        quantity: 1,
        createdAt: new Date(),
      });
    }

    res.status(200).json({ message: "Added to cart" });
  } catch (error) {
    console.error("Error adding to cart:", error);
    res.status(500).json({ message: "Error adding to cart" });
  }
});

// Update quantity of a cart item
app.put("/api/cart/:id", verifyToken, async (req, res) => {
  const cartItemId = req.params.id;
  const { quantity } = req.body;
  const userEmail = req.user.email;

  if (quantity === undefined || quantity < 1) {
    return res.status(400).json({ message: "Quantity must be at least 1" });
  }

  try {
    const cartItem = await carts.findOne({ _id: new ObjectId(cartItemId), userEmail });

    if (!cartItem) {
      return res.status(404).json({ message: "Cart item not found" });
    }

    await carts.updateOne(
      { _id: cartItem._id },
      { $set: { quantity } }
    );

    res.status(200).json({ message: "Quantity updated" });
  } catch (error) {
    console.error("Error updating cart quantity:", error);
    res.status(500).json({ message: "Error updating cart" });
  }
});

// Remove an item from cart
app.delete("/api/cart/:id", verifyToken, async (req, res) => {
  const cartItemId = req.params.id;
  const userEmail = req.user.email;

  try {
    const cartItem = await carts.findOne({ _id: new ObjectId(cartItemId), userEmail });

    if (!cartItem) {
      return res.status(404).json({ message: "Cart item not found" });
    }

    await carts.deleteOne({ _id: cartItem._id });

    res.status(200).json({ message: "Removed from cart" });
  } catch (error) {
    console.error("Error removing cart item:", error);
    res.status(500).json({ message: "Error removing cart item" });
  }
});

// Clear all cart items for user
app.delete("/api/cart", verifyToken, async (req, res) => {
  const userEmail = req.user.email;

  try {
    await carts.deleteMany({ userEmail });

    res.status(200).json({ message: "Cart cleared" });
  } catch (error) {
    console.error("Error clearing cart:", error);
    res.status(500).json({ message: "Error clearing cart" });
  }
});

const orders = db.collection("orders");
// Create Stripe checkout session endpoint
app.post("/api/create-checkout-session", verifyToken, async (req, res) => {
  const userEmail = req.user.email;

  try {
    // Fetch user's cart items with medicine details (same aggregation as /api/cart)
    const userCart = await carts.aggregate([
      { $match: { userEmail } },
      {
        $lookup: {
          from: "medicines",
          localField: "medicineId",
          foreignField: "_id",
          as: "medicineDetails",
        },
      },
      { $unwind: "$medicineDetails" },
    ]).toArray();

    if (userCart.length === 0) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    // Prepare line items for Stripe
    const line_items = userCart.map((item) => ({
      price_data: {
        currency: "usd",
        product_data: {
          name: item.medicineDetails.name,
          images: [item.medicineDetails.image || "https://via.placeholder.com/150"],
        },
        unit_amount: Math.round(item.medicineDetails.price * 100), // cents
      },
      quantity: item.quantity,
    }));

   const session = await stripe.checkout.sessions.create({
  payment_method_types: ["card"],
  mode: "payment",
  customer_email: req.user.email, // ✅ Add this
  line_items,
  success_url: `http://localhost:5173/invoice?session_id={CHECKOUT_SESSION_ID}`,
  cancel_url: "http://localhost:3000/cart",
});


    res.json({ url: session.url });
  } catch (error) {
    console.error("Stripe checkout session error:", error);
    res.status(500).json({ message: "Failed to create checkout session" });
  }
});


app.get("/api/order/:sessionId", verifyToken, async (req, res) => {
  const { sessionId } = req.params;
  const userEmail = req.user.email;

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["line_items", "customer"],
    });

    const stripeEmail = session?.customer_details?.email;

    if (stripeEmail && stripeEmail !== userEmail) {
      return res.status(403).json({ message: "Unauthorized access to order" });
    }

    let order = await orders.findOne({ sessionId });

    if (!order) {
      // 🛒 Fetch user's cart with medicine details
      const cartItems = await carts.aggregate([
        { $match: { userEmail } },
        {
          $lookup: {
            from: "medicines",
            localField: "medicineId",
            foreignField: "_id",
            as: "medicineDetails",
          },
        },
        { $unwind: "$medicineDetails" },
      ]).toArray();

      // 🧾 Build order with sellerEmail & medicineId
      const lineItems = session.line_items.data.map((li, index) => ({
        name: li.description,
        quantity: li.quantity,
        amount: li.amount_total / 100,
        medicineId: cartItems[index]?.medicineId,
        sellerEmail: cartItems[index]?.medicineDetails?.sellerEmail || "unknown",
      }));

      order = {
        sessionId,
        userEmail,
        customer: session.customer_details || { name: "Guest", email: userEmail },
        amount_total: session.amount_total / 100,
        payment_status: session.payment_status,
        status: "pending", // ⏳ Payment done, waiting for approval
        line_items: lineItems,
        createdAt: new Date(),
      };

      await orders.insertOne(order);
      await carts.deleteMany({ userEmail });
    }

    res.json(order);
  } catch (error) {
    console.error("❌ Failed to fetch order:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.get("/api/orders", async (req, res) => {
  try {
    const allOrders = await orders.find().toArray();
    res.json(allOrders);
  } catch (err) {
    console.error("Failed to fetch orders", err);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
});


// Get all orders that include medicines sold by current seller/admin
app.get("/api/seller/orders", verifyToken, async (req, res) => {
  const sellerEmail = req.user.email;

  try {
    const sellerOrders = await orders
      .find({ "line_items.sellerEmail": sellerEmail })
      .toArray();

    // Filter line_items to only include current seller's items
    const filtered = sellerOrders.map((order) => ({
      ...order,
      line_items: order.line_items.filter((li) => li.sellerEmail === sellerEmail),
    }));

    res.status(200).json(filtered);
  } catch (err) {
    console.error("Error fetching seller orders:", err);
    res.status(500).json({ message: "Error fetching seller orders" });
  }
});

  // --- Admin: Get all payments (orders) ---
    app.get("/api/payments", verifyToken, async (req, res) => {
      if (req.user.role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
      }
      try {
        const payments = await orders.find().toArray();
        res.json(payments);
      } catch (err) {
        res.status(500).json({ message: "Failed to fetch payments" });
      }
    });

    // --- Admin: Approve payment (change status pending => paid) ---
    app.put("/api/payments/:id/approve", verifyToken, async (req, res) => {
      if (req.user.role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
      }

      const { id } = req.params;

      try {
        const result = await orders.updateOne(
          { _id: new ObjectId(id), status: "pending" },
          { $set: { status: "paid" } }
        );

        if (result.modifiedCount === 0) {
          return res.status(400).json({ message: "Order not found or already approved" });
        }

        res.json({ message: "Payment approved and marked as paid" });
      } catch (err) {
        res.status(500).json({ message: "Failed to update payment status" });
      }
    });


app.get("/api/sales", verifyToken, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ message: "Forbidden" });

  const { startDate, endDate } = req.query;

  const filter = {};
  if (startDate && endDate) {
    filter.createdAt = {
      $gte: new Date(startDate),
      $lte: new Date(endDate),
    };
  }

  try {
    const sales = await orders.find(filter).toArray();
    res.json(sales);
  } catch (err) {
    console.error("Error fetching sales:", err);
    res.status(500).json({ message: "Failed to fetch sales" });
  }
});

app.get("/api/payment-history", verifyToken, async (req, res) => {
  const sellerEmail = req.user.email;

  try {
    const ordersForSeller = await orders
      .find({
        "line_items.sellerEmail": sellerEmail,
      })
      .toArray();

    const filteredOrders = ordersForSeller.map((order) => {
      const sellerItems = order.line_items.filter(
        (item) => item.sellerEmail === sellerEmail
      );

      return {
        orderId: order._id,
        sessionId: order.sessionId,
        buyerEmail: order.userEmail,
        payment_status: order.payment_status,
        status: order.status,
        amount_total: sellerItems.reduce((acc, item) => acc + item.amount, 0),
        line_items: sellerItems,
        createdAt: order.createdAt,
      };
    });

    if (filteredOrders.length === 0) {
      return res.json({ message: "No purchase history found." });
    }

    res.json(filteredOrders);
  } catch (error) {
    console.error("Failed to fetch payment history:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// User Payment History
app.get("/api/orders/user-history", verifyToken, async (req, res) => {
  const userEmail = req.user.email;

  try {
    const ordersList = await orders.find({ userEmail }).sort({ createdAt: -1 }).toArray();
    res.status(200).json(ordersList);
  } catch (err) {
    console.error("Error fetching user payment history:", err);
    res.status(500).json({ message: "Failed to fetch payment history" });
  }
});

   app.post("/api/register", async (req, res) => {
      const { name, email, password, photoURL, role = "user" } = req.body;
      const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z]).{6,}$/;
      if (!passwordRegex.test(password)) {
        return res.status(400).json({
          message:
            "Password must have an uppercase letter, a lowercase letter, and be at least 6 characters long.",
        });
      }

      try {
        const existingUser = await users.findOne({ email });
        if (existingUser) {
          return res.status(409).json({ message: "User already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await users.insertOne({
          name,
          email,
          role,
          password: hashedPassword,
          photoURL: photoURL || "",
          createdAt: new Date(),
        });

        const token = jwt.sign({ id: result.insertedId, email }, JWT_SECRET, {
          expiresIn: "7d",
        });

        res
          .status(201)
          .json({ message: "User registered successfully", token });
      } catch (err) {
        res.status(500).json({ message: "Internal server error" });
      }
    });

app.get("/api/users", verifyToken, async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const page = parseInt(req.query.page) || 1; // Default to page 1
  const limit = parseInt(req.query.limit) || 10; // Default to 10 users per page
  const skip = (page - 1) * limit;

  try {
    const totalUsers = await users.countDocuments();
    const allUsers = await users.find().skip(skip).limit(limit).toArray();

    res.json({
      users: allUsers,
      totalPages: Math.ceil(totalUsers / limit),
      currentPage: page,
    });
  } catch (err) {
    console.error("Error fetching paginated users:", err);
    res.status(500).json({ message: "Failed to fetch users" });
  }
});


app.patch("/api/users/:id/role", verifyToken, async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const { id } = req.params;
  const { role } = req.body;

  if (!["user", "seller", "admin"].includes(role)) {
    return res.status(400).json({ message: "Invalid role" });
  }

  try {
    await users.updateOne({ _id: new ObjectId(id) }, { $set: { role } });
    res.json({ message: "Role updated" });
  } catch (err) {
    res.status(500).json({ message: "Failed to update role" });
  }
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await users.findOne({ email });
    if (!user) {
      return res.status(400).send("User not found");
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).send("Invalid credentials");
    }

    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    // ✅ Return complete user info explicitly
    res.json({
      token,
      user: {
        name: user.name,
        email: user.email,
        role: user.role,
        photoURL: user.photoURL || "",
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).send("Server error");
  }
});


   app.post("/api/save-user", async (req, res) => {
  const { name, email, photoURL, role = "user" } = req.body;

  try {
    let user = await users.findOne({ email });

    if (!user) {
      const result = await users.insertOne({
        name,
        email,
        role,
        photoURL: photoURL || "",
        createdAt: new Date(),
      });
      user = await users.findOne({ _id: result.insertedId });
    }

    const token = jwt.sign(
      { id: user._id, email, role: user.role },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    // ✅ Return full user info explicitly
    res.status(200).json({
      message: "User saved",
      token,
      user: {
        name: user.name,
        email: user.email,
        role: user.role,
        photoURL: user.photoURL || "",
      },
    });
  } catch (err) {
    console.error("Save Google user error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});


  } catch (err) {
    console.error(" Error connecting to MongoDB:", err);
  }
}

run().catch(console.dir);

app.get("/", async (req, res) => {
  try {
    await client.db("admin").command({ ping: 1 });
    res.send(" MongoDB is connected. Server is running on port " + port);
  } catch (error) {
    res.status(500).send(" MongoDB connection failed: " + error.message);
  }
});

app.listen(port, () => {
  console.log(`🚀 Server is running on http://localhost:${port}`);
});
