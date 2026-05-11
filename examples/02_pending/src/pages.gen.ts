// deno-fmt-ignore-file
// biome-ignore format: generated types do not need formatting
// prettier-ignore
import type { PathsForPages, GetConfigResponse } from 'waku/router';

// prettier-ignore
import type { getConfig as File_Slow_getConfig } from './pages/slow';

// prettier-ignore
type Page =
| { path: '/'; render: 'static' }
| ({ path: '/slow' } & GetConfigResponse<typeof File_Slow_getConfig>);

// prettier-ignore
declare module 'waku/router' {
  interface RouteConfig {
    paths: PathsForPages<Page>;
  }
  interface CreatePagesConfig {
    pages: Page;
  }
}
