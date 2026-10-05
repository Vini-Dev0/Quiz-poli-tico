import { config } from '../config.js';

// req.host e req.protocol respeitam o TRUST_PROXY do Express. Cabeçalhos
// encaminhados só são usados quando o proxy é confiável, e a origem ainda
// precisa constar em APP_URL para aparecer em links públicos ou metadados.
export function getAppUrl(req) {
  try {
    if (req.host) {
      const url = new URL(`${req.protocol}://${req.host}`);
      if (!url.username && !url.password && url.pathname === '/' && !url.search && !url.hash && config.appUrls.includes(url.origin)) return url.origin;
    }
  } catch {
    // Hosts inválidos não são refletidos em URLs públicas.
  }
  return config.appUrl;
}
