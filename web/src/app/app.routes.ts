import { Routes } from '@angular/router';
import { requireRole } from './core/auth/role.guard';
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
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login-page').then((m) => m.LoginPage),
  },
  // Members area: any signed-in user. Gate individual features with
  // requireRole('wife'), requireRole('neia-boiz'), … (admins always pass).
  {
    path: 'members',
    canActivate: [requireRole()],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./pages/members/members-home-page').then((m) => m.MembersHomePage),
      },
      {
        path: ':slug',
        loadComponent: () => import('./pages/members/member-page').then((m) => m.MemberPage),
      },
    ],
  },
  // Any other single-segment path is looked up as a CMS page (and 404s if missing)
  { path: ':slug', component: CmsPage },
  {
    path: '**',
    loadComponent: () => import('./pages/not-found/not-found').then((m) => m.NotFound),
  },
];
