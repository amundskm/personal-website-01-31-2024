import { Routes } from '@angular/router';
import { CmsPage } from './pages/cms-page/cms-page';

export const routes: Routes = [
  { path: '', component: CmsPage, data: { slug: 'home' } },
  {
    path: 'blog',
    loadComponent: () => import('./pages/blog/post-list-page').then((m) => m.PostListPage),
  },
  {
    path: 'blog/:slug',
    loadComponent: () => import('./pages/blog/post-page').then((m) => m.PostPage),
  },
  {
    path: 'projects',
    loadComponent: () =>
      import('./pages/projects/project-list-page').then((m) => m.ProjectListPage),
  },
  {
    path: 'projects/:slug',
    loadComponent: () => import('./pages/projects/project-page').then((m) => m.ProjectPage),
  },
  // Any other single-segment path is looked up as a CMS page (and 404s if missing)
  { path: ':slug', component: CmsPage },
  {
    path: '**',
    loadComponent: () => import('./pages/not-found/not-found').then((m) => m.NotFound),
  },
];
