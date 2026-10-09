import { api, setError, setText, signed, compass, toast } from './common.js?v=4';
import { t, ready, localPath, translatedResult } from './i18n.js?v=4';
import { basePath } from './i18n-config.js?v=4';
await ready;
const uuid = basePath(location.pathname).split('/')[2];
let result;
let publicUrl;
let shareText;
let sharing = false;
async function load() {
  document.getElementById('result-loading').hidden = false;
  document.getElementById('result-error').hidden = true;
  document.getElementById('result-retry').hidden = true;
  try {
    result = await api(`/results/${uuid}`);
    renderResult();
    document.getElementById('result-content').hidden = false;
  } catch (error) {
    setError('result-error', error);
    document.getElementById('result-error').hidden = false;
    document.getElementById('result-retry').hidden = false;
  } finally { document.getElementById('result-loading').hidden = true; }
}
function renderResult() {
    publicUrl = `${location.origin}${localPath(`/resultado/${uuid}`)}`;
    const display = translatedResult(result);
    // Fallback mantém a apresentação compatível durante um deploy gradual.
    const economic = { score: result.economicScore, label: display.economicLabel };
    const authority = { score: result.authorityScore, label: display.authorityLabel };
    shareText = t('results.shareText', { label: display.politicalLabel, economicLabel: economic.label, authorityLabel: authority.label, economic: signed(economic.score), authority: signed(authority.score) });
    setText('political-label', display.politicalLabel);
    for (const [axis, view] of [['economic', economic], ['authority', authority]]) {
      setText(`${axis}-score`, signed(view.score));
      setText(`${axis}-label`, view.label);
      setText(`share-${axis}`, signed(view.score));
      setText(`share-${axis}-label`, view.label);
      setText(`map-${axis}-score`, signed(view.score));
      setText(`map-${axis}-label`, view.label);
      setText(`${axis}-reading`, t('results.reading', { label: view.label, score: signed(view.score) }));
      document.getElementById(`${axis}-marker`).style.left = `${(view.score + 100) / 2}%`;
      document.getElementById(`${axis}-track`).setAttribute('role', 'img');
      document.getElementById(`${axis}-track`).setAttribute('aria-label', t('results.axisAria', { axis: t(axis === 'economic' ? 'ui.text054' : 'ui.text056'), label: view.label, score: signed(view.score) }));
    }
    setText('share-label', display.politicalLabel);
    document.getElementById('result-compass').replaceChildren(compass(result.economicScore, result.authorityScore));
    document.getElementById('result-url').value = publicUrl;
    document.getElementById('download-card').href = localPath(`/resultado/${uuid}/card.svg`);

}
async function copy(value) {
  if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(value); return; }
  const input = document.createElement('textarea');
  input.value = value;
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.append(input);
  input.select();
  const success = document.execCommand('copy');
  input.remove();
  if (!success) throw new Error(t('messages.copyManual'));
}
function shareUrl(network) {
  const url = encodeURIComponent(publicUrl);
  const text = encodeURIComponent(shareText);
  return {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${shareText}\n${publicUrl}`)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
    x: `https://twitter.com/intent/tweet?text=${text}&url=${url}`,
    telegram: `https://t.me/share/url?url=${url}&text=${text}`,
    instagram: 'https://www.instagram.com/'
  }[network];
}
async function share(network) {
  if (!result || sharing) return;
  sharing = true;
  // Disparar durante o gesto de clique, antes de await, preserva Web Share
  // e a abertura de janelas nos navegadores com bloqueio de pop-ups.
  let action;
  try {
    if (network === 'native' && navigator.share) action = navigator.share({ title: t('results.shareTitle', { label: translatedResult(result).politicalLabel }), text: shareText, url: publicUrl });
    else if (network === 'native' || network === 'copy') action = copy(publicUrl).then(() => toast(t('messages.copied')));
    else if (network === 'instagram') {
      action = copy(`${shareText}\n${publicUrl}`).then(() => toast(t('messages.instagram')));
      window.open(shareUrl(network), '_blank', 'noopener,noreferrer');
    } else {
      window.open(shareUrl(network), '_blank', 'noopener,noreferrer');
      action = Promise.resolve();
    }
    // Métrica de intenção de compartilhar: o clique é registrado mesmo
    // quando a plataforma externa não informa se a publicação ocorreu.
    const tracking = api(`/quiz/${uuid}/share`, { method: 'POST' }).catch(() => toast(t('messages.shareTracking')));
    await Promise.allSettled([action, tracking]).then(results => {
      const failure = results[0];
      if (failure.status === 'rejected' && failure.reason.name !== 'AbortError') toast(failure.reason.message || t('messages.shareFailed'));
    });
  } catch (error) { if (error.name !== 'AbortError') toast(error.message); }
  finally { sharing = false; }
}
document.getElementById('native-share').addEventListener('click', () => share('native'));
document.getElementById('copy-inline').addEventListener('click', () => share('copy'));
document.querySelectorAll('[data-share]').forEach(button => button.addEventListener('click', () => share(button.dataset.share)));
document.getElementById('result-retry').addEventListener('click', load);
await load();
document.addEventListener('languagechange', () => { if (result) renderResult(); });
