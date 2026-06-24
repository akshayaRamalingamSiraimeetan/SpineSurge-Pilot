# 🏥 SpineSurge Pro (Web Edition)

SpineSurge Pro is a high-performance medical imaging and surgical planning application designed for browser-based spine visualization and simulation.

> [!IMPORTANT]  
> This project is a **pure Web Application**. All legacy desktop/Electron components have been removed.

---

## 🚀 Quick Start: How to Run
### 0. Setup .env :
Create a .env file in the project root:
copy .env.example .env

and add in the following values:
# PostgreSQL Database
DATABASE_URL=postgresql://<DB_USERNAME>:<DB_PASSWORD>@<DB_HOST>:<DB_PORT>/<DB_NAME>

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Application
You must run both the backend (Data API) and the frontend (UI).

- **Terminal 1: Backend Server**  
  ```bash
  npm run start:server
  ```
  *(Server runs at `http://localhost:3001`)*

- **Terminal 2: Frontend (Vite)**  
  ```bash
  npm run dev
  ```
  *(Frontend runs at `http://localhost:5173`)*

---

## 📂 Project Structure (Web-Only)

- `src/renderer/` — Core React application, imaging logic, and UI components.
- `server/` — Node.js backend with SQLite persistence using Drizzle ORM.
- `server/data/` — Local database storage (`spinesurge.db`).
- `public/` — Static assets, 3D models, and DICOM sample data.

---

## 🛠️ Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS.
- **Medical Imaging**: Cornerstone3D, VTK.js, ITK-Wasm.
- **Backend/Database**: Express, SQLite (Better-SQLite3), Drizzle ORM.
- **Collaboration**: Yjs + WebSockets for real-time planning sync.

---

## 📄 Core Workflow

1. **Load DICOM**: Import CT scans via drag-and-drop or use the built-in demo.
2. **Crop ROI**: Define your Region of Interest directly on 2D axial/sagittal/coronal views.
3. **Place Screws**: Position hardware in 3D and fine-tune trajectory across all 2D planes.
4. **Grade & Export**: Calculate bone contact metrics and export PDF reports.

---

## 🔒 Security & Maintenance
The project has undergone a security audit. Run `npm audit` to verify dependency health.

## 📄 License
© 2026 InovaceX. All rights reserved. Proprietary software for medical simulation.
