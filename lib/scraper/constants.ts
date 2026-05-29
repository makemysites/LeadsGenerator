export const SPECIALTIES: string[] = [
  'General Physician',
  'Dentist',
  'Dermatologist',
  'Cardiologist',
  'Orthopedic Doctor',
  'Pediatrician',
  'Gynecologist',
  'Neurologist',
  'Ophthalmologist',
  'ENT Specialist',
  'Psychiatrist',
  'Urologist',
  'Gastroenterologist',
  'Diabetologist',
  'Pulmonologist',
  'Oncologist',
  'Nephrologist',
  'Endocrinologist',
  'Ayurvedic Doctor',
  'Homeopathy Doctor',
  'Physiotherapist',
  'Dietitian',
  'Sexologist',
  'Rheumatologist',
  'Radiologist',
];

export const AREAS: string[] = [
  'Banjara Hills',
  'Jubilee Hills',
  'Madhapur',
  'Gachibowli',
  'Kondapur',
  'Hitech City',
  'Kukatpally',
  'Miyapur',
  'Secunderabad',
  'Begumpet',
  'Ameerpet',
  'SR Nagar',
  'Dilsukhnagar',
  'LB Nagar',
  'Uppal',
  'Nacharam',
  'Tarnaka',
  'Malkajgiri',
  'Sainikpuri',
  'Kompally',
  'Alwal',
  'Bowenpally',
  'Marredpally',
  'Himayatnagar',
  'Nampally',
  'Mehdipatnam',
  'Tolichowki',
  'Attapur',
  'Rajendranagar',
  'Manikonda',
  'Nanakramguda',
  'Kokapet',
  'Tellapur',
  'Bachupally',
  'Nizampet',
  'ECIL',
  'Moula Ali',
  'Hayathnagar',
  'Nagole',
  'Vanasthalipuram',
];

export const SPECIALTY_COLORS: Record<string, { bg: string; text: string }> = {
  'General Physician':    { bg: '#DBEAFE', text: '#1E40AF' },
  'Dentist':              { bg: '#D1FAE5', text: '#065F46' },
  'Dermatologist':        { bg: '#FCE7F3', text: '#9D174D' },
  'Cardiologist':         { bg: '#FEE2E2', text: '#991B1B' },
  'Orthopedic Doctor':    { bg: '#E0E7FF', text: '#3730A3' },
  'Pediatrician':         { bg: '#CFFAFE', text: '#155E75' },
  'Gynecologist':         { bg: '#FDF2F8', text: '#831843' },
  'Neurologist':          { bg: '#EDE9FE', text: '#5B21B6' },
  'Ophthalmologist':      { bg: '#ECFDF5', text: '#064E3B' },
  'ENT Specialist':       { bg: '#FEF3C7', text: '#92400E' },
  'Psychiatrist':         { bg: '#F3E8FF', text: '#6B21A8' },
  'Urologist':            { bg: '#E0F2FE', text: '#075985' },
  'Gastroenterologist':   { bg: '#FFF7ED', text: '#9A3412' },
  'Diabetologist':        { bg: '#F0FDF4', text: '#166534' },
  'Pulmonologist':        { bg: '#F0F9FF', text: '#0C4A6E' },
  'Oncologist':           { bg: '#FFF1F2', text: '#9F1239' },
  'Nephrologist':         { bg: '#FAF5FF', text: '#7E22CE' },
  'Endocrinologist':      { bg: '#FFFBEB', text: '#B45309' },
  'Ayurvedic Doctor':     { bg: '#F0FDF4', text: '#15803D' },
  'Homeopathy Doctor':    { bg: '#FEFCE8', text: '#A16207' },
  'Physiotherapist':      { bg: '#F1F5F9', text: '#334155' },
  'Dietitian':            { bg: '#FDF4FF', text: '#86198F' },
  'Sexologist':           { bg: '#FEF2F2', text: '#B91C1C' },
  'Rheumatologist':       { bg: '#EFF6FF', text: '#1D4ED8' },
  'Radiologist':          { bg: '#F8FAFC', text: '#475569' },
};

export interface SearchCombination {
  specialty: string;
  area: string;
}

/**
 * Generates all specialty + area combinations (25 × 40 = 1000).
 */
export function generateCombinations(): SearchCombination[] {
  const combinations: SearchCombination[] = [];
  for (const specialty of SPECIALTIES) {
    for (const area of AREAS) {
      combinations.push({ specialty, area });
    }
  }
  return combinations;
}

export const TOTAL_COMBINATIONS = SPECIALTIES.length * AREAS.length; // 1000
