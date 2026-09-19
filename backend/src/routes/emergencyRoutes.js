const express = require('express');
const router = express.Router();
const emergencyDb = require('../db/emergencyDb');
const emergencyService = require('../services/emergencyService');

// 1. User Registration
router.post('/auth/register', (req, res) => {
  try {
    const { name, phone, email, password } = req.body;
    if (!name || !phone || !email || !password) {
      return res.status(400).json({ success: false, error: 'Name, Phone, Email, and Password are all required.' });
    }

    const result = emergencyDb.registerEmergencyUser({ name, phone, email, password });
    if (!result.success) return res.status(400).json(result);

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Verify Registration OTP
router.post('/auth/verify-registration', (req, res) => {
  try {
    const { userId, otpCode } = req.body;
    if (!userId || !otpCode) {
      return res.status(400).json({ success: false, error: 'User ID and OTP Code are required.' });
    }

    const result = emergencyDb.verifyRegistrationOtp({ userId, otpCode });
    if (!result.success) return res.status(400).json(result);

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 3. User Login Request (Phone/Email + Password -> triggers OTP)
router.post('/auth/login-request', (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({ success: false, error: 'Phone/Email and Password are required.' });
    }

    const result = emergencyDb.requestLoginOtp({ identifier, password });
    if (!result.success) return res.status(401).json(result);

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Verify Login OTP
router.post('/auth/login-verify', (req, res) => {
  try {
    const { userId, otpCode } = req.body;
    if (!userId || !otpCode) {
      return res.status(400).json({ success: false, error: 'User ID and OTP Code are required.' });
    }

    const result = emergencyDb.verifyLoginOtp({ userId, otpCode });
    if (!result.success) return res.status(400).json(result);

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Query Top 4 Ranked Nearby Hospitals
router.post('/nearby-hospitals', (req, res) => {
  try {
    const { lat, lng } = req.body;
    // Default to central Delhi coordinates if geolocation is not provided
    const patientLat = Number(lat) || 28.6139;
    const patientLng = Number(lng) || 77.2090;

    const rankedHospitals = emergencyService.getRankedCandidateHospitals(patientLat, patientLng);
    return res.json({ success: true, rankedHospitals });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 5a. Rapido-Style Reverse Geocoding (Converts GPS coordinates to exact readable address)
router.get('/geocode/reverse', async (req, res) => {
  try {
    const { lat, lng } = req.query;
    if (!lat || !lng) {
      return res.status(400).json({ success: false, error: 'Latitude and Longitude are required.' });
    }

    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&zoom=18&addressdetails=1`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'SmartCare-Emergency-Platform/1.0',
        'Accept-Language': 'en'
      }
    });

    if (!response.ok) {
      return res.json({
        success: true,
        displayName: `${Number(lat).toFixed(4)}° N, ${Number(lng).toFixed(4)}° E`,
        address: {}
      });
    }

    const data = await response.json();
    return res.json({
      success: true,
      displayName: data.display_name || `${Number(lat).toFixed(4)}° N, ${Number(lng).toFixed(4)}° E`,
      address: data.address || {}
    });
  } catch (_) {
    return res.json({
      success: true,
      displayName: `${Number(req.query.lat || 0).toFixed(4)}° N, ${Number(req.query.lng || 0).toFixed(4)}° E`,
      address: {}
    });
  }
});

// 5b. Rapido-Style Address Search Autocomplete (Search landmark, colony, street, metro)
router.get('/geocode/search', async (req, res) => {
  try {
    const { query } = req.query;
    if (!query || query.trim().length < 2) {
      return res.json({ success: true, results: [] });
    }

    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=in&limit=5&addressdetails=1`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'SmartCare-Emergency-Platform/1.0',
        'Accept-Language': 'en'
      }
    });

    if (!response.ok) {
      return res.json({ success: true, results: [] });
    }

    const data = await response.json();
    const results = data.map((item) => ({
      name: item.display_name,
      lat: Number(item.lat),
      lng: Number(item.lon)
    }));

    return res.json({ success: true, results });
  } catch (_) {
    return res.json({ success: true, results: [] });
  }
});

// 5c. Patient Device IP Fallback Location (if hardware GPS is disabled on desktop)
router.get('/geocode/ip-location', async (req, res) => {
  try {
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
    if (ip && ip !== '::1' && ip !== '127.0.0.1') {
      const response = await fetch(`https://ipapi.co/${ip}/json/`);
      if (response.ok) {
        const data = await response.json();
        if (data.latitude && data.longitude) {
          return res.json({
            success: true,
            lat: Number(data.latitude),
            lng: Number(data.longitude),
            city: data.city || 'Delhi',
            region: data.region || 'Delhi'
          });
        }
      }
    }
  } catch (_) {}

  // Fallback to central Delhi region if IP lookup fails
  return res.json({
    success: true,
    lat: 28.6139,
    lng: 77.2090,
    city: 'Delhi',
    region: 'Delhi'
  });
});

// 6. Submit Emergency Request (Triggers Sequential 2-Min Routing)
router.post('/request', (req, res) => {
  try {
    const { userId, patientName, phone, symptoms, lat, lng, address } = req.body;
    if (!patientName || !phone || !symptoms) {
      return res.status(400).json({ success: false, error: 'Patient Name, Phone, and Symptoms are required.' });
    }

    const patientLat = Number(lat) || 28.6139;
    const patientLng = Number(lng) || 77.2090;

    // Get 4 nearest qualifying candidate hospitals
    const rankedQueue = emergencyService.getRankedCandidateHospitals(patientLat, patientLng);
    if (rankedQueue.length === 0) {
      return res.status(400).json({ success: false, error: 'No available hospitals found nearby with adequate capacity.' });
    }

    // Create emergency request in DB
    const request = emergencyDb.createEmergencyRequest({
      userId: userId || 'anonymous-sos',
      patientName,
      phone,
      symptoms,
      lat: patientLat,
      lng: patientLng,
      address: address || '',
      hospitalQueue: rankedQueue
    });

    // Dispatch to first hospital in queue via Socket.IO
    const io = req.app.get('io');
    emergencyService.dispatchToCurrentHospital(io, request);

    return res.json({
      success: true,
      message: 'Emergency SOS activated! Sequential hospital routing initiated.',
      request
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Get Emergency Request Status (with auto-advance if step timed out)
router.get('/request/:id', (req, res) => {
  try {
    let request = emergencyDb.getEmergencyRequest(req.params.id);
    if (!request) return res.status(404).json({ success: false, error: 'Emergency request not found.' });

    // Auto-advance if 2-minute step timer expired
    if (request.status === 'ROUTING') {
      const now = Date.now();
      const expiresAt = new Date(request.step_expires_at).getTime();
      if (now >= expiresAt) {
        const io = req.app.get('io');
        emergencyService.advanceRouting(io, req.params.id, 'TIMEOUT');
        request = emergencyDb.getEmergencyRequest(req.params.id);
      }
    }

    const logs = emergencyDb.getRoutingLogs(req.params.id);
    return res.json({ success: true, request, logs });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 8. Hospital Admin: Get Current Pending Incoming Emergency Alert (2-min window)
router.get('/hospital/:hospitalId/pending', (req, res) => {
  try {
    const pendingAlert = emergencyService.getHospitalPendingEmergency(req.params.hospitalId);
    return res.json({ success: true, pendingAlert });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 9. Hospital Admin: Get Active Incoming and Accepted Emergencies
router.get('/hospital/:hospitalId/active', (req, res) => {
  try {
    const emergencies = emergencyService.getHospitalIncomingEmergencies(req.params.hospitalId);
    return res.json({ success: true, emergencies });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 9. Hospital Admin: Accept Emergency Request
router.post('/hospital/:hospitalId/accept/:requestId', (req, res) => {
  try {
    const io = req.app.get('io');
    const result = emergencyService.acceptEmergencyRequest(io, req.params.hospitalId, req.params.requestId);
    if (!result.success) return res.status(400).json(result);

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 10. Hospital Admin: Reject Emergency Request
router.post('/hospital/:hospitalId/reject/:requestId', (req, res) => {
  try {
    const io = req.app.get('io');
    const result = emergencyService.rejectEmergencyRequest(io, req.params.hospitalId, req.params.requestId);
    if (!result.success) return res.status(400).json(result);

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
