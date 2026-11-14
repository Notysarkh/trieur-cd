import { createRouter, createWebHashHistory } from 'vue-router'

// Les écrans de l'appli. Le « # » dans l'adresse (ex. …/#/scan) permet à l'appli
// de fonctionner sur un hébergement simple comme GitHub Pages.
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'collection', component: () => import('./views/CollectionView.vue') },
    {
      path: '/a-verifier',
      name: 'a-verifier',
      component: () => import('./views/CollectionView.vue'),
      props: { reviewMode: true },
    },
    { path: '/scan', name: 'scan', component: () => import('./views/ScanView.vue') },
    { path: '/ajouter', name: 'ajouter', component: () => import('./views/AddView.vue') },
    { path: '/cd/:id', name: 'cd', component: () => import('./views/CdDetailView.vue'), props: true },
    { path: '/classement', name: 'classement', component: () => import('./views/ClassificationView.vue') },
    { path: '/classement/themes', name: 'themes', component: () => import('./views/ThemesView.vue') },
    { path: '/rangement', name: 'rangement', component: () => import('./views/LayoutView.vue') },
    { path: '/rangement/meubles', name: 'meubles', component: () => import('./views/FurnitureView.vue') },
    { path: '/sans-code', name: 'sans-code', component: () => import('./views/NoBarcodeView.vue') },
    { path: '/imprimer/sans-code', name: 'imprimer-sans-code', component: () => import('./views/PrintNoBarcodeView.vue') },
    { path: '/imprimer/plan', name: 'imprimer-plan', component: () => import('./views/PrintPlanView.vue') },
    { path: '/imprimer/etiquettes', name: 'etiquettes', component: () => import('./views/LabelsView.vue') },
    { path: '/reglages', name: 'reglages', component: () => import('./views/SettingsView.vue') },
  ],
  scrollBehavior: () => ({ top: 0 }),
})
