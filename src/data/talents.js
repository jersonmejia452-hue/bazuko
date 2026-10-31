// src/data/talents.js
// Árbol de talentos: cada nodo tiene id, nombre, descripción, costo,
// rama (rama) y efectos que se aplican al juego.

export const TALENTS = {
  // ===== RAMA: Recolección =====
  collector1: {
    id: 'collector1',
    name: 'Ojo de Águila',
    desc: '+25% de probabilidad de objeto raro en basura',
    branch: 'recoleccion',
    cost: 1,
    requires: [],
    effects: { rareChanceMult: 1.25 }
  },
  collector2: {
    id: 'collector2',
    name: 'Bolsas Llenas',
    desc: '+10 de peso máximo en inventario',
    branch: 'recoleccion',
    cost: 1,
    requires: ['collector1'],
    effects: { maxWeightBonus: 10 }
  },
  collector3: {
    id: 'collector3',
    name: 'Selección Experta',
    desc: 'Seleccionar basura da +50% de valor y -20% de enfermedad',
    branch: 'recoleccion',
    cost: 2,
    requires: ['collector2'],
    effects: { sortValueMult: 1.5, sortDiseaseMult: 0.8 }
  },

  // ===== RAMA: Supervivencia =====
  surv1: {
    id: 'surv1',
    name: 'Estómago de Hierro',
    desc: '-30% de desgaste de hambre y sed',
    branch: 'supervivencia',
    cost: 1,
    requires: [],
    effects: { decayMult: 0.7 }
  },
  surv2: {
    id: 'surv2',
    name: 'Piel Dura',
    desc: '-40% de riesgo de enfermedad en la basura y de sarna al dormir',
    branch: 'supervivencia',
    cost: 1,
    requires: ['surv1'],
    effects: { diseaseResist: 0.6 }
  },
  surv3: {
    id: 'surv3',
    name: 'Mente de Acero',
    desc: '-50% de desgaste de salud mental',
    branch: 'supervivencia',
    cost: 2,
    requires: ['surv2'],
    effects: { mentalDecayMult: 0.5 }
  },

  // ===== RAMA: Crimen =====
  crime1: {
    id: 'crime1',
    name: 'Manos Ligeras',
    desc: '-20% de probabilidad de ser atrapado robando',
    branch: 'crimen',
    cost: 1,
    requires: [],
    effects: { stealCaughtMult: 0.8 }
  },
  crime2: {
    id: 'crime2',
    name: 'Contactos',
    desc: '+30% de precio en sustancias',
    branch: 'crimen',
    cost: 1,
    requires: ['crime1'],
    effects: { substancePriceMult: 1.3 }
  },
  crime3: {
    id: 'crime3',
    name: 'Rey de la Calle',
    desc: '+50% de XP por todas las actividades',
    branch: 'crimen',
    cost: 2,
    requires: ['crime2'],
    effects: { xpMult: 1.5 }
  }
};

export const BRANCHES = [
  { id: 'recoleccion',  name: 'Recolección', emoji: '🗑️' },
  { id: 'supervivencia', name: 'Supervivencia', emoji: '🩹' },
  { id: 'crimen',        name: 'Crimen', emoji: '🔪' }
];
