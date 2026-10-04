// Forfaits mensuels (prix affichés; les prix réels sont dans Stripe, voir README → Abonnements).
export type PlanKey = 'solo' | 'equipe' | 'pro';

export interface Plan {
  key: PlanKey;
  name: string;
  price: number; // $ CA par mois, avant taxes
  pitch: string;
  features: string[];
  highlight?: boolean;
}

export const PLANS: Plan[] = [
  {
    key: 'solo', name: 'Solo', price: 39, pitch: 'Pour l’entrepreneur qui travaille seul',
    features: ['Soumissions et factures illimitées', 'Codes de prix et facture express', 'Agenda, route du jour et météo', 'Reçus lus automatiquement + km', 'Portail client: signature et paiement par carte', 'Rapports TPS/TVQ et dossier comptable'],
  },
  {
    key: 'equipe', name: 'Équipe', price: 79, highlight: true, pitch: 'Jusqu’à 5 employés',
    features: ['Tout Solo', 'Comptes employés et vendeurs', 'Pointage GPS et feuilles de temps', 'Couleurs par employé dans l’agenda', 'CRM des demandes + formulaire en ligne', 'Commissions et rentabilité par job'],
  },
  {
    key: 'pro', name: 'Pro', price: 129, pitch: 'Employés illimités, plusieurs équipes',
    features: ['Tout Équipe', 'Employés illimités', 'Projets et budgets', 'Avis Google automatisés', 'Soutien prioritaire', 'Accompagnement au démarrage'],
  },
];

export const planOf = (k?: string) => PLANS.find((p) => p.key === k);
