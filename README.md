# SmartCare Healthcare Coordination Platform

> Decentralized Multi-Hospital Emergency Coordination & Digital OPD Management System

## Prototype v1.0 | September 2026

---

## Overview

SmartCare is a full-stack, real-time healthcare coordination platform integrating **five modules**:

| Module | Role |
|--------|------|
| Hospital Admin | Bed management, doctor roster, emergency alerts |
| Emergency SOS | 2-minute sequential hospital routing algorithm |
| Ambulance Driver | GPS cockpit, dispatch management |
| Patient OPD | UHID registration, ORS booking wizard, virtual queue |
| Doctor Portal | Chamber desk, digital prescriptions, duty schedule |

---

## Tech Stack

- **Frontend**: Vite + React (JSX), Vanilla CSS, Lucide-react, Socket.IO-client, qrcode
- **Backend**: Node.js + Express.js, Socket.IO
- **Database**: SQLite (opd.db + emergency.db)
- **Real-Time**: Socket.IO with room-based isolation

---

## Quick Start

### Prerequisites
- Node.js v18+

### Install & Run (Development)

`bash
# Install root dependencies
npm install

# Install frontend dependencies
npm install --prefix frontend

# Install backend dependencies
npm install --prefix backend

# Run both (frontend :3000 + backend :5000)
npm run dev
`

### Production Build

`bash
npm run build --prefix frontend
node backend/src/server.js
# Open http://localhost:5000
`

---

## Demo Credentials

| Module | Login |
|--------|-------|
| Patient | UHID: UHID-2026-44205 or Mobile: 9310685960 |
| Doctor | Hospital: AIIMS, Doctor ID: DOC-AIIMS-02, Password: Doctor@123 |
| Ambulance | Vehicle: MH-01-AB-1234, PIN: 1234 |

---

## Key Features

- **2-Minute Sequential Emergency Routing** - Auto-escalates to next hospital if no response
- **Real-Time Virtual Queue** - Patients track queue from home via Socket.IO
- **Token Duplication Prevention** - MAX(token)+1 algorithm prevents reuse after cancellations
- **Voice-to-Text Prescriptions** - Web Speech API dictation in doctor portal
- **Cryptographic QR Identity** - HMAC-SHA256 signed patient identity cards
- **IST-Safe Date Handling** - Local timezone-aware date logic throughout

---

## Project Structure

`
coordination/
├── backend/
│   ├── src/
│   │   ├── db/
│   │   │   ├── opdDbManager.js      # All OPD business logic (~2400 lines)
│   │   │   └── emergencyDbManager.js
│   │   ├── routes/
│   │   │   ├── opdRoutes.js
│   │   │   └── emergencyRoutes.js
│   │   └── server.js
│   └── .env.example
├── frontend/
│   └── src/
│       └── components/
│           ├── patient/             # PatientAuth, OrsBookingWizard, PatientVirtualQueue...
│           ├── doctor/              # DoctorOpdPortal (full chamber management)
│           └── ambulance/           # AmbulanceCockpit, AmbulanceActiveRide...
└── docs/
    ├── API_DOCUMENTATION.md
    └── DATABASE_ER_DIAGRAM.md
`

---

## License

MIT License | For academic/prototype use
