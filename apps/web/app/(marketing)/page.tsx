import Image from 'next/image';
import Link from 'next/link';

import {
  ArrowRightIcon,
  LayoutDashboard,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Clock,
  LogIn,
  UserPlus,
  User,
  Shield,
  Zap,
  BarChart3,
  Target,
  Sparkles,
} from 'lucide-react';

import { getSupabaseServerClient } from '@kit/supabase/server-client';
import {
  CtaButton,
  FeatureCard,
  FeatureGrid,
  FeatureShowcase,
  FeatureShowcaseIconContainer,
  Hero,
  Pill,
} from '@kit/ui/marketing';
import { Button } from '@kit/ui/button';
import { Trans } from '@kit/ui/trans';

import { withI18n } from '~/lib/i18n/with-i18n';
import pathsConfig from '~/config/paths.config';

// ============================================
// USER STATUS SECTION COMPONENT
// ============================================

interface UserStatusSectionProps {
  isLoggedIn: boolean;
  userEmail?: string | null;
}

function UserStatusSection({ isLoggedIn, userEmail }: UserStatusSectionProps) {
  if (isLoggedIn && userEmail) {
    return (
      <div className="border-b border-gray-100 bg-white/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-sm">
                <User className="h-4 w-4" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-gray-900">
                  Bienvenue
                </span>
                <span className="text-xs text-gray-500 max-w-[200px] truncate">
                  {userEmail}
                </span>
              </div>
              <div className="hidden sm:flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Connecté
              </div>
            </div>
            <Link href={pathsConfig.app.home}>
              <Button 
                size="sm" 
                className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white shadow-sm"
              >
                <LayoutDashboard className="h-4 w-4 mr-2" />
                Accéder au Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-gray-100 bg-gradient-to-r from-slate-50 to-blue-50">
      <div className="container mx-auto px-4 py-3">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 text-white shadow-sm">
              <Sparkles className="h-4 w-4" />
            </div>
            <p className="text-sm text-gray-600">
              <span className="font-medium text-gray-900">Nouveau ?</span>
              {' '}Créez votre compte gratuitement et commencez à analyser vos fournisseurs.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href={pathsConfig.auth.signIn}>
              <Button variant="ghost" size="sm" className="text-gray-600 hover:text-gray-900">
                <LogIn className="h-4 w-4 mr-1.5" />
                Connexion
              </Button>
            </Link>
            <Link href={pathsConfig.auth.signUp}>
              <Button 
                size="sm" 
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-sm"
              >
                <UserPlus className="h-4 w-4 mr-1.5" />
                Créer un compte
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// STATS SECTION COMPONENT
// ============================================

function StatsSection() {
  const stats = [
    { value: '99.5%', label: 'Précision des prédictions', icon: Target },
    { value: '3x', label: 'Plus rapide que l\'analyse manuelle', icon: Zap },
    { value: '24/7', label: 'Surveillance continue', icon: Shield },
  ];

  return (
    <div className="border-y border-gray-100 bg-white py-8">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {stats.map((stat, index) => (
            <div key={index} className="flex items-center justify-center gap-4 text-center sm:text-left">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 text-blue-600">
                <stat.icon className="h-6 w-6" />
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
                <div className="text-sm text-gray-500">{stat.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================
// USE CASES SECTION COMPONENT
// ============================================

function UseCasesSection() {
  return (
    <div className="py-16">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-3">
            Cas d'usage concrets
          </h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Découvrez comment notre solution détecte et prévient les problèmes avant qu'ils n'impactent votre production.
          </p>
        </div>
        
        <div className="grid gap-6 md:grid-cols-2 max-w-4xl mx-auto">
          <div className="group relative overflow-hidden rounded-2xl border border-orange-100 bg-gradient-to-br from-orange-50 to-amber-50 p-6 transition-all hover:shadow-lg hover:shadow-orange-100/50">
            <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-to-br from-orange-200/30 to-amber-200/30 blur-2xl transition-transform group-hover:scale-150" />
            <div className="relative">
              <div className="mb-4 inline-flex items-center justify-center rounded-xl bg-orange-100 p-3 text-orange-600">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-gray-900">
                Détection de dérive qualité
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Identifiez une augmentation progressive du taux de défauts sur 3 semaines. 
                Le système recommande automatiquement les actions correctives appropriées.
              </p>
              <div className="mt-4 flex items-center gap-2 text-xs text-orange-700 font-medium">
                <CheckCircle className="h-4 w-4" />
                Prévention proactive
              </div>
            </div>
          </div>

          <div className="group relative overflow-hidden rounded-2xl border border-red-100 bg-gradient-to-br from-red-50 to-rose-50 p-6 transition-all hover:shadow-lg hover:shadow-red-100/50">
            <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-to-br from-red-200/30 to-rose-200/30 blur-2xl transition-transform group-hover:scale-150" />
            <div className="relative">
              <div className="mb-4 inline-flex items-center justify-center rounded-xl bg-red-100 p-3 text-red-600">
                <Clock className="h-6 w-6" />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-gray-900">
                Alerte retards récurrents
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Détectez les patterns de retards de livraison et recevez des alertes précoces 
                pour anticiper et ajuster vos plannings en conséquence.
              </p>
              <div className="mt-4 flex items-center gap-2 text-xs text-red-700 font-medium">
                <CheckCircle className="h-4 w-4" />
                Anticipation intelligente
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// MAIN PAGE COMPONENT (Server Component)
// ============================================

async function SupplierPredictiveDashboard() {
  const client = getSupabaseServerClient();
  const { data } = await client.auth.getClaims();
  
  const isLoggedIn = !!data?.claims;
  const userEmail = data?.claims?.email as string | undefined;

  return (
    <div className="flex flex-col bg-gradient-to-b from-gray-50 to-white">
      {/* User Status Section */}
      <UserStatusSection isLoggedIn={isLoggedIn} userEmail={userEmail} />

      {/* Main Content */}
      <main>
        {/* Hero Section */}
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-100/40 via-transparent to-transparent" />
          <div className="container relative mx-auto px-4 py-12 lg:py-16">
            <Hero
              spacing="compact"
              pill={
                <Pill label="">
                  <span className="flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5" />
                    Analyse prédictive intelligente
                  </span>
                </Pill>
              }
              title={
                <span className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 bg-clip-text text-transparent">
                  Anticipez les risques fournisseurs
                </span>
              }
              subtitle={
                <span className="text-gray-600">
                  Surveillez vos fournisseurs en temps réel, détectez les dérives 
                  et prenez des décisions éclairées grâce à nos algorithmes de prédiction.
                </span>
              }
              cta={<MainCallToActionButton isLoggedIn={isLoggedIn} />}
              image={
                <div className="relative">
                  <div className="absolute -inset-4 rounded-3xl bg-gradient-to-r from-blue-500/20 to-indigo-500/20 blur-2xl" />
                  <Image
                    priority
                    className="relative rounded-2xl border border-gray-200/50 shadow-2xl shadow-gray-900/10"
                    width={3558}
                    height={2222}
                    src={`/images/supplier-dashboard.webp`}
                    alt={`Dashboard de suivi fournisseurs`}
                  />
                </div>
              }
            />
          </div>
        </div>

        {/* Stats Section */}
        <StatsSection />

        {/* Features Section */}
        <div className="py-16 lg:py-24">
          <div className="container mx-auto px-4">
            <FeatureShowcase
              heading={
                <div className="text-center mb-4">
                  <h2 className="text-3xl font-bold text-gray-900 mb-3">
                    Trois vues essentielles
                  </h2>
                  <p className="text-gray-600 max-w-2xl mx-auto">
                    Un tableau de bord clair et intuitif pour piloter efficacement 
                    votre chaîne d'approvisionnement.
                  </p>
                </div>
              }
              icon={
                <FeatureShowcaseIconContainer>
                  <BarChart3 className="h-5 w-5" />
                  <span>Fonctionnalités clés</span>
                </FeatureShowcaseIconContainer>
              }
            >
              <FeatureGrid>
                <FeatureCard
                  className="relative col-span-2 overflow-hidden bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-100"
                  label={'Analyse des délais'}
                  description={`Visualisez les écarts entre dates promises et livrées. Identifiez les tendances et anticipez les retards.`}
                >
                  <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-blue-200/30 blur-xl" />
                  <Clock className="absolute -right-4 -top-4 h-20 w-20 text-blue-200" />
                </FeatureCard>

                <FeatureCard
                  className="relative col-span-2 w-full overflow-hidden lg:col-span-1 bg-gradient-to-br from-amber-50 to-orange-50 border-amber-100"
                  label={'Suivi qualité'}
                  description={`Surveillez le taux de défauts par fournisseur avec des alertes automatiques.`}
                >
                  <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-amber-200/30 blur-xl" />
                  <AlertTriangle className="absolute -right-2 -top-2 h-16 w-16 text-amber-200" />
                </FeatureCard>

                <FeatureCard
                  className="relative col-span-2 overflow-hidden lg:col-span-1 bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-100"
                  label={'Actions correctives'}
                  description={`Recevez des recommandations prioritaires et actionnables.`}
                >
                  <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-emerald-200/30 blur-xl" />
                  <CheckCircle className="absolute -right-2 -top-2 h-16 w-16 text-emerald-200" />
                </FeatureCard>

                <FeatureCard
                  className="relative col-span-2 overflow-hidden bg-gradient-to-br from-violet-50 to-purple-50 border-violet-100"
                  label={'Prédictions transparentes'}
                  description={`Des algorithmes explicables : moyennes glissantes et tendances linéaires. Comprenez chaque prédiction.`}
                >
                  <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-violet-200/30 blur-xl" />
                  <TrendingUp className="absolute -right-4 -top-4 h-20 w-20 text-violet-200" />
                </FeatureCard>
              </FeatureGrid>
            </FeatureShowcase>
          </div>
        </div>

        {/* Use Cases Section */}
        <div className="bg-gray-50">
          <UseCasesSection />
        </div>

        {/* Final CTA Section */}
        <div className="py-16 lg:py-24">
          <div className="container mx-auto px-4">
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-blue-600 to-indigo-700 px-8 py-12 text-center shadow-xl lg:px-16 lg:py-16">
              <div className="absolute inset-0 bg-[url('/images/grid.svg')] opacity-10" />
              <div className="relative">
                <h2 className="mb-4 text-2xl font-bold text-white lg:text-3xl">
                  Prêt à optimiser votre chaîne d'approvisionnement ?
                </h2>
                <p className="mx-auto mb-8 max-w-xl text-blue-100">
                  Commencez dès maintenant à analyser vos fournisseurs et à anticiper les problèmes.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-4">
                  {isLoggedIn ? (
                    <Link href={pathsConfig.app.home}>
                      <Button size="lg" className="bg-white text-blue-700 hover:bg-blue-50 shadow-lg">
                        <LayoutDashboard className="mr-2 h-5 w-5" />
                        Accéder au Dashboard
                      </Button>
                    </Link>
                  ) : (
                    <>
                      <Link href={pathsConfig.auth.signUp}>
                        <Button size="lg" className="bg-white text-blue-700 hover:bg-blue-50 shadow-lg">
                          <UserPlus className="mr-2 h-5 w-5" />
                          Créer un compte gratuit
                        </Button>
                      </Link>
                      <Link href={pathsConfig.auth.signIn}>
                        <Button size="lg" variant="outline" className="border-white/30 text-white hover:bg-white/10">
                          <LogIn className="mr-2 h-5 w-5" />
                          Se connecter
                        </Button>
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default withI18n(SupplierPredictiveDashboard);

// ============================================
// CALL TO ACTION BUTTONS COMPONENT
// ============================================

interface MainCallToActionButtonProps {
  isLoggedIn: boolean;
}

function MainCallToActionButton({ isLoggedIn }: MainCallToActionButtonProps) {
  if (isLoggedIn) {
    return (
      <div className="flex flex-wrap items-center gap-4">
        <CtaButton>
          <Link href={pathsConfig.app.home}>
            <span className="flex items-center gap-2">
              <LayoutDashboard className="h-5 w-5" />
              <span>Accéder au Dashboard</span>
              <ArrowRightIcon className="h-4 w-4 animate-pulse" />
            </span>
          </Link>
        </CtaButton>

        <CtaButton variant={'outline'}>
          <Link href={pathsConfig.app.profileSettings}>
            <span className="flex items-center gap-2">
              <User className="h-4 w-4" />
              <span>Paramètres</span>
            </span>
          </Link>
        </CtaButton>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <CtaButton>
        <Link href={pathsConfig.auth.signUp}>
          <span className="flex items-center gap-2">
            <span>Commencer gratuitement</span>
            <ArrowRightIcon className="h-4 w-4 animate-pulse" />
          </span>
        </Link>
      </CtaButton>

      <CtaButton variant={'outline'}>
        <Link href={pathsConfig.auth.signIn}>
          <span className="flex items-center gap-2">
            <LogIn className="h-4 w-4" />
            <span>Se connecter</span>
          </span>
        </Link>
      </CtaButton>

      <CtaButton variant={'link'}>
        <Link href={'/dashboard'} className="text-gray-600 hover:text-gray-900">
          Voir la démo →
        </Link>
      </CtaButton>
    </div>
  );
}