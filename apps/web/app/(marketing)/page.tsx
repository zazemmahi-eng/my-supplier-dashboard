import Image from 'next/image';
import Link from 'next/link';

import { 
  ArrowRightIcon, 
  LayoutDashboard, 
  TrendingUp, 
  AlertTriangle,
  CheckCircle,
  Clock
} from 'lucide-react';

import {
  CtaButton,
  FeatureCard,
  FeatureGrid,
  FeatureShowcase,
  FeatureShowcaseIconContainer,
  Hero,
  Pill,
} from '@kit/ui/marketing';
import { Trans } from '@kit/ui/trans';

import { withI18n } from '~/lib/i18n/with-i18n';

function SupplierPredictiveDashboard() {
  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 text-white flex flex-col">
        <div className="p-4 text-xl font-bold border-b border-gray-700">
          Qualité & Supply Chain
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <Link href="/dashboard" className="block p-2 rounded hover:bg-gray-700 bg-gray-800">
            📊 Vue d'ensemble
          </Link>
          <Link href="/delivery-risks" className="block p-2 rounded hover:bg-gray-700">
            🚚 Risques de retard
          </Link>
          <Link href="/quality-defects" className="block p-2 rounded hover:bg-gray-700">
            ⚠️ Taux de défauts
          </Link>
          <Link href="/corrective-actions" className="block p-2 rounded hover:bg-gray-700">
            ✅ Actions correctives
          </Link>
          <Link href="/suppliers" className="block p-2 rounded hover:bg-gray-700">
            🏭 Fournisseurs
          </Link>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-gray-50">
        <div className="mt-4 flex flex-col space-y-24 py-14">
          <div className="container mx-auto">
            <Hero
              pill={
                <Pill label={'Innovation'}>
                  <span>Tableau de bord prédictif intelligent</span>
                </Pill>
              }
              title={
                <>
                  <span>Anticipez les retards</span>
                  <span> et défauts fournisseurs</span>
                </>
              }
              subtitle={
                <span>
                  Surveillez en temps réel vos fournisseurs, identifiez les dérives 
                  de processus et anticipez les problèmes de qualité et de livraison 
                  grâce à des prédictions simples et efficaces.
                </span>
              }
              cta={<MainCallToActionButton />}
              image={
                <Image
                  priority
                  className="dark:border-primary/10 rounded-2xl border border-gray-200 shadow-2xl"
                  width={3558}
                  height={2222}
                  src={`/images/supplier-dashboard.webp`}
                  alt={`Tableau de bord prédictif fournisseurs`}
                />
              }
            />
          </div>

          <div className="container mx-auto">
            <div className="flex flex-col space-y-16 xl:space-y-32 2xl:space-y-36">
              <FeatureShowcase
                heading={
                  <>
                    <b className="font-semibold dark:text-white">
                      3 écrans essentiels
                    </b>
                    .{' '}
                    <span className="text-muted-foreground font-normal">
                      Un tableau de bord clair et actionnable pour piloter 
                      efficacement votre chaîne d'approvisionnement et votre qualité.
                    </span>
                  </>
                }
                icon={
                  <FeatureShowcaseIconContainer>
                    <TrendingUp className="h-5" />
                    <span>Prédiction intelligente</span>
                  </FeatureShowcaseIconContainer>
                }
              >
                <FeatureGrid>
                  <FeatureCard
                    className="relative col-span-2 overflow-hidden"
                    label={'Écran 1 : Risques de retard de livraison'}
                    description={`Visualisez les fournisseurs à risque avec analyse des dates promises vs réelles. Moyennes glissantes et tendances pour identifier les retards potentiels avant qu'ils n'impactent la production.`}
                  >
                    <Clock className="absolute -right-8 -top-8 h-32 w-32 text-blue-100 opacity-20" />
                  </FeatureCard>

                  <FeatureCard
                    className="relative col-span-2 w-full overflow-hidden lg:col-span-1"
                    label={'Écran 2 : Évolution des défauts'}
                    description={`Suivez le taux de défauts par fournisseur avec alertes automatiques sur les dérives de processus. Détection précoce des problèmes qualité.`}
                  >
                    <AlertTriangle className="absolute -right-6 -top-6 h-24 w-24 text-orange-100 opacity-20" />
                  </FeatureCard>

                  <FeatureCard
                    className="relative col-span-2 overflow-hidden lg:col-span-1"
                    label={'Écran 3 : Actions correctives'}
                    description={`Recommandations simples et actionnables : formation, recalibrage, vérification. Priorisées par impact et urgence.`}
                  >
                    <CheckCircle className="absolute -right-6 -top-6 h-24 w-24 text-green-100 opacity-20" />
                  </FeatureCard>

                  <FeatureCard
                    className="relative col-span-2 overflow-hidden"
                    label={'Méthodes prédictives simples'}
                    description={`Moyennes glissantes et tendances linéaires pour des prédictions compréhensibles par tous. Résultats clairs sans "boîte noire".`}
                  >
                    <LayoutDashboard className="absolute -right-8 -top-8 h-32 w-32 text-purple-100 opacity-20" />
                  </FeatureCard>
                </FeatureGrid>
              </FeatureShowcase>

              {/* Section Cas d'usage */}
              <div className="rounded-xl bg-white p-8 shadow-lg">
                <h2 className="mb-6 text-3xl font-bold text-gray-900">
                  Scénarios de démonstration
                </h2>
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="rounded-lg border-2 border-orange-200 bg-orange-50 p-6">
                    <h3 className="mb-3 flex items-center text-xl font-semibold text-orange-900">
                      <AlertTriangle className="mr-2 h-6 w-6" />
                      Fournisseur A : Dérive de processus
                    </h3>
                    <p className="text-gray-700">
                      Augmentation progressive du taux de défauts détectée sur 3 semaines. 
                      Le système recommande une recalibration des équipements et une formation 
                      des opérateurs avant que la situation ne devienne critique.
                    </p>
                  </div>
                  
                  <div className="rounded-lg border-2 border-red-200 bg-red-50 p-6">
                    <h3 className="mb-3 flex items-center text-xl font-semibold text-red-900">
                      <Clock className="mr-2 h-6 w-6" />
                      Fournisseur B : Retards récurrents
                    </h3>
                    <p className="text-gray-700">
                      Retards de livraison identifiés au milieu de la période d'analyse. 
                      Alerte précoce permettant de planifier des commandes anticipées et 
                      d'engager un dialogue avec le fournisseur.
                    </p>
                  </div>
                </div>
              </div>

              {/* Section Livrables */}
              <div className="rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 p-8">
                <h2 className="mb-6 text-3xl font-bold text-gray-900">
                  Livrables du projet
                </h2>
                <ul className="space-y-4 text-lg text-gray-700">
                  <li className="flex items-start">
                    <span className="mr-3 text-2xl">📊</span>
                    <span><strong>Tableau de bord interactif</strong> : 3 écrans maximum, visualisations claires et intuitives</span>
                  </li>
                  <li className="flex items-start">
                    <span className="mr-3 text-2xl">📄</span>
                    <span><strong>Note technique</strong> : ≤5 pages expliquant le nettoyage des données, la logique des indicateurs et l'interprétation</span>
                  </li>
                  <li className="flex items-start">
                    <span className="mr-3 text-2xl">🎬</span>
                    <span><strong>Démo scénarisée</strong> : 2-3 minutes illustrant les cas d'usage concrets</span>
                  </li>
                  <li className="flex items-start">
                    <span className="mr-3 text-2xl">💾</span>
                    <span><strong>Données traitées</strong> : Jeu de données nettoyé avec commandes, défauts, mesures et actions correctives</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default withI18n(SupplierPredictiveDashboard);

function MainCallToActionButton() {
  return (
    <div className="flex space-x-4">
      <CtaButton>
        <Link href={'/dashboard'}>
          <span className="flex items-center space-x-0.5">
            <span>Accéder au tableau de bord</span>

            <ArrowRightIcon
              className={
                'animate-in fade-in slide-in-from-left-8 h-4' +
                ' zoom-in fill-mode-both delay-1000 duration-1000'
              }
            />
          </span>
        </Link>
      </CtaButton>

      <CtaButton variant={'link'}>
        <Link href={'/demo'}>
          Voir la démo
        </Link>
      </CtaButton>
    </div>
  );
}