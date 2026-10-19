import type { Prospect } from '../types'

const names = [
  'Carlos Mendoza', 'Andrea Torres', 'Luis Ramírez', 'María Fernández', 'José Castillo',
  'Daniela Vargas', 'Miguel Rojas', 'Lucía Salazar', 'Jorge Medina', 'Valeria Chávez',
  'Renato Paredes', 'Camila Flores', 'Diego Gutiérrez', 'Paola Herrera', 'Alonso Cabrera',
  'Fernanda León', 'Sebastián Navarro', 'Gabriela Soto', 'Martín Acosta', 'Ximena Reyes',
  'Rodrigo Campos', 'Natalia Vega', 'Bruno Espinoza', 'Cecilia Ríos', 'Álvaro Silva',
]

// A fixed set keeps every presentation consistent. These records and numbers are fictional.
const eligibleIndexes = new Set([0, 1, 3, 4, 6, 7, 9, 10, 12, 14, 15, 17, 18, 20, 22, 24])

export function createDemoProspects(): Prospect[] {
  return names.map((name, index) => ({
    id: `demo-${index + 1}`,
    dni: String(74000001 + index),
    name,
    phone: `900000${String(index + 101).padStart(3, '0')}`,
    status: 'pending',
    offerAmount: null,
    rate: null,
    lastReview: null,
    nextReview: null,
    contactDate: null,
    message: null,
    mockEligibility: eligibleIndexes.has(index),
    eligibility: null,
  }))
}
