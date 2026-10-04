import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-loading',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="status container" role="status" aria-live="polite">Loading…</div>`,
})
export class LoadingComponent {}

@Component({
  selector: 'app-load-error',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="status container" role="alert">
      <h1>Something went wrong</h1>
      <p>{{ message() }}</p>
    </div>
  `,
})
export class LoadErrorComponent {
  readonly message = input('This content could not be loaded. Please try again later.');
}
