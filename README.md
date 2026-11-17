# AgriRent – Agricultural Equipment Rental System
**A 1st-Year College Web Technology & Database Project**

AgriRent is a simple, modern, and beginner-friendly web application designed to connect farmers who need machinery with equipment owners who have underutilized tractors, harvesters, tillers, and irrigation pumps.

---

## 🌾 Project Highlights & Features

### 1. User Authentication & Roles
- **Dual User Roles**: Registration and login for **Farmers** and **Equipment Owners**.
- **Secure Password Hashing**: Passwords securely hashed with `bcryptjs`.
- **Session Management**: Cookie-based JWT tokens for secure authentication.
- **⚡ 1-Click Demo Logins (Viva Mode)**: Instant one-click login buttons for **Farmer**, **Equipment Owner**, and **Administrator** to effortlessly demonstrate all workflows during college review.

### 2. Equipment Marketplace (Dynamic Database Driven)
- **Live SQLite Integration**: Equipment listings loaded directly from `data/agrirent.db`.
- **Search & Filter**:
  - Search by equipment name or description.
  - Filter by category pills (*Tractors*, *Harvesters*, *Tools & Tillers*, *Irrigation*).
  - Search by Village, District, or City.
- **Popular Equipment Showcase**: Highlights top requested machinery with special badges.
- **Equipment Availability Badges**: Shows whether a machine is **🟢 Available** or **🔴 In Use**.
- **Contact Owner Feature**: Modal reveals the owner's verified name, phone number (`tel:` link), email (`mailto:` link), and location.

### 3. Equipment Owner Dashboard
- **Add New Machinery**: Modal form with Name, Category, Price/Day, Location, Emoji/Icon, and Description.
- **Edit Equipment**: Update rates, description, or details.
- **Delete Equipment**: Remove machinery with confirmation.
- **Toggle Availability**: Fast 1-click switch between *Available* and *Unavailable*.
- **Manage Rental Requests**: Review incoming booking requests from farmers with one-click **✔ Approve** and **✖ Reject** actions.
- **Earning Stats**: View total machines listed, total requests, pending count, and approved earnings in ₹.

### 4. Farmer Dashboard
- **Browse & Rent**: Select rental start date and end date with **Live Price Calculation** (e.g., 4 days × ₹1,200 = ₹4,800).
- **Conflict Prevention**: Database prevents overlapping approved bookings for the same machine.
- **Track Status**: Real-time status badges for **Pending 🟡**, **Approved 🟢**, **Rejected 🔴**, and **Cancelled ⚪**.
- **Cancel Request**: Ability for farmers to cancel pending or approved bookings.
- **Rental History**: Complete history of past bookings.

### 5. Website Information Sections
- **How It Works**: Visual 4-step walkthrough for first-time farmers.
- **About Us**: Project vision, mission, and benefits for farming communities.
- **Contact Us**: Working support form and contact details.

---

## 📁 Project Structure

```text
agrirent/
├── data/
│   ├── agrirent.db           <-- Permanent SQLite database file
│   └── .jwt_secret           <-- Secure auth session key
├── public/
│   ├── index.html            <-- Homepage & Equipment Marketplace
│   ├── signup.html           <-- User Registration (Farmer & Owner)
│   └── dashboard.html        <-- Interactive Role-based Dashboard
├── src/
│   ├── db.js                 <-- SQLite database initialization & seeding
│   └── server.js             <-- Express.js REST API & routing
├── package.json              <-- Dependencies & project metadata
└── README.md                 <-- Documentation & instructions
```

---

## 🚀 How to Run the Project Locally

### Prerequisites
- Node.js installed (v18, v20, v22, or v24). Check with `node -v` in terminal.

### Step 1: Open Terminal in the project directory
```bash
cd agrirent
```

### Step 2: Install Dependencies (if not already installed)
```bash
npm install
```

### Step 3: Start the AgriRent Server
```bash
npm start
```

### Step 4: Open in Your Web Browser
Open your browser and navigate to:
```text
http://localhost:3000
```

---

## 🔑 Pre-Seeded Demo Accounts for College Viva / Testing

You can use the **1-Click Demo Buttons** on the login modal or sign in with these credentials:

| Role | Email | Password | What to Test |
| :--- | :--- | :--- | :--- |
| **Farmer** | `farmer@agrirent.com` | `password123` | Browse equipment, submit rental requests, see live price calculator, view booking history, cancel bookings. |
| **Equipment Owner** | `owner@agrirent.com` | `password123` | View incoming farmer requests, click Approve/Reject, add new equipment, toggle availability, edit/delete machinery. |
| **Administrator** | `admin@agrirent.com` | `password123` | View all registered users and all system rental transactions. |

---

## 🎓 College Viva & Demonstration Guide

If asked by your professor or examiner:

1. **"Which database are you using?"**
   > *"We are using SQLite. It is a lightweight, serverless relational database engine. All users, equipment, and rental records are permanently stored in the `data/agrirent.db` file, so data persists even when the server restarts."*

2. **"How do the frontend and backend communicate?"**
   > *"The frontend uses modern standard JavaScript `fetch()` to call RESTful API endpoints on our Node.js Express backend (such as `GET /api/equipment`, `POST /api/rentals`, `POST /api/auth/login`)."*

3. **"How does role-based access work?"**
   > *"When a user logs in, the backend signs a secure JWT cookie storing their user ID. The backend middleware checks their role before allowing restricted actions (e.g., only Equipment Owners can add machinery or approve rentals; only Farmers can request rentals)."*

4. **"How do you prevent double bookings?"**
   > *"Before approving or booking, the backend queries the SQLite database to check if any existing approved rental overlaps with the requested date range (`start_date <= requested_end AND end_date >= requested_start`)."*
