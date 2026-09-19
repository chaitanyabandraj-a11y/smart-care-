# SmartCare OPD & Doctor Portal - REST API & Real-Time Documentation

## Base URL
- **REST Endpoints**: `http://localhost:5000/api/opd`
- **Socket.IO Gateway**: `ws://localhost:5000` (path `/socket.io`)

---

## 1. Consultation Lifecycle & Virtual Queue

### 1.1 Start Doctor Desk Session
`POST /api/opd/doctor/session/start`
- **Body**: `{ hospitalId: string, doctorId: string, date: string }`
- **Behavior**: Marks doctor `ON_DESK`. Chamber enters open state waiting for doctor to explicitly call patient #1. `activeToken` remains `0`.
- **Response**: `{ success: true, message: string, queue: Object }`

### 1.2 Call Specific / Next Token
`POST /api/opd/doctor/call-token`
- **Body**: `{ hospitalId: string, doctorId: string, date: string, targetToken?: number }`
- **Behavior**:
  - Sets target token to `IN_CONSULTATION` and `presence_status: 'PRESENT'`.
  - Sets `activeToken: targetToken` and starts live consultation stopwatch (`consultation_started_at: Date.now()`).
  - Emits real-time event `opd:token_called` and `opd:queue_updated`.
  - If queue has no remaining waiting patients, returns `400` with `isQueueComplete: true` and does **not** create phantom tokens.
- **Response**: `{ success: true, calledToken: number, calledPatient: Object, queue: Object }`

### 1.3 Complete Consultation
`POST /api/opd/doctor/complete-consultation`
- **Body**: `{ hospitalId: string, doctorId: string, date: string, tokenNumber?: number, notes?: string, durationMins?: number }`
- **Behavior**:
  - Calculates exact duration $\Delta t$ from stopwatch or duration parameter.
  - Updates appointment `status: 'COMPLETED'`, `completed_at`, `consultation_duration_mins`.
  - Updates virtual queue: sets `active_token: 0`, `last_completed_token: tokenNumber`, increments `total_consultations_completed`, updates dynamic running average duration `actual_avg_duration_mins`.
  - Emits `opd:consultation_completed` and `opd:queue_updated`.
- **Response**: `{ success: true, completedToken: number, durationMins: number, message: string, queue: Object }`

### 1.4 Mark Patient Not Present
`POST /api/opd/doctor/mark-not-present`
- **Body**: `{ hospitalId: string, doctorId: string, date: string, tokenNumber: number }`
- **Behavior**: Sets appointment `status: 'NOT_PRESENT'` and `presence_status: 'NOT_PRESENT'`. If patient was inside chamber, resets chamber to idle.
- **Response**: `{ success: true, message: string, queue: Object }`

### 1.5 Re-Add Patient to Queue
`POST /api/opd/doctor/re-add-queue`
- **Body**: `{ hospitalId: string, doctorId: string, date: string, tokenNumber: number, priorityRule?: 'NEXT' | 'LAST' }`
- **Behavior**: Restores appointment to `CONFIRMED` / `PRESENT` so doctor can call them.
- **Response**: `{ success: true, message: string, queue: Object }`

### 1.6 Fetch Virtual Queue Status
`GET /api/opd/queue/:hospitalId/:doctorId/:date?token=XYZ`
- **Query Params**: `token` (optional patient token number)
- **Response**:
  ```json
  {
    "success": true,
    "queue": {
      "hospitalId": "aiims",
      "doctorId": "DOC-AIIMS-01",
      "doctorStatus": "ON_DESK",
      "consultationState": "IN_CONSULTATION",
      "activeToken": 5,
      "lastCompletedToken": 4,
      "nextWaitingToken": 6,
      "isQueueComplete": false,
      "patientTokenNumber": 6,
      "patientsAhead": 1,
      "estimatedWaitMins": 12,
      "queueState": "DOCTOR_DONE_PREVIOUS_PREPARE_NOW"
    }
  }
  ```

---

## 2. Digital Prescriptions (with Voice Dictation)

### 2.1 Create Digital Prescription
`POST /api/opd/prescription/create`
- **Body**:
  ```json
  {
    "appointmentId": "APT-2026-001",
    "uhid": "UHID-2026-706472",
    "patientName": "Rohan Sharma",
    "doctorId": "DOC-AIIMS-01",
    "doctorName": "Dr. Arvind Gupta",
    "hospitalId": "aiims",
    "hospitalName": "AIIMS New Delhi",
    "diagnosis": "Dyslipidemia",
    "clinicalNotes": "Advised lipid profile",
    "voiceTranscript": "Advised lipid profile",
    "medicines": [
      { "name": "Atorvastatin", "dosage": "20 mg", "frequency": "0-0-1", "duration": "30 days", "instructions": "At bedtime" }
    ],
    "advice": "Low salt diet",
    "followUpDate": "2026-10-05"
  }
  ```
- **Behavior**: Saves prescription in `opd_prescriptions`, auto-creates authorized medical record in `opd_medical_records`, writes audit log entry.
- **Response**: `{ success: true, prescriptionId: "RX-...", prescription: Object }`

### 2.2 Get Patient Prescriptions
`GET /api/opd/prescription/patient/:uhid`
- **Response**: `{ success: true, prescriptions: Array }`

### 2.3 Get Single Prescription by ID
`GET /api/opd/prescription/:id`
- **Response**: `{ success: true, prescription: Object }`

---

## 3. Structured Medical Records

### 3.1 Create Authorized Medical Record
`POST /api/opd/medical-record/create`
- **Body**: `{ uhid: string, doctorId: string, doctorName: string, hospitalId: string, title: string, symptoms?: string, clinicalNotes?: string, diagnosis?: string, treatment?: string, followUpDate?: string }`
- **Response**: `{ success: true, recordId: "MR-...", message: string }`

### 3.2 Get Patient Medical Records
`GET /api/opd/medical-record/patient/:uhid`
- **Response**: `{ success: true, records: Array }`

---

## 4. Cryptographic QR Identification

### 4.1 Generate Secure QR Token
`GET /api/opd/qr/generate/:uhid`
- **Behavior**: Generates cryptographic HMAC-SHA256 opaque payload `{ ref: uhid, ts: timestamp, tok: nonce.hmac }`. Zero medical history or clinical diagnosis in raw payload.
- **Response**: `{ success: true, uhid: string, patientName: string, qrPayload: string, issuedAt: string }`

### 4.2 Verify Patient QR (Doctor Scanner at Chamber Desk)
`POST /api/opd/qr/verify`
- **Body**: `{ qrData: string, doctorId?: string, hospitalId?: string }`
- **Behavior**: Unpacks opaque reference, verifies patient identity, queries today's active appointment for this doctor, and authorizes access to medical records and prescriptions.
- **Response**: `{ success: true, patient: Object, todayAppointment: Object, medicalRecords: Array, prescriptions: Array }`

---

## 5. Audit Logging

### 5.1 Query Audit Logs
`GET /api/opd/audit-logs?limit=50`
- **Response**: `{ success: true, logs: Array<{ id, user_id, role, action, entity, entity_id, metadata, timestamp }> }`

---

## 6. Socket.IO Real-Time Events

| Event Name | Scope | Payload | Description |
|---|---|---|---|
| `opd:queue_updated` | `opd_queue_{hospital}_{doctor}_{date}` + Broadcast | Virtual Queue Object | Emitted whenever token changes, session starts/ends, consultation completes |
| `opd:token_called` | Room | `{ token, patient }` | Emitted when doctor calls a token into chamber |
| `opd:consultation_completed` | Room | `{ token, durationMins }` | Emitted when consultation finishes |
| `opd:doctor_status_changed` | Room + Broadcast | `{ doctorId, status: 'ON_DESK' \| 'OFF_DESK' }` | Emitted when doctor starts/ends desk session |
| `opd:appointment_cancelled` | Doctor & Hospital Rooms | `{ appointmentId, queue }` | Emitted when an appointment is cancelled |
