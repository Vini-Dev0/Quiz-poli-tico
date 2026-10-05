// Catálogo v1: 40 afirmações propostas para este projeto (não foi fornecido o
// questionário anterior). Cada eixo tem 20 itens e direções balanceadas.
// Ao mudar texto/peso/direção após publicar, crie uma nova versão do catálogo.
// economic: concordar com +1 move à direita, -1 à esquerda.
// authority: concordar com +1 move ao autoritário, -1 ao libertário.
export const QUIZ_VERSION = 'v1';
const economic = [
  [-1, 'O Estado deve reduzir a desigualdade de renda por meio de impostos progressivos.'],
  [1, 'A iniciativa privada costuma administrar empresas com mais eficiência do que o Estado.'],
  [-1, 'Serviços essenciais, como água e energia, devem ser controlados pelo poder público.'],
  [1, 'O governo deve reduzir impostos sobre empresas para estimular o investimento.'],
  [-1, 'Saúde e educação devem ser oferecidas universalmente pelo Estado, mesmo que isso exija mais impostos.'],
  [1, 'Preços e salários devem ser definidos principalmente pela oferta e pela demanda.'],
  [-1, 'Grandes fortunas devem pagar impostos maiores para financiar políticas sociais.'],
  [1, 'Privatizar empresas estatais pode melhorar a qualidade dos serviços.'],
  [-1, 'O governo deve garantir uma renda mínima a quem não consegue se sustentar.'],
  [1, 'A competição entre empresas é o melhor caminho para melhorar produtos e reduzir preços.'],
  [-1, 'Sindicatos devem ter um papel forte na negociação das condições de trabalho.'],
  [1, 'Empregadores e trabalhadores devem ter mais liberdade para negociar contratos individuais.'],
  [-1, 'O Estado deve intervir na economia para proteger empregos durante crises.'],
  [1, 'O comércio internacional deve ter poucas barreiras, mesmo quando empresas nacionais enfrentam concorrência.'],
  [-1, 'Moradia acessível deve ser garantida por políticas públicas de investimento e subsídio.'],
  [1, 'A propriedade privada é um incentivo fundamental para a prosperidade econômica.'],
  [-1, 'Setores estratégicos da economia devem seguir prioridades definidas pelo Estado.'],
  [1, 'Empreender deve exigir menos licenças e menos regulamentação econômica.'],
  [-1, 'O governo deve limitar a concentração de riqueza, mesmo que isso reduza alguns investimentos.'],
  [1, 'Programas sociais devem ser mais restritos para manter impostos e gastos públicos baixos.']
];
const authority = [
  [-1, 'Adultos devem poder decidir sobre sua vida privada sem interferência do Estado, desde que não prejudiquem outras pessoas.'],
  [1, 'A segurança pública justifica ampliar a vigilância estatal, mesmo com perda de privacidade.'],
  [-1, 'A liberdade de expressão deve proteger também opiniões que a maioria considera ofensivas.'],
  [1, 'Em períodos de crise, o governo deve poder restringir manifestações públicas para manter a ordem.'],
  [-1, 'O Estado deve respeitar a liberdade religiosa e também o direito de não seguir religião alguma.'],
  [1, 'Penas mais severas devem ser a principal resposta ao aumento da criminalidade.'],
  [-1, 'O uso pessoal de drogas deve ser tratado principalmente como questão de saúde, sem punição criminal.'],
  [1, 'As escolas devem priorizar disciplina e obediência às autoridades.'],
  [-1, 'Pessoas devem ter liberdade para expressar sua identidade de gênero e orientação sexual.'],
  [1, 'O governo deve poder proibir conteúdos que ameacem os valores morais predominantes.'],
  [-1, 'Acusados de crimes devem manter o direito ao devido processo, mesmo quando há pressão popular por punição.'],
  [1, 'A manutenção da ordem social pode justificar restringir temporariamente direitos individuais.'],
  [-1, 'Decisões políticas devem permitir ampla participação e contestação da população.'],
  [1, 'Um líder com amplos poderes pode resolver problemas melhor do que instituições com muitos controles.'],
  [-1, 'A polícia deve estar sujeita a limites claros e fiscalização independente.'],
  [1, 'O Estado deve impor regras rígidas para preservar tradições e costumes da sociedade.'],
  [-1, 'A imprensa deve poder investigar e criticar o governo sem autorização prévia.'],
  [1, 'O governo deve ter acesso facilitado a comunicações privadas para prevenir ameaças.'],
  [-1, 'Protestos pacíficos devem ser permitidos mesmo quando causam incômodo ou criticam instituições.'],
  [1, 'Cidadãos devem obedecer às decisões das autoridades, mesmo quando discordam delas.']
];
export const questions = Object.freeze([
  ...economic.map(([direction, text], i) => Object.freeze({ id: i + 1, text, topic: 'Economia e sociedade', axes: { economic: direction, authority: 0 }, weight: 1 })),
  ...authority.map(([direction, text], i) => Object.freeze({ id: i + 21, text, topic: 'Liberdades e autoridade', axes: { economic: 0, authority: direction }, weight: 1 }))
]);
