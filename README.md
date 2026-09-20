# SmartCare Healthcare Coordination Platform

> Decentralized Multi-Hospital Emergency Coordination & Digital OPD Management System

## LIVE URL
**https://smart-care-m6um.onrender.com**

> First request may take 30-60 seconds (free tier wake-up). After that runs fast.

---

## SYSTEM MODULES

| Module | Description |
|--------|-------------|
| Hospital Admin | Live bed management, doctor roster, emergency alerts |
| Emergency SOS | 2-minute sequential hospital routing algorithm |
| Ambulance Driver | GPS cockpit, real-time dispatch |
| Patient OPD | UHID registration, ORS booking wizard, virtual queue |
| Doctor Portal | Chamber desk, digital prescriptions, duty schedule |

---

## TECH STACK
- Frontend: Vite + React, Vanilla CSS, Socket.IO-client, Lucide-react, Leaflet.js, qrcode
- Backend: Node.js + Express.js, Socket.IO
- Database: SQLite (opd.db + emergency.db — auto-seeded on startup)
- Real-Time: Socket.IO with room-based isolation

---

## FOR ADMIN'S LOGIN — HOSPITAL-WISE

| HOSPITALS | ADMIN NAME | ADMIN ID | PASSWORD |
|---|---|---|---|
| AIIMS New Delhi | Dr. Arvind Gupta | ADMIN-AIIMS-03 | Aiims@2026 |
| Apollo Hospital | Dr. Rajesh Sharma | ADMIN-APOLLO-01 | Apollo@2026 |
| Fortis Escorts | Dr. Priya Nair | ADMIN-FORTIS-04 | Fortis@2026 |
| Lok Nayak (LNJP) | Dr. Sunita Verma | ADMIN-LOKNAYAK-02 | LokNayak@2026 |
| Max Super Speciality | Dr. Vikram Malhotra | ADMIN-MAX-05 | MaxSaket@2026 |

> Note: First time = Register tab (Name + ID + Password). Next time = Login tab (ID + Password only).

---

## FOR PATIENT LOGIN

| UHID | Name | Mobile | Method |
|---|---|---|---|
| UHID-2026-44205 | chaitanya | 9310685960 | UHID or Mobile + OTP |
| UHID-2026-429374 | kajal | 8287547496 | UHID or Mobile + OTP |

> OTP is simulated — check server logs or use any 6-digit number in dev mode.

---

## FOR DRIVER'S LOGIN

| DRIVER ID | PASSWORD |
|---|---|
| DRV-APOLLO-01 through DRV-APOLLO-10 | Driver@123 |
| DRV-AIIMS-01 through DRV-AIIMS-10 | Driver@123 |
| DRV-FORTIS-01 through DRV-FORTIS-10 | Driver@123 |
| DRV-MAX-01 through DRV-MAX-10 | Driver@123 |
| DRV-LOKNAYAK-01 through DRV-LOKNAYAK-10 | Driver@123 |

---

## FOR DOCTOR'S LOGIN — HOSPITAL-WISE

**Hospital select -> Doctor ID -> Password**

### AIIMS New Delhi

| Doctor ID | Doctor Name | Department | Password |
|---|---|---|---|
| DOC-AIIMS-01 | Dr. Arvind Gupta | Cardiology | Doctor@123 |
| DOC-AIIMS-02 | Dr. Meenakshi Sundaram | General Medicine | Doctor@123 |
| DOC-AIIMS-03 | Dr. Rajeshwar Singh | Orthopedics | Doctor@123 |
| DOC-AIIMS-04 | Dr. Sunita Deshmukh | Pediatrics | Doctor@123 |
| DOC-AIIMS-05 | Dr. Vivek Bhattacharya | Neurology | Doctor@123 |
| DOC-AIIMS-06 | Dr. Tanvi Sharma | Dermatology | Doctor@123 |

### Indraprastha Apollo

| Doctor ID | Doctor Name | Password |
|---|---|---|
| DOC-APOLLO-01 | Dr. Alok Mukherjee | Doctor@123 |
| DOC-APOLLO-02 | Dr. Shalini Kapoor | Doctor@123 |
| DOC-APOLLO-03 | Dr. Harsh Vardhan Goel | Doctor@123 |
| DOC-APOLLO-04 | Dr. Ritu Rastogi | Doctor@123 |
| DOC-APOL-26738 | Dr. Sneha Roy | Doctor@123 |
| DOC-APOLLO-05 | Dr. Sunita Deshmukh | SecureDoctorPass@123 |
| DOC-APOLLO-06 | Dr. Vivek Saxena | SecureDoctorPass@123 |

### Fortis Escorts

| Doctor ID | Doctor Name | Password |
|---|---|---|
| DOC-FORTIS-01 | Dr. Priya Nair | Doctor@123 |
| DOC-FORTIS-02 | Dr. Sanjay Kaushik | Doctor@123 |
| DOC-FORTIS-03 | Dr. Sameer Joshi | Doctor@123 |

### Lok Nayak

| Doctor ID | Doctor Name | Password |
|---|---|---|
| DOC-LOK-01 | Dr. Manoj Saxena | Doctor@123 |
| DOC-LOK-02 | Dr. Rekha Bansal | Doctor@123 |
| DOC-LOK-03 | Dr. Devendra Sharma | Doctor@123 |
| DOC-LOK-04 | Dr. Ananya Sen | Doctor@123 |

### Max Super Speciality

| Doctor ID | Doctor Name | Password |
|---|---|---|
| DOC-MAX-01 | Dr. Vikramaditya Rawat | Doctor@123 |
| DOC-MAX-02 | Dr. Neha Agarwal | Doctor@123 |
| DOC-MAX-03 | Dr. Rohan Mehra | Doctor@123 |

---

## QUICK START (Local Development)

### Prerequisites
- Node.js v18+

### Install & Run

`bash
# Install root dependencies
npm install

# Install frontend dependencies
npm install --prefix frontend

# Run backend
node backend/src/server.js

# In another terminal - Run frontend dev server
npm run dev --prefix frontend
`

---

## LICENSE
MIT License | SmartCare Prototype v1.0 | Chaitanya Bandraj | SIH 2026
