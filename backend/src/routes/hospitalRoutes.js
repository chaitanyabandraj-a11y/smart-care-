const express = require('express');
const router = express.Router();
const hospitalDbManager = require('../db/hospitalDbManager');

// Helper to broadcast via Socket.IO
function broadcastChange(req, eventName, payload) {
  const io = req.app.get('io');
  if (io) {
    io.emit(eventName, payload);
    // Also emit to hospital-specific room
    if (payload.hospitalId) {
      io.to(`hospital_${payload.hospitalId}`).emit(eventName, payload);
    }
  }
}

// 1. Get all registered hospitals for dropdown
router.get('/', (req, res) => {
  try {
    const hospitals = hospitalDbManager.getAllHospitals();
    return res.json({ success: true, hospitals });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Get single hospital dashboard data
router.get('/:id/dashboard', (req, res) => {
  try {
    const data = hospitalDbManager.getHospitalDashboard(req.params.id);
    return res.json({ success: true, ...data });
  } catch (err) {
    return res.status(404).json({ success: false, error: err.message });
  }
});

// 3. One-time Admin Registration (matches developer pre-entered data)
router.post('/:id/register', (req, res) => {
  try {
    const { adminName, adminId, password } = req.body;
    if (!adminName || !adminId || !password) {
      return res.status(400).json({
        success: false,
        error: 'Admin Name, Admin ID, and Password are all required for registration.'
      });
    }

    const result = hospitalDbManager.registerHospitalAdmin(req.params.id, { adminName, adminId, password });
    if (!result.success) {
      return res.status(400).json(result);
    }

    // Broadcast registration event
    broadcastChange(req, 'hospital:admin_registered', {
      hospitalId: req.params.id,
      adminName: result.admin.adminName,
      timestamp: new Date().toISOString()
    });

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Admin Login
router.post('/:id/login', (req, res) => {
  try {
    const { adminId, password } = req.body;
    if (!adminId || !password) {
      return res.status(400).json({
        success: false,
        error: 'Admin ID and Password are required.'
      });
    }

    const result = hospitalDbManager.loginHospitalAdmin(req.params.id, { adminId, password });
    if (!result.success) {
      return res.status(401).json(result);
    }

    broadcastChange(req, 'hospital:admin_logged_in', {
      hospitalId: req.params.id,
      adminName: result.admin.adminName,
      timestamp: new Date().toISOString()
    });

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Update Bed Availability in Real Time
router.put('/:id/beds', (req, res) => {
  try {
    const hospitalId = req.params.id;
    const { adminName, totalBeds, availableBeds, icuTotal, icuAvailable, oxygenTotal, oxygenAvailable, generalTotal, generalAvailable } = req.body;

    const result = hospitalDbManager.updateBedAvailability(hospitalId, adminName, {
      totalBeds, availableBeds,
      icuTotal, icuAvailable,
      oxygenTotal, oxygenAvailable,
      generalTotal, generalAvailable
    });

    // Real-time broadcast
    broadcastChange(req, 'hospital:beds_updated', {
      hospitalId,
      adminName,
      beds: result.beds,
      lastUpdated: result.lastUpdated
    });

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Update Doctor Availability in Real Time
router.put('/:id/doctors', (req, res) => {
  try {
    const hospitalId = req.params.id;
    const { adminName, totalDoctors, availableDoctors, emergencyDuty, opdDuty } = req.body;

    const result = hospitalDbManager.updateDoctorAvailability(hospitalId, adminName, {
      totalDoctors, availableDoctors,
      emergencyDuty, opdDuty
    });

    // Real-time broadcast
    broadcastChange(req, 'hospital:doctors_updated', {
      hospitalId,
      adminName,
      doctors: result.doctors,
      lastUpdated: result.lastUpdated
    });

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
