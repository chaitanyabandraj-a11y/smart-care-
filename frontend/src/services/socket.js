import { io } from 'socket.io-client';

let socket = null;

const LIVE_BACKEND = 'https://smart-care-m6um.onrender.com';

const isExternalDeploy = typeof window !== 'undefined' && 
  (window.location.hostname.includes('vercel.app') || 
   (!window.location.hostname.includes('onrender.com') && 
    window.location.hostname !== 'localhost' && 
    window.location.hostname !== '127.0.0.1'));

export const SOCKET_SERVER_URL = import.meta.env.VITE_BACKEND_URL || (isExternalDeploy ? LIVE_BACKEND : window.location.origin);

export function getSocket() {
  if (!socket) {
    socket = io(SOCKET_SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000
    });
  }
  return socket;
}

export function joinHospitalRoom(hospitalId) {
  const s = getSocket();
  s.emit('join_hospital', hospitalId);
}

export function leaveHospitalRoom(hospitalId) {
  const s = getSocket();
  s.emit('leave_hospital', hospitalId);
}

export function joinOpdHospitalRoom(hospitalId) {
  const s = getSocket();
  s.emit('join_opd_hospital', hospitalId);
}

export function leaveOpdHospitalRoom(hospitalId) {
  const s = getSocket();
  s.emit('leave_opd_hospital', hospitalId);
}

export function joinOpdDoctorRoom(doctorId) {
  const s = getSocket();
  s.emit('join_opd_doctor', doctorId);
}

export function leaveOpdDoctorRoom(doctorId) {
  const s = getSocket();
  s.emit('leave_opd_doctor', doctorId);
}
