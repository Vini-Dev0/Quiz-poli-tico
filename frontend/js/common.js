import { language, t } from './i18n.js?v=4';
export async function api(path, { token, signal, ...options } = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, { credentials: 'same-origin', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000), ...options, headers: { 'Content-Type': 'application/json', 'X-Language': language(), ...(token ? { 'X-Quiz-Token': token } : {}), ...options.headers } });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    const failure = new Error(t('messages.connection'));
    failure.code = 'connection';
    throw failure;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.code ? t(`messages.${data.code}`, data.params || {}) : data.error || t('messages.request'));
    error.code = data.code;
    error.params = data.params;
    error.status = response.status;
    throw error;
  }
  return data;
}
export function toast(message) {
  document.querySelector('.toast')?.remove();
  const element = document.createElement('div');
  element.className = 'toast';
  element.setAttribute('role', 'status');
  element.textContent = message;
  document.body.append(element);
  setTimeout(() => element.remove(), 5000);
}
export const signed = value => `${value > 0 ? '+' : ''}${Number(value).toLocaleString(language(), { maximumFractionDigits: 2 })}`;
export function setText(id, text) { document.getElementById(id).textContent = text; }
export function setError(id, error) {
  const element = document.getElementById(id);
  element.textContent = error.message;
  if (error.code) element.dataset.i18n = `messages.${error.code}`;
  else delete element.dataset.i18n;
  if (error.params) element.dataset.i18nParams = JSON.stringify(error.params);
  else delete element.dataset.i18nParams;
}
export function svgNode(name, attrs = {}) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', name);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
  return node;
}
export function compass(economic, authority) {
  const svg = svgNode('svg', { viewBox: '0 0 440 400', role: 'img', 'aria-label': t('results.compass', { economic: signed(economic), authority: signed(authority) }) });
  svg.append(svgNode('rect', { x: 40, y: 35, width: 360, height: 330, fill: '#b590fb03', rx: 9 }));
  for (let i = 1; i < 10; i++) {
    svg.append(svgNode('line', { x1: 40 + i * 36, y1: 35, x2: 40 + i * 36, y2: 365, stroke: '#ffffff09' }));
    svg.append(svgNode('line', { x1: 40, y1: 35 + i * 33, x2: 400, y2: 35 + i * 33, stroke: '#ffffff09' }));
  }
  svg.append(svgNode('path', { d: 'M40 200H400M220 35V365', stroke: '#aa9cbd60', fill: 'none' }));
  const labels = [[220, 18, t('ui.text021')], [220, 388, t('ui.text022')], [55, 190, t('ui.text023')], [375, 190, t('ui.text024')], [227, 215, '0']];
  labels.forEach(([x, y, text]) => { const label = svgNode('text', { x, y, fill: '#9e90b0', 'font-size': text === '0' ? 10 : 9, 'text-anchor': 'middle', 'letter-spacing': 1 }); label.textContent = text; svg.append(label); });
  const x = 220 + economic * 1.8;
  const y = 200 - authority * 1.65;
  svg.append(svgNode('path', { d: `M${x} 200V${y}H220`, stroke: '#c3a7f770', 'stroke-dasharray': '4 5', fill: 'none' }));
  svg.append(svgNode('circle', { cx: x, cy: y, r: 17, fill: '#c3a7f712', stroke: '#c3a7f728' }));
  svg.append(svgNode('circle', { cx: x, cy: y, r: 6, fill: '#d4bcff', stroke: '#ebe0ff', 'stroke-width': 2 }));
  return svg;
}
