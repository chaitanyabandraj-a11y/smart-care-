// Hospital and platform logo registry for UI components
export const HOSPITAL_LOGOS = {
  aiims: '/logos/aiims.svg',
  apollo: '/logos/apollo.svg',
  fortis: '/logos/fortis.svg',
  lok_nayak: '/logos/lok_nayak.svg',
  max: '/logos/max.svg',
  smartcare: '/logos/smartcare.svg',
  ambulance: '/logos/ambulance.svg',
  emergency: '/logos/emergency.svg'
};

export function getHospitalLogo(hospitalId) {
  if (!hospitalId) return HOSPITAL_LOGOS.smartcare;
  const key = hospitalId.toLowerCase().replace(/[^a-z0-9_]/g, '');
  for (const k of Object.keys(HOSPITAL_LOGOS)) {
    if (key.includes(k) || k.includes(key)) {
      return HOSPITAL_LOGOS[k];
    }
  }
  return HOSPITAL_LOGOS.smartcare;
}

export default HOSPITAL_LOGOS;
