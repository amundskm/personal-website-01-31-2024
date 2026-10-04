import { HTTP_TRANSFER_CACHE_ORIGIN_MAP } from '@angular/common/http';
import { mergeApplicationConfig, ApplicationConfig } from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';
import { SANITY_USE_CDN, sanityOrigin } from './core/sanity';
import { sanityConfig } from './core/sanity.config';

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(withRoutes(serverRoutes)),
    // Prerender from the live API so a build started right after publishing
    // sees the new content, not a cached copy...
    { provide: SANITY_USE_CDN, useValue: false },
    // ...and store those responses under the URL the browser will request,
    // so hydration still reuses them instead of querying Sanity again.
    {
      provide: HTTP_TRANSFER_CACHE_ORIGIN_MAP,
      useValue: { [sanityOrigin(false)]: sanityOrigin(sanityConfig.useCdn) },
    },
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
