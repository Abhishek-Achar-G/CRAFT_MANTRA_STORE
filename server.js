/* =====================================================
   CRAFT MANTRA 
===================================================== */
const express = require("express");
const db = require("./db");
const path = require("path");
const multer = require("multer");
const fs = require("fs");
const session = require("express-session");
const nodemailer = require("nodemailer");
const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");

const app = express();

let otpStore = {};

/* ================================
   TEST SESSION 
================================ */

app.get("/test-session",(req,res)=>{
res.json(req.session.user);
});


/* =====================================================
   MIDDLEWARE
===================================================== */

app.use(session({
    secret: "craft_mantra_secret",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files statically

app.use("/uploads", express.static("public/uploads"));

/* ================================
   STATIC PUBLIC FOLDER
================================ */

app.use(express.static(path.join(__dirname, "public")));

/* ================================
   GET NEXT PRODUCT CODE
================================ */

app.get("/get-product-code", (req, res) => {

    db.query("SELECT id FROM products ORDER BY id DESC LIMIT 1", (err, result) => {

        let nextId = 1;

        if(result.length > 0){
            nextId = result[0].id + 1;
        }

        let productCode = "CMP" + String(nextId).padStart(3,'0');

        res.json({
            success: true,
            productCode: productCode
        });

    });

});

/* ================================
   CREATE UPLOAD FOLDERS
================================ */

const productPath = path.join(__dirname, "public/uploads/products");
const eventPath = path.join(__dirname, "public/uploads/events");

if (!fs.existsSync(productPath))
    fs.mkdirSync(productPath, { recursive: true });

if (!fs.existsSync(eventPath))
    fs.mkdirSync(eventPath, { recursive: true });

/* ================================
   USER DP FOLDER
================================ */

const userPath = path.join(__dirname, "public/uploads/users");

if (!fs.existsSync(userPath))
    fs.mkdirSync(userPath, { recursive: true });

/* ================================
   ENQUIRY DOCS FOLDER
================================ */

const enquiryDocPath = path.join(__dirname, "public/uploads/enquiry_docs");

if (!fs.existsSync(enquiryDocPath))
    fs.mkdirSync(enquiryDocPath, { recursive: true });


/* ================================
   MULTER STORAGE
================================ */

const productStorage = multer.diskStorage({

    destination: (req, file, cb) => {
        cb(null, productPath);
    },

    filename: (req, file, cb) => {
        cb(null, Date.now() + "-" + file.originalname);
    }

});

const uploadProduct = multer({ storage: productStorage });

const eventStorage = multer.diskStorage({

    destination: (req, file, cb) => {
        cb(null, eventPath);
    },

    filename: (req, file, cb) => {
        cb(null, Date.now() + "-" + file.originalname);
    }

});

/* ================================
   ENQUIRY DOCS UPLOAD
================================ */

const enquiryDocStorage = multer.diskStorage({

destination:(req,file,cb)=>{
cb(null,enquiryDocPath);
},

filename:(req,file,cb)=>{
cb(null,Date.now()+"-"+file.originalname);
}

});

// Allow max 3 files and only images and PDFs
const uploadEnquiryDocs = multer({
storage: enquiryDocStorage,
limits: { files: 3 },

fileFilter: (req,file,cb)=>{

const allowed = ["image/jpeg","image/png","image/jpg","application/pdf"];

if(allowed.includes(file.mimetype)){
cb(null,true);
}else{
cb(new Error("Invalid file type"),false);
}

}

});


// DP UPLOAD AND UPDATE

const storage=multer.diskStorage({
destination:"public/uploads/users",
filename:(req,file,cb)=>{
cb(null,Date.now()+"-"+file.originalname);
}
});

const upload=multer({storage});

/* ================================
   DP UPLOAD AND UPDATE
================================ */
const uploadEvent = multer({ storage: eventStorage });

const userStorage = multer.diskStorage({

destination:(req,file,cb)=>{

cb(null,userPath);

},

filename:(req,file,cb)=>{

const filename=Date.now()+"-"+file.originalname;

cb(null,filename);

}

});

const uploadDP = multer({storage:userStorage});

app.post("/upload-dp",uploadDP.single("dp"),(req,res)=>{

if(!req.session.user)
return res.json({success:false});

const filename=req.file.filename;

db.query(
"UPDATE users SET dp=? WHERE id=?",
[filename,req.session.user.id],
()=>{

req.session.user.dp=filename;

res.json({
success:true,
filename
});

});

});


/* ================================
   HOME
================================ */

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public/index.html"));
});


/* =====================================================
   REGISTER USER
===================================================== */

app.post("/register", (req, res) => {

    let { user_code, name, email, password } = req.body;

    user_code = user_code?.trim();
    name = name?.trim();
    email = email?.trim().toLowerCase();
    password = password?.trim();

    if (!user_code || !name || !email || !password)
    {
        return res.send(alertBack("All fields required"));
    }

    const check =
    "SELECT id FROM users WHERE LOWER(TRIM(email))=?";

    db.query(check, [email], (err, result) => {

        if (result.length > 0)
            return res.send(alertBack("Email already exists"));

        const insert =
        `INSERT INTO users
        (user_code,name,email,password,dp,role)
        VALUES (?,?,?,?,?,?)`;

        db.query(insert,

        [
            user_code,
            name,
            email,
            password,
            "user_logo.jpg",
            "user"
        ],

        err => {

            if (err)
            {
                console.log(err);
                return res.send(alertBack("Registration failed"));
            }

            res.send(alertRedirect(
            "Registration successful",
            "/auth/login.html"));

        });

    });

});

/* ================================
 GENERATE USER CODE FOR REGISTRATION
================================ */

app.get("/generate-user-code", (req, res) => {

    const sql = "SELECT COUNT(*) AS total FROM users WHERE role='user'";

    db.query(sql, (err, result) => {

        if(err) throw err;

        const count = result[0].total + 1;

        const user_code = "IMCM" + String(count).padStart(4, '0');

        res.json({ user_code });

    });

});

/* =====================================================
   LOGIN 
===================================================== */

app.post("/login", (req, res) => {

    let { user_code, email, password } = req.body;

    user_code = user_code.trim();
    email = email.trim().toLowerCase();
    password = password.trim();

    console.log("LOGIN INPUT:");
    console.log("User Code:", user_code);
    console.log("Email:", email);
    console.log("Password:", password);

    const sql = `
    SELECT *
    FROM users
    WHERE TRIM(user_code)=?
    AND LOWER(TRIM(email))=?
    LIMIT 1
    `;

    db.query(sql, [user_code, email], (err, result) => {

        if (err) {
            console.log(err);
            return res.send(alertBack("Database error"));
        }

        if (result.length === 0) {

            console.log("User not found in DB");

            return res.send(alertBack("Invalid User ID or Email"));
        }

        const user = result[0];

        console.log("DB Password:", user.password);

        /* PASSWORD CHECK */
        if (password !== user.password.trim()) {

            console.log("Password mismatch");

            return res.send(alertBack("Invalid Password"));
        }

        /* STORE SESSION */
        req.session.user = {

            id: user.id,
            user_code: user.user_code,
            name: user.name,
            email: user.email,
            role: user.role,
            dp: user.dp

        };
        /* ================================
        SEND LOGIN WELCOME EMAIL
        ================================ */

        const mailOptions = {

from: "Craft Mantra <craftmatrastore@gmail.com>",
to: user.email,
subject: "Welcome to Craft Mantra",

html:`

<div style="font-family:Poppins,Arial;max-width:600px;margin:auto;background:#f4f6f9;padding:30px">

<div style="background:white;padding:25px;border-radius:10px;text-align:center">

<img src="cid:logo" width="70">

<h2 style="color:#2e7d32;margin-top:10px">Welcome to Craft Mantra</h2>

<p style="color:#555">
Thanks for connecting with our organization.
</p>

<hr style="margin:20px 0">

<div style="text-align:left;font-size:15px">

<p><b>User ID:</b> ${user.user_code}</p>
<p><b>Name:</b> ${user.name}</p>
<p><b>Email:</b> ${user.email}</p>

</div>

<hr style="margin:20px 0">

<p style="color:#2e7d32;font-weight:600">
Stay connected with us 🌿
</p>

<p style="color:#777">
Have a great day!
</p>

<br>

<p style="font-size:13px;color:#888">
Craft Mantra<br>
Touching Lives While Going Green
</p>

</div>

</div>
`,

attachments:[
{
filename:"logo.png",
path:__dirname + "/public/images/logo.png",
cid:"logo"
}
]

};

    transporter.sendMail(mailOptions,(error,info)=>{

if(error){
console.log("Email error:",error);
}else{
console.log("Login email sent:",info.response);
}

});

        console.log("Login success:", user.user_code);

        /* REDIRECT BASED ON ROLE */

        if (user.role === "admin")
            return res.redirect("/admin/admin-dashboard.html");

        if (user.role === "staff")
            return res.redirect("/staff/staff-dashboard.html");

        if (user.role === "user")
            return res.redirect("/user/user-dashboard.html");

        return res.redirect("/auth/login.html");

    });

});

/* ================================
    EMAIL TRANSPORTER (GMAIL)
================================ */
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: "craftmatrastore@gmail.com",   // your gmail
        pass: "fyqo uldb iido npbj"   // Gmail App Password
    }
});

/* ================================
   SEND OTP FOR PASSWORD RESET
================================ */

app.post("/send-otp",(req,res)=>{

const {email}=req.body;

if(!email){
return res.json({
success:false,
message:"Email required"
});
}

const sql="SELECT * FROM users WHERE email=?";

db.query(sql,[email],(err,result)=>{

if(err){
console.log(err);
return res.json({
success:false,
message:"Database error"
});
}

if(result.length==0){

return res.json({
success:false,
message:"Email not registered"
});

}

const otp=Math.floor(100000+Math.random()*900000);

otpStore[email]=otp;


const mailOptions={

from:"Craft Mantra <craftmatrastore@gmail.com>",
to:email,

subject:"Craft Mantra Password Reset OTP",

html:`
<h2>Your OTP: ${otp}</h2>
<p>This OTP is valid for password reset.</p>
`

};

transporter.sendMail(mailOptions,(error,info)=>{

if(error){

console.log(error);

return res.json({
success:false,
message:"Failed to send OTP"
});

}

res.json({
success:true,
message:"OTP sent successfully"
});

});

});

});
/* ================================
    VERIFY OTP
================================ */

app.post("/verify-otp",(req,res)=>{

const {email,otp}=req.body;

if(otpStore[email]==otp){

res.json({
success:true,
message:"OTP verified"
});

}else{

res.json({
success:false,
message:"Invalid OTP"
});

}

});


/* ================================
    UPDATE PASSWORD
================================ */

app.post("/update-password", (req, res) => {

    let { email, password } = req.body;

    /* CLEAN INPUT */

    email = email.trim().toLowerCase();
    password = password.trim();

    if (!email || !password) {

        return res.json({
            success: false,
            message: "Email and Password required"
        });

    }

    /* UPDATE PASSWORD (PLAIN TEXT) */

    const sql = `
    UPDATE users
    SET password = ?
    WHERE email = ?
    `;

    db.query(sql, [password, email], (err) => {

        if (err) {

            console.log(err);

            return res.json({
                success: false,
                message: "Error updating password"
            });

        }

        /* REMOVE OTP */

        delete otpStore[email];

        res.json({
            success: true,
            message: "Password updated successfully"
        });

    });

});


/* ================================
   GET ENQUIRIES FOR ADMIN
================================ */

app.get("/admin/get-enquiries", (req, res) => {

    const sql = `
    SELECT 
        e.id,
        e.enquiryNo,
        e.confirmation_sent,
        e.organisation,
        e.phone,
        e.quantity,
        e.deadline,
        e.customization,
        e.status,
        e.altEmail,
        e.documents,

        u.user_code,
        u.name AS user_name,
        u.email,

        p.product_code,
        p.name AS product_name,
        p.image,
        p.price

    FROM enquiries e
    JOIN users u ON e.user_id = u.id
    JOIN products p ON e.product_id = p.id
    ORDER BY e.id DESC
    `;

    db.query(sql, (err, result) => {

        if (err) {
            console.log(err);
            return res.json([]);
        }

        res.json(result);

    });

});
/* ================================
   ACCEPT ENQUIRY (ADMIN)
================================ */

app.put("/admin/accept-enquiry/:id", (req, res) => {

    db.query(
        "UPDATE enquiries SET status='Accepted' WHERE id=?",
        [req.params.id],
        (err) => {
            if (err) return res.send("Error");
            res.send("Accepted");
        }
    );
});

/* ================================
   REJECT ENQUIRY (ADMIN)
================================ */

app.put("/admin/reject-enquiry/:id", (req, res) => {

    db.query(
        "UPDATE enquiries SET status='Rejected' WHERE id=?",
        [req.params.id],
        (err) => {
            if (err) return res.send("Error");
            res.send("Rejected");
        }
    );
});

/* ================================
   SEND CONFIRMATION EMAIL
================================ */

app.get("/admin/send-confirmation/:id", (req, res) => {

    const enquiryId = req.params.id;

    const sql = `
    SELECT 
        e.*,
        u.name AS user_name,
        u.email,
        u.user_code,
        p.product_code,
        p.name AS product_name,
        p.price
    FROM enquiries e
    JOIN users u ON e.user_id = u.id
    JOIN products p ON e.product_id = p.id
    WHERE e.id = ?
    `;

    db.query(sql, [enquiryId], (err, result) => {

        if (err || result.length === 0) {
            console.log(err);
            return res.send("Enquiry not found");
        }

        const data = result[0];

        const doc = new PDFDocument({ margin: 50 });
        const buffers = [];

        doc.on("data", buffers.push.bind(buffers));

        doc.on("end", async () => {

            const pdfData = Buffer.concat(buffers);

            try {

                await transporter.sendMail({
                from: "craftmatrastore@gmail.com",
                to: data.email,
                cc: data.altEmail || "",
                subject: "Confirmation of Accepted Enquiry - CraftMantra",
                text: "Please find attached confirmation letter.",
                attachments: [
                                {
                                    filename: `confirmation_${data.enquiryNo}.pdf`,
                                    content: pdfData
                                }
                            ]
                });

// UPDATE DB AFTER MAIL
db.query(
"UPDATE enquiries SET confirmation_sent='Yes' WHERE id=?",
[enquiryId],
(err)=>{
    if(err){
        console.log(err);
        return res.send("Mail sent but DB update failed");
    }

    res.send("Confirmation email sent successfully");
});

            } catch (mailError) {
                console.log(mailError);
                res.send("Error sending email");
            }

        });

        /* ================= PDF DESIGN ================= */

        // Logo
        doc.image("public/images/logo.png", 50, 45, { width: 80 });

        // Company Name
        doc
            .fontSize(24)
            .text("CraftMantra", 150, 50);

        doc.moveDown();

        // Subtitle
        doc
            .fontSize(14)
            .text("Confirmation of the Acceptance of Raised Enquiry", {
                align: "center"
            });

        doc.moveDown(2);

        doc.fontSize(12);

        // User ID
        doc.text("User ID: " + data.user_code);
        doc.moveDown();

        /* ===== TABLE FORMAT ===== */

        const tableTop = doc.y;
        const itemSpacing = 25;

        function drawRow(label, value, y) {
            doc
                .font("Helvetica-Bold")
                .text(label, 50, y)
                .font("Helvetica")
                .text(value || "-", 220, y);
        }

        let y = tableTop;

        drawRow("Enquiry No:", data.enquiryNo, y);
        y += itemSpacing;

        drawRow("User Name:", data.user_name, y);
        y += itemSpacing;

        drawRow("Email:", data.email, y);
        y += itemSpacing;

        drawRow("Alternative Email:", data.altEmail, y);
        y += itemSpacing;

        drawRow("Organisation:", data.organisation, y);
        y += itemSpacing;

        drawRow("Contact No:", data.phone, y);
        y += itemSpacing;

        drawRow("Product Code:", data.product_code, y);
        y += itemSpacing;

        drawRow("Product Name:", data.product_name, y);
        y += itemSpacing;

        drawRow("Quantity:", data.quantity, y);
        y += itemSpacing;

        drawRow("Price:", "₹ " + data.price, y);
        y += itemSpacing;

        drawRow("Deadline:", data.deadline, y);
        y += itemSpacing;

        drawRow("Customization:", data.customization, y);
        y += itemSpacing;

        doc.moveDown(3);

        /* ===== FOOTER MESSAGE ===== */

        doc.moveDown(2);

        doc.text("As per your enquiry, we accept your request.");
        doc.moveDown();
        doc.text("We will further process your enquiry in a few days.");
        doc.moveDown();
        doc.text("For queries call us: +91 6362 571 412");
        doc.moveDown(2);

        doc.text("Thank you", { align: "center" });
        doc.moveDown();

        doc.text(
            "To create a sustainable world where every gift empowers communities and nurtures the planet.",
            { align: "center" }
        );

        doc.end();

    });

});


/* ================================
   LOGOUT
================================ */

app.get("/logout", (req, res) => {

    req.session.destroy((err) => {

        if (err) {
            console.log(err);
            return res.send("Logout failed");
        }

        // Clear session cookie
        res.clearCookie("connect.sid");

        // Redirect to home page
        res.redirect("/index.html");

    });

});



/* =========================================
   GET PRODUCTS (SEARCH + CATEGORY + SORT)
========================================= */

app.get("/get-products", (req, res) => {

    const search = req.query.search || "";
    const category = req.query.category || "";
    const sort = req.query.sort || "";

    let sql = `
        SELECT id, product_code, name, price, description, image, category
        FROM products
        WHERE 1=1
    `;

    let params = [];

    /* 🔍 Search by product name */
    if (search) {
        sql += " AND name LIKE ?";
        params.push("%" + search + "%");
    }

    /* 📂 Filter by category */
    if (category) {
        sql += " AND category = ?";
        params.push(category);
    }

    /* 💰 Sort by price */
    if (sort === "low") {
        sql += " ORDER BY price ASC";
    } 
    else if (sort === "high") {
        sql += " ORDER BY price DESC";
    } 
    else {
        sql += " ORDER BY id DESC";
    }

    db.query(sql, params, (err, result) => {

        if (err) {
            console.log(err);
            return res.json([]);
        }

        res.json(result);

    });

});

/* =========================================
   GET DISTINCT PRODUCT CATEGORIES
========================================= */

app.get("/get-categories", (req, res) => {

    db.query(
        "SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND category != ''",
        (err, result) => {

            if (err) {
                console.log(err);
                return res.json([]);
            }

            res.json(result);

        });

});

/* ================================
   ADD PRODUCT
================================ */

app.post("/add-product", uploadProduct.array("images", 10), (req, res) => {

    const { product_code, name, category, price, description } = req.body;

    if (!product_code || !name || !category || !price || !description) {
        return res.send("All fields required");
    }

    if (!req.files || req.files.length === 0) {
        return res.send("At least one image required");
    }

    // First image will be main image
    const mainImage = req.files[0].filename;

    // Insert into products table
    const sql = `
        INSERT INTO products 
        (product_code, name, category, price, description, image)
        VALUES (?, ?, ?, ?, ?, ?)
    `;

    db.query(sql, 
        [product_code, name, category, price, description, mainImage],
        (err, result) => {

            if (err) {
                console.log(err);
                return res.send("Database error");
            }

            const productId = result.insertId;

            // Save additional images in product_images table
            req.files.forEach(file => {

                db.query(
                    "INSERT INTO product_images (productId, image) VALUES (?, ?)",
                    [productId, file.filename]
                );

            });

            let role = req.session.user.role;

if(role === "admin"){
res.send(`
<script>
alert("Product Added Successfully");
window.location="/admin/admin-dashboard.html";
</script>
`);
}
else{
res.send(`
<script>
alert("Product Added Successfully");
window.location="/staff/staff-dashboard.html";
</script>
`);
}

        }
    );

});

/* ================================
   GET PRODUCT DETAILS WITH ALL IMAGES
================================ */

app.get("/get-product-details/:id", (req, res) => {

    const id = req.params.id;

    const sql = `
    SELECT 
    products.id,
    products.name,
    products.price,
    products.description,
    product_images.image
    FROM products
    LEFT JOIN product_images
    ON products.id = product_images.productId
    WHERE products.id=?
    `;

    db.query(sql, [id], (err, result) => {

        if (err)
            return res.json([]);

        res.json(result);

    });

});

/* ================================
   GET SINGLE PRODUCT
================================ */

app.get("/get-product/:id",(req,res)=>{

db.query(
"SELECT * FROM products WHERE id=?",
[req.params.id],
(err,result)=>{

if(err || result.length==0)
return res.json({});

res.json(result[0]);

});

});

/* ================================
   DELETE PRODUCT
================================ */

app.delete("/delete-product/:id", (req, res) => {

    const id = req.params.id;

    db.query(
        "DELETE FROM products WHERE id=?",
        [id],
        (err) => {

            if (err)
                return res.send("Delete failed");

            res.send("Deleted");

        });

});
/* ================================
   UPDATE PRODUCT
================================ */

app.put("/update-product/:id",
uploadProduct.single("image"),
(req, res) => {

const id = req.params.id;

const { name, price, description, category } = req.body;

if(req.file){

db.query(
"UPDATE products SET name=?, price=?, description=?, category=?, image=? WHERE id=?",
[name, price, description || "", category, req.file.filename, id],
(err)=>{
if(err) return res.send(err);
res.send({success:true});
});

}

else{

db.query(
"UPDATE products SET name=?, price=?, description=?, category=? WHERE id=?",
[name, price, description || "", category, id],
(err)=>{
if(err) return res.send(err);
res.send({success:true});
});

}

});

/* ================================
   EXPORT PRODUCTS TO EXCEL
================================ */

app.get("/export-excel", (req,res)=>{

    db.query("SELECT product_code,name,description,price FROM products", async (err, results)=>{

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("CraftMantra Products");

        sheet.addRow(["CraftMantra"]);
        sheet.addRow(["CraftMantra Products"]);
        sheet.addRow([]);

        sheet.addRow(["Product ID","Name","Description","Price"]);

        results.forEach(p=>{
            sheet.addRow([
                p.product_code,
                p.name,
                p.description,
                p.price
            ]);
        });

        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );

        res.setHeader(
            "Content-Disposition",
            "attachment; filename=craftmantra_products.xlsx"
        );

        await workbook.xlsx.write(res);
        res.end();

    });

});

/* ================================
   EXPORT PRODUCTS TO PDF
================================ */

app.get("/export-pdf", (req, res) => {

    db.query("SELECT product_code,name,description,price FROM products", (err, results) => {

        if (err) {
            console.log(err);
            return res.send("Database error");
        }

        const doc = new PDFDocument({ margin: 40, size: "A4" });

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", "attachment; filename=craftmantra_products.pdf");

        doc.pipe(res);

        // ===== TITLE =====
        doc.fontSize(20).text("CraftMantra", { align: "center" });
        doc.moveDown(0.5);
        doc.fontSize(14).text("CraftMantra Products", { align: "center" });
        doc.moveDown(2);

        // ===== TABLE HEADER =====
        const tableTop = doc.y;
        const itemSpacing = 25;

        doc.fontSize(12).font("Helvetica-Bold");

        doc.text("SI No", 40, tableTop);
        doc.text("ID", 90, tableTop);
        doc.text("Name", 150, tableTop);
        doc.text("Description", 250, tableTop);
        doc.text("Price", 430, tableTop);

        doc.moveTo(40, tableTop + 15)
           .lineTo(550, tableTop + 15)
           .stroke();

        // ===== TABLE DATA =====
        doc.font("Helvetica");

        let y = tableTop + itemSpacing;

        results.forEach((p, index) => {

            if (y > 750) {   // New page if overflow
                doc.addPage();
                y = 40;
            }

            doc.text(index + 1, 40, y);
            doc.text(p.product_code, 90, y);
            doc.text(p.name, 150, y, { width: 90 });
            doc.text(p.description, 250, y, { width: 160 });
            doc.text("₹ " + p.price, 430, y);

            y += itemSpacing;
        });

        doc.end();
    });
});


/* ================================
   GET CURRENT LOGGED USER
================================ */

app.get("/get-user", (req, res) => {

    if (!req.session.user)
        return res.json({ success: false });

    res.json({

        success: true,
        user: req.session.user

    });

});


/* =====================================================
   ALERT FUNCTIONS
===================================================== */

function alertBack(msg)
{
return `
<script>
alert("${msg}");
window.history.back();
</script>`;
}

function alertRedirect(msg, url)
{
return `
<script>
alert("${msg}");
window.location="${url}";
</script>`;
}


/* ================================
    USER (DASHBOARD)
================================ */
app.get("/user-dashboard", (req, res) => {

    if (!req.session.user)
        return res.redirect("/auth/login.html");

    res.sendFile(path.join(__dirname, "public/user/user-dashboard.html"));

});


/* ================================
   GENERATE ENQUIRY NUMBER
================================ */

app.get("/generate-enquiry-no",(req,res)=>{

db.query(
"SELECT enquiryNo FROM enquiries ORDER BY id DESC LIMIT 1",
(err,result)=>{

let newNo="EN101";

if(!err && result.length>0){

let last=result[0].enquiryNo.replace("EN","");
newNo="EN"+(parseInt(last)+1);

}

res.json({enquiryNo:newNo});

});

});

/* ================================
   SUBMIT ENQUIRY
================================ */

app.post("/submit-enquiry",
uploadEnquiryDocs.array("documents",3),
(req,res)=>{

if(!req.session.user)
return res.json({success:false});

const{
enquiryNo,
product_id,
altEmail,
org,
phone,
qty,
deadline,
custom
}=req.body;

/* GET FILE NAMES */

let docs="";

if(req.files && req.files.length>0){
docs=req.files.map(f=>f.filename).join(",");
}

const sql=`
INSERT INTO enquiries
(
enquiryNo,
user_id,
product_id,
altEmail,
organisation,
phone,
quantity,
deadline,
customization,
documents,
status
)
VALUES (?,?,?,?,?,?,?,?,?,?,'Pending')
`;

db.query(sql,[

enquiryNo,
req.session.user.id,
product_id,
altEmail,
org,
phone,
qty,
deadline,
custom,
docs

],(err)=>{

if(err){
console.log(err);
return res.json({success:false});
}

res.json({success:true});

});

});

/* ================================
   GET ENQUIRIES
================================ */

app.get("/get-enquiries", (req, res) => {

    const sql = `
    SELECT *
    FROM enquiries
    ORDER BY id DESC
    `;

    db.query(sql, (err, result) => {

        if (err) {
            console.log(err);
            return res.json([]);
        }

        res.json(result);

    });

});


/* ================================
   GET-MY ENQUIRY
================================ */

app.get("/get-my-enquiries",(req,res)=>{

if(!req.session.user)
return res.json([]);

const sql = `
SELECT 
    e.*,
    p.product_code,
    p.name AS product_name,
    p.image
FROM enquiries e
JOIN products p ON e.product_id = p.id
WHERE e.user_id = ?
ORDER BY e.id DESC
`;

db.query(sql,[req.session.user.id],(err,result)=>{

if(err){
console.log(err);
return res.json([]);
}

res.json(result);

});

});


/* ================================
   UPDATE ENQUIRY
================================ */

app.post("/update-enquiry",(req,res)=>{

if(!req.session.user)
return res.json({success:false});

const {id,qty,deadline,custom}=req.body;

/* Only allow update if enquiry belongs to user AND is Pending */

const sql=`
UPDATE enquiries 
SET quantity=?, deadline=?, customization=? 
WHERE id=? AND user_id=? AND status='Pending'
`;

db.query(sql,[

qty,
deadline,
custom,
id,
req.session.user.id

],(err,result)=>{

if(err){
console.log(err);
return res.json({success:false});
}

res.json({success:true});

});

});

/* ================================
   REJECT ENQUIRY
================================ */

app.post("/reject-enquiry",(req,res)=>{

if(!req.session.user)
return res.json({success:false});

const {id}=req.body;

/* Only reject if Pending */

const sql=`
UPDATE enquiries 
SET status='Rejected' 
WHERE id=? AND user_id=? AND status='Pending'
`;

db.query(sql,[

id,
req.session.user.id

],(err)=>{

if(err){
console.log(err);
return res.json({success:false});
}

res.json({success:true});

});

});

/* ================================
   DELETE ENQUIRY
================================ */

app.get("/delete-enquiry/:id",(req,res)=>{

db.query(
"DELETE FROM enquiries WHERE id=?",
[req.params.id],
()=>res.json({success:true})
);

});

/* ================================
   CHECK FEEDBACK PERMISSION
================================ */
app.get("/check-feedback",(req,res)=>{

if(!req.session.user)
return res.json({allow:false});

const sql=`
SELECT 
e.enquiryNo,
u.name,
u.email
FROM enquiries e
JOIN users u ON e.user_id = u.id
WHERE e.user_id=?
AND e.status='Accepted'
AND e.confirmation_sent='Yes'
LIMIT 1
`;

db.query(sql,[req.session.user.id],(err,result)=>{

if(err){
console.log(err);
return res.json({allow:false});
}

if(result.length===0)
return res.json({allow:false});

res.json({
allow:true,
data:result[0]
});

});

});

/* ================================
  DELETE FEEDBACK
================================ */

app.post("/delete-feedback", async (req, res) => {

const { row } = req.body;

try {

const { google } = require("googleapis");

const auth = new google.auth.GoogleAuth({
keyFile: "credentials.json",
scopes: ["https://www.googleapis.com/auth/spreadsheets"]
});

const client = await auth.getClient();

const sheets = google.sheets({ version: "v4", auth: client });

const spreadsheetId = "1qGgxzgK7PRAKLLw2OKNrDcKj1DR2wJ1h2q4ZGjPcVno";

// 🔴 VERY IMPORTANT: row mapping
const startIndex = row;       // because index starts from 0 in API
const endIndex = row + 1;

// 🔴 IMPORTANT: sheetId (NOT name)
const sheetId = 41902427; // default usually 0

await sheets.spreadsheets.batchUpdate({
  spreadsheetId,
  requestBody: {
    requests: [
      {
        deleteDimension: {
          range: {
            sheetId: sheetId,
            dimension: "ROWS",
            startIndex: startIndex,
            endIndex: endIndex
          }
        }
      }
    ]
  }
});

res.json({ success: true });

} catch (err) {
console.error(err);
res.status(500).json({ success: false });
}

});


/* ================================
   GET SINGLE PRODUCT
================================ */

app.get("/get-product/:id",(req,res)=>{

let id=req.params.id;

db.query("SELECT * FROM products WHERE id=?",[id],(err,result)=>{

if(err) return res.json({error:err});

res.json(result[0]);

});

});

/* ================================
   ADD EVENT
================================ */

app.post("/add-event",
uploadEvent.fields([
    { name: "image1" },
    { name: "image2" },
    { name: "image3" }
]),
(req, res) => {

    const { name, date, description } = req.body;

    const image1 = req.files.image1?.[0]?.filename || null;
    const image2 = req.files.image2?.[0]?.filename || null;
    const image3 = req.files.image3?.[0]?.filename || null;

    db.query(
        "INSERT INTO events (name,date,description,image1,image2,image3) VALUES (?,?,?,?,?,?)",
        [name, date, description, image1, image2, image3],
        () => {

            res.send(`
            <script>
            alert("Event added successfully");
            window.history.back();
            </script>
            `);

        });

});

/* ================================
   GET EVENTS
================================ */

app.get("/get-events", (req, res) => {

    db.query(
        "SELECT * FROM events ORDER BY id DESC",
        (err, result) => {

            if (err)
                return res.json([]);

            res.json(result);

        });

});

/* ================================
   STAFF MANAGEMENT
================================ */

/* GET NEXT STAFF ID */
app.get("/next-staff-id",(req,res)=>{

db.query(
"SELECT user_code FROM users WHERE user_code LIKE 'IMCMS%' ORDER BY id DESC LIMIT 1",
(err,result)=>{

let next="IMCMS01";

if(result.length>0){

let last=result[0].user_code.replace("IMCMS","");
let num=parseInt(last)+1;

if(num<10)
next="IMCMS0"+num;
else
next="IMCMS"+num;

}

res.json({code:next});

});

});


/* ADD STAFF */
app.post("/add-staff",(req,res)=>{

const {name,email,password}=req.body;

db.query(
"SELECT user_code FROM users WHERE user_code LIKE 'IMCMS%' ORDER BY id DESC LIMIT 1",
(err,result)=>{

let newCode="IMCMS01";

if(result.length>0){

let last=result[0].user_code.replace("IMCMS","");
let num=parseInt(last)+1;

if(num<10)
newCode="IMCMS0"+num;
else
newCode="IMCMS"+num;

}

db.query(

"INSERT INTO users (user_code,name,email,password,dp,role) VALUES (?,?,?,?,?,?)",

[
newCode,
name,
email,
password,
"staff_logo.jpg",
"staff"
],

(err)=>{

if(err){
console.log(err);
return res.json({
success:false,
message:"Staff creation failed"
});
}

/* ================= SEND EMAIL ================= */

const mailOptions = {

from: "Craft Mantra <craftmatrastore@gmail.com>",
to: email,
subject: "Welcome to Craft Mantra Team",

html: `
<div style="font-family:Poppins;text-align:center">

<img src="cid:logo" width="70"><br><br>

<h2 style="color:#2e7d32">Welcome to Craft Mantra</h2>

<p>Hello <b>${name}</b>,</p>

<p>We are happy to welcome you to the 
<b>Digital Craft Mantra Team</b>.</p>

<p>Your staff account has been created successfully.</p>

<br>

<p><b>Staff ID:</b> ${newCode}</p>
<p><b>Name:</b> ${name}</p>
<p><b>Email:</b> ${email}</p>

<br>

<p style="color:#2e7d32">
Thank you for joining Craft Mantra.<br>
Let's grow together and stay connected with us 🌿
</p>

<br>

<p>Regards,<br>
<b>Craft Mantra Team</b></p>

</div>
`,

attachments:[
{
filename:"logo.png",
path:__dirname + "/public/images/logo.png",
cid:"logo"
}
]

};

transporter.sendMail(mailOptions,(err,info)=>{
if(err){
console.log("Mail Error:",err);
}else{
console.log("Staff welcome email sent");
}
});

/* ================================= */

res.json({
success:true,
message:"Staff added successfully",
code:newCode
});

});

});

});

/* GET STAFF */
app.get("/get-staff",(req,res)=>{

db.query(
"SELECT id,user_code,name,email FROM users WHERE role='staff' ORDER BY id DESC",
(err,result)=>{

if(err) return res.json([]);

res.json(result);

});

});


/* DELETE STAFF */
app.delete("/delete-staff/:id",(req,res)=>{

db.query(
"DELETE FROM users WHERE id=? AND role='staff'",
[req.params.id],
()=>res.send("Deleted")
);

});

/* UPDATE STAFF */

app.post("/update-staff",(req,res)=>{

const {id,name,email,password}=req.body;

if(password){

db.query(
"UPDATE users SET name=?,email=?,password=? WHERE id=? AND role='staff'",
[name,email,password,id],
()=>res.send("Updated")
);

}else{

db.query(
"UPDATE users SET name=?,email=? WHERE id=? AND role='staff'",
[name,email,id],
()=>res.send("Updated")
);

}

});

/* ================================
   GET CURRENT USER (FOR DASHBOARD DISPLAY)
================================ */
app.get("/get-user", (req, res) => {
    if (!req.session.user)
        return res.json({ success: false });

    res.json({
        success: true,
        user: req.session.user
    });
});


/* ================================
   SERVER
================================ */

app.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
});