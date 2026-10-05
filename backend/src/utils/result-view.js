// Projeção dos campos públicos existentes. Não recalcula scores, não infere
// novas características e não cria campos no banco. Também atende resultados
// antigos com os valores e classificações que foram salvos na conclusão.
export function presentResult(result) {
  return {
    uuid: result.uuid,
    economicScore: result.economicScore,
    authorityScore: result.authorityScore,
    economicLabel: result.economicLabel,
    authorityLabel: result.authorityLabel,
    politicalLabel: result.politicalLabel,
    completedAt: result.completedAt,
    economicView: { score: result.economicScore, label: result.economicLabel },
    authorityView: { score: result.authorityScore, label: result.authorityLabel }
  };
}
