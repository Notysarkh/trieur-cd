import { createRouter, createWebHashHistory } from 'vue-router'
import { settings } from './services/settings'
import type { MediaKind } from './lib/media'

// Les écrans de l'appli. Le « # » dans l'adresse (ex. …/#/scan) permet à l'appli
// de fonctionner sur un hébergement simple comme GitHub Pages.
//
// meta.onlyFor : univers où l'écran existe déjà (les autres l'auront à leur étape de la v2) ;
// dans un autre univers, App.vue affiche « bientôt ».

declare module 'vue-router' {
  interface RouteMeta {
    onlyFor?: MediaKind[]
  }
}

/** Écrans de rangement : les CD seulement (livres, films et jeux : étape E). */
const cdOnly = { onlyFor: ['cd'] as MediaKind[] }
/** Scan, ajout et classement : CD et livres (films : étape C, jeux : étape D). */
const cdAndBooks = { onlyFor: ['cd', 'livre'] as MediaKind[] }

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'accueil', component: () => import('./views/HomeView.vue') },
    { path: '/collection', name: 'collection', component: () => import('./views/CollectionView.vue') },
    {
      path: '/a-verifier',
      name: 'a-verifier',
      component: () => import('./views/CollectionView.vue'),
      props: { reviewMode: true },
    },
    { path: '/scan', name: 'scan', component: () => import('./views/ScanView.vue'), meta: cdAndBooks },
    { path: '/ajouter', name: 'ajouter', component: () => import('./views/AddView.vue'), meta: cdAndBooks },
    { path: '/cd/:id', name: 'cd', component: () => import('./views/CdDetailView.vue'), props: true },
    { path: '/classement', name: 'classement', component: () => import('./views/ClassificationView.vue'), meta: cdAndBooks },
    { path: '/classement/themes', name: 'themes', component: () => import('./views/ThemesView.vue'), meta: cdAndBooks },
    { path: '/rangement', name: 'rangement', component: () => import('./views/LayoutView.vue'), meta: cdOnly },
    { path: '/rangement/meubles', name: 'meubles', component: () => import('./views/FurnitureView.vue'), meta: cdOnly },
    { path: '/ou-est', name: 'ou-est', component: () => import('./views/FindView.vue'), meta: cdOnly },
    { path: '/sans-code', name: 'sans-code', component: () => import('./views/NoBarcodeView.vue'), meta: cdOnly },
    { path: '/imprimer/sans-code', name: 'imprimer-sans-code', component: () => import('./views/PrintNoBarcodeView.vue'), meta: cdOnly },
    { path: '/imprimer/plan', name: 'imprimer-plan', component: () => import('./views/PrintPlanView.vue'), meta: cdOnly },
    { path: '/imprimer/etiquettes', name: 'etiquettes', component: () => import('./views/LabelsView.vue'), meta: cdOnly },
    { path: '/reglages', name: 'reglages', component: () => import('./views/SettingsView.vue') },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

// Au démarrage, on rouvre directement le dernier univers utilisé (l'accueil reste accessible
// par le bouton en haut de l'écran). Les réglages sont déjà chargés (main.ts).
let firstNavigation = true
router.beforeEach((to) => {
  const first = firstNavigation
  firstNavigation = false
  if (first && to.name === 'accueil' && settings.lastMedia) return { name: 'collection' }
})
