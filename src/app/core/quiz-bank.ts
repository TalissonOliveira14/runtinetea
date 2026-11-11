/** Desafios curtos depois de cada fase (aprendizado sem erro: errou, tenta de novo com dica). */
export interface Question {
  say: string; // o que a voz lê
  show?: string; // figura grande (emojis)
  opts: { label: string; read?: string; correct?: boolean }[];
  hint: string;
}

const o = (label: string, correct = false, read?: string) => ({ label, correct, read });

const BANK: Record<string, Question[]> = {
  quarto: [
    { say: 'Conte os ursinhos. Quantos ursinhos tem?', show: '🧸🧸🧸', opts: [o('2'), o('3', true), o('4')], hint: 'Toque em cada ursinho e conte: um, dois, três.' },
    { say: 'O que fazemos primeiro de manhã?', opts: [o('☀️ Acordar', true, 'Acordar'), o('🌙 Dormir', false, 'Dormir')], hint: 'De manhã o sol aparece. A gente acorda!' },
    { say: 'Qual destas é a cor azul?', opts: [o('🔴', false, 'vermelho'), o('🔵', true, 'azul'), o('🟢', false, 'verde')], hint: 'O céu e o mar são azuis.' },
  ],
  banheiro: [
    { say: 'O que usamos para escovar os dentes?', opts: [o('🪥', true, 'escova de dentes'), o('🍴', false, 'garfo'), o('🧦', false, 'meia')], hint: 'A escova tem cerdinhas macias.' },
    { say: 'Conte as bolhas de sabão. Quantas bolhas?', show: '🫧🫧🫧🫧', opts: [o('3'), o('4', true), o('5')], hint: 'Conte devagar: um, dois, três, quatro.' },
    { say: 'Com qual letra começa a palavra BANHO?', show: 'BANHO', opts: [o('B', true), o('P'), o('D')], hint: 'Banho começa com o som BÊ.' },
  ],
  cozinha: [
    { say: 'Qual destes é uma fruta?', opts: [o('🍎', true, 'maçã'), o('🚗', false, 'carro'), o('🧦', false, 'meia')], hint: 'Fruta é gostosa e a gente come!' },
    { say: 'Uma maçã mais duas maçãs. Quantas maçãs?', show: '🍎 + 🍎🍎', opts: [o('2'), o('3', true), o('4')], hint: 'Conte todas juntas: um, dois, três.' },
    { say: 'Qual é uma comida saudável?', opts: [o('🍬', false, 'bala'), o('🥕', true, 'cenoura'), o('🍭', false, 'pirulito')], hint: 'Os legumes e as frutas fazem bem para o corpo.' },
  ],
  rua: [
    { say: 'O sinal está vermelho. O que a gente faz?', show: '🔴', opts: [o('✋ Parar', true, 'Parar'), o('🏃 Correr', false, 'Correr')], hint: 'Vermelho quer dizer pare!' },
    { say: 'Qual cor do sinal quer dizer siga?', opts: [o('🔴', false, 'vermelho'), o('🟡', false, 'amarelo'), o('🟢', true, 'verde')], hint: 'Verde é para seguir, com cuidado.' },
    { say: 'Por onde atravessamos a rua?', opts: [o('🦓 Faixa de pedestres', true, 'Pela faixa de pedestres'), o('🚗 No meio dos carros', false, 'No meio dos carros')], hint: 'A faixa listrada é o lugar seguro.' },
  ],
  escola: [
    { say: 'Conte os lápis. Quantos lápis tem?', show: '✏️✏️✏️✏️✏️', opts: [o('4'), o('5', true), o('6')], hint: 'Conte um por um: um, dois, três, quatro, cinco.' },
    { say: 'Quando queremos falar na sala, o que fazemos?', opts: [o('🙋 Levantar a mão', true, 'Levantar a mão'), o('😠 Gritar', false, 'Gritar')], hint: 'A professora vê a mãozinha levantada.' },
    { say: 'Qual é a primeira letra do seu nome?', show: '{inicial}', opts: [], hint: 'É a letra que vem primeiro no seu nome.' },
  ],
  recreio: [
    { say: 'Uma bola mais duas bolas. Quantas bolas?', show: '⚽ + ⚽⚽', opts: [o('2'), o('3', true), o('4')], hint: 'Junte todas e conte: um, dois, três.' },
    { say: 'Um amigo quer brincar com você. O que você pode fazer?', opts: [o('🤝 Brincar junto', true, 'Brincar junto'), o('🙅 Não deixar', false, 'Não deixar')], hint: 'Brincar junto é mais divertido!' },
    { say: 'Quem corre atrás da bola?', opts: [o('🐶', true, 'o cachorro'), o('🐟', false, 'o peixe')], hint: 'Ele late: au au!' },
  ],
  sala: [
    { say: 'Qual destas formas é um círculo?', opts: [o('🔺', false, 'triângulo'), o('⚪', true, 'círculo'), o('🟥', false, 'quadrado')], hint: 'O círculo é redondinho.' },
    { say: 'Onde guardamos os brinquedos?', opts: [o('📦 Na caixa', true, 'Na caixa'), o('🛏️ Na cama', false, 'Na cama')], hint: 'A caixa de brinquedos é o lugar deles.' },
    { say: 'Conte as plantinhas. Quantas plantinhas?', show: '🪴🪴', opts: [o('1'), o('2', true), o('3')], hint: 'Um, dois.' },
  ],
  mercado: [
    { say: 'Um pão custa 3 reais e um leite custa 2 reais. Quanto custa tudo?', show: '🍞 3 + 🥛 2', opts: [o('4'), o('5', true), o('6')], hint: 'Conte nos dedos: três e mais dois.' },
    { say: 'O que podemos comprar no mercado?', opts: [o('🛒🍎', true, 'frutas'), o('🛒🚗', false, 'um carro')], hint: 'No mercado tem comida e coisas de casa.' },
    { say: 'Conte as maçãs. Quantas maçãs?', show: '🍎🍎🍎🍎', opts: [o('3'), o('4', true), o('5')], hint: 'Um, dois, três, quatro.' },
  ],
  dentista: [
    { say: 'O dentista cuida de quê?', opts: [o('🦷', true, 'dos dentes'), o('👀', false, 'dos olhos')], hint: 'Ele deixa os dentinhos limpos e fortes.' },
    { say: 'Quando sentimos medo, o que ajuda?', opts: [o('🫧 Respirar fundo', true, 'Respirar fundo'), o('😡 Gritar', false, 'Gritar')], hint: 'Respirar devagar acalma o corpo.' },
    { say: 'Quantas vezes por dia escovamos os dentes? Escolha a melhor resposta.', opts: [o('0'), o('1'), o('3', true)], hint: 'Depois de comer, escovamos os dentes.' },
  ],
  noite: [
    { say: 'O que vemos no céu à noite?', opts: [o('🌙', true, 'a lua'), o('☀️', false, 'o sol')], hint: 'À noite o céu fica escuro, com lua e estrelas.' },
    { say: 'Conte as estrelas. Quantas estrelas?', show: '⭐⭐⭐⭐⭐', opts: [o('4'), o('5', true), o('6')], hint: 'Um, dois, três, quatro, cinco.' },
    { say: 'Para dormir, a luz fica...', opts: [o('💡 Apagada', true, 'Apagada'), o('✨ Muito acesa', false, 'Muito acesa')], hint: 'No escuro é mais fácil dormir.' },
  ],
};

/** Letras diferentes da inicial, para as opções erradas */
const ALPHA = 'ABCDEFGHIJLMNOPRSTUV';

export function questionsFor(levelId: string, name: string): Question[] {
  const initial = (name.trim()[0] ?? 'A').toUpperCase();
  const wrong = [...ALPHA].filter((c) => c !== initial);
  const k = initial.charCodeAt(0) % (wrong.length - 2);
  return (BANK[levelId] ?? []).map((q) =>
    q.opts.length
      ? q
      : {
          ...q,
          show: q.show?.replace('{inicial}', initial),
          opts: [o(initial, true, initial), o(wrong[k]), o(wrong[k + 2])],
        }
  );
}