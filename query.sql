CREATE DATABASE IF NOT EXISTS craft_mantra;
USE craft_mantra;

-- ================================
-- 1. USERS TABLE
-- ================================
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_code VARCHAR(20),
    name VARCHAR(100),
    email VARCHAR(100),
    password VARCHAR(100),
    dp VARCHAR(255),
    role ENUM('admin','staff','user') DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ================================
-- 2. STAFF TABLE
-- ================================
CREATE TABLE staff (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100),
    email VARCHAR(100),
    password VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ================================
-- 3. PRODUCTS TABLE
-- ================================
CREATE TABLE products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_code VARCHAR(20),
    name VARCHAR(200),
    category VARCHAR(100),
    price INT,
    image VARCHAR(255),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ================================
-- 4. PRODUCT IMAGES TABLE
-- ================================
CREATE TABLE product_images (
    id INT AUTO_INCREMENT PRIMARY KEY,
    productId INT,
    image VARCHAR(255),
    FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE
);

-- ================================
-- 5. ENQUIRIES TABLE
-- ================================
CREATE TABLE enquiries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    enquiryNo VARCHAR(20),
    user_id INT,
    product_id INT,
    altEmail VARCHAR(100),
    organisation VARCHAR(200),
    phone VARCHAR(20),
    quantity INT,
    deadline DATE,
    customization TEXT,
    status VARCHAR(20),
    confirmation_sent VARCHAR(10),
    documents TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
);

-- ================================
-- 6. FEEDBACK TABLE
-- ================================
CREATE TABLE feedback (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    enquiryNo VARCHAR(20),
    rating INT,
    message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ================================
-- 7. EVENTS TABLE
-- ================================
CREATE TABLE events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(200),
    date DATE,
    description TEXT,
    image1 VARCHAR(255),
    image2 VARCHAR(255),
    image3 VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);