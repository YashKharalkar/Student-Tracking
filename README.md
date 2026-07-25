# Student Tracking System

A fullstack real-time geolocation tracking application. 

## How to Start the Project

To start this project, you need to open your terminal windows in your editor.

### 1. Start the Backend Server
This server handles all live WebSocket connections between mobile devices and the admin map.

1. Open a terminal window.
2. Navigate to the backend folder:
   ```bash
   cd backend
   ```
3. Start the node server:
   ```bash
   node server.js
   ```
*(You should see: "Student Tracking Server is running on port 5000")*

### 2. Start the Frontend Application
This runs the React UI.

1. Open a **second** terminal window.
2. Navigate to the frontend folder:
   ```bash
   cd frontend
   ```
3. Start the Vite server:
   ```bash
   npm run dev -- --host
   ```
*(This starts your local Vite server on `http://localhost:5173`)*

### 3. Expose to the Internet (Optional - Public Tunnel Mode) 🚀
If you want to track a phone that is **not** on the same Wi-Fi network (e.g. using mobile data / 4G / 5G), you can generate a secure public link:

1. Open a **third** terminal window.
2. Navigate to the frontend folder:
   ```bash
   cd frontend
   ```
3. Run the tunnel script:
   ```bash
   npm run tunnel
   ```
4. This will run a secure SSH tunnel to `localhost.run` and print a secure, direct link like:
   `https://xxxx.lhr.life`

---

## How to View Your Mobile's Current Location on the Map

### Step 1: Connect to the Same Wi-Fi
Make sure your **mobile phone** and your **PC/laptop** are both connected to the **same Wi-Fi network**.

### Step 2: Open the Admin Map on your PC
1. Navigate to: **`https://localhost:5173/admin`**
2. When the SSL warning page loads (*"Your connection is not private"*), click **Advanced** (or *More Information*) and select **"Proceed to localhost (unsafe)"**.

### Step 3: Open the Tracker on your Mobile Phone
1. Look at your Vite terminal network line to get your PC's IP address (e.g. `10.247.60.51`).
2. Open Chrome or Safari on your phone, and go to:
   👉 **`https://10.247.60.51:5173/tracker`** (replace `10.247.60.51` with your actual network IP).
3. Accept the SSL warning on your phone (*Advanced -> Proceed to IP (unsafe)*).
4. Check the **"Bypass Time Restriction"** box at the bottom.
5. Tap **"Share My Location"** and select **"Allow"** when prompted for GPS access.

Look back at your PC monitor—you will immediately see your marker moving on the map in real-time! 🚀

---

---

## Technical Stack & Features Used

If you are presenting this project, here is a complete breakdown of the technologies running under the hood:

### 1. Mapping & Geolocation 🌍
* **Leaflet.js & React-Leaflet:** The core open-source libraries used to render the interactive, draggable, and zoomable map interface on the Admin dashboard.
* **HTML5 Geolocation API:** We use the browser's built-in `navigator.geolocation.watchPosition()` to request permissions and continuously track the mobile device's live GPS coordinates (latitude and longitude).

### 2. Real-Time Communication ⚡
* **Socket.IO:** The backbone of the live-tracking feature. Instead of the client constantly refreshing the page, Socket.IO establishes a persistent WebSocket connection. When the student's phone moves, it emits the coordinates to the server, which instantly broadcasts them directly to the Admin map in milliseconds.

### 3. Frontend Architecture 💻
* **React.js (v19):** Used to build the modern, component-based robust user interface. 
* **Vite:** The lightning-fast build tool used to compile the React application and run the local development server.
* **Tailwind CSS:** Used directly in the code for responsive, modern, utility-first UI styling. 
* **React Router v7:** Manages client-side routing, easily separating the `/tracker` (mobile flow) and `/admin` (desktop map) environments.

### 4. Backend Server ⚙️
* **Node.js & Express.js:** The core runtime environment and web framework that initializes the server and handles the API infrastructure.
* **CORS:** Cross-Origin Resource Sharing middleware that allows our React frontend to securely talk to our Express backend.
* **Nodemon:** A development utility that automatically restarts the Node server whenever a file change is saved.

### 5. Networking & Security 🔒
* **HTTPS Local Server (Vite Basic SSL plugin):** Mobile browsers (like iOS Safari and Android Chrome) have strict security policies that completely block access to GPS APIs on insecure `HTTP` pages. This plugin automatically generates a local SSL certificate, forcing the local network to run over `HTTPS` and allowing seamless phone GPS testing on your home Wi-Fi network.
