import type { CanDeactivateFn, Routes } from '@angular/router';
import type { Collection } from './schemas';
import type { EditorPage } from './pages/editor-page';

/** Leaving an editor with unsaved edits asks first. */
const confirmUnsaved: CanDeactivateFn<EditorPage> = (editor) =>
  !editor.dirty() || confirm('You have unsaved changes. Leave without saving?');

const editor = () => import('./pages/editor-page').then((m) => m.EditorPage);

const collection = (path: Collection): Routes => [
  {
    path,
    data: { collection: path },
    loadComponent: () => import('./pages/document-list-page').then((m) => m.DocumentListPage),
  },
  {
    path: `${path}/:id`,
    data: { mode: 'document', collection: path },
    canDeactivate: [confirmUnsaved],
    loadComponent: editor,
  },
];

/** The admin at /admin. Admins only (guarded in app.routes.ts and checked by the API). */
export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/admin-shell').then((m) => m.AdminShell),
    children: [
      { path: '', loadComponent: () => import('./pages/publish-page').then((m) => m.PublishPage) },
      ...collection('pages'),
      ...collection('posts'),
      ...collection('projects'),
      ...collection('member-pages'),
      { path: 'settings', data: { mode: 'settings' }, canDeactivate: [confirmUnsaved], loadComponent: editor },
      {
        path: 'spending-plan',
        data: { mode: 'spending-plan' },
        canDeactivate: [confirmUnsaved],
        loadComponent: editor,
      },
    ],
  },
];
