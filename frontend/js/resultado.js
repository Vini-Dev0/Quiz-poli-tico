import { api, setText, signed, compass, toast } from './common.js';
const uuid = location.pathname.split('/')[2];
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
    publicUrl = document.querySelector('link[rel="canonical"]')?.href || `${location.origin}/resultado/${uuid}`;
    shareText = `Descobri meu posicionamento político!\nResultado: ${result.politicalLabel}\nFaça o teste:`;
    setText('political-label', result.politicalLabel);
    setText('economic-score', signed(result.economicScore));
    setText('authority-score', signed(result.authorityScore));
    setText('economic-label', result.economicLabel);
    setText('authority-label', result.authorityLabel);
    setText('share-label', result.politicalLabel);
    setText('share-economic', signed(result.economicScore));
    setText('share-authority', signed(result.authorityScore));
    for (const axis of ['economic', 'authority']) {
      document.getElementById(`${axis}-marker`).style.left = `${(result[`${axis}Score`] + 100) / 2}%`;
      document.getElementById(`${axis}-track`).setAttribute('aria-label', `${axis === 'economic' ? 'Economia' : 'Autoridade'}: ${signed(result[`${axis}Score`])}`);
    }
    document.getElementById('result-compass').replaceChildren(compass(result.economicScore, result.authorityScore));
    document.getElementById('result-url').value = publicUrl;
    document.getElementById('download-card').href = `/resultado/${uuid}/card.svg`;
    document.getElementById('result-content').hidden = false;
  } catch (error) {
    setText('result-error', error.message);
    document.getElementById('result-error').hidden = false;
    document.getElementById('result-retry').hidden = false;
  } finally { document.getElementById('result-loading').hidden = true; }
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
  if (!success) throw new Error('Selecione e copie o link no campo acima.');
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
    if (network === 'native' && navigator.share) action = navigator.share({ title: `Meu resultado: ${result.politicalLabel}`, text: shareText, url: publicUrl });
    else if (network === 'native' || network === 'copy') action = copy(publicUrl).then(() => toast('Link copiado. Pronto para compartilhar!'));
    else if (network === 'instagram') {
      action = copy(`${shareText}\n${publicUrl}`).then(() => toast('Resultado e link copiados. Cole no Instagram para compartilhar.'));
      window.open(shareUrl(network), '_blank', 'noopener,noreferrer');
    } else {
      window.open(shareUrl(network), '_blank', 'noopener,noreferrer');
      action = Promise.resolve();
    }
    // Métrica de intenção de compartilhar: o clique é registrado mesmo
    // quando a plataforma externa não informa se a publicação ocorreu.
    const tracking = api(`/quiz/${uuid}/share`, { method: 'POST' }).catch(() => toast('Seu compartilhamento foi aberto, mas não conseguimos registrar a métrica.'));
    await Promise.allSettled([action, tracking]).then(results => {
      const failure = results[0];
      if (failure.status === 'rejected' && failure.reason.name !== 'AbortError') toast(failure.reason.message || 'Não foi possível compartilhar. Copie o link.');
    });
  } catch (error) { if (error.name !== 'AbortError') toast(error.message); }
  finally { sharing = false; }
}
document.getElementById('native-share').addEventListener('click', () => share('native'));
document.getElementById('copy-inline').addEventListener('click', () => share('copy'));
document.querySelectorAll('[data-share]').forEach(button => button.addEventListener('click', () => share(button.dataset.share)));
document.getElementById('result-retry').addEventListener('click', load);
await load();
