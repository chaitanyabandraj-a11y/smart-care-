import { io } from 'socket.io-client';

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(window.location.origin, {
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
